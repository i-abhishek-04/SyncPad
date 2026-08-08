# ⚡ SyncPad

> **A real-time collaborative code editor powered by a hand-built RGA CRDT engine.**  
> Built to demonstrate low-latency distributed state synchronization, strong eventual consistency, and conflict-free concurrent editing without central server locking.

---

## 🌟 Why SyncPad Exists

Most real-time collaborative tools rely on third-party frameworks like *Yjs*, *Automerge*, or *ShareDB*. **SyncPad** was engineered from scratch in **Python (backend)** and **JavaScript (frontend)** to demonstrate how distributed systems achieve **Strong Eventual Consistency (SEC)** under concurrent user edits.

```
Client A (Site s1)  ⇄  WebSocket Relay  ⇄  Client B (Site s2)
       │                                            │
       └──── both run the SAME hand-built RGA ──────┘
             CRDT engine locally in real-time
```

---

## 🔬 Why RGA CRDT? (The Engineering Math)

SyncPad implements the **Replicated Growable Array (RGA)** algorithm based on *Roh et al. 2011*.

### 1. Operational Transformation (OT) vs. CRDTs
* **OT (Google Docs approach)**: Requires a central server to rewrite every incoming operation index relative to concurrent operations. If packets arrive out of order or the network drops, state can easily diverge.
* **CRDT (SyncPad / Figma approach)**: Operations carry immutable metadata `(site_id, counter, origin)`. Any replica can independently compute the exact same character ordering regardless of network arrival order.

### 2. Node Anatomy & ID Assignment
Every character typed is stored as an immutable RGA node:

$$\text{Node} = \{ \text{id}: (\text{site\_id}, \text{counter}),\ \text{origin}: \text{id}_{\text{prev}},\ \text{value}: \text{"char"},\ \text{deleted}: \text{bool} \}$$

### 3. Deterministic Insertion Tie-Breaking
When two users concurrently type at the exact same location:
1. Both operations share the same `origin` ID.
2. RGA breaks ties deterministically: **higher $(\text{counter}, \text{site\_id})$ sorts further left**.
3. Because every client applies this exact mathematical rule, all replicas converge to the **exact same text sequence** without central server locks.

### 4. Tombstone Deletions
* Deletions mark nodes as `deleted = True` rather than removing them from memory.
* **Why?** Keeping tombstones ensures that if a delayed remote insert arrives whose `origin` was a character deleted a few milliseconds prior, the engine can still locate the correct insertion point.

---

## 🔥 Key Features

- **⚡ Zero-Latency Local Optimism**: Typing reflects on your screen at 0ms latency; CRDT ops stream over WebSockets in the background.
- **🎬 Interactive Split-Screen Landing Demo**: Built-in side-by-side simulator showing two virtual clients ("Alice" & "Bob") typing simultaneously and merging ops in real-time.
- **🔬 Live CRDT Engine Inspector**: Toggleable visualizer modal displaying raw RGA memory nodes `[site_id:counter -> char]`, origin pointers, tombstone counts, and merged op statistics.
- **💻 Multi-Language Highlighting & Templates**: Prism syntax highlighting for Python, JavaScript, C++, HTML, and Markdown with 1-click starter problem templates (*Two Sum*, *LRU Cache*, *Binary Search*).
- **👥 Active Collaborator Carets**: Real-time presence badges tracking colored user chips and live line:column cursor carets (`L1:C14`).
- **🛡️ 8-Test Verification Suite**: Automated test suite validating same-position inserts, tombstone resolution, 4-client convergence, and disconnect/reconnect snapshot resync.

---

## 📊 Comprehensive Test Suite (8/8 PASSED)

Run the backend test harness:

```bash
cd backend
python test_crdt.py
```

| Test Case | Scenario Tested | Outcome |
| :--- | :--- | :--- |
| **1. Same-Position Insert** | Tab A ("AAAA") & Tab B ("BBBB") insert at same spot simultaneously | **PASSED** (Converged 100% to `'BBBBAAAA'`) |
| **2. Different-Position Insert** | Simultaneous edits at start (`[PREFIX]`) and end (`[SUFFIX]`) | **PASSED** (Landed cleanly without interference) |
| **3. Concurrent Delete + Insert** | Tab A deletes 'R' while Tab B inserts 'X' after 'R' | **PASSED** (Tombstone handled insert after deleted node) |
| **4. 4-Client Convergence** | 4 clients typing distinct phrases concurrently for 30s | **PASSED** (100% byte-for-byte replica identity) |
| **5. Disconnect & Reconnect** | Tab B goes offline mid-session and rejoins later | **PASSED** (Full snapshot resync upon reconnect) |
| **6. Rapid-Fire Stress Test** | 100-op burst paste while another client types normally | **PASSED** (111 rapid ops merged in 0.002s with 0 drops) |
| **7. Late-Join Mid-Session** | New client joins room with active document history | **PASSED** (Instant snapshot payload initialization) |
| **8. Live Cursor Accuracy** | User 2 updates cursor to index 42 | **PASSED** (User 1 receives exact position 42) |

---

## 🛠️ Stack & Architecture

- **Backend**: Python 3.11, FastAPI, native WebSockets (no Socket.IO overhead).
- **Frontend**: React 18, Vite, `react-simple-code-editor`, PrismJS, Vanilla CSS (Glassmorphism design system).
- **State**: In-memory RGA CRDT array per room.

```
syncpad/
├── backend/
│   ├── crdt.py           # Core Roh et al. 2011 RGA CRDT engine
│   ├── main.py           # FastAPI WebSocket gateway & room routes
│   ├── rooms.py          # In-memory room & client state manager
│   └── test_crdt.py      # Engine convergence tests
└── frontend/
    └── src/
        ├── crdt.js            # Client-side JS mirror of RGA CRDT
        ├── diff.js            # Textarea delta diffing algorithm
        ├── useSync.js         # Custom WebSocket sync & cursor hook
        ├── CrdtVisualizer.jsx # Live CRDT memory node inspector modal
        ├── LandingDemo.jsx    # Interactive split-screen simulator
        └── App.jsx            # Main room editor & multi-language UI
```

---

## 🚀 Running Locally

### 1. Backend Server
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5174` in two separate browser tabs to test real-time multi-client collaboration!

---

## 📜 License

Distributed under the [MIT License](LICENSE).  
Copyright (c) 2026 **Abhishek Raj**.
