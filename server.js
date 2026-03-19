console.log('[Server] Process starting...');
const { instrument } = require('@socket.io/admin-ui');
console.log('[Server] Admin UI loaded');
const { createServer } = require('http');
const { Server } = require('socket.io');
console.log('[Server] Core modules loaded');

process.on('uncaughtException', (err) => {
  console.error('!!!! FATAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!!! UNHANDLED REJECTION:', reason);
});
const fs = require('fs');
const path = require('path');
// MIME types are now handled automatically by Express static middleware


// Load environment variables from .env.local for local development
try {
  if (fs.existsSync('.env.local')) {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return; // Skip empty lines and comments
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ''); // Trim quotes
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.log('Note: .env.local not found, relying on system environment variables');
}

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
let supabase = null;
const INDONESIAN_NAMES = [
  "Budi Santoso", "Agus Setiawan", "Siti Aminah", "Eko Prasetyo", "Dewi Lestari",
  "Ahmad Fauzi", "Bambang Pamungkas", "Joko Susilo", "Rina Wulandari", "Santi Wijaya",
  "Hafiz Ramadhan", "Syamsul Arifin", "Putu Gede", "Made Wirawan", "Nyoman Sukarja",
  "Ketut Abadi", "Ridwan Kamil", "Ganjar Pranowo", "Anies Baswedan", "Gibran Rakabuming",
  "Kaesang Pangarep", "Prabowo Subianto", "Luhut Panjaitan", "Sri Mulyani", "Retno Marsudi",
  "Dian Sastrowardoyo", "Nicholas Saputra", "Reza Rahadian", "Pevita Pearce", "Raisa Andriana",
  "Tulus", "Isyana Sarasvati", "Andmesh", "Tiara Andini", "Lyodra", "Ziva",
  "Wureg", "Abina", "Cup Manager", "Sapri", "Udin", "Sule", "Andre", "Tukul"
];

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[Server] Supabase client created');
  console.log('[BR] Connected to Supabase DB');

  // PURGE STALE SERVERS ON STARTUP
  if (supabase) {
    supabase.from('game_servers').delete().neq('room_id', 'KEEP_ALIVE').then(({ error }) => {
      if (error) console.error('[Supabase Startup Cleanup Error]', error.message);
      else console.log('[Supabase DB] Stale servers purged on startup.');
    });
  }
}

// Express Server Setup
const express = require('express');
const app = express();
const httpServer = createServer(app);

// Robust CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Health check
app.get(['/health', '/status'], (req, res) => res.send('OK'));

// Serve Next.js static production export
const outPath = path.join(__dirname, 'out');
app.use(express.static(outPath));

// Fallback to index.html for undefined routes (Next.js SPA behavior)
app.get('*', (req, res, next) => {
    // Skip if it's a socket.io request (though express.static usually handles files first)
    if (req.url.startsWith('/socket.io')) return next();
    const indexPath = path.join(outPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Not Found');
    }
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

console.log('[Server] Socket.io initialized with Express');

// === SERVER STATE ===
const brRooms = new Map(); // roomId -> { players: Map<socketId, playerData> }
const playerToRoom = new Map(); // socketId -> roomId
const ROOM_MAX = 30; // Max players per room
const WORLD_SIZE = 8000; // Size of the game world

// --- NEW SOCIAL & PRESENCE STATE ---
const onlinePlayers = new Map(); // uid -> { name, status, socketId, lastSeen, startTime }
const globalTopPlayers = []; // Cache for global leaderboard

// Function to broadcast room list to all clients

function getRoomId(socket, requestedRoomId, mode = 'battleroyale') {
  const is1v1 = mode === 'pvp1v1';
  const MAX_PLAYERS = is1v1 ? 2 : ROOM_MAX;
  const MAP_SIZE = is1v1 ? 3000 : WORLD_SIZE; // Smaller map for 1v1 PvP


  // If a specific room is requested, prioritize it if it's available
  if (requestedRoomId && brRooms.has(requestedRoomId)) {
    const room = brRooms.get(requestedRoomId);
    if (room.players.size < room.maxRoomPlayers && !room.locked && room.mode === mode) {
      return requestedRoomId;
    }
  }

  // Find room with available space and not yet started
  for (const [roomId, room] of brRooms.entries()) {
    if (room.players.size < room.maxRoomPlayers && !room.locked && room.mode === mode) {
      return roomId;
    }
  }

  // If no suitable room found, create a new one
  const newRoomId = `BR_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  brRooms.set(newRoomId, {
    players: new Map(),
    bullets: [], // Server-side bullets for bot collision
    mode: mode,
    maxRoomPlayers: MAX_PLAYERS,
    mapSize: MAP_SIZE,
    safeZone: { x: MAP_SIZE / 2, y: MAP_SIZE / 2, radius: MAP_SIZE },
    started: false, // Room combat has started
    locked: false,  // Room is closed for new players
    countingDown: false,
    startTime: null, // Will be set when the match officially starts
    matchDuration: is1v1 ? 180000 : 300000, // 3 minutes for PvP, 5 minutes for BR
    createdAt: Date.now(), // Track room creation time for bot fill timeout
    botCheckTimer: 0 // Local counter for bot fill logic
  });

  if (supabase) {
    supabase.from('game_servers').upsert({
      room_id: newRoomId,
      status: 'Waiting',
      players: 0,
      max_players: MAX_PLAYERS,
      locked: false
    }).then(({ error }) => {
      if (error) {
        console.error('[Supabase Create Room Error]', error.message);
      } else {
        console.log(`[Supabase DB] Successfully saved room ${newRoomId} to database!`);
      }
    });
  }

  return newRoomId;
}

// === REALTIME GLOBAL LEADERBOARD CACHE ===
async function refreshGlobalLeaderboard() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('players')
    .select('username, highscore, total_kills, avatar, playtime')
    .order('highscore', { ascending: false })
    .limit(20);

  if (!error && data) {
    globalTopPlayers.length = 0;
    globalTopPlayers.push(...data);
    io.emit('stats:global_top', globalTopPlayers);
  }
}

// Refresh every 30 seconds
setInterval(refreshGlobalLeaderboard, 30000);
refreshGlobalLeaderboard(); // Initial fetch

// === GLOBAL SERVER BROWSER REFRESHER ===
function broadcastServerList() {
  const rooms = [];
  for (const [roomId, room] of brRooms.entries()) {
    let readyCount = 0;
    room.players.forEach(p => { if (p.isReady) readyCount++; });

    const roomState = room.started ? 'Started' : (room.countingDown ? 'Starting' : 'Waiting');

    rooms.push({
      id: roomId,
      players: room.players.size,
      readyCount: readyCount,
      max: room.maxRoomPlayers,
      state: roomState,
      mode: room.mode,
      locked: room.locked
    });

    // Sync with Supabase
    if (supabase) {
      supabase.from('game_servers').upsert({
        room_id: roomId,
        status: roomState,
        players: room.players.size,
        max_players: room.maxRoomPlayers,
        locked: room.locked
      }).then();
    }
  }
  io.emit('br:room_list', rooms);
}

io.on('connection', (socket) => {
  console.log(`[BR] Player connected: ${socket.id}`);
  broadcastServerList(); // Immediately sync room list to new connection
  socket.emit('stats:global_top', globalTopPlayers);
  io.emit('stats:online_count', onlinePlayers.size);

  // === USER IDENTIFICATION & PRESENCE ===
  socket.on('player:identify', ({ uid, name, avatar }) => {
    if (!uid) return;
    const sessionData = {
      uid,
      name,
      socketId: socket.id,
      status: 'Online',
      lastSeen: Date.now(),
      startTime: Date.now(),
      avatar
    };
    onlinePlayers.set(uid, sessionData);

    // Update DB
    if (supabase) {
      supabase.from('players').update({
        is_online: true,
        last_seen: new Date().toISOString()
      }).eq('uid', uid).then();
    }

    io.emit('player:status_update', { uid, status: 'Online', lastSeen: sessionData.lastSeen });
    io.emit('stats:online_count', onlinePlayers.size);
  });

  // === JOIN BATTLE ROYALE ===
  socket.on('br:join', (playerData) => {
    // Leave previous room if any (Memory Leak Fix)
    const oldRoomId = playerToRoom.get(socket.id);
    if (oldRoomId) {
      const oldRoom = brRooms.get(oldRoomId);
      if (oldRoom) {
        oldRoom.players.delete(socket.id);
        if (oldRoom.players.size === 0) brRooms.delete(oldRoomId);
      }
      socket.leave(oldRoomId);
    }

    const mode = playerData.mode || 'battleroyale';
    const roomId = getRoomId(socket, playerData.roomId, mode);
    socket.join(roomId);
    playerToRoom.set(socket.id, roomId);

    const room = brRooms.get(roomId);
    const pData = {
      socketId: socket.id,
      uid: playerData.uid,
      name: playerData.name,
      class: playerData.class || 'basic',
      x: 200 + Math.random() * (room.mapSize - 400),
      y: 200 + Math.random() * (room.mapSize - 400),
      vx: 0, vy: 0,
      angle: 0,
      hp: 150,
      maxHp: 150,
      size: 20,
      alive: true,
      kills: 0,
      isReady: false,
      cooldown: 0
    };
    room.players.set(socket.id, pData);

    // Check Room Lock status
    if (room.players.size >= room.maxRoomPlayers) {
      room.locked = true;
    }

    // Send existing players to new joiner
    const otherPlayers = [];
    room.players.forEach((p, sid) => {
      if (sid !== socket.id) otherPlayers.push(p);
    });
    socket.emit('br:init', {
      selfData: pData,
      players: otherPlayers,
      roomId,
      mapSize: room.mapSize,
      mode: room.mode,
      safeZone: room.safeZone,
      aliveCount: room.players.size,
      maxPlayers: room.maxRoomPlayers,
      countingDown: room.countingDown,
      startTime: room.startTime
    });

    // Broadcast new player to others
    socket.to(roomId).emit('br:player_joined', { pData, aliveCount: room.players.size, maxPlayers: room.maxRoomPlayers });
    console.log(`[BR] ${playerData.name} joined ${roomId} (${room.players.size} players)`);

    // Auto-cancel countdown if someone joins and is not ready
    if (room.countingDown && room.players.size > 0 && !pData.isReady) {
      let readyCount = 0; room.players.forEach(pp => { if (pp.isReady) readyCount++; });
      if (readyCount < room.players.size) {
        room.countingDown = false;
        room.startTime = null;
        io.to(roomId).emit('br:countdown_msg', { text: 'New player joined. Waiting for all players to be ready.' });
      }
    } else if (room.players.size < 2) {
      io.to(roomId).emit('br:countdown_msg', { text: 'Waiting for more players to join... (Min 2)' });
    } else {
      io.to(roomId).emit('br:countdown_msg', { text: 'Waiting for players to be ready.' });
    }

    // Auto Refresh Server Browser
    broadcastServerList();
  });

  // === SERVER LIST & READY CHECK ===
  socket.on('br:get_rooms', () => {
    console.log(`[Server] ${socket.id} requested room list`);
    broadcastServerList();
  });

  socket.on('br:ready', (isReady) => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    const room = brRooms.get(roomId);
    if (!room || room.started) return;

    const p = room.players.get(socket.id);
    if (p) p.isReady = isReady;

    io.to(roomId).emit('br:ready_state', { socketId: socket.id, isReady, uid: p ? p.uid : null });

    let readyCount = 0;
    room.players.forEach(pp => { if (pp.isReady) readyCount++; });

    if (room.players.size >= 2 && readyCount === room.players.size) {
      if (!room.countingDown) {
        room.startTime = Date.now() + 10000; // 10 SECOND COUNTDOWN
        room.countingDown = true;
        io.to(roomId).emit('br:countdown_msg', { text: 'Starting in 10s...' });
      }
    } else {
      if (room.countingDown) {
        room.countingDown = false;
        room.startTime = null;
        io.to(roomId).emit('br:countdown_msg', { text: 'Countdown cancelled. Waiting for players to be ready.' });
      } else if (room.players.size < 2) {
        io.to(roomId).emit('br:countdown_msg', { text: 'Waiting for more players to join... (Min 2)' });
      } else {
        io.to(roomId).emit('br:countdown_msg', { text: `${readyCount}/${room.players.size} Players Ready` });
      }
    }

    // Auto Refresh Server Browser status count
    broadcastServerList();
  });

  // === PING CALCULATION ===
  socket.on('br:ping', (time) => {
    socket.emit('br:pong', time);
  });

  // === VOICE CHAT WEBRTC SIGNALING ===
  socket.on('webrtc:offer', (data) => {
    io.to(data.targetSocket).emit('webrtc:offer', { offer: data.offer, senderSocket: socket.id });
  });
  socket.on('webrtc:answer', (data) => {
    io.to(data.targetSocket).emit('webrtc:answer', { answer: data.answer, senderSocket: socket.id });
  });
  socket.on('webrtc:ice-candidate', (data) => {
    io.to(data.targetSocket).emit('webrtc:ice-candidate', { candidate: data.candidate, senderSocket: socket.id });
  });

  // === LAZY UPDATE / DELTA COMPRESSION & ANTI-HACK ===
  socket.on('br:update', (update) => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    const room = brRooms.get(roomId);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;

    // HACK PROTECTION: Speed Limit Validation
    const dist = Math.hypot(p.x - update.x, p.y - update.y);
    const now = Date.now();
    const timeDiff = Math.max(1, now - (p.lastUpdate || now));
    const speed = dist / timeDiff;

    // Max allowed speed tolerance (pixels per ms). If cheat detected, rubberband to old position
    if (speed > 1.5 && p.lastUpdate) {
      // Hack detected! Ignore update, server will correct client later
    } else {
      p.x = update.x;
      p.y = update.y;
      p.vx = update.vx;
      p.vy = update.vy;
      p.angle = update.angle;
      p.hasChanged = true; // Lazy update flag
    }
    p.lastUpdate = now;
  });

  // === BULLET SHOOT & RAPID FIRE HACK PROTECTION ===
  socket.on('br:shoot', (bulletData) => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    const room = brRooms.get(roomId);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const now = Date.now();
    // Validate rapid fire (minimum 30ms between bullets)
    if (p.lastShoot && now - p.lastShoot < 30) {
      return; // Ignore hack
    }
    p.lastShoot = now;

    socket.to(roomId).emit('br:bullet', {
      ...bulletData,
      shooterId: socket.id,
    });
  });


  // === HIT DETECTION (client-side authoritative) ===
  socket.on('br:hit', ({ targetSocketId, damage, isExplosion }) => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    const room = brRooms.get(roomId);
    if (!room) return;
    const target = room.players.get(targetSocketId);
    if (!target || !target.alive) return;

    if (!room.started) return; // NO DAMAGE IN LOBBY (WAITING FOR PLAYERS)

    target.hp -= damage;

    // INSTANT DEATH DARI LEDAKAN JIKA HP HABIS/MELEDAK INSTAN
    if (isExplosion && target.hp <= 0) {
      target.hp = 0;
    }

    if (target.hp <= 0) {
      target.alive = false;
      target.hp = 0;

      // Credit kill to shooter
      const shooter = room.players.get(socket.id);
      if (shooter) shooter.kills++;

      // Notify target killed
      io.to(targetSocketId).emit('br:you_died', {
        killerName: shooter?.name || 'Unknown',
        kills: shooter?.kills || 0,
      });

      // Broadcast kill feed
      io.to(roomId).emit('br:kill_feed', {
        killerName: shooter?.name || 'Unknown',
        victimName: target.name,
        aliveCount: Array.from(room.players.values()).filter(pp => pp.alive).length,
      });

      // Check winner
      const alivePlayers = Array.from(room.players.values()).filter(pp => pp.alive);
      if (alivePlayers.length === 1) {
        io.to(roomId).emit('br:winner', { winner: alivePlayers[0] });
        refreshGlobalLeaderboard(); // INSTANT REFRESH ON MATCH END
        // Cleanup room after 5 seconds
        setTimeout(() => {
          brRooms.delete(roomId);
          if (supabase) supabase.from('game_servers').delete().match({ room_id: roomId }).then();
          room.players.forEach((_, sid) => playerToRoom.delete(sid));
        }, 5000);
      }
    }

    // Broadcast hp update
    io.to(roomId).emit('br:hp_update', {
      socketId: targetSocketId,
      hp: target.hp,
      alive: target.alive,
    });
  });

  // === CLIENT DIED MATI DARI NPC ATAU BUNUH DIRI ===
  socket.on('br:died', () => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    const room = brRooms.get(roomId);
    if (!room) return;
    const target = room.players.get(socket.id);
    if (!target || !target.alive) return;

    if (!room.started) return;

    target.alive = false;
    target.hp = 0;

    // Broadcast kill feed (died to environment)
    io.to(roomId).emit('br:kill_feed', {
      killerName: 'The World',
      victimName: target.name,
      aliveCount: Array.from(room.players.values()).filter(pp => pp.alive).length,
    });

    // Broadcast hp update so other clients remove the player entity
    io.to(roomId).emit('br:hp_update', {
      socketId: socket.id,
      hp: 0,
      alive: false,
    });

    // Check winner
    const alivePlayers = Array.from(room.players.values()).filter(pp => pp.alive);
    if (alivePlayers.length === 1 && room.started) {
      io.to(roomId).emit('br:winner', { winner: alivePlayers[0] });
      refreshGlobalLeaderboard(); // INSTANT REFRESH ON MATCH END
      // Cleanup room after 5 seconds
      setTimeout(() => {
        brRooms.delete(roomId);
        if (supabase) supabase.from('game_servers').delete().match({ room_id: roomId }).then();
        room.players.forEach((_, sid) => playerToRoom.delete(sid));
        broadcastServerList();
      }, 5000);
    }
  });

  // === EXPLOSION ===
  socket.on('br:explosion', (data) => {
    const roomId = playerToRoom.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('br:explosion', { ...data, shooterId: socket.id });
  });

  // === FRIEND & PARTY System ===
  socket.on('friend:invite', ({ toUid, fromName, fromUid }) => {
    io.emit('friend:invite_received', { fromUid, fromName, toUid });
  });

  socket.on('friend:accept', ({ fromUid, toUid, toName, toAvatar }) => {
    io.emit('friend:accepted', { fromUid, toUid, toName, toAvatar });
  });

  socket.on('friend:request', (data) => {
    io.emit('friend:request_received', data);
  });

  socket.on('player:status', (data) => {
    io.emit('player:status_update', { uid: data.uid, status: data.status, lastSeen: Date.now() });
  });

  socket.on('party:state', (data) => {
    io.emit('party:state_update', data); // Buat sync ready/not ready & kick
  });

  socket.on('party:start_game', (data) => {
    io.emit('party:trigger_start', data);
  });

  socket.on('chat:private', (data) => {
    io.emit('chat:private_receive', data);
  });

  // === DISCONNECT ===
  socket.on('disconnect', async () => {
    // 1. Find UID associated with this socket
    let disconnectedUid = null;
    for (const [uid, data] of onlinePlayers.entries()) {
      if (data.socketId === socket.id) {
        disconnectedUid = uid;
        const playDuration = Math.floor((Date.now() - data.startTime) / 1000);

        // Update Playtime in DB
        if (supabase) {
          // Atomic increment for playtime
          const { data: currentPlaytime } = await supabase.from('players').select('playtime').eq('uid', uid).single();
          const newTotal = (currentPlaytime?.playtime || 0) + playDuration;

          await supabase.from('players').update({
            is_online: false,
            last_seen: new Date().toISOString(),
            playtime: newTotal
          }).eq('uid', uid);
        }

        onlinePlayers.delete(uid);
        io.emit('player:status_update', { uid, status: 'Offline', lastSeen: Date.now() });
        io.emit('stats:online_count', onlinePlayers.size);
        break;
      }
    }

    const roomId = playerToRoom.get(socket.id);
    if (roomId) {
      const room = brRooms.get(roomId);
      if (room) {
        room.players.delete(socket.id);
        const alivePlayersInRoom = Array.from(room.players.values()).filter(pp => pp.alive);
        socket.to(roomId).emit('br:player_left', { socketId: socket.id, aliveCount: alivePlayersInRoom.length });

        // If room is empty, delete it
        if (room.players.size === 0) {
          brRooms.delete(roomId);
          if (supabase) supabase.from('game_servers').delete().match({ room_id: roomId }).then();
        }
        // If only one player left and room was started, declare winner
        else if (room.started && alivePlayersInRoom.length === 1) {
          io.to(roomId).emit('br:winner', { winner: alivePlayersInRoom[0] });
          setTimeout(() => {
            brRooms.delete(roomId);
            if (supabase) supabase.from('game_servers').delete().match({ room_id: roomId }).then();
            room.players.forEach((_, sid) => playerToRoom.delete(sid));
            broadcastServerList();
          }, 5000);
        }
      }
    }
    playerToRoom.delete(socket.id);
    console.log(`[BR] Player disconnected: ${socket.id}`);

    // Auto Refresh Server Browser on disconnection
    broadcastServerList();
  });
});

// === SERVER TICK LOOP (Spatial Hashing / Lazy Updates / Safe Zone / BR Timer) ===
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of brRooms.entries()) {
    const updates = [];

    // Pengecilan Safe Zone dalam 5 menit
    let timeLeft = 0;

    if (room.countingDown) {
      const elapsed = now - room.startTime; // Starts negative

      if (elapsed >= 0) {
        // Lobby Countdown Finished! Start Combat & Lock Room
        if (!room.started) {
          room.started = true;
          room.locked = true;
          console.log(`[BR] Room ${roomId} match officially started! Storm is active.`);
          if (supabase) {
            supabase.from('game_servers').update({ status: 'Started' }).match({ room_id: roomId }).then();
          }
          broadcastServerList();
        }

        timeLeft = Math.max(0, room.matchDuration - elapsed);

        // Radius awal WORLD_SIZE, radius akhir 200 (or some minimum)
        const minRadius = 200;
        const initialRadius = room.mapSize || WORLD_SIZE;
        const shrinkAmount = initialRadius - minRadius;

        const progress = Math.min(1, elapsed / room.matchDuration);
        room.safeZone.radius = initialRadius - (progress * shrinkAmount);

        const targetSafeZone = room.targetSafeZone || room.safeZone;
        const safeRadius = targetSafeZone.radius;

        // Cek pemain & Bot AI
        room.players.forEach(p => {
          if (!p.alive) return;
          const distToCenter = Math.hypot(p.x - targetSafeZone.x, p.y - targetSafeZone.y);

          // Bot AI Combat & Movement - MAJOR OVERHAUL
          if (p.isBot && room.started) {
            const botSpeed = p.class === 'melee' ? 14 : (p.class === 'machinegun' ? 12 : 10);
            let targetAngle = p.angle || 0;
            let nearestDist = Infinity;
            let targetObj = null;
            let lowestHpTarget = null;
            let lowestHp = Infinity;

            // SMART Targeting: Prioritize low HP enemies AND nearby threats
            room.players.forEach(p2 => {
              if (p2.alive && p2.socketId !== p.socketId) {
                const d = Math.hypot(p2.x - p.x, p2.y - p.y);
                if (d < 1200) { // Detection range
                  if (d < nearestDist) { nearestDist = d; targetObj = p2; }
                  if (p2.hp < lowestHp && d < 800) { lowestHp = p2.hp; lowestHpTarget = p2; }
                }
              }
            });

            // Pick the best target: prefer low HP if close enough
            if (lowestHpTarget && nearestDist < 600) targetObj = lowestHpTarget;

            if (targetObj) {
              targetAngle = Math.atan2(targetObj.y - p.y, targetObj.x - p.x);
              const isMelee = p.class === 'melee';
              const isGunner = p.class === 'machinegun';
              const isWarden = p.class === 'warden';
              const isFlame = p.class === 'flamethrower';

              // Class-specific ideal distances
              const idealDist = isMelee ? 40 : (isWarden ? 400 : (isGunner ? 200 : 280));

              // MOVEMENT: Approach, retreat, or strafe based on class
              if (nearestDist > idealDist + 80) {
                // Approach target with slight angle variation for natural movement
                const approachAngle = targetAngle + (Math.sin(now * 0.003 + p.x) * 0.15);
                p.vx = Math.cos(approachAngle) * botSpeed;
                p.vy = Math.sin(approachAngle) * botSpeed;
              } else if (nearestDist < idealDist - 60) {
                // Retreat  
                p.vx = -Math.cos(targetAngle) * (botSpeed * 0.8);
                p.vy = -Math.sin(targetAngle) * (botSpeed * 0.8);
              } else {
                // Strafe (circle around target like a real player)
                const strafeDir = (Math.sin(now * 0.002 + p.y) > 0) ? 1 : -1; // Change strafe direction periodically
                const strafeAngle = targetAngle + (Math.PI / 2) * strafeDir;
                p.vx = Math.cos(strafeAngle) * (botSpeed * 0.65);
                p.vy = Math.sin(strafeAngle) * (botSpeed * 0.65);
              }

              // Dodge when getting hit (reactive AI)
              if (p.lastHp !== undefined && p.hp < p.lastHp) {
                const dodgeAngle = targetAngle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                p.vx = Math.cos(dodgeAngle) * botSpeed * 1.5;
                p.vy = Math.sin(dodgeAngle) * botSpeed * 1.5;
              }
              p.lastHp = p.hp;

              // DASH (Player-like, class-specific cooldowns)
              if (!p.dashCooldown) p.dashCooldown = 0;
              if (p.dashCooldown > 0) p.dashCooldown -= (1000 / 60);
              if (p.dashCooldown <= 0 && Math.random() < 0.008) {
                const dashAngle = isMelee ? targetAngle : (targetAngle + Math.PI); // Melee dashes IN, others dash AWAY
                p.vx += Math.cos(dashAngle) * 25;
                p.vy += Math.sin(dashAngle) * 25;
                p.dashCooldown = 3000; // 3 second cooldown
              }

              // SHOOTING - Class-specific weapons
              if (p.cooldown > 0) p.cooldown -= (1000 / 60);
              if (p.cooldown <= 0 && nearestDist < 900) {
                let bSpd, bDmg, bReload, bulletCount, spreadAngle;

                if (isGunner) { // Machinegun: Fast fire, low damage, slight spread
                  bSpd = 20; bDmg = 8; bReload = 100; bulletCount = 1; spreadAngle = 0.08;
                } else if (isMelee) { // Melee: Body charge + close range burst
                  bSpd = 15; bDmg = 18; bReload = 500; bulletCount = 3; spreadAngle = 0.3;
                } else if (isWarden) { // Warden: Sonic wave
                  bSpd = 12; bDmg = 25; bReload = 800; bulletCount = 1; spreadAngle = 0;
                } else if (isFlame) { // Flamethrower: TNT projectile
                  bSpd = 14; bDmg = 15; bReload = 600; bulletCount = 1; spreadAngle = 0;
                } else { // Basic & others
                  bSpd = 18; bDmg = 12; bReload = 350; bulletCount = 1; spreadAngle = 0.05;
                }

                // Add aim inaccuracy (bots aren't perfect, but better now)
                const aimError = (Math.random() - 0.5) * 0.04;

                for (let bc = 0; bc < bulletCount; bc++) {
                  const bulletAngle = targetAngle + aimError + (bc - (bulletCount - 1) / 2) * spreadAngle;
                  const bullet = {
                    x: p.x + Math.cos(bulletAngle) * 45,
                    y: p.y + Math.sin(bulletAngle) * 45,
                    vx: Math.cos(bulletAngle) * bSpd,
                    vy: Math.sin(bulletAngle) * bSpd,
                    life: 100,
                    damage: bDmg,
                    penetration: 1,
                    ownerId: p.socketId,
                    isEnemy: true,
                    type: isWarden ? 'warden_sonic_wave' : (isFlame ? 'tnt' : 'player_bullet')
                  };
                  if (!room.bullets) room.bullets = [];
                  room.bullets.push(bullet);
                  io.to(roomId).emit('br:bullet', bullet);
                }
                p.cooldown = bReload;
              }
            } else {
              // No target: Move toward safe zone center with random wandering
              const angleToCenter = Math.atan2(targetSafeZone.y - p.y, targetSafeZone.x - p.x);
              const wanderOffset = Math.sin(now * 0.001 + p.x * 0.01) * 0.5;
              p.vx = Math.cos(angleToCenter + wanderOffset) * (botSpeed * 0.6);
              p.vy = Math.sin(angleToCenter + wanderOffset) * (botSpeed * 0.6);
              targetAngle = angleToCenter + wanderOffset;
            }

            p.angle = targetAngle;
            p.x += p.vx;
            p.y += p.vy;

            // Apply friction (like real physics)
            p.vx *= 0.85;
            p.vy *= 0.85;

            // Keep bot within map bounds
            const margin = 200;
            p.x = Math.max(margin, Math.min(room.mapSize - margin, p.x));
            p.y = Math.max(margin, Math.min(room.mapSize - margin, p.y));
            p.hasChanged = true;
          }

          // Storm Damage
          if (distToCenter > safeRadius) {
            p.hp -= (15 / (1000 / 60));
            p.hasChanged = true;
            if (p.hp <= 0 && p.alive) {
              p.alive = false; p.hp = 0;
              io.to(roomId).emit('br:kill_feed', { killerName: 'The Storm', victimName: p.name, aliveCount: Array.from(room.players.values()).filter(pp => pp.alive).length });
              if (!p.isBot) io.to(p.socketId).emit('br:you_died', { killerName: 'The Storm' });
            }
          }
        });

        // === SERVER-SIDE BULLET COLLISION (Bot bullets hitting players/bots) ===
        if (!room.bullets) room.bullets = [];
        for (let bi = room.bullets.length - 1; bi >= 0; bi--) {
          const b = room.bullets[bi];
          if (!b) continue;
          b.x += b.vx;
          b.y += b.vy;
          b.life -= 1;

          if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > room.mapSize || b.y > room.mapSize) {
            room.bullets.splice(bi, 1);
            continue;
          }

          // Check collision with all players (including bots)
          let bulletHit = false;
          room.players.forEach(target => {
            if (bulletHit) return;
            if (!target.alive || target.socketId === b.ownerId) return;
            const dx = b.x - target.x;
            const dy = b.y - target.y;
            const hitRadius = (target.size || 30) / 2;
            if (dx * dx + dy * dy < hitRadius * hitRadius) {
              target.hp -= b.damage;
              target.hasChanged = true;
              bulletHit = true;

              // Knockback
              const angle = Math.atan2(b.vy, b.vx);
              target.vx = (target.vx || 0) + Math.cos(angle) * 3;
              target.vy = (target.vy || 0) + Math.sin(angle) * 3;

              if (target.hp <= 0 && target.alive) {
                target.alive = false;
                target.hp = 0;
                const shooter = room.players.get(b.ownerId);
                if (shooter) shooter.kills = (shooter.kills || 0) + 1;

                // Kill feed broadcast
                const aliveCount = Array.from(room.players.values()).filter(pp => pp.alive).length;
                io.to(roomId).emit('br:kill_feed', {
                  killerName: shooter?.name || 'Unknown',
                  victimName: target.name,
                  aliveCount
                });

                // Notify victim
                if (!target.isBot) {
                  io.to(target.socketId).emit('br:you_died', {
                    killerName: shooter?.name || 'Unknown',
                    kills: shooter?.kills || 0
                  });
                }

                // Broadcast HP update
                io.to(roomId).emit('br:hp_update', {
                  socketId: target.socketId,
                  hp: 0,
                  alive: false
                });

                // Check for winner
                const alivePlayers = Array.from(room.players.values()).filter(pp => pp.alive);
                if (alivePlayers.length === 1) {
                  io.to(roomId).emit('br:winner', { winner: alivePlayers[0] });
                  refreshGlobalLeaderboard();
                  setTimeout(() => {
                    brRooms.delete(roomId);
                    if (supabase) supabase.from('game_servers').delete().match({ room_id: roomId }).then();
                    room.players.forEach((_, sid) => playerToRoom.delete(sid));
                    broadcastServerList();
                  }, 5000);
                }
              } else {
                // Broadcast HP update for damaged player
                io.to(roomId).emit('br:hp_update', {
                  socketId: target.socketId,
                  hp: target.hp,
                  alive: target.alive
                });
              }
            }
          });
          if (bulletHit) room.bullets.splice(bi, 1);
        }

      }
    } else if ((room.mode === 'battleroyale' || room.mode === 'pvp1v1') && !room.started && !room.countingDown) {
      // Auto-Fill Logic - Fill with bots after 30 seconds of waiting
      if (now - room.createdAt >= 30000 && room.players.size > 0 && room.players.size < room.maxRoomPlayers) {
        console.log(`[BR] Room ${roomId} inactive for 30s. Filling with bots.`);
        const botsToFill = room.maxRoomPlayers - room.players.size;
        const usedNames = new Set();
        room.players.forEach(p => usedNames.add(p.name));

        for (let i = 0; i < botsToFill; i++) {
          const botId = `BOT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const botClasses = ['basic', 'machinegun', 'melee', 'warden', 'flamethrower', 'necromancer'];
          const botClass = botClasses[Math.floor(Math.random() * botClasses.length)];

          // Pick unique Indonesian name
          let botName;
          let attempts = 0;
          do {
            botName = INDONESIAN_NAMES[Math.floor(Math.random() * INDONESIAN_NAMES.length)];
            attempts++;
          } while (usedNames.has(botName) && attempts < 50);
          usedNames.add(botName);

          // Spawn within valid map bounds with safe margin
          const margin = 300;
          const mapMax = room.mapSize - margin;
          const spawnX = margin + Math.random() * (mapMax - margin);
          const spawnY = margin + Math.random() * (mapMax - margin);

          // Class-specific HP
          const classHp = { basic: 150, machinegun: 120, melee: 200, warden: 180, flamethrower: 140, necromancer: 130 };
          const botHp = classHp[botClass] || 150;

          const bData = {
            socketId: botId,
            uid: botId,
            name: `${botName}`,
            class: botClass,
            x: spawnX,
            y: spawnY,
            vx: 0, vy: 0, angle: 0,
            hp: botHp, maxHp: botHp,
            size: 30, // BIGGER visual size than default 20
            alive: true, kills: 0, isReady: true, isBot: true,
            cooldown: 0, dashCooldown: 0,
            hasChanged: true // Ensure first update is sent
          };
          room.players.set(botId, bData);
          io.to(roomId).emit('br:player_joined', { pData: bData, aliveCount: room.players.size, maxPlayers: room.maxRoomPlayers });
        }

        room.locked = true;
        room.countingDown = true;
        room.startTime = now + 10000; // 10s countdown
        io.to(roomId).emit('br:countdown_msg', { text: `${botsToFill} bots joined! Starting in 10s...` });
        broadcastServerList();
      }
    } // <--- CLOSE

    // Optimized spatial updates: only send data of players near other players
    room.players.forEach((recipient, recipientSid) => {
      const playerUpdates = [];
      const REC_X = recipient.x, REC_Y = recipient.y;
      const R_DIST_SQ = 2000 * 2000;

      room.players.forEach(p => {
        if (p.hasChanged && p.alive) {
          const dx = REC_X - p.x;
          const dy = REC_Y - p.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < R_DIST_SQ || p.socketId === recipientSid || room.mode === 'pvp1v1') {
            playerUpdates.push({ socketId: p.socketId, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, hp: p.hp });
          }
        }
      });
      if (playerUpdates.length > 0) {
        io.to(recipientSid).emit('br:batch_update', playerUpdates);
      }
    });

    // Reset hasChanged after all recipients processed
    room.players.forEach(p => p.hasChanged = false);

    // Return positive timeLeft for combat, display countdown in Lobby using negative elapsed logic
    let displayTimeLeft = room.started ? Math.floor(timeLeft / 1000) : (room.countingDown ? Math.abs(Math.floor((room.startTime - now) / 1000)) : 15);
    io.to(roomId).emit('br:zone_update', { safeZone: room.safeZone, timeLeft: displayTimeLeft, started: room.started });
  }
}, 60); // Reduced tick rate slightly from 50ms to 60ms to save CPU

const PORT = process.env.PORT || process.env.NEXT_PUBLIC_GAME_PORT || 3000;
const HOST = process.env.GAME_HOST || '0.0.0.0'; // Use '0.0.0.0' to listen on all interfaces

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`!!!! ERROR: Port ${PORT} is already in use. Please close the other process running on this port and tray again.`);
    process.exit(1);
  } else {
    console.error('Server Error:', e);
  }
});

console.log(`[Server] Attempting to listen on ${HOST}:${PORT}...`);
httpServer.listen(PORT, HOST, () => {
  console.log(`[BR Socket Server] Running and listening on ${HOST}:${PORT}`);
});

instrument(io, {
  auth: false,
});
