// Client-side mirror of the hand-built RGA CRDT (see backend/crdt.py for
// the authoritative write-up of the algorithm and its tradeoffs). The
// server doesn't run any "extra" logic the client doesn't also run -- both
// sides implement the exact same integrate algorithm, which is *how* a
// CRDT gives every replica the same convergence guarantee.

function idEq(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}
function idKey(id) {
  return id ? `${id[0]}:${id[1]}` : "root";
}
function idGt(a, b) {
  // compare (counter, site) so ordering doesn't let site-id strings dominate
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[0] > b[0];
}

export class RGADocument {
  constructor() {
    this.nodes = []; // {id, origin, value, deleted}
    this.indexOf = new Map(); // idKey -> index
    this.pending = [];
    this.counters = {};
  }

  nextId(siteId) {
    const c = (this.counters[siteId] || 0) + 1;
    this.counters[siteId] = c;
    return [siteId, c];
  }

  originIndex(origin) {
    if (origin === null || origin === undefined) return -1;
    const idx = this.indexOf.get(idKey(origin));
    return idx === undefined ? undefined : idx;
  }

  place(node) {
    if (node.origin !== null && node.origin !== undefined) {
      if (!this.indexOf.has(idKey(node.origin))) {
        this.pending.push(node);
        return false;
      }
    }
    const originIdx = this.originIndex(node.origin);
    let insertAt = originIdx + 1;

    while (insertAt < this.nodes.length) {
      const candidate = this.nodes[insertAt];
      const candOriginIdx = this.originIndex(candidate.origin);
      if (candOriginIdx < originIdx) break;
      if (candOriginIdx === originIdx) {
        if (idGt(candidate.id, node.id)) {
          insertAt += 1;
          continue;
        } else {
          break;
        }
      }
      insertAt += 1;
    }

    this.nodes.splice(insertAt, 0, node);
    this.reindexFrom(insertAt);
    return true;
  }

  reindexFrom(start) {
    for (let i = start; i < this.nodes.length; i++) {
      this.indexOf.set(idKey(this.nodes[i].id), i);
    }
  }

  drainPending() {
    let progress = true;
    while (progress && this.pending.length) {
      progress = false;
      const stillPending = [];
      for (const node of this.pending) {
        if (node.origin === null || node.origin === undefined || this.indexOf.has(idKey(node.origin))) {
          this.place(node);
          progress = true;
        } else {
          stillPending.push(node);
        }
      }
      this.pending = stillPending;
    }
  }

  integrate(node) {
    this.place(node);
    this.drainPending();
  }

  localInsert(siteId, afterId, value) {
    const node = { id: this.nextId(siteId), origin: afterId, value, deleted: false };
    this.integrate(node);
    return node;
  }

  applyRemoteInsert(id, origin, value) {
    this.integrate({ id, origin: origin ?? null, value, deleted: false });
  }

  applyDelete(id) {
    const idx = this.indexOf.get(idKey(id));
    if (idx === undefined) return false;
    this.nodes[idx].deleted = true;
    return true;
  }

  visibleNodes() {
    return this.nodes.filter((n) => !n.deleted);
  }

  getText() {
    return this.visibleNodes().map((n) => n.value).join("");
  }

  originBeforeVisibleIndex(i) {
    const vis = this.visibleNodes();
    if (i <= 0) return null;
    return vis[i - 1].id;
  }

  idAtVisibleIndex(i) {
    const vis = this.visibleNodes();
    return i >= 0 && i < vis.length ? vis[i].id : null;
  }

  loadSnapshot(snapshot) {
    // snapshot is server document order INCLUDING tombstones; integrate
    // in order so origin references always resolve.
    this.nodes = [];
    this.indexOf = new Map();
    this.pending = [];
    for (const n of snapshot) {
      const node = { id: n.id, origin: n.origin, value: n.value, deleted: n.deleted };
      this.place(node);
    }
    this.drainPending();
  }
}

export { idEq };
