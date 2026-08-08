import React, { useState, useEffect, useRef } from "react";
import { RGADocument } from "./crdt";

const PRESETS = {
  python: [
    { site: "s1", name: "Alice", char: "d", delay: 180 },
    { site: "s2", name: "Bob", char: "f", delay: 220 },
    { site: "s1", name: "Alice", char: "e", delay: 160 },
    { site: "s2", name: "Bob", char: "u", delay: 200 },
    { site: "s1", name: "Alice", char: "f", delay: 180 },
    { site: "s2", name: "Bob", char: "n", delay: 190 },
    { site: "s1", name: "Alice", char: " ", delay: 140 },
    { site: "s2", name: "Bob", char: " ", delay: 180 },
    { site: "s1", name: "Alice", char: "s", delay: 200 },
    { site: "s2", name: "Bob", char: "s", delay: 170 },
    { site: "s1", name: "Alice", char: "y", delay: 180 },
    { site: "s2", name: "Bob", char: "y", delay: 190 },
    { site: "s1", name: "Alice", char: "n", delay: 150 },
    { site: "s2", name: "Bob", char: "n", delay: 160 },
    { site: "s1", name: "Alice", char: "c", delay: 190 },
    { site: "s2", name: "Bob", char: "c", delay: 210 },
    { site: "s1", name: "Alice", char: "(", delay: 160 },
    { site: "s2", name: "Bob", char: "(", delay: 170 },
    { site: "s1", name: "Alice", char: "a", delay: 140 },
    { site: "s2", name: "Bob", char: "b", delay: 150 },
    { site: "s1", name: "Alice", char: ")", delay: 190 },
    { site: "s2", name: "Bob", char: ")", delay: 200 },
  ],
  javascript: [
    { site: "s1", name: "Alice", char: "c", delay: 160 },
    { site: "s2", name: "Bob", char: "a", delay: 180 },
    { site: "s1", name: "Alice", char: "o", delay: 140 },
    { site: "s2", name: "Bob", char: "s", delay: 170 },
    { site: "s1", name: "Alice", char: "n", delay: 150 },
    { site: "s2", name: "Bob", char: "y", delay: 160 },
    { site: "s1", name: "Alice", char: "s", delay: 160 },
    { site: "s2", name: "Bob", char: "n", delay: 170 },
    { site: "s1", name: "Alice", char: "o", delay: 150 },
    { site: "s2", name: "Bob", char: "c", delay: 180 },
    { site: "s1", name: "Alice", char: "l", delay: 140 },
    { site: "s2", name: "Bob", char: " ", delay: 150 },
    { site: "s1", name: "Alice", char: "e", delay: 160 },
    { site: "s2", name: "Bob", char: "=", delay: 190 },
    { site: "s1", name: "Alice", char: ".", delay: 150 },
    { site: "s2", name: "Bob", char: ">", delay: 170 },
    { site: "s1", name: "Alice", char: "l", delay: 140 },
    { site: "s2", name: "Bob", char: " ", delay: 150 },
    { site: "s1", name: "Alice", char: "o", delay: 150 },
    { site: "s2", name: "Bob", char: "1", delay: 180 },
    { site: "s1", name: "Alice", char: "g", delay: 160 },
    { site: "s2", name: "Bob", char: "0", delay: 170 },
  ],
};

export function LandingDemo({ onCreateRoom, onJoinRoom }) {
  const [roomCode, setRoomCode] = useState("");
  const [preset, setPreset] = useState("python");
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [aliceText, setAliceText] = useState("");
  const [bobText, setBobText] = useState("");
  const [mergedText, setMergedText] = useState("");
  const [opCount, setOpCount] = useState(0);
  const [opTickerLogs, setOpTickerLogs] = useState([]);
  const [customInput, setCustomInput] = useState("");

  const doc1Ref = useRef(new RGADocument());
  const doc2Ref = useRef(new RGADocument());
  const stepRef = useRef(0);

  const activeScript = PRESETS[preset] || PRESETS.python;

  const resetSimulator = () => {
    stepRef.current = 0;
    doc1Ref.current = new RGADocument();
    doc2Ref.current = new RGADocument();
    setAliceText("");
    setBobText("");
    setMergedText("");
    setOpCount(0);
    setOpTickerLogs([]);
  };

  useEffect(() => {
    resetSimulator();
  }, [preset]);

  useEffect(() => {
    let timer;
    if (isPlaying) {
      const runStep = () => {
        if (stepRef.current >= activeScript.length) {
          resetSimulator();
        }

        const action = activeScript[stepRef.current];
        if (!action) return;
        stepRef.current += 1;

        let node;
        if (action.site === "s1") {
          const vis = doc1Ref.current.visibleNodes();
          const origin = vis.length > 0 ? vis[vis.length - 1].id : null;
          node = doc1Ref.current.localInsert("s1", origin, action.char);
          doc2Ref.current.applyRemoteInsert(node.id, node.origin, node.value);
          setAliceText((prev) => prev + action.char);
        } else {
          const vis = doc2Ref.current.visibleNodes();
          const origin = vis.length > 0 ? vis[vis.length - 1].id : null;
          node = doc2Ref.current.localInsert("s2", origin, action.char);
          doc1Ref.current.applyRemoteInsert(node.id, node.origin, node.value);
          setBobText((prev) => prev + action.char);
        }

        const logItem = `[${node.id[0]}:${node.id[1]}] INSERT '${action.char}' (origin: ${
          node.origin ? node.origin[0] + ":" + node.origin[1] : "ROOT"
        })`;

        setOpTickerLogs((prev) => [logItem, ...prev.slice(0, 4)]);
        setMergedText(doc1Ref.current.getText());
        setOpCount(stepRef.current);

        const adjustedDelay = action.delay / speedMultiplier;
        timer = setTimeout(runStep, adjustedDelay);
      };

      timer = setTimeout(runStep, 200 / speedMultiplier);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, preset, speedMultiplier]);

  const handleInjectCustomText = () => {
    if (!customInput.trim()) return;
    for (const ch of customInput) {
      const vis = doc1Ref.current.visibleNodes();
      const origin = vis.length > 0 ? vis[vis.length - 1].id : null;
      const node = doc1Ref.current.localInsert("s1", origin, ch);
      doc2Ref.current.applyRemoteInsert(node.id, node.origin, node.value);
      setAliceText((prev) => prev + ch);

      const logItem = `[s1:${node.id[1]}] CUSTOM INJECT '${ch}'`;
      setOpTickerLogs((prev) => [logItem, ...prev.slice(0, 4)]);
    }
    setMergedText(doc1Ref.current.getText());
    setCustomInput("");
  };

  return (
    <div className="landing-page">
      {/* Hero Header Section */}
      <div className="hero-section">
        <div className="hero-badge">
          <span className="pulse-dot" /> Built from Scratch Roh et al. 2011 RGA Engine
        </div>
        <h1 className="hero-title">
          Real-Time Collaborative Code Pad <br />
          <span className="gradient-text">Engineered for Concurrency</span>
        </h1>
        <p className="hero-subtitle">
          Zero central locks, 100% deterministic replica convergence.
          Watch concurrent operations interleave live in the real-time split-screen simulator below.
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

      {/* Live Interactive Split-Screen Simulator */}
      <div className="demo-simulator-container">
        <div className="simulator-header">
          <div className="sim-title">
            <span className="live-pill">LIVE CRDT SIMULATOR</span>
            <span>Concurrent Typing Merging in Real-Time</span>
          </div>

          <div className="sim-toolbar-controls">
            {/* Speed Selector */}
            <div className="speed-group">
              <span className="ctrl-label">Speed:</span>
              {[0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  className={`speed-btn ${speedMultiplier === s ? "active" : ""}`}
                  onClick={() => setSpeedMultiplier(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Script Preset Selector */}
            <select
              className="preset-select"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="python">Python Preset</option>
              <option value="javascript">JavaScript Preset</option>
            </select>

            <span className="ops-chip">Merged Ops: {opCount}</span>

            <button className="sim-toggle-btn" onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? "⏸ Pause" : "▶ Play"}
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
            <div className="custom-inject-box">
              <input
                type="text"
                placeholder="Type custom text to inject..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInjectCustomText()}
              />
              <button onClick={handleInjectCustomText}>Inject</button>
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

          {/* Merged Convergent Document Mirror */}
          <div className="sim-pane merged-pane">
            <div className="pane-header">
              <span className="sparkle-icon">✨</span>
              <span className="user-name">Convergent Document Mirror</span>
              <span className="crdt-tag">Strong Eventual Consistency</span>
            </div>
            <div className="sim-editor-content">
              <code className="highlight-code">{mergedText || "// Watching live convergence..."}</code>
            </div>
          </div>
        </div>

        {/* Live WebSocket Operation Stream Ticker Bar */}
        <div className="op-ticker-bar">
          <span className="ticker-label">⚡ Live Op Stream:</span>
          <div className="ticker-logs">
            {opTickerLogs.length === 0 ? (
              <span className="ticker-empty">Streaming CRDT operations...</span>
            ) : (
              opTickerLogs.map((log, idx) => (
                <span key={idx} className="ticker-item">
                  {log}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🚀</div>
          <h3>Hand-Crafted RGA Engine</h3>
          <p>
            Built from scratch without external CRDT libraries (Yjs/ShareDB). Roh et al. 2011 integer tie-breaking ensures 100% replica convergence.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>Tombstone Resilience</h3>
          <p>
            Deletions preserve character origin IDs so delayed remote inserts always land in their correct relative position.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Native WebSockets</h3>
          <p>
            Lightweight, high-frequency JSON op-streaming with minimal memory overhead and 0ms perceived local typing latency.
          </p>
        </div>
      </div>
    </div>
  );
}
