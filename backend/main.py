"""
SyncPad backend.

Stack: FastAPI + native WebSockets only (no Socket.IO). In-memory room
state only (no DB, no persistence across restarts) — see README.

WebSocket message protocol
---------------------------
Client -> Server:
  {"type": "join",   "room": str, "name": str}
  {"type": "insert", "id": [site,counter], "origin": [site,counter]|null, "value": str}
  {"type": "delete", "id": [site,counter]}
  {"type": "cursor",  "index": int}
  {"type": "ping"}

Server -> Client:
  {"type": "sync",     "site_id", "snapshot": [...], "presence": [...], "ops_merged": int}
  {"type": "insert",   "id", "origin", "value", "from": site_id}
  {"type": "delete",   "id", "from": site_id}
  {"type": "presence", "presence": [...]}
  {"type": "left",     "site_id": str}
  {"type": "pong"}
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from rooms import RoomRegistry, new_site_id

app = FastAPI(title="SyncPad")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed frontend origin before shipping publicly
    allow_methods=["*"],
    allow_headers=["*"],
)

registry = RoomRegistry()


@app.get("/health")
async def health():
    return {"status": "ok", "rooms": len(registry.rooms)}


@app.websocket("/ws/{room_id}")
async def ws_room(websocket: WebSocket, room_id: str):
    await websocket.accept()
    room = registry.get_or_create(room_id)
    site_id = new_site_id()
    client = None

    try:
        # First message from the client must be "join"
        join_msg = await websocket.receive_json()
        name = (join_msg.get("name") or "Anonymous")[:24] if join_msg.get("type") == "join" else "Anonymous"

        client = room.add_client(site_id, websocket, name)

        # Send full snapshot so this client can build its CRDT mirror,
        # plus current presence and op count -- this is the resync path
        # used both for first join AND for reconnects.
        await websocket.send_json({
            "type": "sync",
            "site_id": site_id,
            "your_color": client.color,
            "snapshot": room.doc.snapshot(),
            "presence": room.presence_list(),
            "ops_merged": room.ops_merged,
        })

        # Tell everyone else this client joined
        await room.broadcast({"type": "presence", "presence": room.presence_list()}, exclude_site_id=site_id)

        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")

            if mtype == "insert":
                node_id = tuple(msg["id"])
                origin = tuple(msg["origin"]) if msg.get("origin") is not None else None
                value = msg["value"]
                room.doc.apply_remote_insert(node_id, origin, value)
                room.ops_merged += 1
                await room.broadcast({
                    "type": "insert", "id": msg["id"], "origin": msg.get("origin"),
                    "value": value, "from": site_id, "ops_merged": room.ops_merged,
                }, exclude_site_id=site_id)

            elif mtype == "delete":
                node_id = tuple(msg["id"])
                ok = room.doc.apply_delete(node_id)
                if ok:
                    room.ops_merged += 1
                    await room.broadcast({
                        "type": "delete", "id": msg["id"], "from": site_id,
                        "ops_merged": room.ops_merged,
                    }, exclude_site_id=site_id)

            elif mtype == "cursor":
                idx = int(msg.get("index", 0))
                if site_id in room.clients:
                    room.clients[site_id].cursor_index = idx
                await room.broadcast({
                    "type": "cursor", "site_id": site_id, "index": idx,
                }, exclude_site_id=site_id)

            elif mtype == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        if client is not None:
            room.remove_client(site_id)
            await room.broadcast({"type": "left", "site_id": site_id})
            registry.drop_if_empty(room_id)
