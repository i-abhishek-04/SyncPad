"""
SyncPad CRDT engine — a hand-built sequence CRDT for plain text.

Approach: RGA (Replicated Growable Array), based on Roh et al. 2011.
Each character is a node with a globally-unique id (site_id, counter) and
an `origin` pointer: the id of the character it was inserted immediately
after at the moment of insertion (None = start of document).

Why RGA instead of pure fractional-index (LSEQ) positioning:
- Both are valid "simplified CRDT" approaches for text.
- RGA gives a deterministic total order using only integer comparison
  (no floating point precision decay after many inserts between the
  same two neighbors, which fractional/LSEQ schemes have to work around
  with allocation strategies).
- The convergence proof is easier to state and test: any two replicas
  that have applied the same *set* of insert/delete ops end up with the
  same list, regardless of the order those ops were applied in.

Deletions are tombstoned (kept in the array, marked deleted) rather than
removed, so an insert whose `origin` points at an already-deleted node
can still be positioned correctly.

Simplifications vs a production CRDT (documented for the README too):
- O(n) insert/lookup (linear scan) — fine for a single shared pad,
  not designed for huge documents.
- No garbage collection of tombstones (would need causal stability /
  vector clocks to know when it's safe to compact).
- Single global counter source of truth is the server relay order for
  buffering, not a vector clock — sufficient because the server forwards
  each client's messages in the order it received them, and same-client
  ops are already causally ordered by the client itself.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

NodeId = Tuple[str, int]  # (site_id, counter)


@dataclass
class Node:
    id: NodeId
    origin: Optional[NodeId]
    value: str
    deleted: bool = False


class RGADocument:
    def __init__(self):
        # Document order (includes tombstones).
        self.nodes: List[Node] = []
        # id -> index in self.nodes, kept in sync on every insert.
        self.index_of: Dict[NodeId, int] = {}
        # Ops whose origin hasn't arrived yet get buffered here.
        self.pending: List[Node] = []
        # Per-site counters, used when *this* replica (the server acting
        # as a relay/authority for local ops isn't needed since clients
        # generate their own ids) — kept for completeness/testing.
        self._counters: Dict[str, int] = {}

    # ---------- id helpers ----------

    def next_id(self, site_id: str) -> NodeId:
        c = self._counters.get(site_id, 0) + 1
        self._counters[site_id] = c
        return (site_id, c)

    @staticmethod
    def _id_gt(a: NodeId, b: NodeId) -> bool:
        # Compare (counter, site_id) so ordering is deterministic and
        # doesn't depend on site_id string values dominating counters.
        return (a[1], a[0]) > (b[1], b[0])

    # ---------- core RGA integrate algorithm ----------

    def _origin_index(self, origin: Optional[NodeId]) -> int:
        if origin is None:
            return -1
        return self.index_of[origin]

    def integrate_insert(self, node: Node) -> bool:
        """Attempt to place `node` in the document, then drain any buffered
        nodes that were waiting on it. Returns True if `node` itself was
        placed immediately, False if it had to be buffered."""
        placed = self._place(node)
        self._drain_pending()
        return placed

    def _place(self, node: Node) -> bool:
        """Place a single node with no side effects on `pending`. Does not
        recurse and does not drain -- callers handle draining."""
        if node.origin is not None and node.origin not in self.index_of:
            self.pending.append(node)
            return False

        origin_idx = self._origin_index(node.origin)
        insert_at = origin_idx + 1

        # Scan right past any concurrent siblings that must sort before us.
        while insert_at < len(self.nodes):
            candidate = self.nodes[insert_at]
            cand_origin_idx = self._origin_index(candidate.origin)

            if cand_origin_idx < origin_idx:
                # candidate branches off further left in the doc than our
                # origin -> it belongs after us. Stop here.
                break
            if cand_origin_idx == origin_idx:
                # True concurrent sibling inserted at the same spot.
                # Deterministic tie-break: higher id sits further left.
                if self._id_gt(candidate.id, node.id):
                    insert_at += 1
                    continue
                else:
                    break
            # cand_origin_idx > origin_idx: candidate is part of a chain
            # that itself descends from something right of our origin;
            # keep scanning.
            insert_at += 1

        self.nodes.insert(insert_at, node)
        self._reindex_from(insert_at)
        return True

    def _reindex_from(self, start: int):
        for i in range(start, len(self.nodes)):
            self.index_of[self.nodes[i].id] = i

    def _drain_pending(self):
        """Iteratively (not recursively) place any buffered nodes whose
        origin has since arrived, looping until a full pass places nothing."""
        progress = True
        while progress and self.pending:
            progress = False
            still_pending = []
            for node in self.pending:
                if node.origin is None or node.origin in self.index_of:
                    self._place(node)
                    progress = True
                else:
                    still_pending.append(node)
            self.pending = still_pending

    # ---------- public ops ----------

    def local_insert(self, site_id: str, after_id: Optional[NodeId], value: str) -> Node:
        """Generate + apply a local insert. after_id = id of the character
        the new char sits immediately after (None = document start)."""
        node = Node(id=self.next_id(site_id), origin=after_id, value=value)
        self.integrate_insert(node)
        return node

    def apply_remote_insert(self, node_id: NodeId, origin: Optional[NodeId], value: str):
        node = Node(id=node_id, origin=origin, value=value)
        self.integrate_insert(node)

    def apply_delete(self, node_id: NodeId) -> bool:
        idx = self.index_of.get(node_id)
        if idx is None:
            return False
        self.nodes[idx].deleted = True
        return True

    # ---------- read ----------

    def visible_nodes(self) -> List[Node]:
        return [n for n in self.nodes if not n.deleted]

    def get_text(self) -> str:
        return "".join(n.value for n in self.visible_nodes())

    def id_at_visible_index(self, i: int) -> Optional[NodeId]:
        """id of the visible character currently at position i (0-based).
        Returns None if i == len(text) (i.e. 'end of document')."""
        vis = self.visible_nodes()
        if 0 <= i < len(vis):
            return vis[i].id
        return None

    def origin_before_visible_index(self, i: int) -> Optional[NodeId]:
        """id to use as `origin` when inserting at visible position i
        (i.e. the id of the visible char immediately before position i)."""
        vis = self.visible_nodes()
        if i <= 0:
            return None
        return vis[i - 1].id

    def snapshot(self) -> List[dict]:
        """Full state for a client that just (re)joined — includes tombstones
        so the client can build its own mirror and stay resync-able."""
        return [
            {"id": list(n.id), "origin": list(n.origin) if n.origin else None,
             "value": n.value, "deleted": n.deleted}
            for n in self.nodes
        ]
