import React from "react";

export function CrdtVisualizer({ nodes, presence, opsMerged, onClose }) {
  const presenceMap = presence.reduce((acc, p) => {
    acc[p.site_id] = p;
    return acc;
  }, {});

  const totalNodes = nodes.length;
  const activeNodes = nodes.filter((n) => !n.deleted).length;
  const tombstoneCount = totalNodes - activeNodes;

  return (
    <div className="crdt-inspector-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crdt-inspector-modal">
        <header className="inspector-header">
          <div className="inspector-title">
            <span className="sparkle-icon">⚡</span>
            <h3>CRDT State Inspector</h3>
            <span className="algorithm-badge">Roh et al. 2011 RGA</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Close Inspector">
            ✕
          </button>
        </header>

        <div className="inspector-stats">
          <div className="stat-card">
            <span className="stat-value">{opsMerged}</span>
            <span className="stat-label">Ops Merged</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeNodes}</span>
            <span className="stat-label">Active Nodes</span>
          </div>
          <div className="stat-card">
            <span className="stat-value text-warning">{tombstoneCount}</span>
            <span className="stat-label">Tombstones (Deleted)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value text-accent">{totalNodes}</span>
            <span className="stat-label">Total RGA Memory Nodes</span>
          </div>
        </div>

        <div className="inspector-explain">
          <p>
            <strong>How SyncPad Merges Edits:</strong> Every character is stored as an immutable RGA node with a unique <code>(site_id, counter)</code> ID and an <code>origin</code> pointer. Deletions are tombstoned to preserve concurrent insert positioning without central locks.
          </p>
        </div>

        <div className="nodes-container">
          <h4>Replicated Growable Array (RGA) Sequence</h4>
          {nodes.length === 0 ? (
            <div className="empty-nodes">Document is empty. Type in the editor to inspect live CRDT node allocations!</div>
          ) : (
            <div className="node-list">
              {nodes.map((node, index) => {
                const siteId = node.id ? node.id[0] : "root";
                const counter = node.id ? node.id[1] : 0;
                const user = presenceMap[siteId] || { name: siteId, color: "#818cf8" };
                const originStr = node.origin ? `${node.origin[0]}:${node.origin[1]}` : "ROOT";

                return (
                  <div
                    key={`${siteId}-${counter}-${index}`}
                    className={`node-chip ${node.deleted ? "deleted" : ""}`}
                    style={{ "--user-color": user.color }}
                  >
                    <div className="node-header">
                      <span className="node-id">
                        {siteId}:{counter}
                      </span>
                      <span className="node-char">
                        {node.value === " " ? "␣" : node.value === "\n" ? "↵" : node.value}
                      </span>
                    </div>
                    <div className="node-meta">
                      <span className="node-origin">origin: {originStr}</span>
                      {node.deleted && <span className="tombstone-tag">TOMBSTONE</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
