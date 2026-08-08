import { useMemo, useState, useRef, useEffect } from "react";
import EditorComponent from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-markdown";
import "prismjs/themes/prism-tomorrow.css";

import { useSync } from "./useSync";
import { LandingDemo } from "./LandingDemo";
import { CrdtVisualizer } from "./CrdtVisualizer";
import { CODE_TEMPLATES } from "./templates";
import "./App.css";

const Editor = typeof EditorComponent === "function" ? EditorComponent : (EditorComponent?.default || EditorComponent);

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function getInitialRoom() {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") || null;
}

function getLineCol(str, index) {
  if (index === undefined || index === null) return { line: 1, col: 1 };
  const sliced = (str || "").slice(0, Math.max(0, Math.min(index, (str || "").length)));
  const lines = sliced.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

export default function App() {
  const [roomId, setRoomId] = useState(getInitialRoom);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);

  const handleCreateRoom = () => {
    const id = randomRoomId();
    const url = new URL(window.location.href);
    url.searchParams.set("room", id);
    window.history.replaceState({}, "", url);
    setRoomId(id);
  };

  const handleSetRoomId = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", id);
    window.history.replaceState({}, "", url);
    setRoomId(id);
  };

  if (!joined && !roomId) {
    return (
      <LandingDemo
        onCreateRoom={handleCreateRoom}
        onJoinRoom={(id) => handleSetRoomId(id)}
      />
    );
  }

  if (!joined) {
    return (
      <JoinScreen
        roomId={roomId}
        onCreateRoom={handleCreateRoom}
        onSetRoomId={handleSetRoomId}
        onJoin={(n) => {
          setName(n || "Anonymous");
          setJoined(true);
        }}
        onBackToHome={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("room");
          window.history.replaceState({}, "", url);
          setRoomId(null);
        }}
      />
    );
  }

  return <Room roomId={roomId} name={name} onLeaveRoom={() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
    setRoomId(null);
    setJoined(false);
  }} />;
}

function JoinScreen({ roomId, onCreateRoom, onSetRoomId, onJoin, onBackToHome }) {
  const [nameInput, setNameInput] = useState("");

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="card-brand">
          <span className="brand-logo">⚡</span> SyncPad
        </div>
        <h2>Join Room: <code className="room-code-tag">{roomId}</code></h2>
        <p className="tagline">Enter your nickname to join the real-time pair programming session.</p>

        <input
          className="text-input"
          placeholder="Your nickname (e.g. Alex)"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onJoin(nameInput)}
          autoFocus
        />

        <div className="join-card-buttons">
          <button className="primary-btn" onClick={() => onJoin(nameInput)}>
            Join Room
          </button>
          <button className="secondary-btn" onClick={onBackToHome}>
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

function Room({ roomId, name, onLeaveRoom }) {
  const {
    text,
    nodes,
    applyLocalEdit,
    presence,
    remoteCursors,
    sendCursor,
    status,
    latency,
    opsMerged,
    myColor,
    myCursorSiteId,
    flashConflict,
    simulateDisconnect,
    cursorCorrection,
  } = useSync(roomId, name);

  const [language, setLanguage] = useState("python");
  const [showInspector, setShowInspector] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef(null);
  const shareUrl = window.location.href;

  useEffect(() => {
    const textarea = editorRef.current?._input;
    if (!textarea || document.activeElement !== textarea) return;
    const pos = Math.max(0, Math.min(cursorCorrection.index, text.length));
    textarea.setSelectionRange(pos, pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorCorrection.version]);

  const highlighted = useMemo(() => {
    return (code) => {
      let langObj = languages.python;
      if (language === "javascript") langObj = languages.javascript;
      if (language === "cpp") langObj = languages.cpp;
      if (language === "markup") langObj = languages.markup;
      if (language === "markdown") langObj = languages.markdown;
      return highlight(code || "", langObj || languages.python, language);
    };
  }, [language]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadTemplate = () => {
    const tmpl = CODE_TEMPLATES[language] || CODE_TEMPLATES.python;
    applyLocalEdit(tmpl);
  };

  const handleDownloadCode = () => {
    const extMap = { python: "py", javascript: "js", cpp: "cpp", markup: "html", markdown: "md" };
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `syncpad_${roomId}.${extMap[language] || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="room">
      {/* Room Navigation & Header */}
      <header className="room-header">
        <div className="brand-group" onClick={onLeaveRoom} title="Return to Landing Page">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">SyncPad</span>
          <span className="room-pill">Room: {roomId}</span>
        </div>

        <div className="header-actions">
          {/* Language Selector */}
          <div className="control-group">
            <label>Language:</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="lang-select"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="cpp">C++</option>
              <option value="markup">HTML</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>

          <button className="small-btn template-btn" onClick={handleLoadTemplate} title="Load Starter Code Template">
            📄 Load Template
          </button>

          {/* CRDT Inspector Toggle */}
          <button
            className={`small-btn inspector-toggle-btn ${showInspector ? "active" : ""}`}
            onClick={() => setShowInspector(!showInspector)}
          >
            🔬 Inspect CRDT Engine
          </button>

          {/* Share Room Button */}
          <div className="share-box">
            <button className="primary-btn copy-btn" onClick={handleCopyLink}>
              {copied ? "✓ Link Copied!" : "🔗 Share Link"}
            </button>
          </div>
        </div>
      </header>

      {/* Live Presence & Remote User Bar */}
      <div className="presence-bar">
        <span className="presence-label">Active Collaborators ({presence.length}):</span>
        {presence.map((p) => {
          const isMe = p.site_id === myCursorSiteId.current;
          const cursorPos = remoteCursors[p.site_id] ?? p.cursor;
          const { line, col } = getLineCol(text, cursorPos);
          return (
            <span key={p.site_id} className="presence-chip" style={{ "--chip-color": p.color }}>
              <span className="dot" style={{ background: p.color }} />
              <span className="user-name">{p.name}</span>
              {isMe && <span className="you-badge">(you)</span>}
              {!isMe && (
                <span className="cursor-pos-badge" style={{ color: p.color }}>
                  L{line}:C{col}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Main Editor Section */}
      <main className={`editor-wrap ${flashConflict ? "flash" : ""}`}>
        {/* Floating Remote Carets Overlay */}
        <div className="remote-carets-container">
          {presence
            .filter((p) => p.site_id !== myCursorSiteId.current)
            .map((p) => {
              const cursorPos = remoteCursors[p.site_id] ?? p.cursor;
              const { line, col } = getLineCol(text, cursorPos);
              return (
                <div
                  key={p.site_id}
                  className="floating-caret-badge"
                  style={{ "--caret-color": p.color }}
                >
                  <span className="caret-line-bar" style={{ background: p.color }} />
                  <span className="caret-nametag" style={{ background: p.color }}>
                    {p.name} (L{line}:C{col})
                  </span>
                </div>
              );
            })}
        </div>

        <Editor
          ref={editorRef}
          value={text}
          onValueChange={(v) => applyLocalEdit(v)}
          onKeyUp={(e) => sendCursor(e.target.selectionStart)}
          onClick={(e) => sendCursor(e.target.selectionStart)}
          highlight={highlighted}
          padding={20}
          className="code-editor"
          textareaClassName="code-editor-textarea"
          style={{
            fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", monospace',
            fontSize: 14,
            minHeight: "65vh",
          }}
        />
      </main>

      {/* Footer & Status Control Bar */}
      <footer className="status-bar">
        <div className="status-item">
          <span className={`status-dot ${status}`} />
          <span className="status-text">{status}</span>
        </div>
        <span className="sep">|</span>
        <div className="status-item">
          <span className="metric-label">Latency:</span> {latency !== null ? `${latency}ms` : "…"}
        </div>
        <span className="sep">|</span>
        <div className="status-item">
          <span className="metric-label">CRDT Ops Merged:</span> {opsMerged}
        </div>
        <span className="sep">|</span>
        <div className="status-item">
          <span className="metric-label">Memory Nodes:</span> {nodes.length}
        </div>
        <span className="sep">|</span>
        <div className="footer-actions">
          <button className="action-link-btn" onClick={handleDownloadCode}>
            💾 Download Code
          </button>
          <button className="action-link-btn" onClick={() => applyLocalEdit("")}>
            🗑️ Clear Editor
          </button>
          <button className="action-link-btn disconnect-btn" onClick={simulateDisconnect}>
            🔄 Test Offline Reconnect
          </button>
        </div>
      </footer>

      {/* CRDT Inspector Modal Drawer */}
      {showInspector && (
        <CrdtVisualizer
          nodes={nodes}
          presence={presence}
          opsMerged={opsMerged}
          onClose={() => setShowInspector(false)}
        />
      )}
    </div>
  );
}
