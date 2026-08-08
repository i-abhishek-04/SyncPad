# SyncPad

A real-time collaborative code pad for pair-programming / mock-interview
practice. Two (or more) people open the same room and see each other's
edits, cursors, and presence live — with the text-merging logic built
**from scratch**, not from Yjs/Automerge/ShareDB.

## Status: tonight's build

This is the core-engine build: the hand-built CRDT, the WebSocket relay,
and a working two-person editor with presence, reconnect, and syntax
highlighting. It's genuinely usable right now for a real pair-programming
session. What's **not** in this pass yet: the auto-playing landing/demo
page, deployment, and animated cursor overlays — see "Next" below.

## Why this exists

This doesn't solve a problem the market lacks (Google Docs, VS Code Live
Share, Replit already nail this). It exists to demonstrate real
understanding of concurrent state synchronization — the same class of
problem behind Figma's multiplayer cursors and Notion's live blocks —
scoped around a use case I'd actually use: two students on a shared link,
coding a problem together for interview prep.

## How it works

```
Client A  ⇄  WebSocket  ⇄  FastAPI room relay  ⇄  WebSocket  ⇄  Client B
   |                                                              |
   +---- both run the SAME hand-built RGA CRDT locally -----------+
```

- The **server is a dumb relay + authoritative merge log**: it applies
  every op to its own copy of the document (so a client that joins mid-
  session gets the correct current state) and rebroadcasts the op to
  everyone else. It does not do any conflict resolution beyond what the
  CRDT integration algorithm itself defines.
- Every **client keeps its own live mirror** of the document (same CRDT
  code, ported to JS) so typing feels instant — it never waits on a
  round-trip before showing your own keystroke.

## The CRDT (the actual point of this project)

Implemented as an **RGA (Replicated Growable Array)**, based on Roh et
al. 2011 — the same family of algorithm YATA/Yjs is built on, just
without the production-grade optimizations.

- Every character gets a globally unique id: `(site_id, counter)`.
- Every character also stores an `origin`: the id of the character it
  was inserted immediately after, at the moment of insertion.
- To integrate a new character, walk right from its origin and skip
  past any **concurrent siblings** — other characters that share the
  same origin — using a deterministic tie-break (higher id sorts
  further left). Because every replica applies the exact same rule,
  they all converge to the same order regardless of what order the
  network delivers the ops in.
- Deletions are **tombstoned** (kept, marked deleted) rather than
  removed, so a later op whose `origin` points at a deleted character
  can still be positioned correctly.
- A remote op whose `origin` hasn't arrived yet is buffered and
  retried once its origin shows up (handles out-of-order delivery).

This is why fractional/LSEQ positioning wasn't used instead: RGA's
ordering is decided purely by integer comparison, so it doesn't
accumulate floating-point precision loss after many inserts squeezed
between the same two neighbors, and the convergence argument is simpler
to state (and to test — see `backend/test_crdt.py`).

### Convergence, actually tested

`backend/test_crdt.py` has four tests, all passing:
1. Two replicas concurrently insert different characters at the exact
   same empty-document position — both survive, both replicas converge
   to the identical final string.
2. Same thing but mid-document (`"ac"` → two concurrent inserts between
   `a` and `c`).
3. Insert whose `origin` is a character that gets deleted in between —
   still lands in the right place.
4. Remote inserts delivered **out of order** — buffered and drained
   correctly once their origin arrives.

Run them: `cd backend && python3 test_crdt.py`

There's also a live end-to-end check (two real WebSocket clients typing
concurrently into the same room, verified against a third client's
fresh sync) that produced `HELLOWORLD` from concurrent `HELLO` /
`WORLD` typing — full text of both survived, correctly merged.

## Simplifications vs. a production CRDT

- **O(n) per operation** (linear scan / array insert). Fine for a
  single shared pad's worth of text; not built for huge documents.
- **No tombstone garbage collection** — a production CRDT needs
  causal-stability tracking (vector clocks) to know when it's safe to
  compact deleted characters. Not implemented.
- **Single-server only.** No distribution across multiple backend
  nodes — the server is the one authoritative relay for a room.
- **No persistence across server restarts** — rooms are in-memory only,
  by design (see stack scoping below). Restarting the backend loses all
  active rooms.
- **No rich text / formatting** — plain text only.
- **Plain-text diffing on the client** uses a common-prefix/suffix trim
  to turn a `<textarea>` change into ops. This covers typing, backspace,
  and paste correctly; it isn't a general multi-cursor diff algorithm.

## Stack (intentionally minimal — see project brief)

- **Backend:** Python, FastAPI, native WebSocket support. No Socket.IO.
- **Frontend:** React + Vite, `react-simple-code-editor` + `prismjs` for
  syntax highlighting.
- **State:** in-memory Python dict per room. No database.
- **No CRDT library.** No message broker. No Kubernetes.

## Running it locally

Backend:
```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open the printed local URL in two browser tabs, create a room in one,
and open the shareable link (with `?room=...`) in the other.

## Next (not done tonight)

- Landing/demo page with an auto-playing simulated two-pane sync on
  load, plus a "How it works" diagram — this is portfolio-facing
  marketing, deliberately deferred so the actual engine got the time.
- Deploy: Render (backend) + Vercel (frontend). Straightforward once
  this is confirmed working locally; ~5 minutes of config.
- Animated, pixel-positioned live cursor carets (currently: presence
  chips + cursor position tracked and broadcast, but not drawn as
  in-text overlays yet).
- README section with actual screenshots once deployed.
