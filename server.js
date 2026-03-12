const { instrument } = require('@socket.io/admin-ui');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

// Load environment variables from .env.local for local development
try {
  if (fs.existsSync('.env.local')) {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
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
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[BR] Connected to Supabase DB');
}

const httpServer = createServer((req, res) => {
  // Only handle these routes, let Socket.io and Admin UI handle the rest
  const isInternal = req.url.startsWith('/socket.io') || req.url.startsWith('/admin');
  
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else if (!isInternal) {
    console.log(`[HTTP] 404 Blocked: ${req.url}`);
    res.writeHead(404);
    res.end();
  }
});
// Update CORS for production and all-device connectivity
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for game connectivity from any device
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ["bypass-tunnel-reminder", "Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling']
});

// === SERVER STATE ===
const brRooms = new Map(); // roomId -> { players: Map<socketId, playerData> }
const playerToRoom = new Map(); // socketId -> roomId
const ROOM_MAX = 30; // Max players per room
const WORLD_SIZE = 8000; // Size of the game world

function getRoomId(socket, requestedRoomId, mode = 'battleroyale') {
  const is1v1 = mode === 'pvp1v1';
  const MAX_PLAYERS = is1v1 ? 2 : ROOM_MAX;
  const MAP_SIZE = WORLD_SIZE;

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
    mode: mode,
    maxRoomPlayers: MAX_PLAYERS,
    mapSize: MAP_SIZE,
    safeZone: { x: MAP_SIZE / 2, y: MAP_SIZE / 2, radius: MAP_SIZE },
    started: false, // Room combat has started
    locked: false,  // Room is closed for new players
    countingDown: false,
    startTime: null, // Will be set when the match officially starts
    matchDuration: 300000, // 5 minutes in milliseconds for safe zone shrinking
    createdAt: Date.now() // Track room creation time for bot fill timeout
  });

  if (supabase) {
    supabase.from('game_servers').insert({
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
      x: Math.random() * room.mapSize,
      y: Math.random() * room.mapSize,
      vx: 0, vy: 0,
      angle: 0,
      hp: 150,
      maxHp: 150,
      size: 20,
      alive: true,
      kills: 0,
      isReady: false
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
      countingDown: room.countingDown,
      startTime: room.startTime
    });

    // Broadcast new player to others
    socket.to(roomId).emit('br:player_joined', { pData, aliveCount: room.players.size });
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
  socket.on('disconnect', () => {
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
        }

        timeLeft = Math.max(0, room.matchDuration - elapsed);

        // Radius awal WORLD_SIZE, radius akhir 200 (or some minimum)
        const minRadius = 200;
        const initialRadius = WORLD_SIZE;
        const shrinkAmount = initialRadius - minRadius;

        const progress = Math.min(1, elapsed / room.matchDuration);
        room.safeZone.radius = initialRadius - (progress * shrinkAmount);

        const targetSafeZone = room.targetSafeZone || room.safeZone;
        const safeRadius = targetSafeZone.radius;

        // Cek pemain & Bot AI
        room.players.forEach(p => {
          if (p.alive) {
            const distToCenter = Math.hypot(p.x - targetSafeZone.x, p.y - targetSafeZone.y);

            // Bot AI Movement (Move towards Safe Zone center if far, or just wander slightly)
            if (p.isBot && room.started) {
              const botSpeed = 3;
              let angleToCenter = Math.atan2(targetSafeZone.y - p.y, targetSafeZone.x - p.x);

              // If they are safely inside, maybe add some random walk, otherwise dive straight inwards
              if (distToCenter < safeRadius * 0.5) {
                angleToCenter += (Math.random() - 0.5) * 2; // Wander
              }

              p.vx = Math.cos(angleToCenter) * botSpeed;
              p.vy = Math.sin(angleToCenter) * botSpeed;
              p.angle = angleToCenter;
              p.x += p.vx;
              p.y += p.vy;
              p.hasChanged = true;
            }

            // Kena Damage Badai (Storm Damage Processing)
            if (distToCenter > safeRadius) {
              // Kena Damage Badai per-detik (Karena ini 20 Ticks/Sec, damage dibagi 20)
              p.hp -= (10 / 20);
              p.hasChanged = true;

              if (p.hp <= 0 && p.alive) {
                p.alive = false; p.hp = 0;
                // Broadcast Mati kena badai
                io.to(roomId).emit('br:kill_feed', { killerName: 'The Storm', victimName: p.name, aliveCount: Array.from(room.players.values()).filter(pp => pp.alive).length });
                // Find the socket ID for the player who died to send them a specific message
                const targetSocketId = Array.from(room.players.keys()).find(key => room.players.get(key) === p);
                if (targetSocketId) io.to(targetSocketId).emit('br:you_died', { killerName: 'The Storm', kills: 0 });
              }
            }
          }
        });
      }
    } else if (room.mode === 'battleroyale' && !room.started && !room.countingDown) {
      // Battle Royale Bot Auto-Fill Logic
      // Apabila dalam waktu 1 menit sudah tak ada lagi pemain masuk maka akan di isi oleh bot
      if (now - room.createdAt >= 60000 && room.players.size > 0 && room.players.size < room.maxRoomPlayers) {
        console.log(`[BR] Room ${roomId} inactive for 1 min. Filling with bots.`);
        const botsToFill = room.maxRoomPlayers - room.players.size;

        for (let i = 0; i < botsToFill; i++) {
          const botId = `BOT_${Math.random().toString(36).slice(2)}`;
          const botClasses = ['basic', 'machinegun', 'melee', 'warden', 'flamethrower', 'necromancer'];
          const botClass = botClasses[Math.floor(Math.random() * botClasses.length)];
          const bData = {
            socketId: botId,
            uid: botId,
            name: `Bot_${Math.floor(Math.random() * 9999)}`,
            class: botClass,
            x: Math.random() * room.mapSize, y: Math.random() * room.mapSize,
            vx: 0, vy: 0, angle: 0,
            hp: 150, maxHp: 150, size: 20,
            alive: true, kills: 0, isReady: true, isBot: true
          };
          room.players.set(botId, bData);
          io.to(roomId).emit('br:player_joined', { pData: bData, aliveCount: room.players.size });
        }

        room.locked = true;
        room.countingDown = true;
        room.startTime = now + 10000; // 10s countdown
        io.to(roomId).emit('br:countdown_msg', { text: 'Bots filled the room. Starting in 10s...' });
        broadcastServerList();
      }
    } // <--- CLOSE

    // Send updates
    room.players.forEach(p => {
      if (p.hasChanged && p.alive) {
        updates.push({ socketId: p.socketId, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, hp: p.hp });
        p.hasChanged = false;
      }
    });

    if (updates.length > 0) {
      io.to(roomId).emit('br:batch_update', updates);
    }

    // Return positive timeLeft for combat, display countdown in Lobby using negative elapsed logic
    let displayTimeLeft = room.started ? Math.floor(timeLeft / 1000) : (room.countingDown ? Math.abs(Math.floor((room.startTime - now) / 1000)) : 15);
    io.to(roomId).emit('br:zone_update', { safeZone: room.safeZone, timeLeft: displayTimeLeft, started: room.started });
  }
}, 50); // 20 Ticks per second

const PORT = process.env.PORT || 3001;

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`!!!! ERROR: Port ${PORT} is already in use. Please close the other process running on this port and tray again.`);
    process.exit(1);
  } else {
    console.error('Server Error:', e);
  }
});

httpServer.listen(PORT, () => {
  console.log(`[BR Socket Server] Running on port ${PORT}`);
});

instrument(io, {
  auth: false,
});