"""In-memory room state. No database, no persistence across restarts —
this is intentional (see project README, Section 3)."""

import random
from dataclasses import dataclass, field
from typing import Dict, Optional
from fastapi import WebSocket

from crdt import RGADocument

USER_COLORS = [
    "#f97316", "#22d3ee", "#a3e635", "#f472b6",
    "#818cf8", "#facc15", "#34d399", "#fb7185",
]


@dataclass
class Client:
    site_id: str
    websocket: WebSocket
    name: str
    color: str
    cursor_index: int = 0


@dataclass
class Room:
    room_id: str
    doc: RGADocument = field(default_factory=RGADocument)
    clients: Dict[str, Client] = field(default_factory=dict)
    ops_merged: int = 0

    def add_client(self, site_id: str, websocket: WebSocket, name: str) -> Client:
        color = USER_COLORS[len(self.clients) % len(USER_COLORS)]
        client = Client(site_id=site_id, websocket=websocket, name=name, color=color)
        self.clients[site_id] = client
        return client

    def remove_client(self, site_id: str):
        self.clients.pop(site_id, None)

    def presence_list(self):
        return [
            {"site_id": c.site_id, "name": c.name, "color": c.color, "cursor": c.cursor_index}
            for c in self.clients.values()
        ]

    async def broadcast(self, message: dict, exclude_site_id: Optional[str] = None):
        dead = []
        for site_id, client in self.clients.items():
            if site_id == exclude_site_id:
                continue
            try:
                await client.websocket.send_json(message)
            except Exception:
                dead.append(site_id)
        for site_id in dead:
            self.remove_client(site_id)


class RoomRegistry:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create(self, room_id: str) -> Room:
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id=room_id)
        return self.rooms[room_id]

    def get(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)

    def drop_if_empty(self, room_id: str):
        room = self.rooms.get(room_id)
        if room and not room.clients:
            del self.rooms[room_id]


def new_site_id() -> str:
    return f"s{random.randint(100000, 999999)}"
