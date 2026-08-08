import { useCallback, useEffect, useRef, useState } from "react";
import { RGADocument } from "./crdt";
import { diffToOps } from "./diff";

const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

function visibleIndexOfNode(doc, id) {
  if (!id) return -1;
  const vis = doc.visibleNodes();
  for (let i = 0; i < vis.length; i++) {
    if (vis[i].id[0] === id[0] && vis[i].id[1] === id[1]) return i;
  }
  return -1;
}

export function useSync(roomId, name) {
  const docRef = useRef(new RGADocument());
  const wsRef = useRef(null);
  const siteIdRef = useRef(null);
  const pingSentAtRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const manuallyClosedRef = useRef(false);

  const localCursorRef = useRef(0);
  const [cursorCorrection, setCursorCorrection] = useState({ index: 0, version: 0 });

  const [text, setText] = useState("");
  const [nodes, setNodes] = useState([]);
  const [presence, setPresence] = useState([]); // [{site_id,name,color,cursor}]
  const [remoteCursors, setRemoteCursors] = useState({}); // site_id -> index
  const [status, setStatus] = useState("connecting"); // connecting | open | closed
  const [latency, setLatency] = useState(null);
  const [opsMerged, setOpsMerged] = useState(0);
  const [myColor, setMyColor] = useState("#22d3ee");
  const [flashConflict, setFlashConflict] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current) {
      // Close any existing socket without triggering its reconnect
      const oldWs = wsRef.current;
      wsRef.current = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.close();
    }

    manuallyClosedRef.current = false;
    setStatus("connecting");
    const ws = new WebSocket(`${WS_BASE}/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(JSON.stringify({ type: "join", name }));
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (evt) => {
      if (wsRef.current !== ws) return;
      const msg = JSON.parse(evt.data);

      // Ignore messages echoed from our own site ID if any
      if (msg.from && siteIdRef.current && msg.from === siteIdRef.current) {
        return;
      }

      switch (msg.type) {
        case "sync": {
          siteIdRef.current = msg.site_id;
          localCursorRef.current = 0;
          setMyColor(msg.your_color);
          docRef.current.loadSnapshot(msg.snapshot);
          setText(docRef.current.getText());
          setNodes([...docRef.current.nodes]);
          setPresence(msg.presence);
          setOpsMerged(msg.ops_merged);
          setStatus("open");
          break;
        }
        case "insert": {
          docRef.current.applyRemoteInsert(msg.id, msg.origin, msg.value);
          const insertedAt = visibleIndexOfNode(docRef.current, msg.id);
          if (insertedAt !== -1 && insertedAt <= localCursorRef.current) {
            localCursorRef.current += 1;
            setCursorCorrection((c) => ({ index: localCursorRef.current, version: c.version + 1 }));
          }
          setText(docRef.current.getText());
          setNodes([...docRef.current.nodes]);
          setOpsMerged(msg.ops_merged);
          setFlashConflict(true);
          setTimeout(() => setFlashConflict(false), 400);
          break;
        }
        case "delete": {
          const deletedAt = visibleIndexOfNode(docRef.current, msg.id);
          docRef.current.applyDelete(msg.id);
          if (deletedAt !== -1 && deletedAt < localCursorRef.current) {
            localCursorRef.current = Math.max(0, localCursorRef.current - 1);
            setCursorCorrection((c) => ({ index: localCursorRef.current, version: c.version + 1 }));
          }
          setText(docRef.current.getText());
          setNodes([...docRef.current.nodes]);
          setOpsMerged(msg.ops_merged);
          break;
        }
        case "presence": {
          setPresence(msg.presence);
          break;
        }
        case "cursor": {
          setRemoteCursors((prev) => ({ ...prev, [msg.site_id]: msg.index }));
          break;
        }
        case "left": {
          setPresence((prev) => prev.filter((p) => p.site_id !== msg.site_id));
          setRemoteCursors((prev) => {
            const next = { ...prev };
            delete next[msg.site_id];
            return next;
          });
          break;
        }
        case "pong": {
          setLatency(Date.now() - pingSentAtRef.current);
          break;
        }
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus("closed");
      if (!manuallyClosedRef.current) {
        const delay = Math.min(500 * 2 ** reconnectAttemptRef.current, 5000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      ws.close();
    };
  }, [roomId, name]);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        pingSentAtRef.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 3000);

    return () => {
      manuallyClosedRef.current = true;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  const applyLocalEdit = useCallback((newText) => {
    const doc = docRef.current;
    const siteId = siteIdRef.current;
    if (!siteId) return; // not synced yet
    const oldText = doc.getText();
    if (newText === oldText) return;

    const { deleteStart, deleteEnd, insertAt, insertedText } = diffToOps(oldText, newText);

    // Capture origin for the eventual insert BEFORE deleting -- deleting
    // characters at/after insertAt never changes what sits before it.
    const originForInsert = doc.originBeforeVisibleIndex(insertAt);

    // Delete range, oldest-index-first is fine since we always look up by id.
    const deleteIds = [];
    for (let i = deleteStart; i < deleteEnd; i++) {
      const id = doc.idAtVisibleIndex(deleteStart); // list shrinks as we delete
      if (id) deleteIds.push(id);
      doc.applyDelete(id);
    }
    const ws = wsRef.current;
    for (const id of deleteIds) {
      ws?.readyState === WebSocket.OPEN &&
        ws.send(JSON.stringify({ type: "delete", id }));
    }

    let currentOrigin = originForInsert;
    for (const ch of insertedText) {
      const node = doc.localInsert(siteId, currentOrigin, ch);
      currentOrigin = node.id;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "insert", id: node.id, origin: node.origin, value: ch }));
      }
    }

    localCursorRef.current = insertAt + insertedText.length;
    setText(doc.getText());
    setNodes([...doc.nodes]);
  }, []);

  const sendCursor = useCallback((index) => {
    localCursorRef.current = index;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cursor", index }));
    }
  }, []);

  const simulateDisconnect = useCallback(() => {
    manuallyClosedRef.current = true;
    wsRef.current?.close();
    setTimeout(() => connect(), 800);
  }, [connect]);

  return {
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
    myCursorSiteId: siteIdRef,
    flashConflict,
    simulateDisconnect,
    cursorCorrection,
  };
}
