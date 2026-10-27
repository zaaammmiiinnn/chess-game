import http from 'http';
import path from 'path';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';

interface RoomPlayer {
  token: string;
  name: string;
  connected: boolean;
  ws?: WebSocket | null;
}

interface RoomMove {
  seq: number;
  color: 'w' | 'b';
  from: { r: number; c: number };
  to: { r: number; c: number };
  promotion?: string;
  ts: number;
}

interface GameRoom {
  code: string;
  white: RoomPlayer | null;
  black: RoomPlayer | null;
  spectators: RoomPlayer[];
  moves: RoomMove[];
  turn: 'w' | 'b';
  status: 'waiting' | 'playing' | 'checkmate' | 'draw' | 'resigned';
  resetCount: number;
  winner?: 'w' | 'b' | 'draw' | null;
  rematchOfferBy?: string | null;
  createdAt: number;
  updatedAt: number;
}

const app = express();
app.use(express.json());

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function getPublicRoomState(room: GameRoom) {
  return {
    code: room.code,
    status: room.status,
    whiteJoined: Boolean(room.white),
    blackJoined: Boolean(room.black),
    whiteName: room.white?.name || (room.white ? 'White Player' : null),
    blackName: room.black?.name || (room.black ? 'Black Player' : null),
    whiteConnected: Boolean(room.white?.connected),
    blackConnected: Boolean(room.black?.connected),
    turn: room.turn,
    moves: room.moves,
    resetCount: room.resetCount,
    winner: room.winner,
    rematchOfferBy: room.rematchOfferBy,
    updatedAt: room.updatedAt,
    spectatorCount: room.spectators.filter((s) => s.connected).length
  };
}

function broadcastToRoom(room: GameRoom, event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const targets = [
    room.white?.ws,
    room.black?.ws,
    ...room.spectators.map((s) => s.ws)
  ];
  for (const client of targets) {
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (e) {}
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP API Endpoints
// ---------------------------------------------------------------------------

app.post('/api/rooms/create', (req: Request, res: Response): void => {
  const { preferredColor, playerToken, playerName } = req.body || {};
  const token = playerToken || `tok_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  const name = String(playerName || 'Archmage').trim().slice(0, 24);

  let side: 'w' | 'b' = 'w';
  if (preferredColor === 'b') {
    side = 'b';
  } else if (preferredColor === 'random') {
    side = Math.random() < 0.5 ? 'w' : 'b';
  }

  const code = generateRoomCode();
  const newRoom: GameRoom = {
    code,
    white: side === 'w' ? { token, name, connected: true } : null,
    black: side === 'b' ? { token, name, connected: true } : null,
    spectators: [],
    moves: [],
    turn: 'w',
    status: 'waiting',
    resetCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  rooms.set(code, newRoom);

  res.json({
    ok: true,
    code,
    color: side,
    playerToken: token,
    room: getPublicRoomState(newRoom)
  });
});

app.post('/api/rooms/join', (req: Request, res: Response): void => {
  const { code, playerToken, playerName } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  const room = rooms.get(cleanCode);

  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found. Please verify the code.' });
    return;
  }

  const token = playerToken || `tok_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  const name = String(playerName || 'Challenger').trim().slice(0, 24);

  let assignedColor: 'w' | 'b' | 'spectator' = 'spectator';

  if (room.white?.token === token) {
    room.white.connected = true;
    room.white.name = name || room.white.name;
    assignedColor = 'w';
  } else if (room.black?.token === token) {
    room.black.connected = true;
    room.black.name = name || room.black.name;
    assignedColor = 'b';
  } else if (!room.white) {
    room.white = { token, name, connected: true };
    assignedColor = 'w';
  } else if (!room.black) {
    room.black = { token, name, connected: true };
    assignedColor = 'b';
  } else {
    // Both player slots taken; join as spectator
    const existing = room.spectators.find((s) => s.token === token);
    if (existing) {
      existing.connected = true;
    } else {
      room.spectators.push({ token, name, connected: true });
    }
    assignedColor = 'spectator';
  }

  if (room.white && room.black) {
    room.status = 'playing';
  }
  room.updatedAt = Date.now();

  broadcastToRoom(room, {
    type: 'room_state',
    room: getPublicRoomState(room),
    message: `${name} has joined the sanctum room.`
  });

  res.json({
    ok: true,
    code: cleanCode,
    color: assignedColor,
    isSpectator: assignedColor === 'spectator',
    playerToken: token,
    room: getPublicRoomState(room)
  });
});

app.get('/api/rooms/:code/state', (req: Request, res: Response): void => {
  const cleanCode = String(req.params.code || '').trim().toUpperCase();
  const room = rooms.get(cleanCode);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found' });
    return;
  }
  res.json({
    ok: true,
    room: getPublicRoomState(room)
  });
});

app.post('/api/rooms/:code/move', (req: Request, res: Response): void => {
  const cleanCode = String(req.params.code || '').trim().toUpperCase();
  const room = rooms.get(cleanCode);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found' });
    return;
  }

  const { from, to, color, promotion, playerToken } = req.body || {};
  if (!from || !to || !color) {
    res.status(400).json({ ok: false, error: 'Incomplete move payload' });
    return;
  }

  // Token validation if assigned
  if (color === 'w' && room.white && room.white.token !== playerToken) {
    res.status(403).json({ ok: false, error: 'Not authorized for White' });
    return;
  }
  if (color === 'b' && room.black && room.black.token !== playerToken) {
    res.status(403).json({ ok: false, error: 'Not authorized for Black' });
    return;
  }

  const newMove: RoomMove = {
    seq: room.moves.length + 1,
    color,
    from,
    to,
    promotion: promotion || 'queen',
    ts: Date.now()
  };

  room.moves.push(newMove);
  room.turn = color === 'w' ? 'b' : 'w';
  room.updatedAt = Date.now();

  broadcastToRoom(room, {
    type: 'move',
    move: newMove,
    room: getPublicRoomState(room)
  });

  res.json({
    ok: true,
    move: newMove,
    room: getPublicRoomState(room)
  });
});

app.post('/api/rooms/:code/reset', (req: Request, res: Response): void => {
  const cleanCode = String(req.params.code || '').trim().toUpperCase();
  const room = rooms.get(cleanCode);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found' });
    return;
  }

  room.moves = [];
  room.turn = 'w';
  room.resetCount = (room.resetCount || 0) + 1;
  room.rematchOfferBy = null;
  room.status = room.white && room.black ? 'playing' : 'waiting';
  room.updatedAt = Date.now();

  broadcastToRoom(room, {
    type: 'reset',
    room: getPublicRoomState(room)
  });

  res.json({
    ok: true,
    room: getPublicRoomState(room)
  });
});

// ---------------------------------------------------------------------------
// HTTP Server & WebSocket Server
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  let boundCode: string | null = null;
  let boundToken: string | null = null;

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join_room') {
        const cleanCode = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }

        boundCode = cleanCode;
        boundToken = msg.playerToken;

        if (room.white?.token === boundToken) {
          room.white.ws = ws;
          room.white.connected = true;
        } else if (room.black?.token === boundToken) {
          room.black.ws = ws;
          room.black.connected = true;
        } else {
          const spec = room.spectators.find((s) => s.token === boundToken);
          if (spec) {
            spec.ws = ws;
            spec.connected = true;
          } else {
            room.spectators.push({
              token: boundToken || `spec_${Date.now()}`,
              name: msg.playerName || 'Spectator',
              connected: true,
              ws
            });
          }
        }

        if (room.white && room.black) {
          room.status = 'playing';
        }
        room.updatedAt = Date.now();

        // Send confirmation back to connecting client
        ws.send(JSON.stringify({
          type: 'room_state',
          room: getPublicRoomState(room)
        }));

        // Broadcast presence update to others
        broadcastToRoom(room, {
          type: 'room_state',
          room: getPublicRoomState(room)
        });
      }

      if (msg.type === 'make_move') {
        const cleanCode = String(msg.code || boundCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) return;

        const { from, to, color, promotion, playerToken } = msg;
        if (!from || !to || !color) return;

        const newMove: RoomMove = {
          seq: room.moves.length + 1,
          color,
          from,
          to,
          promotion: promotion || 'queen',
          ts: Date.now()
        };

        room.moves.push(newMove);
        room.turn = color === 'w' ? 'b' : 'w';
        room.updatedAt = Date.now();

        broadcastToRoom(room, {
          type: 'move',
          move: newMove,
          room: getPublicRoomState(room)
        });
      }

      if (msg.type === 'chat_message') {
        const cleanCode = String(msg.code || boundCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) return;

        const senderName =
          room.white?.token === boundToken ? (room.white.name || 'White') :
          room.black?.token === boundToken ? (room.black.name || 'Black') :
          'Spectator';

        broadcastToRoom(room, {
          type: 'chat',
          sender: senderName,
          text: String(msg.text || '').trim().slice(0, 140),
          ts: Date.now()
        });
      }

      if (msg.type === 'request_rematch') {
        const cleanCode = String(msg.code || boundCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) return;

        room.rematchOfferBy = boundToken;
        broadcastToRoom(room, {
          type: 'rematch_offered',
          by: room.white?.token === boundToken ? 'w' : 'b',
          room: getPublicRoomState(room)
        });
      }

      if (msg.type === 'accept_rematch') {
        const cleanCode = String(msg.code || boundCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) return;

        room.moves = [];
        room.turn = 'w';
        room.resetCount = (room.resetCount || 0) + 1;
        room.rematchOfferBy = null;
        room.status = 'playing';
        room.updatedAt = Date.now();

        broadcastToRoom(room, {
          type: 'reset',
          room: getPublicRoomState(room)
        });
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (boundCode) {
      const room = rooms.get(boundCode);
      if (room) {
        if (room.white?.ws === ws) {
          room.white.connected = false;
          room.white.ws = null;
        }
        if (room.black?.ws === ws) {
          room.black.connected = false;
          room.black.ws = null;
        }
        const spec = room.spectators.find((s) => s.ws === ws);
        if (spec) {
          spec.connected = false;
          spec.ws = null;
        }
        room.updatedAt = Date.now();
        broadcastToRoom(room, {
          type: 'room_state',
          room: getPublicRoomState(room)
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Dev / Production Static Assets & Vite Integration
// ---------------------------------------------------------------------------

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wizard Chess Sanctum server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
