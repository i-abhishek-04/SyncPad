import React, { useState, useEffect, useRef } from "react";
import { RGADocument } from "./crdt";

const SCRIPT = [
  { site: "s1", name: "Alice", char: "d", delay: 200 },
  { site: "s2", name: "Bob", char: "f", delay: 250 },
  { site: "s1", name: "Alice", char: "e", delay: 180 },
  { site: "s2", name: "Bob", char: "u", delay: 220 },
  { site: "s1", name: "Alice", char: "f", delay: 200 },
  { site: "s2", name: "Bob", char: "n", delay: 190 },
  { site: "s1", name: "Alice", char: " ", delay: 150 },
  { site: "s2", name: "Bob", char: " ", delay: 200 },
  { site: "s1", name: "Alice", char: "s", delay: 220 },
  { site: "s2", name: "Bob", char: "s", delay: 180 },
  { site: "s1", name: "Alice", char: "y", delay: 190 },
  { site: "s2", name: "Bob", char: "y", delay: 210 },
  { site: "s1", name: "Alice", char: "n", delay: 160 },
  { site: "s2", name: "Bob", char: "n", delay: 170 },
  { site: "s1", name: "Alice", char: "c", delay: 200 },
  { site: "s2", name: "Bob", char: "c", delay: 240 },
  { site: "s1", name: "Alice", char: "(", delay: 180 },
  { site: "s2", name: "Bob", char: "(", delay: 190 },
  { site: "s1", name: "Alice", char: "a", delay: 150 },
  { site: "s2", name: "Bob", char: "b", delay: 160 },
  { site: "s1", name: "Alice", char: ")", delay: 210 },
  { site: "s2", name: "Bob", char: ")", delay: 220 },
];

export function LandingDemo({ onCreateRoom, onJoinRoom }) {
  const [roomCode, setRoomCode] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const [aliceText, setAliceText] = useState("");
  const [bobText, setBobText] = useState("");
  const [mergedText, setMergedText] = useState("");
  const [opCount, setOpCount] = useState(0);

  const doc1Ref = useRef(new RGADocument());
  const doc2Ref = useRef(new RGADocument());
  const stepRef = useRef(0);

  useEffect(() => {
    let timer;
    if (isPlaying) {
      const runStep = () => {
        if (stepRef.current >= SCRIPT.length) {
          stepRef.current = 0;
          doc1Ref.current = new RGADocument();
          doc2Ref.current = new RGADocument();
          setAliceText("");
          setBobText("");
          setMergedText("");
          setOpCount(0);
        }

        const action = SCRIPT[stepRef.current];
        stepRef.current += 1;

        if (action.site === "s1") {
          const vis = doc1Ref.current.visibleNodes();
          const origin = vis.length > 0 ? vis[vis.length - 1].id : null;
          const node = doc1Ref.current.localInsert("s1", origin, action.char);
          doc2Ref.current.applyRemoteInsert(node.id, node.origin, node.value);
          setAliceText((prev) => prev + action.char);
        } else {
          const vis = doc2Ref.current.visibleNodes();
          const origin = vis.length > 0 ? vis[vis.length - 1].id : null;
          const node = doc2Ref.current.localInsert("s2", origin, action.char);
          doc1Ref.current.applyRemoteInsert(node.id, node.origin, node.value);
          setBobText((prev) => prev + action.char);
        }

        setMergedText(doc1Ref.current.getText());
        setOpCount(stepRef.current);

        timer = setTimeout(runStep, action.delay);
      };

      timer = setTimeout(runStep, 300);
    }
    return () => clearTimeout(timer);
  }, [isPlaying]);

  return (
    <div className="landing-page">
      <div className="hero-section">
        <div className="hero-badge">
          <span className="pulse-dot" /> Built from Scratch RGA CRDT Engine
        </div>
        <h1 className="hero-title">
          Real-Time Code Collaboration <br />
          <span className="gradient-text">Engineered for Concurrency</span>
        </h1>
        <p className="hero-subtitle">
          Two developers, zero server locks, 100% deterministic convergence.
          Experience low-latency peer-style pair programming with built-in CRDT state inspection.
        </p>

        <div className="hero-actions">
          <button className="cta-primary-btn" onClick={onCreateRoom}>
            <span className="btn-icon">⚡</span> Create Live Room
          </button>
          <div className="join-inline-form">
            <input
              type="text"
              placeholder="Enter Room Code (e.g. x8k9p2)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && roomCode.trim() && onJoinRoom(roomCode.trim())}
            />
            <button
              className="cta-secondary-btn"
              disabled={!roomCode.trim()}
              onClick={() => onJoinRoom(roomCode.trim())}
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {/* Live Split-Screen Simulator */}
      <div className="demo-simulator-container">
        <div className="simulator-header">
          <div className="sim-title">
            <span className="live-pill">LIVE SIMULATION</span>
            <span>Concurrent Typing Merging in Real-Time</span>
          </div>
          <div className="sim-controls">
            <span className="ops-chip">Ops: {opCount}</span>
            <button
              className="sim-toggle-btn"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? "⏸ Pause Demo" : "▶ Replay Demo"}
            </button>
          </div>
        </div>

        <div className="simulator-grid">
          {/* Alice's Pane */}
          <div className="sim-pane alice-pane">
            <div className="pane-header">
              <span className="user-dot alice-dot" />
              <span className="user-name">Alice (Client A)</span>
              <span className="site-tag">site_id: s1</span>
            </div>
            <div className="sim-editor-content">
              <code>{aliceText}</code>
              <span className="sim-caret alice-caret" />
            </div>
          </div>

          {/* Bob's Pane */}
          <div className="sim-pane bob-pane">
            <div className="pane-header">
              <span className="user-dot bob-dot" />
              <span className="user-name">Bob (Client B)</span>
              <span className="site-tag">site_id: s2</span>
            </div>
            <div className="sim-editor-content">
              <code>{bobText}</code>
              <span className="sim-caret bob-caret" />
            </div>
          </div>

          {/* Merged Convergent State */}
          <div className="sim-pane merged-pane">
            <div className="pane-header">
              <span className="sparkle-icon">✨</span>
              <span className="user-name">Convergent Document Mirror</span>
              <span className="crdt-tag">CRDT RGA State</span>
            </div>
            <div className="sim-editor-content">
              <code className="highlight-code">{mergedText || "// Watching live convergence..."}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🚀</div>
          <h3>Hand-Crafted RGA Engine</h3>
          <p>
            Implemented without external CRDT libraries (Yjs/ShareDB). Uses Roh et al. 2011 integer tie-breaking for perfect replica convergence.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>Tombstone Resilience</h3>
          <p>
            Deletions preserve character origin IDs so out-of-order remote inserts always land in their correct relative positions.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Native WebSockets</h3>
          <p>
            Lightweight, high-frequency JSON op-streaming with minimal memory overhead and instant local optimism.
          </p>
        </div>
      </div>
    </div>
  );
}
