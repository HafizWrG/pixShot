'use client';
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { io, Socket } from 'socket.io-client';

// === GAME CONSTANTS ===
const WORLD_SIZE = 8000;
const TILE_SIZE = 100;
const MAX_SHAPES = 50;
const MAX_PARTICLES = 20;
const MAX_DROPS = 40;

// === PROCEDURAL TEXTURE GENERATOR ===
const generateTexture = (type: string) => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    if (!ctx) return c;

    let bC = '#aaaaaa', nC = '#888888', amt = 0.3;
    if (type === 'dirt') { bC = '#866043'; nC = '#664932'; }
    else if (type === 'wood') { bC = '#a08054'; nC = '#7b623f'; }
    else if (type === 'stone') { bC = '#7d7d7d'; nC = '#5c5c5c'; amt = 0.5; }
    else if (type === 'diamond') { bC = '#51e8ea'; nC = '#ffffff'; amt = 0.2; }
    else if (type === 'emerald') { bC = '#2ECC71'; nC = '#27AE60'; amt = 0.2; }
    else if (type === 'soulSand') { bC = '#544033'; nC = '#3d2e24'; amt = 0.6; }
    else if (type === 'sand') { bC = '#d2b48c'; nC = '#e6cca8'; amt = 0.4; }
    else if (type === 'ice') { bC = '#a5f2f3'; nC = '#82d3d4'; amt = 0.2; }
    else if (type === 'water') { bC = '#2B65EC'; nC = '#15317E'; amt = 0.1; }
    else if (type === 'netherrack') { bC = '#6b2020'; nC = '#4a1515'; amt = 0.7; }
    else if (type === 'bedrock') { bC = '#333333'; nC = '#111111'; amt = 0.8; }
    else if (type === 'tnt') { bC = '#db3232'; nC = '#ffffff'; amt = 0.1; }
    else if (type === 'tex_warden') { bC = '#0f766e'; nC = '#14b8a6'; amt = 0.8; }

    ctx.fillStyle = bC; ctx.fillRect(0, 0, 16, 16);

    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            if (type === 'wood' && i % 4 === 0) { ctx.fillStyle = nC; ctx.fillRect(i, j, 1, 1); }
            else if (type === 'tnt' && j > 4 && j < 11) { ctx.fillStyle = '#fff'; ctx.fillRect(i, j, 1, 1); if (i === 7) { ctx.fillStyle = '#000'; ctx.fillRect(i, j, 2, 2); } }
            else if (type === 'tex_warden' && i % 2 === 0 && j % 2 === 0) { ctx.fillStyle = nC; ctx.fillRect(i, j, 1, 1); }
            else if (Math.random() < amt) { ctx.fillStyle = nC; ctx.fillRect(i, j, 1, 1); }
            if ((type === 'stone' || type === 'bedrock') && (i === 0 || j === 0)) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(i, j, 1, 1); }
        }
    }
    return c;
};

// === PRE-RENDERED SHADOW ===
const createShadowTexture = () => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return c;
};

// === ENTITIES ===
const ENTITIES = [
    { type: 'dirt', textureId: 'dirt', hp: 10, xp: 10, size: 12, weight: 50, h: 20 },
    { type: 'wood', textureId: 'wood', hp: 30, xp: 25, size: 16, weight: 30, h: 25 },
    { type: 'stone', textureId: 'stone', hp: 100, xp: 100, size: 20, weight: 15, h: 30 },
    { type: 'tnt', textureId: 'tnt', hp: 20, xp: 50, size: 18, weight: 5, h: 25, isBomb: true },
    { type: 'diamond', textureId: 'diamond', hp: 500, xp: 500, size: 25, weight: 3, h: 40 },
    { type: 'emerald', textureId: 'emerald', hp: 1000, xp: 2000, size: 22, weight: 1, h: 45 },

    { type: 'creeper', textureId: 'creeper_local', hp: 30, xp: 40, size: 28, weight: 8, isBot: true, botType: 'melee', isBomb: true, h: 40, splatter: '#16a34a', framesConfig: [10, 10, 10] },
    { type: 'zombie', textureId: 'zolo', hp: 120, xp: 80, size: 28, weight: 6, isBot: true, botType: 'melee', h: 35, splatter: '#16a34a', framesConfig: [8, 8, 8] },
    { type: 'skeleton', textureId: 'skeleton_local', colorTop: '#E0E0E0', colorSide: '#BDBDBD', hp: 40, xp: 60, size: 24, weight: 5, isBot: true, botType: 'ranged', h: 32, splatter: '#e5e7eb', framesConfig: [12, 12, 12] },
    { type: 'slime', textureId: 'slime', hp: 80, xp: 50, size: 40, weight: 4, isBot: true, botType: 'melee', h: 30, splatter: '#22c55e', framesConfig: [8, 8, 8] },
    { type: 'spider', textureId: 'spid', hp: 50, xp: 70, size: 22, weight: 5, isBot: true, botType: 'climber', h: 15, splatter: '#991b1b', framesConfig: [8, 8, 8] },
    { type: 'golem', textureId: 'golem_local', colorTop: '#dddddd', colorSide: '#999999', hp: 500, xp: 300, size: 35, weight: 2, isBot: true, botType: 'neutral', h: 45, splatter: '#64748b', framesConfig: [12, 12, 12] },
    { type: 'enderman', textureId: 'ender', hp: 150, xp: 150, size: 30, weight: 4, isBot: true, botType: 'teleporter', h: 50, splatter: '#c084fc', framesConfig: [4, 4, 4] },
    { type: 'ghast', textureId: 'ghast', hp: 250, xp: 200, size: 50, weight: 3, isBot: true, botType: 'ranged', h: 60, splatter: '#f8fafc', framesConfig: [12, 12, 12] }
];

const CLASSES: Record<string, any> = {
    basic: {
        id: 'basic', name: 'Minecart', color: '#cbd5e1', price: 0, desc: 'Starter tank.', textureId: 'tank_basic', framesConfig: [8, 8, 8],
        skills: [
            { name: 'Overdrive', cd: 600, type: 'buff', buffType: 'overdrive', dur: 300 },
            { name: 'Heal Burst', cd: 900, type: 'heal', amt: 0.5 },
            { name: 'EMP Stun', cd: 1200, type: 'aoe', dmg: 50, rad: 400, effect: 'stun' },
            { name: 'Homing Missiles', cd: 800, type: 'projectile', bulletType: 'homing', count: 5 },
            { name: 'Orbital Strike', cd: 1800, type: 'aoe_delayed', dmg: 1500, rad: 500, delay: 60 }
        ]
    },
    machinegun: {
        id: 'machinegun', name: 'Rapid', color: '#fbbf24', price: 500, desc: 'Bullet hose. Inaccurate.', textureId: 'tank_machinegun', framesConfig: [8, 10, 8],
        skills: [
            { name: 'Bullet Storm', cd: 600, type: 'buff', buffType: 'bulletstorm', dur: 250 },
            { name: 'Dash Strike', cd: 400, type: 'dash', power: 25 },
            { name: 'Bouncing Spray', cd: 900, type: 'projectile', bulletType: 'bounce', count: 16 },
            { name: 'Mine Trap', cd: 600, type: 'deploy', deployType: 'mine', count: 3 },
            { name: 'Auto Turret', cd: 1500, type: 'buff', buffType: 'turret', dur: 400 }
        ]
    },
    melee: {
        id: 'melee', name: 'Smasher', color: '#475569', price: 1800, desc: 'Spinning sawblades. Huge body damage.', textureId: 'tank_melee', framesConfig: [8, 10, 8],
        skills: [
            { name: 'Earthquake', cd: 600, type: 'buff', buffType: 'earthquake', dur: 180 },
            { name: 'Hook Pull', cd: 500, type: 'projectile', bulletType: 'hook', count: 1 },
            { name: 'Saw Boomerang', cd: 400, type: 'projectile', bulletType: 'saw', count: 1 },
            { name: 'Reflect Shield', cd: 1000, type: 'buff', buffType: 'reflect', dur: 300 },
            { name: 'Blackhole', cd: 2000, type: 'deploy', deployType: 'blackhole', dur: 300 }
        ]
    },
    warden: {
        id: 'warden', name: 'Warden', color: '#0f766e', price: 2000, desc: 'Sonic Boom pierces all walls.', textureId: 'tank_warden', framesConfig: [8, 8, 8],
        skills: [
            { name: 'Sonic Wave', cd: 600, type: 'buff', buffType: 'sonicwave', dur: 100 },
            { name: 'Radar Scan', cd: 800, type: 'buff', buffType: 'radar', dur: 600 },
            { name: 'Echo Blast', cd: 500, type: 'projectile', bulletType: 'warden_sonic_wave', count: 5 },
            { name: 'Silence Area', cd: 1000, type: 'aoe_cloud', rad: 400, dur: 300, effect: 'silence' },
            { name: 'Wrath of Warden', cd: 1800, type: 'aoe', dmg: 1000, rad: 800 }
        ]
    },
    flamethrower: {
        id: 'flamethrower', name: 'Igniter', color: '#f97316', price: 2200, desc: 'Sprays close-range fire cone.', textureId: 'tank_flamethrower', framesConfig: [8, 8, 8],
        skills: [
            { name: 'Inferno', cd: 600, type: 'buff', buffType: 'inferno', dur: 150 },
            { name: 'Lava Trail', cd: 900, type: 'buff', buffType: 'lava_trail', dur: 300 },
            { name: 'Napalm Bomb', cd: 800, type: 'projectile', bulletType: 'napalm', count: 1 },
            { name: 'Ring of Fire', cd: 1200, type: 'aoe_cloud', rad: 300, dur: 400 },
            { name: 'Meteor Swarm', cd: 1800, type: 'projectile', bulletType: 'meteor', count: 10 }
        ]
    },
    necromancer: {
        id: 'necromancer', name: 'Necromancer', color: '#d946ef', price: 3500, desc: 'Touch blocks to revive as loyal drones.', textureId: 'tank_necromancer', framesConfig: [6, 5, 5],
        skills: [
            { name: 'Mass Revive', cd: 800, type: 'summon', summonType: 'drone', count: 15 },
            { name: 'Life Drain', cd: 900, type: 'aoe_leech', rad: 400, dur: 200 },
            { name: 'Bone Spear', cd: 400, type: 'projectile', bulletType: 'sniper', count: 3 },
            { name: 'Drone Frenzy', cd: 1200, type: 'buff', buffType: 'drone_frenzy', dur: 300 },
            { name: 'Summon Giant', cd: 2000, type: 'summon', summonType: 'golem', count: 1 }
        ]
    },
};


export default function PixShotMega() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioBuffersRef = useRef<Record<string, AudioBuffer>>({});
    const texturesRef = useRef<Record<string, HTMLCanvasElement | HTMLImageElement>>({});
    const shadowTexRef = useRef<HTMLCanvasElement | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // === AUTH & SOCIAL SYSTEM ===
    const [auth, setAuth] = useState({ isLoggedIn: false, username: '', uid: '', password: '' });
    const [friends, setFriends] = useState<{ uid: string, name: string, status: string, lastSeen?: number }[]>([
        { uid: 'U102', name: 'TankMaster', status: 'In-Game (BR)' },
        { uid: 'U777', name: 'Bob', status: 'Online' }
    ]);
    const [party, setParty] = useState<{ uid: string, name: string, isLeader?: boolean, isReady?: boolean, avatar?: string }[]>([]);
    const [addFriendInput, setAddFriendInput] = useState('');
    const [killFeed, setKillFeed] = useState<{ id: number, killer: string, victim: string, time: number }[]>([]);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [allPlayers, setAllPlayers] = useState<any[]>([]);
    const [friendRequests, setFriendRequests] = useState<any[]>([]);
    const [friendTab, setFriendTab] = useState<'friends' | 'all' | 'requests'>('friends');
    const [inspectUser, setInspectUser] = useState<any | null>(null);
    const [privateChat, setPrivateChat] = useState<{ uid: string, name: string, msgs: { sender: string, text: string, time: number }[] } | null>(null);
    const [privateChatMsg, setPrivateChatMsg] = useState('');
    const [isLobbyReady, setIsLobbyReady] = useState(false);
    const [ping, setPing] = useState(0);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Record<string, RTCPeerConnection>>({});
    const [socketUrl, setSocketUrl] = useState(() => {
        if (typeof window === 'undefined') return 'http://localhost:3001';
        const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // 1. Check Env Variable First (Correct way for production)
        if (envUrl) {
            console.log('[Socket] Using NEXT_PUBLIC_SOCKET_URL:', envUrl);
            return envUrl.replace('httpss://', 'https://');
        }

        // 2. Local fallback
        if (isLocal) {
            const localUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
            console.log('[Socket] Using Local fallback:', localUrl);
            return localUrl;
        }

        // 3. Last resort (Often fails on Vercel unless server is on the same domain)
        console.warn('[Socket] No NEXT_PUBLIC_SOCKET_URL found. Falling back to origin.');
        return window.location.origin;
    });
    const [connStatus, setConnStatus] = useState<'Disconnected' | 'Connecting' | 'Connected' | 'Error'>('Disconnected');

    // === TOAST NOTIFICATION SYSTEM ===
    const [toasts, setToasts] = useState<{ id: number, message: string, type: 'info' | 'invite', extra?: any }[]>([]);

    const addToast = (message: string, type: 'info' | 'invite' = 'info', extra?: any) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, extra }]);
        if (type !== 'invite') {
            setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
        }
    };

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // === GLOBAL PROFILE (Local Storage) ===
    const [globalProfile, setGlobalProfile] = useState({
        username: 'Guest', uid: `GUEST_${Math.floor(Math.random() * 10000)}`, coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: ''
    });

    const [serverList, setServerList] = useState<any[]>([]);

    // === REACT STATE ===
    const [uiState, setUiState] = useState({
        isPlaying: false, isGameOver: false, isPaused: false, score: 0, inGameCoins: 0, level: 1, xp: 0, xpNeeded: 50,
        statPoints: 0, stats: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 } as Record<string, number>,
        playerClass: 'basic', dayTime: 0, showShop: false, showSettings: false, showProfile: false, showAuth: true, showLeaderboard: false, showFriends: false,
        minimizeUpgrades: false, gameMode: 'normal', biome: 'plains',
        skillCooldowns: [0, 0, 0, 0, 0], hp: 100, maxHp: 100,
        gameStats: { kills: 0, maxCombo: 0, timeSurvived: 0 },
        brAlive: 0, brTimeLeft: 300, brStarted: false, victory: false, triggerBR: false,
        showServerBrowser: false, brCountdownMsg: 'Waiting for players to be ready.', isPlayerReady: false, targetRoomId: null as string | null,
        lobbyPlayers: [] as { name: string, isReady: boolean, uid: string }[],
        showServerSettings: false
    });

    const [settings, setSettings] = useState({
        volume: 0.5, isMobile: false, showMinimap: true, graphics: 'high', particles: true, joystickScale: 1.0, uiScale: 1.0
    });
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    const uiStateRef = useRef(uiState);
    useEffect(() => { uiStateRef.current = uiState; }, [uiState]);

    const [joystick, setJoystick] = useState({
        left: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
        right: { active: false, x: 0, y: 0, angle: 0, originX: 0, originY: 0, distance: 0 },
        pinchDist: 0
    });

    const [showGodSelector, setShowGodSelector] = useState(false);
    const [authInput, setAuthInput] = useState({ user: '', pass: '' });

    // === MUTABLE GAME STATE ===
    const gameRef = useRef({
        isPaused: false, hasSynced: false,
        player: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, vx: 0, vy: 0, size: 20, angle: 0, hp: 100, maxHp: 100, class: 'basic', cooldown: 0, dashCooldown: 0, skillCooldowns: [0, 0, 0, 0, 0], z: 0, idleTime: 0, activeUlt: null as string | null, ultDuration: 0, activeBuffs: { speed: 0, damage: 0, shield: 0, size: 0, turret: 0, drone_frenzy: 0, reflect: 0, radar: 0, lava_trail: 0 } },
        baseStats: { speed: 1.5, reload: 25, bSpd: 10, bDmg: 12, bPen: 1, bodyDmg: 15, regen: 0.04 },
        statLevels: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 } as Record<string, number>,
        statPoints: 0, score: 0, level: 1, xp: 0, xpNeeded: 50, sessionCoins: 0,
        bullets: [] as any[], shapes: [] as any[], env: [] as any[], particles: [] as any[], aoeClouds: [] as any[], drops: [] as any[], damageTexts: [] as any[], decals: [] as any[], powerups: [] as any[], drones: [] as any[],
        brPlayers: [] as any[],
        worldSize: WORLD_SIZE,
        safeZone: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: WORLD_SIZE, targetRadius: WORLD_SIZE, timer: 0 },
        keys: { w: false, a: false, s: false, d: false, space: false, '1': false, '2': false, '3': false, '4': false, '5': false, rightClick: false } as Record<string, boolean>,
        mouse: { x: 0, y: 0, isDown: false, worldX: 0, worldY: 0 },
        camera: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1.0, shake: 0 }, animationFrameId: null as number | null, globalTime: 0,
        weather: { type: 'clear', timer: 0, flash: 0 },
        gameMode: 'normal', combo: { count: 0, timer: 0, max: 0 },
        sessionStart: 0, kills: 0,
        isGameOver: false
    });

    useEffect(() => {
        const savedAuth = localStorage.getItem('pixshot_auth');
        if (savedAuth) {
            const parsedAuth = JSON.parse(savedAuth);
            setAuth(parsedAuth);
            if (parsedAuth.isLoggedIn) {
                setUiState(p => ({ ...p, showAuth: false }));
                supabase.from('players').select('*').eq('uid', parsedAuth.uid).single().then(({ data }) => {
                    if (data) setGlobalProfile({ username: data.username, uid: data.uid, coins: data.coins, tokens: data.tokens, highscore: data.highscore, totalKills: data.total_kills, matches: data.matches, ownedClasses: data.owned_classes || ['basic'], avatar: data.avatar || '' });
                });
            }
        } else {
            const saved = localStorage.getItem('pixshot_profile');
            if (saved) {
                try { const parsed = JSON.parse(saved); setGlobalProfile(prev => ({ ...prev, ...parsed })); } catch (e) { }
            }
        }
    }, []);

    useEffect(() => {
        if (uiState.showLeaderboard) {
            supabase.from('players').select('uid, username, highscore, total_kills').order('highscore', { ascending: false }).limit(50).then(({ data }) => {
                if (data) setLeaderboard(data);
            });
        }
    }, [uiState.showLeaderboard]);

    const loadFriends = async () => {
        if (!auth.uid) return;
        const { data } = await supabase.from('friends').select('*').eq('user_uid', auth.uid);
        if (data) {
            setFriends(data.filter(f => f.status === 'accepted').map(f => ({ uid: f.friend_uid, name: f.friend_name, status: 'Offline' })));
        }
        const { data: reqData } = await supabase.from('friends').select('*').eq('friend_uid', auth.uid).eq('status', 'pending');
        if (reqData) {
            setFriendRequests(reqData.map(f => ({ uid: f.user_uid, name: f.user_uid }))); // Fallback name
        }
        socketRef.current?.emit('player:status', { uid: auth.uid, status: 'Online' });
    };

    useEffect(() => {
        if (uiState.triggerBR && !uiState.isPlaying) {
            setUiState(p => ({ ...p, triggerBR: false }));
            startGame('battleroyale', uiState.targetRoomId || undefined);
        }
    }, [uiState.triggerBR, uiState.isPlaying, uiState.targetRoomId]);

    // === SUPABASE REALTIME SERVER BROWSER ===
    useEffect(() => {
        // Initial fetch from Supabase
        const fetchServers = async () => {
            const { data } = await supabase.from('game_servers').select('*');
            if (data) {
                setServerList(data.map(srv => ({
                    id: srv.room_id,
                    players: srv.players,
                    max: srv.max_players,
                    state: srv.status,
                    locked: srv.locked
                })));
            }
        };
        fetchServers();

        // Subscribe to changes
        const channel = supabase
            .channel('game_servers_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_servers' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    const srv = payload.new;
                    setServerList(prev => [...prev, {
                        id: srv.room_id,
                        players: srv.players,
                        max: srv.max_players,
                        state: srv.status,
                        locked: srv.locked
                    }]);
                } else if (payload.eventType === 'UPDATE') {
                    const srv = payload.new;
                    setServerList(prev => prev.map(s => s.id === srv.room_id ? {
                        id: srv.room_id,
                        players: srv.players,
                        max: srv.max_players,
                        state: srv.status,
                        locked: srv.locked
                    } : s));
                } else if (payload.eventType === 'DELETE') {
                    setServerList(prev => prev.filter(s => s.id === payload.old.room_id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (uiState.showFriends) {
            loadFriends();
            supabase.from('players').select('uid, username, avatar').then(({ data }) => {
                if (data) setAllPlayers(data);
            });
        }
    }, [uiState.showFriends, auth.uid]);

    // Interval to keep online status active
    useEffect(() => {
        const interval = setInterval(() => {
            if (auth.isLoggedIn && socketRef.current?.connected) {
                socketRef.current.emit('player:status', { uid: auth.uid, status: 'Online' });
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [auth.isLoggedIn, auth.uid]);

    useEffect(() => {
        // === AUTO CONNECT SOCKET.IO ===
        console.log('[Socket] Connecting to:', socketUrl);
        setConnStatus('Connecting');

        const finalUrl = socketUrl.endsWith('/') ? socketUrl.slice(0, -1) : socketUrl;
        console.log('[Socket] Final Connection URL:', finalUrl);
        
        socketRef.current = io(finalUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            transports: ['polling', 'websocket'], // Polling first allows headers to bypass tunnels
            withCredentials: false,
            extraHeaders: {
                "bypass-tunnel-reminder": "true" 
            }
        });

        socketRef.current.on('connect', () => {
            console.log('[Socket] Successfully connected! ID:', socketRef.current?.id);
            setConnStatus('Connected');
            addToast('Connected to Game Server', 'info');
            socketRef.current?.emit('br:get_rooms');
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            setConnStatus('Disconnected');
            if (reason === 'io server disconnect') {
                socketRef.current?.connect();
            }
            addToast('Lost connection to server. Retrying...', 'info');
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('[Socket] Connection Error Type:', error.name);
            console.error('[Socket] Connection Error Message:', error.message);
            setConnStatus('Error');
            if (error.message === 'xhr poll error' || error.message === 'websocket error') {
                console.warn('[Socket] Transport error. Check if server is running and CORS allows origin:', window.location.origin);
            }
        });

        socketRef.current.on('br:init', (data: any) => {
            gameRef.current.safeZone = data.safeZone;

            // Random Spawn Fix: Sync Frontend with Backend selfData
            if (data.selfData && gameRef.current.player) {
                gameRef.current.player.x = data.selfData.x;
                gameRef.current.player.y = data.selfData.y;
                gameRef.current.camera.x = data.selfData.x;
                gameRef.current.camera.y = data.selfData.y;
                gameRef.current.hasSynced = true;
            }

            data.players.forEach((p: any) => { gameRef.current.brPlayers.push(p); });
            const allLobbyPlayers = [data.selfData, ...data.players].map((p: any) => ({ name: p.name, isReady: p.isReady, uid: p.uid }));

            gameRef.current.worldSize = data.mapSize || WORLD_SIZE;

            // FIX: Spawn jangan di bawah environment (Remove overlapping env objects)
            gameRef.current.env = gameRef.current.env.filter((e: any) => {
                let clash = false;
                if (data.selfData && Math.hypot(e.x - data.selfData.x, e.y - data.selfData.y) < e.r + 80) clash = true;
                data.players.forEach((p: any) => {
                    if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 80) clash = true;
                });
                return !clash;
            });

            setUiState(p => ({
                ...p,
                brAlive: data.aliveCount,
                isPlayerReady: false,
                brCountdownMsg: data.countingDown ? 'Starting in 10s...' : (data.aliveCount < 2 ? 'Waiting for players... (Min 2)' : 'Waiting for players to be ready.'),
                lobbyPlayers: allLobbyPlayers
            }));
        });
        socketRef.current.on('br:player_joined', (data: any) => {
            gameRef.current.brPlayers.push(data.pData);
            setUiState(p => ({
                ...p,
                brAlive: data.aliveCount,
                lobbyPlayers: [...p.lobbyPlayers, { name: data.pData.name, isReady: data.pData.isReady, uid: data.pData.uid }]
            }));
            addToast(`${data.pData.name} joined the room`, 'info');
            syncUI();
        });

        socketRef.current.on('br:room_list', (data: any[]) => {
            console.log('[Socket] Received room list:', data);
            setServerList(data);
        });

        socketRef.current.on('br:ready_state', (data: any) => {
            const p = gameRef.current.brPlayers.find((pp: any) => pp.socketId === data.socketId);
            if (p) p.isReady = data.isReady;

            if (data.socketId === socketRef.current?.id) {
                setUiState(p => ({ ...p, isPlayerReady: data.isReady, lobbyPlayers: p.lobbyPlayers.map(lp => lp.uid === auth.uid || lp.uid === globalProfile.uid ? { ...lp, isReady: data.isReady } : lp) }));
            } else {
                setUiState(p => ({ ...p, lobbyPlayers: p.lobbyPlayers.map(lp => lp.uid === data.uid ? { ...lp, isReady: data.isReady } : lp) }));
            }
        });

        socketRef.current.on('br:countdown_msg', (data: any) => {
            setUiState(p => ({ ...p, brCountdownMsg: data.text }));
        });
        socketRef.current.on('br:pong', (time: number) => {
            setPing(Date.now() - time);
        });

        // WebRTC SIGNALING
        socketRef.current.on('webrtc:offer', async (data: any) => {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peersRef.current[data.senderSocket] = pc;
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
            pc.onicecandidate = (e) => { if (e.candidate) socketRef.current?.emit('webrtc:ice-candidate', { targetSocket: data.senderSocket, candidate: e.candidate }); };
            pc.ontrack = (e) => { const a = new Audio(); a.srcObject = e.streams[0]; a.play(); };
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current?.emit('webrtc:answer', { targetSocket: data.senderSocket, answer });
        });
        socketRef.current.on('webrtc:answer', async (data: any) => {
            const pc = peersRef.current[data.senderSocket];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        });
        socketRef.current.on('webrtc:ice-candidate', async (data: any) => {
            const pc = peersRef.current[data.senderSocket];
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        });

        // Batch Update untuk Client-Side Interpolation & Hemat Bandwidth (Lazy Update)
        socketRef.current.on('br:batch_update', (updates: any[]) => {
            updates.forEach(u => {
                let p = gameRef.current.brPlayers.find((pp: any) => pp.socketId === u.socketId);
                if (p) {
                    p.targetX = u.x; p.targetY = u.y;
                    p.vx = u.vx; p.vy = u.vy; p.targetAngle = u.angle;
                }
            });
        });
        socketRef.current.on('br:player_left', (data: any) => {
            const leftPlayer = gameRef.current.brPlayers.find((pp: any) => pp.socketId === data.socketId);
            if (leftPlayer) addToast(`${leftPlayer.name} left the room`, 'info');

            gameRef.current.brPlayers = gameRef.current.brPlayers.filter((pp: any) => pp.socketId !== data.socketId);
            if (data.aliveCount !== undefined) {
                setUiState(p => ({
                    ...p,
                    brAlive: data.aliveCount,
                    lobbyPlayers: p.lobbyPlayers.filter(lp => lp.uid !== data.uid)
                }));
            }
            syncUI();
        });
        socketRef.current.on('br:bullet', (data: any) => {
            gameRef.current.bullets.push({ ...data, isEnemy: true });
        });
        socketRef.current.on('br:zone_update', (data: any) => {
            gameRef.current.safeZone = data.safeZone;
            setUiState(p => {
                // FIXED LAG: Only re-render when timeLeft visually changes instead of 20 times per second
                if (p.brTimeLeft !== data.timeLeft || p.brStarted !== data.started) {
                    return { ...p, brTimeLeft: data.timeLeft, brStarted: data.started };
                }
                return p;
            });
        });
        socketRef.current.on('br:hp_update', (data: any) => {
            let p = gameRef.current.brPlayers.find((pp: any) => pp.socketId === data.socketId);
            if (p) { p.hp = data.hp; }
            if (data.socketId === socketRef.current?.id && gameRef.current.player) {
                gameRef.current.player.hp = data.hp;
            }
        });
        socketRef.current.on('br:you_died', (data: any) => {
            gameRef.current.player.hp = 0;
            setKillFeed(prev => [...prev, { id: Date.now(), killer: data.killerName, victim: 'You', time: Date.now() }]);
            processGameOver();
        });
        socketRef.current.on('br:winner', (data: any) => {
            if (data.winner.socketId === socketRef.current?.id) {
                setUiState(p => ({ ...p, isGameOver: true, victory: true }));
                playSound('levelup');
            }
        });
        socketRef.current.on('br:kill_feed', (data: any) => {
            setKillFeed(prev => [...prev, { id: Math.random(), killer: data.killerName, victim: data.victimName, time: Date.now() }]);
            setUiState(p => ({ ...p, brAlive: data.aliveCount }));
        });
        socketRef.current.on('friend:invite_received', (data: any) => {
            if (data.toUid === auth.uid) {
                addToast(`${data.fromName} invited you to party`, 'invite', {
                    onAccept: () => {
                        socketRef.current?.emit('friend:accept', { fromUid: data.fromUid, toUid: auth.uid, toName: auth.username, toAvatar: globalProfile.avatar });
                        setParty(prev => { if (!prev.find(p => p.uid === data.fromUid)) return [...prev, { uid: data.fromUid, name: data.fromName, isLeader: true }]; return prev; });
                        addToast(`Joined ${data.fromName}'s party!`, 'info');
                    }
                });
            }
        });
        socketRef.current.on('friend:accepted', (data: any) => {
            if (data.fromUid === auth.uid) {
                setParty(prev => { if (!prev.find(p => p.uid === data.toUid)) return [...prev, { uid: data.toUid, name: data.toName, isLeader: false, avatar: data.toAvatar }]; return prev; });
            }
        });

        socketRef.current.on('friend:request_received', (data: any) => {
            if (data.friend_uid === auth.uid) {
                setFriendRequests(prev => { if (!prev.find(p => p.uid === data.user_uid)) return [...prev, { uid: data.user_uid, name: data.user_name }]; return prev; });
            }
        });

        socketRef.current.on('player:status_update', (data: any) => {
            setFriends(prev => prev.map(f => f.uid === data.uid ? { ...f, status: data.status, lastSeen: data.lastSeen } : f));
        });

        socketRef.current.on('party:state_update', (data: any) => {
            if (data.kickUid === auth.uid) {
                setParty([]); addToast("You have been kicked from the party.", 'info');
            } else if (data.uid !== undefined) {
                setParty(prev => prev.map(p => p.uid === data.uid ? { ...p, isReady: data.isReady } : p));
            }
        });

        socketRef.current.on('party:trigger_start', (data: any) => {
            if (data.partyMembers && data.partyMembers.includes(auth.uid)) {
                setUiState(p => ({ ...p, triggerBR: true }));
            }
        });

        socketRef.current.on('chat:private_receive', (data: any) => {
            if (data.toUid === auth.uid) {
                setPrivateChat(prev => {
                    if (prev && prev.uid === data.fromUid) {
                        return { ...prev, msgs: [...prev.msgs, { sender: data.fromName, text: data.text, time: Date.now() }] };
                    } else if (!prev) {
                        return { uid: data.fromUid, name: data.fromName, msgs: [{ sender: data.fromName, text: data.text, time: Date.now() }] };
                    }
                    return prev;
                });
            }
        });

        // PING LOOP
        const pingInterval = setInterval(() => {
            if (socketRef.current?.connected) socketRef.current.emit('br:ping', Date.now());
        }, 2000);

        return () => {
            clearInterval(pingInterval);
            socketRef.current?.disconnect();
        };
    }, [auth.uid, auth.username, socketUrl]);

    const saveProfile = async (newProfile: any) => {
        setGlobalProfile(newProfile);
        if (auth.isLoggedIn && auth.uid) {
            await supabase.from('players').update({ coins: newProfile.coins, tokens: newProfile.tokens, highscore: newProfile.highscore, total_kills: newProfile.totalKills, matches: newProfile.matches, owned_classes: newProfile.ownedClasses, avatar: newProfile.avatar }).eq('uid', auth.uid);
        } else {
            localStorage.setItem('pixshot_profile', JSON.stringify(newProfile));
        }
    };

    const handleLoginRegister = async (isRegister: boolean) => {
        if (!authInput.user || !authInput.pass) return;
        if (isRegister) {
            const newUid = `U${Math.floor(1000 + Math.random() * 9000)}`;
            const { data, error } = await supabase.from('players').insert([{ uid: newUid, username: authInput.user, password_hash: authInput.pass, coins: 0, tokens: 0, highscore: 0, total_kills: 0, matches: 0, owned_classes: ['basic'] }]).select().single();
            if (!error && data) {
                const newAuth = { isLoggedIn: true, username: data.username, uid: data.uid, password: authInput.pass };
                setAuth(newAuth); localStorage.setItem('pixshot_auth', JSON.stringify(newAuth));
                setGlobalProfile({ username: data.username, uid: data.uid, coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '' });
                setUiState(p => ({ ...p, showAuth: false }));
                addToast("Registered successfully", 'info');
            } else { addToast("Register failed: User might exist or network error", 'info'); }
        } else {
            const { data, error } = await supabase.from('players').select('*').eq('username', authInput.user).eq('password_hash', authInput.pass).single();
            if (!error && data) {
                const newAuth = { isLoggedIn: true, username: data.username, uid: data.uid, password: authInput.pass };
                setAuth(newAuth); localStorage.setItem('pixshot_auth', JSON.stringify(newAuth));
                setGlobalProfile({ username: data.username, uid: data.uid, coins: data.coins, tokens: data.tokens, highscore: data.highscore, totalKills: data.total_kills, matches: data.matches, ownedClasses: data.owned_classes || ['basic'], avatar: data.avatar || '' });
                setUiState(p => ({ ...p, showAuth: false }));
                addToast("Logged in successfully", 'info');
            } else { addToast("Login failed: Incorrect username or password", 'info'); }
        }
    };

    const playAsGuest = () => {
        setUiState(p => ({ ...p, showAuth: false }));
    };

    const logout = () => {
        setAuth({ isLoggedIn: false, username: '', uid: '', password: '' });
        localStorage.removeItem('pixshot_auth');
        setGlobalProfile({ username: 'Guest', uid: `GUEST_${Math.floor(Math.random() * 10000)}`, coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '' });
        setUiState(p => ({ ...p, showAuth: true, showProfile: false }));
    }

    const syncCoinsToProfile = () => {
        if (gameRef.current.sessionCoins > 0) {
            saveProfile({ ...globalProfile, coins: globalProfile.coins + gameRef.current.sessionCoins });
            gameRef.current.sessionCoins = 0;
        }
    };

    const toggleShop = () => {
        if (!uiState.showShop) syncCoinsToProfile();
        setUiState(p => ({ ...p, showShop: !p.showShop }));
    };

    const togglePause = () => {
        const newPauseState = !gameRef.current.isPaused;
        gameRef.current.isPaused = newPauseState;
        setUiState(p => ({ ...p, isPaused: newPauseState }));
    };

    const processGameOver = () => {
        const state = gameRef.current;
        if (state.isGameOver) return;
        state.isGameOver = true;
        const survived = Math.floor((Date.now() - state.sessionStart) / 1000);
        const earnedCoins = Math.floor(state.score / 25) + state.sessionCoins;

        let newP = { ...globalProfile, coins: globalProfile.coins + earnedCoins, totalKills: globalProfile.totalKills + state.kills, matches: globalProfile.matches + 1 };
        if (state.score > newP.highscore) newP.highscore = Math.floor(state.score);
        saveProfile(newP);
        state.sessionCoins = 0;

        setUiState(prev => ({ ...prev, isGameOver: true, inGameCoins: 0, gameStats: { kills: state.kills, maxCombo: state.combo.max, timeSurvived: survived } }));
        socketRef.current?.emit('br:died');
    };

    const exitToMainMenu = () => {
        if (!uiState.isGameOver) processGameOver();
        gameRef.current.isPaused = false;
        setParty([]); // leave party on exit
        setUiState(p => ({ ...p, isPlaying: false, isPaused: false, isGameOver: false }));
    };

    const respawnWithToken = () => {
        if (globalProfile.tokens > 0) {
            saveProfile({ ...globalProfile, tokens: globalProfile.tokens - 1 });
            gameRef.current.player.hp = gameRef.current.player.maxHp;
            setUiState(p => ({ ...p, isGameOver: false }));
        }
    }

    const inviteToParty = (friend: any) => {
        if (!party.find(p => p.uid === friend.uid)) {
            socketRef.current?.emit('friend:invite', { toUid: friend.uid, fromName: auth.isLoggedIn ? auth.username : globalProfile.username, fromUid: auth.isLoggedIn ? auth.uid : globalProfile.uid });
            addToast(`Invite sent to ${friend.name}!`, 'info');
        }
    }

    const openPrivateChat = async (friendUser: any) => {
        setPrivateChat({ uid: friendUser.uid, name: friendUser.name || friendUser.username, msgs: [] });
        if (auth.isLoggedIn) {
            const { data } = await supabase.from('private_chats').select('*')
                .or(`and(from_uid.eq.${auth.uid},to_uid.eq.${friendUser.uid}),and(from_uid.eq.${friendUser.uid},to_uid.eq.${auth.uid})`)
                .order('created_at', { ascending: true })
                .limit(50);

            if (data && data.length > 0) {
                setPrivateChat(prev => prev ? {
                    ...prev,
                    msgs: data.map((m: any) => ({ sender: m.from_uid === auth.uid ? auth.username : friendUser.name || friendUser.username, text: m.message, time: new Date(m.created_at).getTime() }))
                } : prev);
            }
        }
    };

    // === ASSET LOADER ===
    useEffect(() => {
        const types = ['dirt', 'wood', 'stone', 'diamond', 'emerald', 'soulSand', 'sand', 'ice', 'water', 'netherrack', 'bedrock', 'tnt', 'tex_warden'];
        types.forEach(t => texturesRef.current[t] = generateTexture(t));
        shadowTexRef.current = createShadowTexture();

        const loadLocalTexture = (id: string, src: string) => {
            const img = new Image(); img.src = src;
            img.onload = () => { texturesRef.current[id] = img; };
        };

        loadLocalTexture('grass', '/grass.png');
        loadLocalTexture('creeper_local', '/creeper.png');
        loadLocalTexture('ender', '/enderman.png');
        loadLocalTexture('zolo', '/zombie.png');
        loadLocalTexture('spid', '/spider.png');
        loadLocalTexture('slime', '/slime.png');
        loadLocalTexture('skeleton_local', '/skeleton.png');
        loadLocalTexture('golem_local', '/golem.png');
        loadLocalTexture('wood', '/planks.png');
        loadLocalTexture('stone', '/stone.png');
        loadLocalTexture('dirt', '/dirt.png');
        loadLocalTexture('sonic', '/sonic.png');
        loadLocalTexture('ghast', '/ghast.png');
        loadLocalTexture('tnt', '/tnt.png');

        // 2D Environment flat textures
        loadLocalTexture('tree', '/tree.png');
        loadLocalTexture('house', '/house.png');

        loadLocalTexture('tank_basic', '/tank1.png');
        loadLocalTexture('tank_warden', '/warden.png');
        loadLocalTexture('tank_flamethrower', '/tank_flamethrower.png');
        loadLocalTexture('tank_melee', '/tank_melee.png');
        loadLocalTexture('tank_machinegun', '/tank_machinegun.png');
        loadLocalTexture('tank_necromancer', '/tankp.png');

        //visual di arsenal
        loadLocalTexture('wiev', '/biasa.png');
        loadLocalTexture('warden', '/miaw.png');
        loadLocalTexture('flamethrower', '/tank_flamethrower.png');
        loadLocalTexture('melee', '/tank_melee.png');
        loadLocalTexture('machinegun', '/tank_machinegun.png');
        loadLocalTexture('necromancer', '/necro.png');

        if (!audioCtxRef.current) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) { audioCtxRef.current = new AudioContextClass(); }
        }
        // Enhanced Mobile Detection
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 1024);
        setSettings(prev => ({ ...prev, isMobile: isMobile, joystickScale: isMobile ? 1.2 : 1.0 }));

        const loadSound = async (id: string, src: string) => {
            try {
                const response = await fetch(src);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    if (audioCtxRef.current) {
                        const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
                        audioBuffersRef.current[id] = audioBuffer;
                    }
                }
            } catch (e) { }
        };

        loadSound('shoot', '/shoot.mp3'); loadSound('hit', '/hit.mp3');
        loadSound('explode', '/explode.mp3'); loadSound('coin', '/coin.mp3');
        loadSound('levelup', '/levelup.mp3'); loadSound('ult', '/ult.mp3'); loadSound('thunder', '/thunder.mp3');
    }, []);

    const playSound = (type: string) => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended' || settings.volume === 0) return;
        const ctx = audioCtxRef.current;

        if (audioBuffersRef.current[type]) {
            const source = ctx.createBufferSource();
            source.buffer = audioBuffersRef.current[type];
            source.playbackRate.value = type === 'shoot' ? (uiState.playerClass === 'warden' ? 0.7 : uiState.playerClass === 'machinegun' ? 1.5 : 1) : 1;
            const gainNode = ctx.createGain();
            gainNode.gain.value = settings.volume * (type === 'shoot' ? 0.3 : 0.6);
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            source.start(0);

            // Screen Shake Trigger
            if (type === 'hit' || type === 'explode') gameRef.current.camera.shake = Math.min(20, gameRef.current.camera.shake + 10);
            else if (type === 'shoot') gameRef.current.camera.shake = Math.min(10, gameRef.current.camera.shake + 3);

            return;
        }
    };

    const startGame = (mode: string, targetRoomId?: string) => {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

        const isGod = mode === 'god';
        const isBR = mode === 'battleroyale';
        const is1v1 = mode === 'pvp1v1';
        const currentWS = WORLD_SIZE; // FIXED: Do not minimize world size so entities can spawn

        gameRef.current = {
            ...gameRef.current,
            worldSize: currentWS,
            isPaused: false,
            player: { ...gameRef.current.player, x: currentWS / 2, y: currentWS / 2, vx: 0, vy: 0, size: 20, hp: isGod ? 99999 : 100, maxHp: isGod ? 99999 : 100, class: uiState.playerClass, z: 0, skillCooldowns: [0, 0, 0, 0, 0], activeUlt: null, ultDuration: 0, activeBuffs: { speed: 0, damage: 0, shield: 0, size: 0, turret: 0, drone_frenzy: 0, reflect: 0, radar: 0, lava_trail: 0 } },
            statLevels: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 },
            statPoints: isGod ? 99 : (isBR ? 20 : 0), score: 0, level: isGod ? 150 : (isBR ? 20 : 1), xp: 0, xpNeeded: 50, sessionCoins: 0,
            bullets: [], shapes: [], env: [], particles: [], aoeClouds: [], drops: [], damageTexts: [], decals: [], powerups: [], drones: [],
            brPlayers: [],
            safeZone: { x: currentWS / 2, y: currentWS / 2, radius: isBR ? currentWS / 2 : currentWS, targetRadius: isBR ? currentWS / 2 : currentWS, timer: isBR ? 1800 : 0 },
            camera: { x: currentWS / 2, y: currentWS / 2, zoom: isBR ? 0.5 : 1.0, shake: 0 },
            weather: { type: 'clear', timer: 1000, flash: 0 },
            gameMode: mode, combo: { count: 0, timer: 0, max: 0 },
            sessionStart: Date.now(), kills: 0,
            isGameOver: false, hasSynced: false
        };

        const state = gameRef.current;

        for (let i = 0; i < 150; i++) {
            let type = Math.random() < 0.6 ? 'tree' : 'house';
            state.env.push({
                type: type,
                x: Math.random() * currentWS,
                y: Math.random() * currentWS,
                r: type === 'house' ? 60 : 25,
                h: type === 'house' ? 80 : 60
            });
        }

        if (isBR || is1v1) {
            const tgtRoom = targetRoomId || uiState.targetRoomId;
            if (socketRef.current) {
                socketRef.current.emit('br:join', { uid: auth.isLoggedIn ? auth.uid : globalProfile.uid, name: auth.isLoggedIn ? auth.username : globalProfile.username, class: uiState.playerClass, mode: mode, roomId: tgtRoom });
            }
        }

        syncUI();
        setUiState(prev => ({ ...prev, isPlaying: true, isPaused: false, isGameOver: false, victory: false, showShop: false, showSettings: false, showProfile: false, showLeaderboard: false, showFriends: false, minimizeUpgrades: false, gameMode: mode, brAlive: isBR && prev.brAlive === 0 ? 30 : prev.brAlive }));
    };

    const getBiomeWeights = (x: number, y: number) => {
        const centers = { plains: { x: 4000, y: 4000 }, ocean: { x: 1000, y: 1000 }, ice: { x: 7000, y: 1000 }, desert: { x: 1000, y: 7000 }, nether: { x: 7000, y: 7000 } };
        let weights: Record<string, number> = {}; let total = 0;
        for (const [name, pos] of Object.entries(centers)) {
            let dist = Math.hypot(x - pos.x, y - pos.y);
            let w = Math.max(0, 4000 - dist);
            weights[name] = Math.pow(w, 2);
            total += weights[name];
        }
        if (total === 0) return { plains: 1 };
        for (let k in weights) weights[k] /= total;
        return weights;
    };

    const getPrimaryBiome = (weights: Record<string, number>) => {
        if (uiState.gameMode === 'pvp1v1') return 'plains';
        return Object.keys(weights).reduce((a, b) => weights[a] > weights[b] ? a : b);
    };

    const spawnParticles = (x: number, y: number, z: number, type: string, count: number) => {
        if (!settingsRef.current.particles) return;
        const state = gameRef.current;
        for (let i = 0; i < count; i++) {
            if (state.particles.length > MAX_PARTICLES) state.particles.shift();
            state.particles.push({
                x, y, z: z + Math.random() * 20, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, vz: Math.random() * 8 + 2,
                type, life: 1.0, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2
            });
        }
    };

    const spawnExplosion = (ex: number, ey: number, dmg: number, radius: number) => {
        playSound('explode'); spawnParticles(ex, ey, 10, 'tnt', 40);
        gameRef.current.aoeClouds.push({ x: ex, y: ey, r: radius, life: 15, type: 'explosion' });
        const state = gameRef.current;

        state.shapes.forEach(s => {
            if (Math.hypot(s.x - ex, s.y - ey) < radius) {
                s.hp -= dmg; state.damageTexts.push({ x: s.x, y: s.y, text: Math.floor(dmg), life: 30 });
            }
        });
        state.brPlayers.forEach(p => {
            if (Math.hypot(p.x - ex, p.y - ey) < radius) {
                state.damageTexts.push({ x: p.x, y: p.y, text: Math.floor(dmg), life: 30 });
                if (socketRef.current && (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1')) {
                    socketRef.current.emit('br:hit', { targetSocketId: p.socketId, damage: dmg, isExplosion: true });
                }
            }
        });
        if (state.gameMode !== 'god' && Math.hypot(state.player.x - ex, state.player.y - ey) < radius) {
            if (state.player.activeBuffs.shield <= 0) state.player.hp -= dmg;
            state.damageTexts.push({ x: state.player.x, y: state.player.y, text: Math.floor(dmg), life: 30, isPlayer: true });
        }
    };

    const syncUI = () => {
        const s = gameRef.current;
        setUiState(prev => ({
            ...prev, score: Math.floor(s.score), level: s.level, xp: s.xp, xpNeeded: s.xpNeeded,
            statPoints: s.statPoints, stats: { ...s.statLevels },
            dayTime: s.globalTime, biome: getPrimaryBiome(getBiomeWeights(s.player.x, s.player.y)),
            skillCooldowns: [...s.player.skillCooldowns], hp: s.player.hp, maxHp: s.player.maxHp,
            inGameCoins: s.sessionCoins, brAlive: (s.gameMode === 'battleroyale' || s.gameMode === 'pvp1v1') ? s.brPlayers.length + 1 : 0
        }));
    };

    const handleUpgradeStat = (sName: string) => {
        if (gameRef.current.statPoints > 0 && gameRef.current.statLevels[sName] < 8) {
            gameRef.current.statPoints--; gameRef.current.statLevels[sName]++;
            if (sName === 'maxHp') gameRef.current.player.maxHp += 20;
            syncUI();
        }
    };

    // === TOUCH/MOBILE CONTROLS ===
    useEffect(() => {
        if (!settings.isMobile || !uiState.isPlaying || uiState.isPaused) return;
        const leftJoyOriginX = 120 * settings.joystickScale;
        const leftJoyOriginY = window.innerHeight - (120 * settings.joystickScale);

        const touchMove = (e: any) => {
            if (e.target !== canvasRef.current) return;
            e.preventDefault();

            const touches = e.touches;

            // Pinch to Zoom
            if (touches.length === 2) {
                const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
                if (joystick.pinchDist > 0) {
                    const diff = dist - joystick.pinchDist;
                    gameRef.current.camera.zoom = Math.min(Math.max(0.5, gameRef.current.camera.zoom + (diff * 0.005)), 2.5);
                }
                setJoystick(p => ({ ...p, pinchDist: dist }));
                return;
            }

            let lActive = false, rActive = false;
            let newL = { ...joystick.left }, newR = { ...joystick.right };

            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];
                if (t.clientX < window.innerWidth / 2) {
                    lActive = true; newL.active = true;
                    let dx = t.clientX - leftJoyOriginX; let dy = t.clientY - leftJoyOriginY;
                    let dist = Math.hypot(dx, dy); let maxDist = 50 * settings.joystickScale;
                    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
                    newL.dx = dx / maxDist; newL.dy = dy / maxDist;
                    lActive = true;
                } else {
                    if (!joystick.right.active && !rActive) { newR.originX = t.clientX; newR.originY = t.clientY; }
                    newR.x = t.clientX; newR.y = t.clientY;
                    let dx = t.clientX - newR.originX; let dy = t.clientY - newR.originY;
                    newR.angle = Math.atan2(dy, dx);
                    newR.distance = Math.hypot(dx, dy);
                    rActive = true;
                }
            }
            if (lActive) newL.active = true; else newL.active = false;
            if (rActive) newR.active = true; else newR.active = false;
            setJoystick({ left: newL, right: newR, pinchDist: 0 });
        };

        const touchEnd = (e: any) => {
            if (e.target !== canvasRef.current) return;
            e.preventDefault();
            if (e.touches.length === 0) {
                setJoystick({
                    left: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
                    right: { active: false, x: 0, y: 0, angle: 0, originX: 0, originY: 0, distance: 0 },
                    pinchDist: 0
                });
            } else { touchMove(e); }
        };

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('touchstart', (e) => { e.preventDefault(); touchMove(e); }, { passive: false });
            canvas.addEventListener('touchmove', touchMove, { passive: false });
            canvas.addEventListener('touchend', touchEnd, { passive: false });
            canvas.addEventListener('touchcancel', touchEnd, { passive: false });
            return () => {
                canvas.removeEventListener('touchstart', touchMove);
                canvas.removeEventListener('touchmove', touchMove);
                canvas.removeEventListener('touchend', touchEnd);
            }
        }
    }, [settings.isMobile, settings.joystickScale, uiState.isPlaying, uiState.isPaused, joystick]);

    // === RENDER ENGINE (Hybrid 2D/3D) ===
    const drawSprite = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, depth: number, angle: number, textureType: any, colorTop: any, colorSide: any, isBot: boolean, zOffset = 0, alpha = 1, frameCount = 0, isSprite = false, animState = 'idle', framesConfig: number[] = [8, 8, 8], flipX = false) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(Math.round(x), Math.round(y + zOffset));
        const depthY = depth * 0.8;

        const tex = textureType ? texturesRef.current[textureType] : null;

        if (isSprite && tex && tex instanceof HTMLImageElement && typeof textureType === 'string' && !textureType.startsWith('tex_')) {
            const rows = 3;
            let rowIdx = 0;
            if (animState === 'walk') rowIdx = 1;
            else if (animState === 'attack') rowIdx = 2;

            const maxFrames = framesConfig[rowIdx] || 8;
            const frameWidth = tex.width / maxFrames;
            const frameHeight = tex.height / rows;

            const drawWidth = width * 2;
            const drawHeight = drawWidth * (frameHeight / frameWidth);
            const spriteY = (height / 2) + depthY - drawHeight;

            ctx.rotate(angle);
            if (flipX) ctx.scale(-1, 1);

            const ticksPerFrame = 6;
            const currentFrame = Math.floor(frameCount / ticksPerFrame) % maxFrames;

            ctx.drawImage(
                tex,
                Math.floor(currentFrame * frameWidth), Math.floor(rowIdx * frameHeight),
                Math.floor(frameWidth), Math.floor(frameHeight),
                Math.floor(-drawWidth / 2), Math.floor(spriteY),
                Math.floor(drawWidth), Math.floor(drawHeight)
            );
            ctx.restore();
            return;
        }

        ctx.rotate(angle);
        const topY = -height / 2 - depthY;
        const frontY = topY + height;
        const frontHeight = depthY;

        if (tex) {
            ctx.drawImage(tex as CanvasImageSource, -width / 2, frontY, width, frontHeight);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-width / 2, frontY, width, frontHeight);
            ctx.drawImage(tex as CanvasImageSource, -width / 2, topY, width, height);
        } else {
            ctx.fillStyle = colorSide || '#333'; ctx.fillRect(-width / 2, frontY, width, frontHeight);
            ctx.fillStyle = colorTop || '#fff'; ctx.fillRect(-width / 2, topY, width, height);
        }

        ctx.strokeStyle = `rgba(0,0,0,${0.5 * alpha})`; ctx.lineWidth = 1.5;
        ctx.strokeRect(-width / 2, frontY, width, frontHeight); ctx.strokeRect(-width / 2, topY, width, height);
        ctx.restore();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        const handleResize = () => {
            if (!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // Auto-scale UI based on screen width - aggressive for mobile
            const isMob = window.innerWidth < 1024;
            // 0.6 to 0.8 range for mobile usually feels better
            const newScale = isMob ? Math.max(0.5, Math.min(0.75, window.innerWidth / 1100)) : 1.0;

            setSettings(prev => {
                if (prev.uiScale === newScale) return prev;
                return { ...prev, uiScale: newScale };
            });
        };
        handleResize(); window.addEventListener('resize', handleResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
        }

        const handleWheel = (e: WheelEvent) => {
            if (!uiState.isPlaying || uiState.isPaused) return;
            gameRef.current.camera.zoom = Math.min(Math.max(0.3, gameRef.current.camera.zoom - e.deltaY * 0.001), 2.5);
        };

        const handleKeyDown = (e: any) => {
            if (e.key === 'Escape') togglePause();
            const k = e.key.toLowerCase();
            if (gameRef.current.keys.hasOwnProperty(k) || k === ' ' || ['1', '2', '3', '4', '5'].includes(k)) {
                if (k === ' ') gameRef.current.keys.space = true; else gameRef.current.keys[k] = true;
            }
            if (e.key === 'Shift' && gameRef.current.player.dashCooldown <= 0) {
                gameRef.current.player.vx *= 10; gameRef.current.player.vy *= 10; gameRef.current.player.dashCooldown = 150;
            }
        };
        const handleKeyUp = (e: any) => {
            const k = e.key.toLowerCase();
            if (gameRef.current.keys.hasOwnProperty(k) || k === ' ' || ['1', '2', '3', '4', '5'].includes(k)) {
                if (k === ' ') gameRef.current.keys.space = false; else gameRef.current.keys[k] = false;
            }
        };
        const handleMouseMove = (e: any) => {
            if (settings.isMobile) return;
            gameRef.current.mouse.x = e.clientX; gameRef.current.mouse.y = e.clientY;
        };
        const handleMouseDown = (e: any) => {
            if (settings.isMobile) return;
            if (e.button === 0) gameRef.current.mouse.isDown = true;
            if (e.button === 2) gameRef.current.keys.rightClick = true;
        };
        const handleMouseUp = (e: any) => {
            if (settings.isMobile) return;
            if (e.button === 0) gameRef.current.mouse.isDown = false;
            if (e.button === 2) gameRef.current.keys.rightClick = false;
        };
        const handleContext = (e: any) => e.preventDefault();

        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('contextmenu', handleContext);
        window.addEventListener('wheel', handleWheel);

        let frameCount = 0;
        const gameLoop = () => {
            const state = gameRef.current;

            if (!uiState.isPlaying) {
                ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(frameCount * 0.002);
                for (let i = 0; i < 50; i++) {
                    ctx.strokeStyle = `rgba(6, 182, 212, ${0.1 + Math.sin(frameCount * 0.01 + i) * 0.1})`;
                    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 100 + i * 20, 0, Math.PI * 2); ctx.stroke();
                    if (i % 5 === 0) { ctx.fillStyle = '#10b981'; ctx.fillRect(Math.cos(frameCount * 0.02 + i) * (100 + i * 20), Math.sin(frameCount * 0.02 + i) * (100 + i * 20), 4, 4); }
                }
                ctx.restore(); frameCount++;
                if (state.animationFrameId !== null) cancelAnimationFrame(state.animationFrameId);
                state.animationFrameId = requestAnimationFrame(gameLoop);
                return;
            }

            if (uiState.isGameOver) {
                if (state.animationFrameId !== null) cancelAnimationFrame(state.animationFrameId);
                state.animationFrameId = requestAnimationFrame(gameLoop);
                return;
            }

            if (!state.isPaused) {
                state.globalTime += 0.0005;
                frameCount++;

                state.weather.timer--;
                if (state.weather.timer <= 0) {
                    state.weather.type = state.weather.type === 'clear' ? 'rain' : 'clear';
                    state.weather.timer = Math.random() * 2000 + 1000;
                }
                if (state.weather.type === 'rain' && Math.random() < 0.01) { state.weather.flash = 1.0; playSound('thunder'); }
                if (state.weather.flash > 0) state.weather.flash -= 0.05;

                // BATTLE ROYALE LOGIC
                if (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') {
                    if (frameCount % 3 === 0 && socketRef.current && state.hasSynced) {
                        socketRef.current.emit('br:update', { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy, angle: state.player.angle });
                    }

                    // Notice: other players locations are automatically updated by socket!
                    // However, calculate damage from zone for self
                    if (Math.hypot(state.player.x - state.safeZone.x, state.player.y - state.safeZone.y) > state.safeZone.radius) {
                        if (frameCount % 30 === 0) { state.player.hp -= 5; playSound('hit'); }
                    }

                    for (let i = state.brPlayers.length - 1; i >= 0; i--) {
                        let p = state.brPlayers[i];
                        // Client-side prediction & smooth interpolation (Smooth entity movement in high ping)
                        if (p.targetX !== undefined) {
                            p.x += (p.targetX - p.x) * 0.3;
                            p.y += (p.targetY - p.y) * 0.3;
                            // Interpolate angle safely around 360 boundary
                            let diffAngle = p.targetAngle - p.angle;
                            while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
                            while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
                            p.angle += diffAngle * 0.3;
                        } else {
                            p.x += p.vx; p.y += p.vy;
                        }

                        if (p.hp <= 0) {
                            spawnExplosion(p.x, p.y, 50, 150);
                            state.brPlayers.splice(i, 1);
                            if (uiState.brAlive !== state.brPlayers.length + 1) syncUI();
                        }
                    }
                }

                const sLvl = state.statLevels; const bStat = state.baseStats;
                let calcAccel = bStat.speed + (sLvl.moveSpd * 0.25);
                let calcReload = Math.max(5, bStat.reload - (sLvl.reload * 2.5));
                let calcBSpd = bStat.bSpd + (sLvl.bulletSpd * 2);
                let calcBDmg = bStat.bDmg + (sLvl.bulletDmg * 4);
                let calcBPen = bStat.bPen + (sLvl.bulletPen * 1);
                let calcBodyDmg = bStat.bodyDmg + (sLvl.bodyDmg * 6);
                let calcRegen = bStat.regen + (sLvl.regen * 0.1);

                if (state.player.class === 'melee') { calcBodyDmg *= 3; calcAccel *= 1.3; }
                if (state.player.activeBuffs.speed > 0) { calcAccel *= 1.5; state.player.activeBuffs.speed--; }
                if (state.player.activeBuffs.damage > 0) { calcBDmg *= 2.0; state.player.activeBuffs.damage--; }
                if (state.player.activeBuffs.shield > 0) { state.player.activeBuffs.shield--; }
                if (state.player.activeBuffs.size > 0) { state.player.size = 30; calcBodyDmg *= 3; state.player.activeBuffs.size--; } else { state.player.size = 20; }
                if (state.player.activeBuffs.reflect > 0) state.player.activeBuffs.reflect--;
                if (state.player.activeBuffs.radar > 0) state.player.activeBuffs.radar--;
                if (state.player.activeBuffs.lava_trail > 0) {
                    if (frameCount % 5 === 0 && (Math.abs(state.player.vx) > 0 || Math.abs(state.player.vy) > 0)) {
                        state.aoeClouds.push({ x: state.player.x, y: state.player.y, r: 40, life: 100, type: 'explosion' });
                    }
                    state.player.activeBuffs.lava_trail--;
                }

                if (state.combo.timer > 0) {
                    state.combo.timer--;
                    if (state.combo.timer <= 0) state.combo.count = 0;
                }

                const weights = getBiomeWeights(state.player.x, state.player.y);
                const primaryBiome = getPrimaryBiome(weights);
                let friction = 0.85;
                if (primaryBiome === 'ice') friction = 0.98;
                if (primaryBiome === 'ocean') friction = 0.70;

                const fireBullet = (pX: number, pY: number, pAngle: number, typeClass: string, offsetA = 0, sMod = 1, dMod = 1, lMod = 1, pen?: number, carriedData?: string, isRemote = false) => {
                    const fAngle = pAngle + offsetA;
                    const b = {
                        x: pX + Math.cos(fAngle) * 40, y: pY + Math.sin(fAngle) * 40,
                        vx: Math.cos(fAngle) * calcBSpd * sMod, vy: Math.sin(fAngle) * calcBSpd * sMod,
                        life: 100 * lMod, maxLife: 100 * lMod, damage: calcBDmg * dMod, penetration: pen !== undefined ? pen : calcBPen,
                        type: typeClass, h: 5, targetX: pX + Math.cos(fAngle) * 500, targetY: pY + Math.sin(fAngle) * 500, a: fAngle, carriedType: carriedData
                    };
                    state.bullets.push(b);
                    if (!isRemote && (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') && socketRef.current) {
                        socketRef.current.emit('br:shoot', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life, maxLife: b.maxLife, damage: b.damage, penetration: b.penetration, type: b.type, h: b.h, targetX: b.targetX, targetY: b.targetY, a: b.a, carriedType: b.carriedType });
                    }
                };

                if (state.player.activeBuffs.turret > 0) {
                    if (frameCount % 15 === 0) {
                        for (let i = 0; i < 8; i++) { fireBullet(state.player.x, state.player.y, (Math.PI * 2 / 8) * i, 'basic', 0, 1.5, 0.5, 1); }
                    }
                    state.player.activeBuffs.turret--;
                }

                // SPECIAL SKILLS LOGIC (1-5)
                for (let i = 0; i < 5; i++) {
                    if (state.player.skillCooldowns[i] > 0) state.player.skillCooldowns[i]--;

                    const reqLvl = (i + 1) * 15;
                    if (state.keys[(i + 1).toString()] && (state.level >= reqLvl || state.gameMode === 'god') && state.player.skillCooldowns[i] <= 0 && !uiState.showShop && !uiState.showSettings) {
                        const skillDef = CLASSES[state.player.class].skills[i];
                        playSound('ult');
                        state.player.skillCooldowns[i] = skillDef.cd;

                        if (skillDef.type === 'buff') {
                            if (skillDef.buffType === 'overdrive') { state.player.activeUlt = 'overdrive'; state.player.ultDuration = skillDef.dur; spawnParticles(state.player.x, state.player.y, 0, 'diamond', 50); }
                            else if (skillDef.buffType === 'bulletstorm') { state.player.activeUlt = 'bulletstorm'; state.player.ultDuration = skillDef.dur; }
                            else if (skillDef.buffType === 'sonicwave') { state.player.activeUlt = 'sonicwave'; state.player.ultDuration = skillDef.dur; state.weather.flash = 0.8; playSound('thunder'); }
                            else if (skillDef.buffType === 'inferno') { state.player.activeUlt = 'inferno'; state.player.ultDuration = skillDef.dur; }
                            else if (skillDef.buffType === 'earthquake') { state.player.activeUlt = 'earthquake'; state.player.ultDuration = skillDef.dur; playSound('explode'); }
                            else if (skillDef.buffType === 'shield') { state.player.activeBuffs.shield = skillDef.dur; }
                            else if (skillDef.buffType === 'speed') { state.player.activeBuffs.speed = skillDef.dur; }
                            else if (skillDef.buffType === 'size') { state.player.activeBuffs.size = skillDef.dur; }
                            else if (skillDef.buffType === 'turret') { state.player.activeBuffs.turret = skillDef.dur; }
                            else if (skillDef.buffType === 'drone_frenzy') { state.player.activeBuffs.drone_frenzy = skillDef.dur; spawnParticles(state.player.x, state.player.y, 10, 'emerald', 30); }
                            else if (skillDef.buffType === 'reflect') { state.player.activeBuffs.reflect = skillDef.dur; }
                            else if (skillDef.buffType === 'radar') { state.player.activeBuffs.radar = skillDef.dur; }
                            else if (skillDef.buffType === 'lava_trail') { state.player.activeBuffs.lava_trail = skillDef.dur; }
                        } else if (skillDef.type === 'heal') {
                            state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * skillDef.amt);
                            spawnParticles(state.player.x, state.player.y, 10, 'heal', 20);
                        } else if (skillDef.type === 'dash') {
                            state.player.vx += Math.cos(state.player.angle) * skillDef.power;
                            state.player.vy += Math.sin(state.player.angle) * skillDef.power;
                            spawnParticles(state.player.x, state.player.y, 10, 'tnt', 30);
                        } else if (skillDef.type === 'projectile') {
                            let a = state.player.angle;
                            if (skillDef.bulletType === 'basic' && skillDef.count > 10) {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, (Math.PI * 2 / skillDef.count) * j, 'basic', 0, 1.5, 1, 1);
                            } else if (skillDef.bulletType === 'bounce') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, a + (Math.random() - 0.5), 'bounce', 0, 1.5, 1, 2, 5);
                            } else if (skillDef.bulletType === 'warden_sonic_wave') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, a + (j - 2) * 0.2, 'warden_sonic_wave', 0, 3, 10, 1.5, 9999);
                            } else if (skillDef.bulletType === 'fireball') {
                                fireBullet(state.player.x, state.player.y, a, 'fireball', 0, 1, 5, 2, 1);
                            } else if (skillDef.bulletType === 'meteor') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, a + (Math.random() - 0.5) * 2, 'fireball', 0, 1.5, 5, 1, 1);
                            } else if (skillDef.bulletType === 'bomb') {
                                fireBullet(state.player.x, state.player.y, a, 'thrown_block', 0, 1.5, 5, 1.5, 1, 'tnt');
                            } else if (skillDef.bulletType === 'saw') {
                                fireBullet(state.player.x, state.player.y, a, 'saw', 0, 1.2, 5, 2, 99);
                            } else if (skillDef.bulletType === 'hook') {
                                fireBullet(state.player.x, state.player.y, a, 'hook', 0, 2.5, 1, 0.8, 1);
                            } else if (skillDef.bulletType === 'sniper') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, a + (j - 1) * 0.1, 'sniper', 0, 4, 10, 2, 10);
                            } else if (skillDef.bulletType === 'homing') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(state.player.x, state.player.y, a + (Math.random() - 0.5) * 1.5, 'homing', 0, 1.2, 3, 2, 1);
                            } else if (skillDef.bulletType === 'napalm') {
                                fireBullet(state.player.x, state.player.y, a, 'napalm', 0, 1, 5, 1, 1);
                            } else {
                                fireBullet(state.player.x, state.player.y, a, 'missile', 0, 1.5, 10, 2, 1);
                            }
                        } else if (skillDef.type === 'deploy') {
                            if (skillDef.deployType === 'mine') {
                                for (let j = 0; j < skillDef.count; j++) state.powerups.push({ x: state.player.x + (Math.random() - 0.5) * 100, y: state.player.y + (Math.random() - 0.5) * 100, type: 'mine', life: 1000, z: 0, vz: 0 });
                            } else if (skillDef.deployType === 'blackhole') {
                                state.bullets.push({ x: state.player.x, y: state.player.y, vx: 0, vy: 0, life: skillDef.dur, maxLife: skillDef.dur, damage: 1, penetration: 999, type: 'blackhole' });
                            }
                        } else if (skillDef.type === 'aoe') {
                            spawnExplosion(state.mouse.worldX || state.player.x, state.mouse.worldY || state.player.y, skillDef.dmg || 500, skillDef.rad || 300);
                            if (skillDef.effect === 'stun') {
                                state.shapes.forEach(s => { if (Math.hypot(s.x - state.player.x, s.y - state.player.y) < skillDef.rad) s.cooldown = 150; });
                            }
                        } else if (skillDef.type === 'aoe_delayed') {
                            setTimeout(() => {
                                spawnExplosion(state.mouse.worldX || state.player.x, state.mouse.worldY || state.player.y, skillDef.dmg, skillDef.rad);
                            }, skillDef.delay * 16);
                        } else if (skillDef.type === 'aoe_cloud') {
                            state.aoeClouds.push({ x: state.player.x, y: state.player.y, r: skillDef.rad, life: skillDef.dur, type: 'explosion' });
                        } else if (skillDef.type === 'aoe_leech') {
                            state.shapes.forEach(s => {
                                if (Math.hypot(s.x - state.player.x, s.y - state.player.y) < skillDef.rad) {
                                    s.hp -= 200; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 50);
                                    spawnParticles(s.x, s.y, 10, 'heal', 5);
                                }
                            });
                        } else if (skillDef.type === 'summon') {
                            if (skillDef.summonType === 'drone') {
                                for (let j = 0; j < skillDef.count; j++) state.drones.push({ x: state.player.x + (Math.random() - 0.5) * 200, y: state.player.y + (Math.random() - 0.5) * 200, hp: 150, maxHp: 150, type: 'diamond', angle: 0 });
                                spawnParticles(state.player.x, state.player.y, 0, 'diamond', 50);
                            } else if (skillDef.summonType === 'golem') {
                                state.drones.push({ x: state.player.x, y: state.player.y, hp: 1000, maxHp: 1000, type: 'golem', angle: 0, isGiant: true });
                            }
                        }
                    }
                }

                let inputX = 0, inputY = 0;
                let isFiring = false;
                let aimAngle = state.player.angle;

                if (settings.isMobile) {
                    if (joystick.left.active) { inputX = joystick.left.dx; inputY = joystick.left.dy; }
                    if (joystick.right.active && joystick.right.distance > 10) {
                        isFiring = true; aimAngle = joystick.right.angle; state.player.angle = aimAngle;
                    }
                } else {
                    if (state.keys.w) inputY -= 1; if (state.keys.s) inputY += 1;
                    if (state.keys.a) inputX -= 1; if (state.keys.d) inputX += 1;

                    state.mouse.worldX = (state.mouse.x - canvas.width / 2) / state.camera.zoom + state.camera.x;
                    state.mouse.worldY = (state.mouse.y - canvas.height / 2) / state.camera.zoom + state.camera.y;

                    state.player.angle = Math.atan2(state.mouse.worldY - state.player.y, state.mouse.worldX - state.player.x);
                    aimAngle = state.player.angle;
                    if (state.mouse.isDown) isFiring = true;
                }

                let speedMod = (state.player.activeUlt === 'overdrive') ? 3.0 : (state.player.activeUlt === 'earthquake' ? 2.5 : 1.0);

                if (inputX !== 0 || inputY !== 0) {
                    const l = Math.hypot(inputX, inputY);
                    state.player.vx += (inputX / l) * calcAccel * speedMod; state.player.vy += (inputY / l) * calcAccel * speedMod;
                    state.player.idleTime = 0;
                } else state.player.idleTime++;

                state.player.vx *= friction; state.player.vy *= friction;

                if (state.keys.space && state.player.dashCooldown <= 0) {
                    state.player.vx *= 10; state.player.vy *= 10; state.player.dashCooldown = 150;
                }
                if (state.player.dashCooldown > 0) state.player.dashCooldown--;

                let nextX = state.player.x + state.player.vx; let nextY = state.player.y + state.player.vy;
                nextX = Math.max(state.player.size + 100, Math.min(state.worldSize - state.player.size - 100, nextX));
                nextY = Math.max(state.player.size + 100, Math.min(state.worldSize - state.player.size - 100, nextY));

                state.env.forEach(e => {
                    if (e.type === 'house' || e.type === 'tree') {
                        if (nextX > e.x - e.r && nextX < e.x + e.r && state.player.y > e.y - e.r && state.player.y < e.y + e.r) { nextX = state.player.x; state.player.vx *= 0.5; }
                        if (state.player.x > e.x - e.r && state.player.x < e.x + e.r && nextY > e.y - e.r && nextY < e.y + e.r) { nextY = state.player.y; state.player.vy *= 0.5; }
                    }
                });

                state.player.x = nextX; state.player.y = nextY;

                state.camera.x += (state.player.x - state.camera.x) * 0.15;
                state.camera.y += (state.player.y - state.camera.y) * 0.15;

                if (state.player.cooldown > 0) state.player.cooldown--;

                if (isFiring && state.player.cooldown <= 0 && !uiState.showShop && !uiState.showSettings) {
                    const cls = state.player.class;
                    let cReload = calcReload;
                    if (state.player.activeUlt === 'overdrive') cReload *= 0.2;
                    if (state.player.activeUlt === 'bulletstorm') cReload = 1;

                    if (cls === 'basic') { fireBullet(state.player.x, state.player.y, aimAngle, 'basic'); state.player.cooldown = cReload; playSound('shoot'); }
                    else if (cls === 'machinegun') {
                        if (state.player.activeUlt === 'bulletstorm') {
                            for (let i = 0; i < 3; i++) fireBullet(state.player.x, state.player.y, aimAngle, 'basic', (Math.random() - 0.5) * 1.5, Math.random() * 0.5 + 0.8, 0.8);
                        } else fireBullet(state.player.x, state.player.y, aimAngle, 'basic', (Math.random() - 0.5) * 0.5, 1.2, 0.5);
                        state.player.cooldown = cReload * 0.3; playSound('shoot');
                    }
                    else if (cls === 'warden') { fireBullet(state.player.x, state.player.y, aimAngle, 'tex_warden', 0, 0.8, 5, 1.5); state.player.cooldown = cReload * 4; playSound('sonic'); }
                    else if (cls === 'flamethrower') {
                        for (let i = 0; i < 3; i++) fireBullet(state.player.x, state.player.y, aimAngle, 'fire', (Math.random() - 0.5) * 0.8, Math.random() * 0.5 + 0.8, 0.4, 0.3, 1);
                        state.player.cooldown = 2;
                    }
                }

                let isFrenzy = state.player.activeBuffs.drone_frenzy > 0;
                state.drones.forEach((d: any, index: number) => {
                    d.angle += 0.05; let tx, ty;
                    if (isFiring) { tx = state.mouse.worldX; ty = state.mouse.worldY; }
                    else { tx = state.player.x + Math.cos(index) * 100; ty = state.player.y + Math.sin(index) * 100; }
                    const a = Math.atan2(ty - d.y, tx - d.x);
                    let dSpeed = isFrenzy ? 12 : 6;
                    d.x += Math.cos(a) * dSpeed; d.y += Math.sin(a) * dSpeed;

                    state.shapes.forEach((s: any) => {
                        let hitDist = d.isGiant ? s.size + 40 : s.size + 15;
                        if (s.isBot && Math.hypot(s.x - d.x, s.y - d.y) < hitDist) {
                            s.hp -= isFrenzy ? calcBDmg * 1.5 : calcBDmg * 0.5; d.hp -= 5;
                            if (frameCount % 5 === 0) spawnParticles(d.x, d.y, 5, d.type, 1);
                        }
                    });
                    if (d.hp <= 0) { state.drones.splice(index, 1); spawnParticles(d.x, d.y, 5, d.type, 10); }
                });

                // COIN DROPS UPDATE
                for (let i = state.drops.length - 1; i >= 0; i--) {
                    let d = state.drops[i];
                    d.x += d.vx; d.y += d.vy; d.z += d.vz; d.vz -= 0.5;
                    if (d.z <= 0) { d.z = 0; d.vz *= -0.5; d.vx *= 0.8; d.vy *= 0.8; }
                    d.life--;

                    if (Math.hypot(state.player.x - d.x, state.player.y - d.y) < state.player.size + 15) {
                        playSound('coin');
                        state.sessionCoins++;
                        state.score += 5;
                        state.drops.splice(i, 1);
                    } else if (d.life <= 0) {
                        state.drops.splice(i, 1);
                    }
                }

                for (let i = state.powerups.length - 1; i >= 0; i--) {
                    let p = state.powerups[i];
                    p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vz -= 0.5;
                    if (p.z <= 0) { p.z = 0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
                    p.life--;

                    if (Math.hypot(state.player.x - p.x, state.player.y - p.y) < state.player.size + 15) {
                        if (p.type === 'mine') {
                            spawnExplosion(p.x, p.y, 300, 250);
                            state.powerups.splice(i, 1); continue;
                        }
                        if (p.type === 'heal') state.player.hp = state.player.maxHp;
                        if (p.type === 'speed') state.player.activeBuffs.speed = 600;
                        if (p.type === 'damage') state.player.activeBuffs.damage = 600;
                        if (p.type === 'shield') state.player.activeBuffs.shield = 600;
                        playSound('levelup'); state.powerups.splice(i, 1);
                    } else if (p.life <= 0) state.powerups.splice(i, 1);
                }

                for (let i = state.aoeClouds.length - 1; i >= 0; i--) {
                    let c = state.aoeClouds[i]; c.life--;
                    if (c.life <= 0) state.aoeClouds.splice(i, 1);
                }

                for (let i = state.particles.length - 1; i >= 0; i--) {
                    let p = state.particles[i]; p.x += p.vx; p.y += p.vy; p.z += p.vz; p.rot += p.rotV; p.vz -= 0.5;
                    if (p.z < 0) { p.z = 0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
                    p.life -= 0.02; if (p.life <= 0) state.particles.splice(i, 1);
                }

                for (let i = state.decals.length - 1; i >= 0; i--) { state.decals[i].life--; if (state.decals[i].life <= 0) state.decals.splice(i, 1); }
                for (let i = state.damageTexts.length - 1; i >= 0; i--) { let dt = state.damageTexts[i]; dt.y -= 1; dt.life--; if (dt.life <= 0) state.damageTexts.splice(i, 1); }

                for (let i = state.bullets.length - 1; i >= 0; i--) {
                    let b = state.bullets[i];

                    if (!b.isEnemy && (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1')) {
                        state.brPlayers.forEach(p => {
                            if (p.hp > 0 && Math.hypot(p.x - b.x, p.y - b.y) < (p.size || 20) + 10) {
                                socketRef.current?.emit('br:hit', { targetSocketId: p.socketId, damage: b.damage });
                                b.penetration--;
                                spawnParticles(p.x, p.y, 10, 'blood', 3);
                            }
                        });
                    }

                    if (b.type === 'homing') {
                        let nearestDist = 1000, nearestObj = null;
                        state.shapes.forEach(s => { let d = Math.hypot(s.x - b.x, s.y - b.y); if (d < nearestDist) { nearestDist = d; nearestObj = s; } });
                        if (nearestObj) {
                            let a2t = Math.atan2((nearestObj as any).y - b.y, (nearestObj as any).x - b.x);
                            b.vx += Math.cos(a2t) * 0.5; b.vy += Math.sin(a2t) * 0.5;
                            b.a = Math.atan2(b.vy, b.vx);
                        }
                    }
                    if (b.type === 'blackhole') {
                        state.shapes.forEach(s => {
                            let d = Math.hypot(s.x - b.x, s.y - b.y);
                            if (d < 300) { let a2b = Math.atan2(b.y - s.y, b.x - s.x); s.x += Math.cos(a2b) * 3; s.y += Math.sin(a2b) * 3; }
                        });
                    }

                    b.x += b.vx; b.y += b.vy; b.life--;

                    if (b.type === 'warden_sonic_wave') {
                        state.env.forEach((e: any, eIdx: number) => {
                            if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 20) {
                                state.env.splice(eIdx, 1); spawnParticles(e.x, e.y, 10, 'stone', 10);
                            }
                        });
                    } else if (b.type !== 'tex_warden' && b.type !== 'saw' && b.type !== 'sniper' && b.type !== 'blackhole') {
                        if (b.type === 'bounce') {
                            state.env.forEach((e: any) => {
                                if ((e.type === 'house' || e.type === 'tree') && Math.hypot(e.x - b.x, e.y - b.y) < e.r) { b.vx *= -1; b.vy *= -1; }
                            });
                        } else {
                            state.env.forEach((e: any) => { if ((e.type === 'house' || e.type === 'tree') && Math.hypot(e.x - b.x, e.y - b.y) < e.r) b.life = 0; });
                        }
                    }

                    if (b.isEnemy && Math.hypot(b.x - state.player.x, b.y - state.player.y) < state.player.size + 5) {
                        if (state.player.activeBuffs.reflect > 0) {
                            b.isEnemy = false; b.vx *= -1; b.vy *= -1; b.a += Math.PI;
                        } else if (state.gameMode !== 'god' && state.player.activeUlt !== 'earthquake' && state.player.activeBuffs.shield <= 0) {
                            state.player.hp -= b.damage; state.damageTexts.push({ x: state.player.x, y: state.player.y, text: Math.floor(b.damage), life: 30, isPlayer: true });
                            b.life = 0; playSound('hit');
                        }
                    }
                    if (b.life <= 0) {
                        if (b.type === 'fireball' || b.type === 'napalm') spawnExplosion(b.x, b.y, b.damage * 2, 150);
                        if (b.type === 'missile') spawnExplosion(b.x, b.y, b.damage * 5, 200);
                        if (b.type === 'blackhole') spawnExplosion(b.x, b.y, 500, 300);
                        state.bullets.splice(i, 1);
                    }
                }

                const maxCurrentShapes = state.gameMode === 'peaceful' ? Math.floor(MAX_SHAPES / 2) : MAX_SHAPES;
                if (state.shapes.length < maxCurrentShapes) {
                    const spawnDist = Math.random() * 800 + 600; const spawnAngle = Math.random() * Math.PI * 2;
                    const sx = state.player.x + Math.cos(spawnAngle) * spawnDist; const sy = state.player.y + Math.sin(spawnAngle) * spawnDist;
                    if (sx > 100 && sx < state.worldSize - 100 && sy > 100 && sy < state.worldSize - 100) {
                        let validEntities = ENTITIES.filter(e => state.gameMode !== 'peaceful' || !e.isBot);
                        const totalW = validEntities.reduce((acc, b) => acc + b.weight, 0);
                        let rand = Math.random() * totalW; let sel = validEntities[0];
                        for (const b of validEntities) { if (rand < b.weight) { sel = b; break; } rand -= b.weight; }
                        state.shapes.push({ id: Math.random(), x: sx, y: sy, ...sel, vx: 0, vy: 0, angle: 0, z: 0, cooldown: 0, carriedBlock: null });
                    }
                }

                for (let i = state.shapes.length - 1; i >= 0; i--) {
                    let shape = state.shapes[i];
                    const distToPlayer = Math.hypot(shape.x - state.player.x, shape.y - state.player.y);
                    if (distToPlayer > 2500) { state.shapes.splice(i, 1); continue; }

                    if (shape.isBot) {
                        let target = (distToPlayer < 800) ? state.player : null;
                        if (shape.botType === 'neutral' && !shape.provoked) target = null as any;

                        const dist = target ? Math.hypot(target.x - shape.x, target.y - shape.y) : 0;
                        const a2t = target ? Math.atan2(target.y - shape.y, target.x - shape.x) : 0;

                        if (shape.type === 'creeper' && distToPlayer < 80 && shape.hp > 0) {
                            spawnExplosion(shape.x, shape.y, 20, 200); shape.hp = 0;
                            state.shapes.splice(i, 1);
                            continue;
                        }

                        if (shape.type === 'enderman') {
                            if (Math.random() < 0.005) {
                                spawnParticles(shape.x, shape.y, 10, 'ender', 20); shape.x = state.player.x + (Math.random() - 0.5) * 800; shape.y = state.player.y + (Math.random() - 0.5) * 800; spawnParticles(shape.x, shape.y, 10, 'ender', 20);
                            }
                            if (!shape.carriedBlock && Math.random() < 0.05) {
                                let tbIdx = state.shapes.findIndex((s: any) => !s.isBot && s.type !== 'bedrock' && Math.hypot(s.x - shape.x, s.y - shape.y) < 100);
                                if (tbIdx > -1) { shape.carriedBlock = state.shapes[tbIdx].type; state.shapes.splice(tbIdx, 1); }
                            }
                            if (shape.carriedBlock && target && dist < 400 && shape.cooldown <= 0) {
                                fireBullet(shape.x, shape.y, a2t, 'thrown_block', 0, 1.5, 3, 1.5, 1, shape.carriedBlock);
                                state.bullets[state.bullets.length - 1].isEnemy = true; shape.carriedBlock = null; shape.cooldown = 100;
                            }
                        }

                        if (target) {
                            if (shape.botType === 'melee' || shape.botType === 'neutral') {
                                let spd = shape.type === 'zombie' ? 1.0 : 2.0; shape.vx = Math.cos(a2t) * spd; shape.vy = Math.sin(a2t) * spd;
                            } else if (shape.botType === 'ranged') {
                                let attackRange = shape.type === 'ghast' ? 900 : 600;
                                let stopRange = shape.type === 'ghast' ? 400 : 200;

                                if (dist < attackRange && dist > stopRange) {
                                    shape.vx = 0; shape.vy = 0; shape.cooldown--;
                                    if (shape.cooldown <= 0) {
                                        if (shape.type === 'ghast') {
                                            fireBullet(shape.x, shape.y, a2t, 'fireball', 0, 0.8, 1.5, 1.5);
                                            state.bullets[state.bullets.length - 1].isEnemy = true;
                                            shape.cooldown = 150; playSound('shoot');
                                        } else {
                                            fireBullet(shape.x, shape.y, a2t, 'basic', 0, 0.6, 0.5, 1);
                                            state.bullets[state.bullets.length - 1].isEnemy = true; shape.cooldown = 100;
                                        }
                                    }
                                } else if (dist <= stopRange) { shape.vx = -Math.cos(a2t) * 1.5; shape.vy = -Math.sin(a2t) * 1.5; }
                                else { shape.vx = Math.cos(a2t) * 1.5; shape.vy = Math.sin(a2t) * 1.5; }
                            } else if (shape.botType === 'climber') { shape.vx = Math.cos(a2t) * 2.5; shape.vy = Math.sin(a2t) * 2.5; }
                            else if (shape.botType === 'teleporter') { shape.vx = Math.cos(a2t) * 1.5; shape.vy = Math.sin(a2t) * 1.5; }
                        } else { shape.vx = 0; shape.vy = 0; }

                        if (shape.type === 'ghast') shape.z = 80 + Math.sin(frameCount * 0.05) * 15;
                        else if (shape.z < 0) shape.z += 2;
                    }

                    if (shape.x < 100 || shape.x > state.worldSize - 100) shape.vx *= -1;
                    if (shape.y < 100 || shape.y > state.worldSize - 100) shape.vy *= -1;

                    if (shape.botType !== 'climber' && shape.botType !== 'teleporter') {
                        state.env.forEach((e: any) => {
                            if (e.type === 'house' || e.type === 'tree') {
                                if (shape.x > e.x - e.r && shape.x < e.x + e.r && shape.y - shape.vy > e.y - e.r && shape.y - shape.vy < e.y + e.r) { shape.x -= shape.vx; shape.vx *= -1; }
                                if (shape.x - shape.vx > e.x - e.r && shape.x - shape.vx < e.x + e.r && shape.y > e.y - e.r && shape.y < e.y + e.r) { shape.y -= shape.vy; shape.vy *= -1; }
                            }
                        });
                    }

                    shape.x += shape.vx;
                    shape.y += shape.vy;

                    for (let j = state.bullets.length - 1; j >= 0; j--) {
                        let b = state.bullets[j];
                        if (b.isEnemy || b.type === 'potion' || b.type === 'bomb' || b.type === 'blackhole') continue;

                        let hitDist = (b.type === 'tex_warden' || b.type === 'warden_sonic_wave' || b.type === 'laser') ? shape.size + 40 : shape.size + 5;
                        if (Math.hypot(shape.x - b.x, shape.y - b.y) < hitDist) {
                            let actualDmg = b.damage;
                            if (b.type === 'warden_sonic_wave') actualDmg *= 10;
                            if (Math.random() < 0.1) { actualDmg *= 2; state.damageTexts.push({ x: shape.x, y: shape.y, text: "CRIT!", life: 40 }); }

                            if (b.type === 'hook') {
                                let a2p = Math.atan2(state.player.y - shape.y, state.player.x - shape.x);
                                shape.x += Math.cos(a2p) * 100; shape.y += Math.sin(a2p) * 100;
                            }

                            shape.hp -= actualDmg; b.penetration--; playSound('hit');
                            spawnParticles(shape.x, shape.y, 10, shape.type || 'stone', 3);
                            state.damageTexts.push({ x: shape.x, y: shape.y, text: Math.floor(actualDmg), life: 30 });

                            if (shape.type === 'golem' && b.damage > 0) shape.provoked = true;
                            if (b.penetration <= 0) state.bullets.splice(j, 1);

                            if (shape.hp <= 0) {
                                if (shape.type === 'tnt') spawnExplosion(shape.x, shape.y, 100, 200);

                                state.combo.count++; state.combo.timer = 180;
                                if (state.combo.count > state.combo.max) state.combo.max = state.combo.count;
                                let comboMult = 1 + (state.combo.count * 0.1);

                                let xpGain = Math.floor(shape.xp * comboMult);
                                state.xp += xpGain; state.score += xpGain; state.kills++;

                                if (Math.random() < 0.05) state.powerups.push({ x: shape.x, y: shape.y, type: ['heal', 'speed', 'damage', 'shield'][Math.floor(Math.random() * 4)], life: 600, z: 20, vz: 5 });

                                if (shape.splatter) {
                                    for (let s = 0; s < 3; s++) state.decals.push({ x: shape.x + (Math.random() - 0.5) * 40, y: shape.y + (Math.random() - 0.5) * 40, r: Math.random() * 15 + 5, color: shape.splatter, life: 1000 });
                                }

                                // Spawn Coins Drop
                                let coinCount = Math.floor(Math.random() * (shape.isBot ? 3 : 1)) + (shape.type === 'emerald' ? 5 : 0) + (shape.type === 'diamond' ? 3 : 0);
                                for (let c = 0; c < coinCount; c++) {
                                    if (state.drops.length < MAX_DROPS) {
                                        state.drops.push({ x: shape.x, y: shape.y, z: 20, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, vz: Math.random() * 6 + 4, life: 1000, type: 'coin' });
                                    }
                                }

                                state.shapes.splice(i, 1);
                                spawnParticles(shape.x, shape.y, 10, shape.type, 20);

                                let leveledUp = false;
                                while (state.xp >= state.xpNeeded && state.level < 150) {
                                    state.level++; state.xp -= state.xpNeeded; state.xpNeeded = Math.floor(state.xpNeeded * 1.1 + 20);
                                    state.statPoints++; state.player.hp = state.player.maxHp; leveledUp = true;
                                }
                                if (leveledUp) playSound('levelup');
                                syncUI(); break;
                            }
                        }
                    }

                    if (shape.hp <= 0) continue;

                    if (shape.hp > 0) {
                        const dist = Math.hypot(shape.x - state.player.x, shape.y - state.player.y);
                        if (dist < shape.size + state.player.size && state.player.z > -20) {
                            if (state.player.class === 'necromancer' && !shape.isBot && state.drones.length < 20) {
                                shape.hp = 0; state.shapes.splice(i, 1);
                                state.drones.push({ x: shape.x, y: shape.y, hp: 50, maxHp: 50, type: shape.type, angle: 0 });
                                spawnParticles(shape.x, shape.y, 10, 'diamond', 10);
                                continue;
                            }
                            if (state.gameMode !== 'god' && state.player.activeUlt !== 'earthquake' && state.player.activeBuffs.shield <= 0) {
                                if (!((state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') && !uiState.brStarted)) {
                                    state.player.hp -= (shape.isBot ? 10 : 2);
                                    state.damageTexts.push({ x: state.player.x, y: state.player.y, text: (shape.isBot ? 10 : 2), life: 30, isPlayer: true });
                                    state.camera.shake = 15;
                                }
                            }
                            shape.hp -= calcBodyDmg;
                            if (shape.type === 'golem') shape.provoked = true;
                            const angle = Math.atan2(shape.y - state.player.y, shape.x - state.player.x);
                            shape.x += Math.cos(angle) * 15; shape.y += Math.sin(angle) * 15;
                            if (shape.hp <= 0) {
                                state.shapes.splice(i, 1);
                                if (shape.splatter) {
                                    for (let s = 0; s < 3; s++) state.decals.push({ x: shape.x + (Math.random() - 0.5) * 40, y: shape.y + (Math.random() - 0.5) * 40, r: Math.random() * 15 + 5, color: shape.splatter, life: 1000 });
                                }
                            }
                            if (state.player.hp <= 0 && state.gameMode !== 'god' && !state.isGameOver) {
                                processGameOver();
                            }
                        }
                    }
                }

                if (state.player.hp <= 0 && state.gameMode !== 'god' && !state.isGameOver) {
                    processGameOver();
                } else if (state.player.hp < state.player.maxHp && state.player.hp > 0) {
                    state.player.hp = Math.min(state.player.maxHp, state.player.hp + calcRegen);
                }

                if (frameCount % 15 === 0) syncUI();

            } // END OF isPaused BLOCK

            // === RENDER PIPELINE ===
            ctx.fillStyle = '#4d822a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

            const viewW = (canvas.width / state.camera.zoom) / 2;
            const viewH = (canvas.height / state.camera.zoom) / 2;

            let renderables: any[] = [];
            state.shapes.forEach((s: any) => {
                if (Math.abs(s.x - state.camera.x) < viewW + s.size + 100 && Math.abs(s.y - state.camera.y) < viewH + s.size + 100) {
                    renderables.push({ type: 'shape', obj: s, sortY: s.y });
                }
            });
            state.brPlayers.forEach((p: any) => {
                if (Math.abs(p.x - state.camera.x) < viewW + 100 && Math.abs(p.y - state.camera.y) < viewH + 100) {
                    renderables.push({ type: 'br_player', obj: p, sortY: p.y });
                }
            });

            const viewWeights = getBiomeWeights(state.camera.x, state.camera.y);
            const drawBiomeLayer = (bName: string, bTexId: string) => {
                if (!texturesRef.current[bTexId]) return;
                ctx.globalAlpha = viewWeights[bName] || 0;
                if (ctx.globalAlpha > 0.05) {
                    const pattern = ctx.createPattern(texturesRef.current[bTexId], 'repeat') as CanvasPattern;
                    if (pattern && pattern.setTransform) {
                        pattern.setTransform(new DOMMatrix().scale(state.camera.zoom, state.camera.zoom).translate(-state.camera.x, -state.camera.y));
                    }
                    ctx.fillStyle = pattern; ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            };

            drawBiomeLayer('plains', 'grass'); drawBiomeLayer('ice', 'ice'); drawBiomeLayer('desert', 'sand');
            drawBiomeLayer('ocean', 'water'); drawBiomeLayer('nether', 'netherrack');
            ctx.globalAlpha = 1.0;

            ctx.save();
            // Apply Camera Center & Zoom Coordinate Matrix
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(state.camera.zoom, state.camera.zoom);

            // Apply Screen Shake
            if (state.camera.shake > 0) {
                ctx.translate((Math.random() - 0.5) * state.camera.shake, (Math.random() - 0.5) * state.camera.shake);
                state.camera.shake *= 0.9;
                if (state.camera.shake < 0.5) state.camera.shake = 0;
            }

            ctx.translate(-state.camera.x, -state.camera.y);

            if (state.player.activeUlt === 'earthquake') ctx.translate((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);

            ctx.strokeStyle = ctx.createPattern(texturesRef.current['bedrock'], 'repeat') as CanvasPattern; ctx.lineWidth = 200; ctx.strokeRect(-100, -100, (state.worldSize || WORLD_SIZE) + 200, (state.worldSize || WORLD_SIZE) + 200);

            if (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.2)';
                ctx.beginPath(); ctx.rect(-100, -100, (state.worldSize || WORLD_SIZE) + 200, (state.worldSize || WORLD_SIZE) + 200);
                ctx.arc(state.safeZone.x, state.safeZone.y, state.safeZone.radius, 0, Math.PI * 2, true); ctx.fill();
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(state.safeZone.x, state.safeZone.y, state.safeZone.radius, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.setLineDash([20, 20]); ctx.beginPath(); ctx.arc(state.safeZone.x, state.safeZone.y, state.safeZone.targetRadius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            }

            state.decals.forEach((d: any) => {
                if (Math.abs(d.x - state.camera.x) < viewW + d.r) {
                    ctx.globalAlpha = d.life / 1000; ctx.fillStyle = d.color;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
                }
            });
            ctx.globalAlpha = 1.0;

            state.env.forEach((e: any) => {
                if ((e.type === 'house' || e.type === 'tree') && Math.abs(e.x - state.camera.x) < viewW + e.r) renderables.push({ type: 'env', obj: e, sortY: e.y + e.r });
            });
            state.bullets.forEach((b: any) => renderables.push({ type: 'bullet', obj: b, sortY: b.y }));
            state.particles.forEach((p: any) => renderables.push({ type: 'particle', obj: p, sortY: p.type === 'tnt' || p.color ? p.y + 10000 : p.y }));
            state.drops.forEach((d: any) => renderables.push({ type: 'drop', obj: d, sortY: d.y }));
            state.powerups.forEach((p: any) => renderables.push({ type: 'powerup', obj: p, sortY: p.y }));
            state.drones.forEach((d: any) => renderables.push({ type: 'drone', obj: d, sortY: d.y }));
            renderables.push({ type: 'player', obj: state.player, sortY: state.player.y });

            renderables.sort((a, b) => a.sortY - b.sortY);

            const lDirX = Math.cos(state.globalTime * 0.5); const lDirY = Math.sin(state.globalTime * 0.5);

            if (settingsRef.current.graphics === 'high' && shadowTexRef.current) {
                const shadowDist = 30;
                ctx.save();
                renderables.forEach(item => {
                    const o = item.obj;
                    if (item.type === 'env') {
                        // Shadows disabled for env objects based on new optimization
                    } else if (item.type === 'shape' || item.type === 'player' || item.type === 'drone' || item.type === 'br_player') {
                        const sSize = ((o.isGiant ? 35 : o.size) || 15) * 2.5;
                        ctx.save(); ctx.translate(o.x + lDirX * shadowDist, o.y + lDirY * shadowDist); ctx.rotate(o.angle || 0);
                        ctx.drawImage(shadowTexRef.current as CanvasImageSource, -sSize / 2, -sSize / 2, sSize, sSize); ctx.restore();
                    }
                });
                ctx.restore();
            }

            renderables.forEach(item => {
                const o = item.obj;
                if (item.type === 'env') {
                    if (texturesRef.current[o.type]) {
                        ctx.drawImage(texturesRef.current[o.type] as CanvasImageSource, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
                    } else {
                        ctx.fillStyle = o.type === 'house' ? '#713f12' : '#14532d';
                        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
                    }
                }
                else if (item.type === 'shape' || item.type === 'drone') {
                    const isMoving = Math.abs(o.vx) > 0.1 || Math.abs(o.vy) > 0.1;
                    const isAttacking = o.cooldown > 0;
                    const eAnimState = isAttacking ? 'attack' : (isMoving ? 'walk' : 'idle');
                    const isEntitySprite = o.isBot === true || item.type === 'drone';
                    let frames = o.framesConfig || [8, 8, 8];
                    let sizeRender = o.isGiant ? 35 : (o.size || 15);

                    drawSprite(ctx, o.x, o.y, sizeRender * 2, sizeRender * 2, o.h || 20, isEntitySprite ? o.angle : 0, o.textureId || o.type, o.colorTop, o.colorSide, o.isBot, o.z || 0, 1.0, frameCount, isEntitySprite, eAnimState, frames);

                    if (o.carriedBlock) drawSprite(ctx, o.x, o.y, 15, 15, 15, 0, o.carriedBlock, null, null, false, (o.z || 0) - 35);
                    const shapeMaxHp = ENTITIES.find(s => s.type === o.type)?.hp || o.maxHp || 10;
                    if (o.hp < shapeMaxHp && o.hp > 0) {
                        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(o.x - sizeRender, o.y + sizeRender + 15 + (o.z || 0), sizeRender * 2, 4);
                        ctx.fillStyle = '#10B981'; ctx.fillRect(o.x - sizeRender, o.y + sizeRender + 15 + (o.z || 0), ((sizeRender) * 2) * (Math.max(0, o.hp) / shapeMaxHp), 4);
                    }
                }
                else if (item.type === 'br_player') {
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y));
                    const pAnimState = Math.abs(o.vx) > 0 ? 'walk' : 'idle';
                    const clsData = CLASSES[o.class];
                    let renderAngle = 0; let flipX = false;
                    if (o.angle > Math.PI / 2 || o.angle < -Math.PI / 2) { flipX = true; }
                    drawSprite(ctx, 0, 0, 40, 40, 22, renderAngle, clsData?.textureId, o.isParty ? '#3b82f6' : '#ef4444', '#64748b', false, 0, 1.0, frameCount, true, pAnimState, clsData?.framesConfig, flipX);
                    ctx.restore();
                    ctx.fillStyle = o.isParty ? '#60a5fa' : '#ef4444'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(o.name, o.x, o.y - 30);

                    if ((state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') && !uiState.brStarted && o.isReady) {
                        ctx.fillStyle = '#10b981'; ctx.font = '16px Arial';
                        ctx.fillText('✔️ Ready', o.x, o.y - 45);
                    }

                    const hpW = 40; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o.x - hpW / 2, o.y + 30, hpW, 4);
                    ctx.fillStyle = o.isParty ? '#3b82f6' : '#ef4444'; ctx.fillRect(o.x - hpW / 2, o.y + 30, hpW * (Math.max(0, o.hp) / o.maxHp), 4);
                }
                else if (item.type === 'bullet') {
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y));
                    if (o.type === 'tex_warden') { ctx.fillStyle = `rgba(20, 184, 166, ${0.4 + Math.sin(frameCount) * 0.2})`; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 3; ctx.stroke(); }
                    else if (o.type === 'warden_sonic_wave') {
                        ctx.rotate(o.a);
                        if (texturesRef.current['sonic']) ctx.drawImage(texturesRef.current['sonic'], -30, -30, 60, 60);
                        else { ctx.fillStyle = '#0f766e'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill(); }
                    }
                    else if (o.type === 'thrown_block') drawSprite(ctx, 0, 0, 15, 15, 15, 0, o.carriedType, null, null, false, o.z);
                    else if (o.type === 'fire') { ctx.fillStyle = `rgba(249, 115, 22, ${o.life / 40})`; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); }
                    else if (o.type === 'fireball' || o.type === 'napalm') {
                        ctx.fillStyle = `rgba(239, 68, 68, ${o.life / 100})`; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
                    }
                    else if (o.type === 'saw') {
                        ctx.rotate(frameCount * 0.5); ctx.fillStyle = '#94a3b8'; ctx.beginPath();
                        for (let i = 0; i < 8; i++) {
                            ctx.arc(0, 0, 15, i * Math.PI / 4, i * Math.PI / 4 + 0.5);
                            ctx.lineTo(20 * Math.cos(i * Math.PI / 4 + 0.25), 20 * Math.sin(i * Math.PI / 4 + 0.25));
                        }
                        ctx.fill(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.stroke();
                    }
                    else if (o.type === 'sniper') { ctx.rotate(o.a); ctx.fillStyle = '#fff'; ctx.fillRect(-15, -3, 30, 6); }
                    else if (o.type === 'missile' || o.type === 'homing') {
                        ctx.rotate(o.a); ctx.fillStyle = '#ef4444'; ctx.fillRect(-10, -5, 20, 10);
                        ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(-10, 0, 6, 0, Math.PI * 2); ctx.fill();
                    }
                    else if (o.type === 'hook') { ctx.rotate(o.a); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(10, 0); ctx.lineTo(5, -5); ctx.stroke(); }
                    else if (o.type === 'blackhole') {
                        ctx.rotate(frameCount * 0.2);
                        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 30); grad.addColorStop(0, '#000'); grad.addColorStop(1, 'rgba(139,92,246,0)');
                        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
                    }
                    else drawSprite(ctx, 0, 0, 10, 10, 4, 0, null, o.isEnemy ? '#ef4444' : '#ffffff', o.isEnemy ? '#991b1b' : '#9ca3af', false);
                    ctx.restore();
                }
                else if (item.type === 'drop') {
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y - o.z));
                    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(0, 0, 8 * Math.max(0.2, Math.abs(Math.sin(frameCount * 0.1))), 8, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.restore();
                }
                else if (item.type === 'powerup') {
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y - o.z));
                    if (o.type === 'mine') {
                        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = (frameCount % 20 < 10) ? '#fff' : '#000'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
                    } else {
                        let color = o.type === 'heal' ? '#22c55e' : o.type === 'speed' ? '#3b82f6' : o.type === 'damage' ? '#ef4444' : '#eab308';
                        ctx.fillStyle = color;
                        if (settingsRef.current.particles) { ctx.shadowColor = color; ctx.shadowBlur = 15; }
                        ctx.fillRect(-10, -10, 20, 20); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText(o.type.charAt(0).toUpperCase(), 0, 4);
                        if (settingsRef.current.particles) { ctx.shadowBlur = 0; }
                    }
                    ctx.restore();
                }
                else if (item.type === 'particle') {
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y - o.z)); ctx.rotate(o.rot);
                    ctx.fillStyle = o.type === 'tnt' ? '#f97316' : (texturesRef.current[o.type] ? '#9ca3af' : o.color || '#fff');
                    ctx.globalAlpha = o.life; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
                }
                else if (item.type === 'player') {
                    if ((o.hp <= 0 && state.gameMode !== 'god') || state.isGameOver) return;
                    ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y));

                    const pIsMoving = o.idleTime === 0;
                    const pIsAttacking = o.cooldown > (Math.max(5, state.baseStats.reload - (state.statLevels.reload * 2.5)) - 10);
                    const pAnimState = pIsAttacking ? 'attack' : (pIsMoving ? 'walk' : 'idle');
                    const clsData = CLASSES[o.class];

                    if (state.player.ultDuration > 0) {
                        let uColor = 'rgba(34, 211, 238';
                        if (state.player.activeUlt === 'earthquake') uColor = 'rgba(239, 68, 68';
                        if (state.player.activeUlt === 'inferno') uColor = 'rgba(249, 115, 22';
                        if (state.player.activeUlt === 'giant') uColor = 'rgba(168, 85, 247';
                        ctx.fillStyle = `${uColor}, ${0.2 + Math.sin(frameCount) * 0.1})`;
                        ctx.beginPath(); ctx.arc(0, 0, o.size * 2.5, 0, Math.PI * 2); ctx.fill();
                    }
                    if (state.player.activeBuffs.shield > 0 || state.player.activeBuffs.reflect > 0) {
                        ctx.strokeStyle = state.player.activeBuffs.reflect > 0 ? `rgba(168, 85, 247, ${0.5 + Math.sin(frameCount * 0.2) * 0.2})` : `rgba(234, 179, 8, ${0.5 + Math.sin(frameCount * 0.2) * 0.2})`;
                        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, o.size + 10, 0, Math.PI * 2); ctx.stroke();
                    }
                    if (state.player.activeBuffs.radar > 0) {
                        ctx.strokeStyle = `rgba(20, 184, 166, ${(state.player.activeBuffs.radar / 600)})`; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(0, 0, 100 + (frameCount % 60) * 10, 0, Math.PI * 2); ctx.stroke();
                    }

                    let renderAngle = 0; let flipX = false;
                    if (o.angle > Math.PI / 2 || o.angle < -Math.PI / 2) { flipX = true; }

                    drawSprite(ctx, 0, 0, o.size * 2, o.size * 2, 22, renderAngle, clsData?.textureId || 'tank_basic', clsData?.color || '#cbd5e1', '#64748b', false, o.z, 1.0, frameCount, true, pAnimState, clsData?.framesConfig || [8, 8, 8], flipX);
                    ctx.restore();

                    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(globalProfile.username, o.x, o.y - o.size - 25 + o.z);

                    const hpW = 46; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o.x - hpW / 2, o.y + o.size + 10 + o.z, hpW, 6);
                    ctx.fillStyle = state.gameMode === 'god' ? '#22d3ee' : '#10b981';
                    ctx.fillRect(o.x - hpW / 2, o.y + o.size + 10 + o.z, hpW * (Math.max(0, o.hp) / o.maxHp), 6);
                }
            });

            state.aoeClouds.forEach((c: any) => {
                const isSonic = c.type === 'sonic_ult'; const isExp = c.type === 'explosion';
                const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
                grad.addColorStop(0, isSonic ? `rgba(20, 184, 166, ${c.life / 30})` : isExp ? `rgba(249, 115, 22, ${c.life / 15})` : `rgba(16, 185, 129, ${c.life / 300 * 0.6})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
            });

            state.damageTexts.forEach((dt: any) => {
                ctx.save(); ctx.globalAlpha = dt.life / 30; ctx.fillStyle = dt.isPlayer ? '#ef4444' : '#fbbf24';
                ctx.font = 'bold 16px "Courier New", monospace'; ctx.textAlign = 'center';
                ctx.fillText(dt.text, Math.round(dt.x), Math.round(dt.y - 30)); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeText(dt.text, Math.round(dt.x), Math.round(dt.y - 30));
                ctx.restore();
            });

            ctx.restore(); // END Zoom Transformation Matrix Restore

            if (state.weather.type === 'rain') {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'rgba(186, 230, 253, 0.3)'; ctx.lineWidth = 1.5; ctx.beginPath();
                for (let i = 0; i < 150; i++) { let rx = Math.random() * canvas.width; let ry = Math.random() * canvas.height; ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 25); } ctx.stroke();
            }

            const timeCycle = Math.sin(state.globalTime * 0.5);
            if (timeCycle < 0 || state.weather.flash > 0) {
                if (state.weather.flash > 0) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${state.weather.flash})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
                } else if (settings.graphics === 'high') {
                    const darkAlpha = Math.abs(timeCycle) * 0.7;
                    ctx.save();

                    ctx.fillStyle = `rgba(2, 6, 23, ${darkAlpha})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    ctx.globalCompositeOperation = 'destination-out';
                    const glowRadius = (state.gameMode === 'god' ? 600 : 350) * state.camera.zoom;
                    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 50 * state.camera.zoom, canvas.width / 2, canvas.height / 2, glowRadius);
                    grad.addColorStop(0, `rgba(255,255,255,1)`); grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, glowRadius, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            }

            if (state.combo.timer > 0) {
                ctx.fillStyle = `rgba(251, 191, 36, ${state.combo.timer / 180})`;
                ctx.font = '900 40px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(`COMBO x${state.combo.count}!`, canvas.width / 2, 100);
            }

            if (uiState.isPlaying && !uiState.isGameOver && settings.showMinimap) {
                const mapSize = 160; const mapX = canvas.width - mapSize - 24; const mapY = settings.isMobile ? 100 : canvas.height - mapSize - 24;
                ctx.save();
                ctx.beginPath(); ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize / 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; ctx.fill();
                ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
                ctx.clip();
                const scale = mapSize / state.worldSize;
                state.shapes.forEach((s: any) => {
                    if (s.isBot || state.player.activeBuffs.radar > 0) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(mapX + s.x * scale, mapY + s.y * scale, 1.5, 0, Math.PI * 2); ctx.fill(); }
                    else if (s.type === 'emerald') { ctx.fillStyle = '#10b981'; ctx.fillRect(mapX + s.x * scale, mapY + s.y * scale, 2, 2); }
                });
                state.brPlayers.forEach((p: any) => {
                    ctx.fillStyle = p.isParty ? '#3b82f6' : '#ef4444'; ctx.beginPath(); ctx.arc(mapX + p.x * scale, mapY + p.y * scale, 2, 0, Math.PI * 2); ctx.fill();
                });
                if (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') {
                    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mapX + state.safeZone.x * scale, mapY + state.safeZone.y * scale, state.safeZone.radius * scale, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(mapX + state.player.x * scale, mapY + state.player.y * scale, 3, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
                ctx.strokeRect(mapX + (state.camera.x - viewW) * scale, mapY + (state.camera.y - viewH) * scale, (viewW * 2) * scale, (viewH * 2) * scale);
                ctx.restore();
            }

            state.animationFrameId = requestAnimationFrame(gameLoop);
        };

        gameRef.current.animationFrameId = requestAnimationFrame(gameLoop);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('contextmenu', handleContext);
            window.removeEventListener('wheel', handleWheel);
            if (gameRef.current.animationFrameId !== null) cancelAnimationFrame(gameRef.current.animationFrameId);
        };
    }, [uiState.isPlaying, uiState.isGameOver, uiState.showShop, uiState.showSettings, uiState.showProfile, settings, joystick, uiState.isPaused, party]);

    const statsList = [
        { id: 'regen', name: 'Regen HP', color: 'bg-pink-500' }, { id: 'maxHp', name: 'Max HP', color: 'bg-red-500' },
        { id: 'bodyDmg', name: 'Body Dmg', color: 'bg-purple-500' }, { id: 'bulletSpd', name: 'Bullet Spd', color: 'bg-blue-500' },
        { id: 'bulletPen', name: 'Bullet Pen', color: 'bg-yellow-400' }, { id: 'bulletDmg', name: 'Bullet Dmg', color: 'bg-orange-500' },
        { id: 'reload', name: 'Reload', color: 'bg-green-500' }, { id: 'moveSpd', name: 'Move Spd', color: 'bg-teal-400' }
    ];

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none font-sans text-slate-100 touch-none" style={{ padding: 'var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)' }}>
            <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />

            {/* TOAST SYSTEM */}
            <div className="absolute top-20 right-4 flex flex-col gap-2 z-[9999] pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id} className="bg-slate-900 border border-slate-700 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-3 min-w-[280px] pointer-events-auto animate-[slideInRight_0.3s_ease-out]">
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 text-lg ${toast.type === 'invite' ? 'text-amber-400' : 'text-cyan-400'}`}>
                                    {toast.type === 'invite' ? '✉️' : '🔔'}
                                </div>
                                <div className="font-bold text-sm tracking-wide break-words flex-1 mt-0.5">{toast.message}</div>
                            </div>
                            <button onClick={() => removeToast(toast.id)} className="text-slate-500 hover:text-white shrink-0">✕</button>
                        </div>
                        {toast.type === 'invite' && (
                            <div className="flex gap-2">
                                <button onClick={() => { toast.extra?.onAccept?.(); removeToast(toast.id); }} className="flex-1 bg-emerald-600/90 hover:bg-emerald-500 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">Accept</button>
                                <button onClick={() => removeToast(toast.id)} className="flex-1 bg-slate-700/90 hover:bg-slate-600 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border border-slate-500">Decline</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* GAMEPLAY HUD: Kill Feed & BR Info */}
            {uiState.isPlaying && !uiState.isGameOver && (
                <>
                    {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && !uiState.brStarted && (
                        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-amber-500/30 backdrop-blur-md p-4 rounded-3xl shadow-xl z-40 text-center w-64 md:w-80 pointer-events-auto flex flex-col">
                            <div className="text-sm font-black text-amber-500 tracking-widest uppercase mb-1">WAITING ROOM</div>
                            <div className="text-slate-300 font-bold text-xs mb-2">Players: <span className="text-cyan-400 font-black">{uiState.brAlive} / {uiState.gameMode === 'pvp1v1' ? 2 : 30}</span></div>
                            <div className="text-[10px] md:text-xs font-bold text-white mb-3 animate-pulse bg-slate-800/50 rounded-lg p-1.5">{uiState.brCountdownMsg || 'Waiting for players...'}</div>

                            <div className="bg-slate-950/50 p-2 border border-slate-700/50 rounded-xl mb-3 text-left overflow-y-auto custom-scrollbar flex-1 max-h-32">
                                {uiState.lobbyPlayers.map((p, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0 pointer-events-none">
                                        <div className={`font-bold text-[10px] md:text-xs ${(p.uid === globalProfile.uid || p.uid === auth.uid) ? 'text-amber-400' : 'text-slate-200'} truncate mr-2`}>{p.name} {(p.uid === globalProfile.uid || p.uid === auth.uid) ? '(You)' : ''}</div>
                                        <div className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider whitespace-nowrap ${p.isReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                            {p.isReady ? 'Ready ✔' : 'Wait'}
                                        </div>
                                    </div>
                                ))}
                                {uiState.lobbyPlayers.length === 0 && <div className="text-center text-slate-500 text-[10px] font-bold my-2">No players yet.</div>}
                            </div>

                            <button onClick={() => {
                                setUiState(p => ({ ...p, isPlayerReady: !p.isPlayerReady }));
                                socketRef.current?.emit('br:ready', !uiState.isPlayerReady);
                            }} className={`w-full py-2.5 text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md shrink-0 ${uiState.isPlayerReady ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white' : 'bg-amber-600/90 hover:bg-amber-500 border border-amber-400 text-white animate-pulse'}`}>
                                {uiState.isPlayerReady ? '✔ READY' : 'CLICK TO READY'}
                            </button>
                        </div>
                    )}

                    <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none z-10 w-64">
                        {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && (
                            <div className="flex flex-col items-end gap-1 mb-2">
                                {(uiState.brStarted) && (
                                    <div className="font-bold text-[10px] text-cyan-400 uppercase tracking-widest bg-slate-900/60 px-2 py-1 rounded border border-slate-700 backdrop-blur-sm">
                                        Alive: <span className="text-white">{uiState.brAlive}</span> | Conn: <span className="text-white">{uiState.lobbyPlayers ? uiState.lobbyPlayers.length : 0}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && uiState.brStarted && (
                            <div className="bg-red-500/10 border border-red-500/40 backdrop-blur-md px-4 py-3 rounded-2xl w-full flex flex-col mb-2 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                                <div className="text-red-400 font-black tracking-widest uppercase text-xs mb-1">Safe Zone</div>
                                <div className="text-3xl font-mono text-white font-black">{Math.floor(uiState.brTimeLeft / 60)}:{(uiState.brTimeLeft % 60).toString().padStart(2, '0')}</div>
                                <div className="h-1 w-full bg-slate-800 mt-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 transition-all" style={{ width: `${(uiState.brTimeLeft / 300) * 100}%` }}></div>
                                </div>
                            </div>
                        )}

                        {/* Kill Feed List */}
                        {killFeed.filter(kf => Date.now() - kf.time < 5000).map((kf, i) => (
                            <div key={kf.id} className="bg-slate-900/60 border-l-4 border-l-emerald-500 backdrop-blur px-3 py-2 rounded text-xs font-bold text-slate-300 animate-[slideInRight_0.3s_ease-out] w-full mt-1 shadow-lg">
                                <span className="text-emerald-400">{kf.killer}</span> <span className="opacity-70">⚔️</span> <span className="text-red-400">{kf.victim}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* VIRTUAL JOYSTICKS (Mobile Only) */}
            {uiState.isPlaying && !uiState.isGameOver && !uiState.isPaused && settings.isMobile && (
                <>
                    <div className="absolute rounded-full border-2 border-white/20 bg-black/30 pointer-events-none"
                        style={{
                            left: `calc(var(--safe-left) + ${70 * settings.joystickScale}px)`,
                            bottom: `calc(var(--safe-bottom) + ${70 * settings.joystickScale}px)`,
                            width: 100 * settings.joystickScale,
                            height: 100 * settings.joystickScale,
                            transform: 'translate(-50%, 50%)'
                        }}>
                        <div className="absolute bg-white/50 rounded-full transition-all duration-75"
                            style={{
                                left: (50 * settings.joystickScale) + (joystick.left.active ? joystick.left.dx * 40 * settings.joystickScale : 0) - (20 * settings.joystickScale),
                                top: (50 * settings.joystickScale) + (joystick.left.active ? joystick.left.dy * 40 * settings.joystickScale : 0) - (20 * settings.joystickScale),
                                width: 40 * settings.joystickScale,
                                height: 40 * settings.joystickScale
                            }}></div>
                    </div>

                    {joystick.right.active && (
                        <div className="absolute rounded-full border-2 border-red-500/30 bg-black/20 pointer-events-none"
                            style={{ left: joystick.right.originX - (50 * settings.joystickScale), top: joystick.right.originY - (50 * settings.joystickScale), width: 100 * settings.joystickScale, height: 100 * settings.joystickScale }}>
                            <div className="absolute bg-red-500/50 rounded-full"
                                style={{ left: (50 * settings.joystickScale) + Math.cos(joystick.right.angle) * 40 * settings.joystickScale - (20 * settings.joystickScale), top: (50 * settings.joystickScale) + Math.sin(joystick.right.angle) * 40 * settings.joystickScale - (20 * settings.joystickScale), width: 40 * settings.joystickScale, height: 40 * settings.joystickScale }}></div>
                        </div>
                    )}

                    <div className="absolute bottom-32 right-8 flex gap-4">
                        <button className="w-16 h-16 rounded-full bg-slate-700/50 border border-slate-500 backdrop-blur text-white font-bold active:bg-slate-500 shadow-lg pointer-events-auto"
                            onTouchStart={() => gameRef.current.keys.space = true} onTouchEnd={() => gameRef.current.keys.space = false}>DASH</button>
                    </div>
                </>
            )}

            {/* PAUSE OVERLAY */}
            {uiState.isPaused && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[70]">
                    <div className="bg-slate-900/80 p-10 rounded-3xl border border-slate-700/80 shadow-2xl flex flex-col items-center gap-6">
                        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-blue-600 uppercase tracking-widest">PAUSED</h2>
                        <div className="flex flex-col gap-4 w-64 mt-4">
                            <button onClick={togglePause} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold uppercase rounded-xl border border-cyan-400 transition-all shadow-lg hover:shadow-[0_0_15px_rgba(6,182,212,0.6)]">Resume</button>
                            <button onClick={() => setUiState(p => ({ ...p, showSettings: true }))} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase rounded-xl border border-slate-600 transition-all">Settings</button>
                            <button onClick={exitToMainMenu} className="w-full py-3 bg-red-600/80 hover:bg-red-500 text-white font-bold uppercase rounded-xl border border-red-400 transition-all mt-4">Exit to Menu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AUTH MENU (Simulated) */}
            {uiState.showAuth && !auth.isLoggedIn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-xl">
                    <div className="bg-slate-900 border border-cyan-500/50 p-8 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col items-center w-[90%] max-w-md">
                        <h1 className="text-4xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">PIXSHOT</h1>
                        <input type="text" placeholder="Username" className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded-xl mb-4 outline-none focus:border-cyan-400 font-bold" value={authInput.user} onChange={e => setAuthInput(p => ({ ...p, user: e.target.value }))} />
                        <input type="password" placeholder="Password" className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded-xl mb-6 outline-none focus:border-cyan-400 font-bold" value={authInput.pass} onChange={e => setAuthInput(p => ({ ...p, pass: e.target.value }))} />
                        <div className="flex gap-4 w-full mb-6">
                            <button onClick={() => handleLoginRegister(false)} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl shadow-lg">Login</button>
                            <button onClick={() => handleLoginRegister(true)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl border border-slate-500">Register</button>
                        </div>
                        <button onClick={playAsGuest} className="text-slate-400 hover:text-white font-bold text-sm underline decoration-slate-600 underline-offset-4">Play as Guest</button>
                    </div>
                </div>
            )}

            {/* MAIN MENU & GAME OVER - top buttons removed, party stays */}
            {(!uiState.isPlaying || uiState.isGameOver) && !uiState.showAuth && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                    {/* Party UI Preview in Lobby */}
                    {party.length > 0 && !uiState.isPlaying && !uiState.isGameOver && (
                        <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-auto z-40 bg-slate-900/60 p-4 rounded-3xl border border-slate-700 backdrop-blur shadow-2xl">
                            <div className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                SQUAD ({party.length + 1}/4)
                                <button onClick={async () => {
                                    try {
                                        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                                        localStreamRef.current = s; setVoiceEnabled(true); alert("Voice Chat Microphone Enabled!");
                                    } catch (e) { alert("Mic Access Denied!"); }
                                }} className={`px-2 py-1 rounded text-[10px] ${voiceEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500' : 'bg-slate-700 text-white'}`}>
                                    {voiceEnabled ? '🎙️ Mic ON' : '🎙️ Enable Voice'}
                                </button>
                            </div>
                            {party.map(p => (
                                <div key={p.uid} className={`bg-slate-800 border ${p.isReady ? 'border-emerald-500/50' : 'border-slate-600'} px-4 py-2 rounded-xl font-bold text-slate-300 shadow-lg text-sm flex items-center justify-between gap-4`}>
                                    <div className="flex items-center gap-2">
                                        <span className="truncate max-w-[100px]">🔵 {p.name}</span>
                                    </div>
                                    <span className={`text-[10px] uppercase font-black ${p.isReady ? 'text-emerald-400' : 'text-slate-500'}`}>{p.isReady ? 'Ready' : 'Waiting'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {(!uiState.isPlaying || uiState.isGameOver) && !uiState.showAuth && (
                <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto custom-scrollbar pointer-events-auto">
                    {/* Latar Belakang UI Menu Utama (Gradien + Blur) */}
                    <div className="absolute inset-0 flex flex-col pointer-events-none fixed">
                        <div className="flex-1 bg-gradient-to-b from-slate-900/60 to-transparent"></div>
                        <div className="flex-1 bg-gradient-to-t from-slate-900 to-transparent"></div>
                    </div>

                    <div className="w-[95%] max-w-[1200px] z-10 flex flex-col md:flex-row gap-6 md:gap-16 py-10 items-center justify-center min-h-screen">

                        {/* LEFT PANEL: HERO SHOWCASE (Mobile & Desktop) */}
                        <div className="flex-1 flex flex-col items-center justify-center pt-8 md:pt-0">
                            <h1 className="text-5xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-blue-600 tracking-tighter drop-shadow-[0_0_30px_rgba(6,182,212,0.4)] mb-2 md:mb-4 text-center z-10 uppercase w-full">PixShot.io</h1>

                            {/* Connection Indicator */}
                            <div className="z-10 mb-6 md:mb-10 flex items-center gap-2 bg-slate-900/60 px-4 py-1.5 rounded-full border border-slate-700/50 backdrop-blur-sm">
                                <div className={`w-2 h-2 rounded-full animate-pulse ${connStatus === 'Connected' ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]' : connStatus === 'Connecting' ? 'bg-amber-400 shadow-[0_0_10px_#f59e0b]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`}></div>
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${connStatus === 'Connected' ? 'text-emerald-400' : connStatus === 'Connecting' ? 'text-amber-400' : 'text-red-400'}`}>
                                    Server: {connStatus}
                                </span>
                            </div>

                            {!uiState.isGameOver && (
                                <div className="relative w-48 h-48 md:w-80 md:h-80 mx-auto z-10 flex items-center justify-center group cursor-pointer" onClick={() => setUiState(p => ({ ...p, showShop: true }))}>
                                    <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-3xl animate-pulse group-hover:bg-cyan-500/20 transition-all"></div>
                                    <div className="absolute w-32 h-32 md:w-48 md:h-48 bg-cyan-900/40 rounded-full border border-cyan-500/30 blur-sm shadow-[0_0_40px_rgba(6,182,212,0.4)] animate-[spin_15s_linear_infinite] group-hover:border-cyan-400/60 transition-all"></div>
                                    <img src={`/${uiState.playerClass === 'basic' ? 'biasa' : uiState.playerClass === 'warden' ? 'miaw' : uiState.playerClass === 'necromancer' ? 'necro' : 'tank_' + uiState.playerClass}.png`} alt="Hero Tank" className="w-full h-full object-contain relative z-10 animate-[pulse_4s_ease-in-out_infinite] group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_20px_20px_rgba(0,0,0,0.8)] filter contrast-125" title="Click to Change Class" />

                                    <div className="absolute bottom-0 md:-bottom-4 px-4 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full text-[10px] md:text-xs font-bold text-slate-300 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                                        Change Class
                                    </div>
                                </div>
                            )}

                            {!uiState.isGameOver && (
                                <div className="flex items-center gap-4 mt-6 md:mt-10 z-10 flex-wrap justify-center bg-slate-900/50 backdrop-blur-md p-3 md:p-4 rounded-3xl border border-slate-800 shadow-xl w-full max-w-md">
                                    <button onClick={() => setUiState(p => ({ ...p, showShop: true }))} className="flex-1 min-w-[100px] bg-amber-600/10 border border-amber-500/30 px-2 md:px-6 py-3 rounded-2xl font-black text-xs md:text-base hover:bg-amber-600/30 hover:border-amber-400 text-amber-400 tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
                                        <span className="text-lg md:text-xl">🛒</span> Arsenal
                                    </button>
                                    <div className="flex flex-col items-center justify-center px-4 border-slate-700 border-x">
                                        <span className="text-[10px] md:text-xs text-slate-400 uppercase tracking-widest font-bold">Balance</span>
                                        <span className="text-xl md:text-2xl font-black font-mono text-amber-400">{globalProfile.coins} <span className="text-sm">🪙</span></span>
                                    </div>
                                    <button onClick={() => setUiState(p => ({ ...p, showProfile: true }))} className="flex-1 min-w-[100px] bg-cyan-600/10 border border-cyan-500/30 px-2 md:px-6 py-3 rounded-2xl font-black text-xs md:text-base hover:bg-cyan-600/30 hover:border-cyan-400 text-cyan-400 tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
                                        <span className="text-lg md:text-xl">👤</span> Profile
                                    </button>
                                </div>
                            )}

                            {uiState.isGameOver && (
                                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto">
                                    <div className="bg-slate-900/90 backdrop-blur-xl border-2 border-red-500/50 p-6 md:p-8 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col items-center gap-6 max-w-sm w-[90%] mx-auto">
                                        <h2 className="text-4xl font-black text-red-500 uppercase tracking-widest drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">Decimated</h2>

                                        <div className="grid grid-cols-2 gap-3 w-full">
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
                                                <div className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Score</div>
                                                <div className="text-xl md:text-2xl font-black text-white font-mono">{uiState.score}</div>
                                            </div>
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
                                                <div className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Earned</div>
                                                <div className="text-xl md:text-2xl font-black text-amber-400 font-mono">+{uiState.inGameCoins}</div>
                                            </div>
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
                                                <div className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Kills</div>
                                                <div className="text-xl md:text-2xl font-black text-emerald-400 font-mono">{uiState.gameStats.kills}</div>
                                            </div>
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
                                                <div className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Max Combo</div>
                                                <div className="text-xl md:text-2xl font-black text-purple-400 font-mono">x{uiState.gameStats.maxCombo}</div>
                                            </div>
                                        </div>
                                        {uiState.gameMode !== 'battleroyale' && uiState.gameMode !== 'pvp1v1' && (
                                            <div className="w-full bg-slate-800 rounded-xl p-3 border border-slate-700 flex justify-between items-center px-6 -mt-2">
                                                <div className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest">Time Survived</div>
                                                <div className="text-lg font-black text-cyan-400 font-mono">{Math.floor(uiState.gameStats.timeSurvived / 60)}:{(uiState.gameStats.timeSurvived % 60).toString().padStart(2, '0')}</div>
                                            </div>
                                        )}

                                        {uiState.gameMode !== 'battleroyale' && uiState.gameMode !== 'pvp1v1' && globalProfile.tokens > 0 && (
                                            <button onClick={respawnWithToken} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase rounded-xl animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all text-sm md:text-base tracking-widest flex items-center justify-center gap-2 hover:-translate-y-1">
                                                <span>🎟️</span> Respawn (1 Token)
                                            </button>
                                        )}

                                        <button onClick={exitToMainMenu} className="text-white font-bold uppercase tracking-widest bg-slate-800 hover:bg-slate-700 px-8 py-4 rounded-xl w-full border border-slate-600 text-sm md:text-base transition-all shadow-lg active:scale-95">Back To HQ</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT PANEL: MODES & ACTION (Mobile & Desktop) */}
                        <div className="flex-1 flex flex-col justify-end max-w-md mx-auto w-full z-10 pb-4 md:pb-0 pointer-events-auto">

                            {!uiState.isGameOver && (
                                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-3xl p-5 md:p-8 shadow-2xl flex flex-col gap-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] ml-2">Select Operation</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setUiState(p => ({ ...p, showFriends: true }))} className="text-lg bg-slate-800 hover:bg-slate-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg border border-slate-600 relative">👥{(friendRequests.length > 0) && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{friendRequests.length}</span>}</button>
                                            <button onClick={() => setUiState(p => ({ ...p, showLeaderboard: true }))} className="text-lg bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-full w-8 h-8 flex items-center justify-center shadow-lg border border-amber-600/50">🏆</button>
                                            <button onClick={() => setUiState(p => ({ ...p, showServerSettings: true }))} className="text-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-full w-8 h-8 flex items-center justify-center shadow-lg border border-cyan-500/50" title="Server Settings">🔗</button>
                                            <button onClick={() => setUiState(p => ({ ...p, showSettings: true }))} className="text-lg bg-slate-800 hover:bg-slate-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg border border-slate-600">⚙️</button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <button onClick={() => setUiState(p => ({ ...p, gameMode: 'normal' }))} className={`group relative overflow-hidden rounded-2xl border ${uiState.gameMode === 'normal' ? 'border-cyan-400 bg-cyan-900/40 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}>
                                            <div className="p-4 flex flex-col items-center justify-center gap-2 relative z-10 h-full">
                                                <span className={`text-2xl ${uiState.gameMode === 'normal' ? 'text-cyan-400' : 'text-slate-400'}`}>🌍</span>
                                                <span className={`font-black uppercase tracking-wider text-[10px] md:text-sm ${uiState.gameMode === 'normal' ? 'text-white' : 'text-slate-300'}`}>Survival</span>
                                            </div>
                                        </button>

                                        <button onClick={() => setUiState(p => ({ ...p, gameMode: 'battleroyale', showServerBrowser: true, targetRoomId: null }))} className={`group relative overflow-hidden rounded-2xl border ${uiState.gameMode === 'battleroyale' ? 'border-red-400 bg-red-900/40 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}>
                                            <div className="p-4 flex flex-col items-center justify-center gap-2 relative z-10 h-full">
                                                <span className={`text-2xl ${uiState.gameMode === 'battleroyale' ? 'text-red-400' : 'text-slate-400'}`}>🪂</span>
                                                <span className={`font-black uppercase tracking-wider text-[10px] md:text-sm ${uiState.gameMode === 'battleroyale' ? 'text-white' : 'text-slate-300'}`}>B. Royale</span>
                                            </div>
                                        </button>

                                        <button onClick={() => setUiState(p => ({ ...p, gameMode: 'pvp1v1', showServerBrowser: true, targetRoomId: null }))} className={`group relative overflow-hidden rounded-2xl border ${uiState.gameMode === 'pvp1v1' ? 'border-purple-400 bg-purple-900/40 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}>
                                            <div className="p-4 flex flex-col items-center justify-center gap-2 relative z-10 h-full">
                                                <span className={`text-2xl ${uiState.gameMode === 'pvp1v1' ? 'text-purple-400' : 'text-slate-400'}`}>⚔️</span>
                                                <span className={`font-black uppercase tracking-wider text-[10px] md:text-sm ${uiState.gameMode === 'pvp1v1' ? 'text-white' : 'text-slate-300'}`}>1v1 Arena</span>
                                            </div>
                                        </button>

                                        <button onClick={() => setUiState(p => ({ ...p, gameMode: 'peaceful' }))} className={`group relative overflow-hidden rounded-2xl border ${uiState.gameMode === 'peaceful' ? 'border-emerald-400 bg-emerald-900/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}>
                                            <div className="p-4 flex flex-col items-center justify-center gap-2 relative z-10 h-full">
                                                <span className={`text-2xl ${uiState.gameMode === 'peaceful' ? 'text-emerald-400' : 'text-slate-400'}`}>🌿</span>
                                                <span className={`font-black uppercase tracking-wider text-[10px] md:text-sm ${uiState.gameMode === 'peaceful' ? 'text-white' : 'text-slate-300'}`}>Peaceful</span>
                                            </div>
                                        </button>

                                        <button onClick={() => setUiState(p => ({ ...p, gameMode: 'god' }))} className={`col-span-2 group relative overflow-hidden rounded-2xl border ${uiState.gameMode === 'god' ? 'border-amber-400 bg-amber-900/40 shadow-[0_0_30px_rgba(245,158,11,0.3)]' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-amber-500/50'}`}>
                                            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
                                            <div className="p-4 flex items-center justify-center gap-4 relative z-10 h-full">
                                                <span className={`text-2xl md:text-3xl ${uiState.gameMode === 'god' ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]' : 'text-slate-400 group-hover:text-amber-500/80'} transition-all`}>⚚</span>
                                                <div className="flex flex-col text-left">
                                                    <span className={`font-black uppercase tracking-widest text-xs md:text-lg leading-tight ${uiState.gameMode === 'god' ? 'text-white' : 'text-amber-100/50 group-hover:text-amber-200'}`}>God Mode</span>
                                                    <span className={`text-[9px] md:text-xs font-bold uppercase tracking-widest ${uiState.gameMode === 'god' ? 'text-amber-300' : 'text-slate-500 group-hover:text-amber-500/70'}`}>Authority Overridden</span>
                                                </div>
                                            </div>
                                        </button>

                                    </div>

                                    <div className="flex items-center gap-2 mt-2 w-full">
                                        {party.length > 0 && (
                                            <div className="flex gap-[-8px] -space-x-2">
                                                {party.map(p => (
                                                    <div key={p.uid} className={`w-8 h-8 rounded-full border-2 ${p.isReady ? 'border-emerald-500' : 'border-amber-500'} bg-slate-700 flex items-center justify-center relative shadow-lg`}>
                                                        {p.avatar ? <img src={p.avatar} alt="" className="w-full h-full object-cover rounded-full" /> : <span className="text-xs">👤</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <button onClick={() => { setUiState(p => ({ ...p, showFriends: true })); setFriendTab('all'); }} className="flex-1 py-3 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-400 rounded-xl font-bold uppercase tracking-widest text-[10px] md:text-sm transition-all shadow-md flex items-center justify-center gap-2">
                                            <span className="text-sm">➕</span> Party
                                        </button>
                                    </div>

                                    <button onClick={() => {
                                        if (party.length > 0 && party.some(p => p.isReady === false)) {
                                            alert("All party members must be Ready!");
                                            return;
                                        }
                                        if (uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') {
                                            setUiState(p => ({ ...p, showServerBrowser: true }));
                                            socketRef.current?.emit('br:get_rooms');
                                        } else {
                                            startGame(uiState.gameMode);
                                        }
                                    }} className="w-full mt-2 py-5 md:py-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border border-cyan-400/50 rounded-2xl font-black text-lg md:text-2xl uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] text-white relative overflow-hidden group">
                                        <span className="relative z-10">{uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1' ? 'FIND MATCH' : 'DEPLOY TANK'}</span>
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>

                                </div>
                            )}

                            {!uiState.isGameOver && (
                                <p className="text-slate-500/80 font-mono mt-4 tracking-widest text-[10px] md:text-xs z-10 uppercase text-center hidden md:block">Developed by Hafiz Wrg &bull; v1.0.6</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SERVER BROWSER MENU */}
            {uiState.showServerBrowser && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-cyan-500/50 w-[90%] md:w-[800px] shadow-[0_0_80px_rgba(6,182,212,0.2)] flex flex-col gap-6 max-h-[90vh] overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                            <h2 className="text-2xl font-black text-cyan-400 tracking-widest uppercase flex items-center gap-3">🌐 Server Browser</h2>
                            <div className="flex gap-4">
                                <button onClick={() => socketRef.current?.emit('br:get_rooms')} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-600 font-bold transition-colors">🔄 Refresh</button>
                                <button onClick={() => setUiState(p => ({ ...p, showServerBrowser: false }))} className="text-slate-500 hover:text-white text-xl font-bold bg-slate-800 hover:bg-red-500/20 px-4 rounded-xl border border-slate-600 hover:border-red-500/50 transition-colors">✕</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-12 text-xs font-black text-slate-500 uppercase tracking-widest px-4 pb-2 border-b border-slate-800 shrink-0">
                            <div className="col-span-5">Server Region ID</div>
                            <div className="col-span-1 text-center">Mode</div>
                            <div className="col-span-3 text-center">Status</div>
                            <div className="col-span-2 text-center">Players</div>
                            <div className="col-span-2 text-right">Action</div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {serverList.filter(srv => srv.mode === uiState.gameMode).length === 0 && <div className="text-center text-slate-500 font-bold mt-10">No active {uiState.gameMode === 'pvp1v1' ? 'PvP1v1' : 'Battle Royale'} servers found. Be the first to start a match!</div>}

                            {serverList.filter(srv => srv.mode === uiState.gameMode).map((srv, i) => (
                                <div key={srv.id} className="grid grid-cols-12 items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-cyan-500/30 transition-all">
                                    <div className="col-span-4 font-mono text-white text-sm truncate pr-4">{srv.id}</div>
                                    <div className="col-span-1 text-center font-bold text-slate-400 text-[10px] uppercase">
                                        {srv.mode === 'pvp1v1' ? <span className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1 py-0.5 rounded">1v1 PvP</span> : <span className="text-red-400 border border-red-500/30 bg-red-500/10 px-1 py-0.5 rounded">BR</span>}
                                    </div>
                                    <div className="col-span-3 text-center font-bold">
                                        <span className={`px-2 py-1 rounded text-[10px] uppercase ${srv.state === 'Waiting' ? 'bg-emerald-500/20 text-emerald-400' : srv.state === 'Starting' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{srv.state}</span>
                                    </div>
                                    <div className="col-span-2 text-center font-mono">
                                        <div className="text-cyan-400 font-bold">{srv.players} / {srv.max}</div>
                                        {srv.state !== 'Started' && <div className="text-[10px] text-emerald-400 font-bold tracking-tighter">✔️ {srv.readyCount} Ready</div>}
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <button disabled={srv.locked} onClick={() => {
                                            setUiState(p => ({ ...p, targetRoomId: srv.id, showServerBrowser: false }));
                                            if (party.length > 0) {
                                                const members = party.map(p => p.uid); members.push(auth.uid);
                                                socketRef.current?.emit('party:start_game', { partyMembers: members, mode: srv.mode || 'battleroyale' });
                                            } else {
                                                startGame(srv.mode || 'battleroyale', srv.id);
                                            }
                                        }} className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 px-4 rounded-lg uppercase text-xs w-full shadow-lg">Join</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="shrink-0 pt-4 border-t border-slate-800">
                            <button onClick={() => {
                                setUiState(p => ({ ...p, targetRoomId: null, showServerBrowser: false }));
                                if (party.length > 0) {
                                    const members = party.map(p => p.uid); members.push(auth.uid);
                                    socketRef.current?.emit('party:start_game', { partyMembers: members, mode: uiState.gameMode === 'pvp1v1' ? 'pvp1v1' : 'battleroyale' });
                                } else {
                                    startGame(uiState.gameMode === 'pvp1v1' ? 'pvp1v1' : 'battleroyale');
                                }
                            }} className="w-full bg-red-600/90 hover:bg-red-500 border border-red-400 py-4 rounded-xl font-black text-xl text-white uppercase shadow-[0_0_20px_rgba(220,38,38,0.4)]">🚀 Quick Match / Create Lobby</button>
                        </div>
                    </div>
                </div>
            )}

            {/* LEADERBOARD MENU */}
            {uiState.showLeaderboard && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-amber-500/50 w-[90%] max-w-lg shadow-[0_0_50px_rgba(245,158,11,0.15)] flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h2 className="text-2xl font-black text-amber-400 tracking-widest uppercase flex items-center gap-3">🏆 Top Players</h2>
                            <button onClick={() => setUiState(p => ({ ...p, showLeaderboard: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-12 text-xs font-bold text-slate-500 uppercase tracking-widest px-4 pb-2 border-b border-slate-800">
                                <div className="col-span-2">Rank</div>
                                <div className="col-span-5">Commander</div>
                                <div className="col-span-3 text-right">Score</div>
                                <div className="col-span-2 text-right">Kills</div>
                            </div>
                            {leaderboard.map((lb, i) => (
                                <div key={i} className="grid grid-cols-12 items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors">
                                    <div className={`col-span-2 font-black text-xl ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>#{i + 1}</div>
                                    <div className="col-span-5 font-bold text-white truncate">{lb.username}</div>
                                    <div className="col-span-3 text-right font-mono text-cyan-400 font-bold">{lb.highscore || lb.score || 0}</div>
                                    <div className="col-span-2 text-right font-mono text-emerald-400 font-bold">{lb.total_kills || lb.kills || 0}</div>
                                </div>
                            ))}
                            {/* Current Player Rank (Simulated) */}
                            <div className="grid grid-cols-12 items-center bg-amber-500/10 p-4 rounded-xl border border-amber-500/30 mt-4">
                                <div className="col-span-2 font-black text-xl text-amber-500">#99+</div>
                                <div className="col-span-5 font-bold text-white truncate">{auth.username || globalProfile.username} (You)</div>
                                <div className="col-span-3 text-right font-mono text-cyan-400 font-bold">{globalProfile.highscore}</div>
                                <div className="col-span-2 text-right font-mono text-emerald-400 font-bold">{globalProfile.totalKills}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FRIENDS MENU (Advanced) */}
            {uiState.showFriends && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-blue-500/50 w-[90%] max-w-lg shadow-[0_0_50px_rgba(59,130,246,0.15)] flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                            <h2 className="text-2xl font-black text-blue-400 tracking-widest uppercase flex items-center gap-3">👥 Connections</h2>
                            <button onClick={() => setUiState(p => ({ ...p, showFriends: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                        </div>

                        {/* Inspect Profile Modal */}
                        {inspectUser && (
                            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[90] pointer-events-auto">
                                <div className="bg-slate-900 border border-indigo-500/50 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative">
                                    <button onClick={() => setInspectUser(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
                                    <div className="flex flex-col items-center gap-4 text-center">
                                        <div className="w-24 h-24 rounded-full border-4 border-indigo-500 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.5)]">
                                            {inspectUser.avatar ? <img src={inspectUser.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-800 text-3xl">👤</div>}
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-white">{inspectUser.username}</div>
                                            <div className="text-sm font-mono text-indigo-400">UID: {inspectUser.uid}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 w-full mt-4">
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 uppercase font-bold tracking-widest">Kills</div>
                                                <div className="text-2xl font-black text-red-400 font-mono">{inspectUser.total_kills || 0}</div>
                                            </div>
                                            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 uppercase font-bold tracking-widest">Highscore</div>
                                                <div className="text-2xl font-black text-amber-400 font-mono">{inspectUser.highscore || 0}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => {
                                            openPrivateChat(inspectUser);
                                            setInspectUser(null);
                                        }} className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl uppercase tracking-widest border border-indigo-400/50">
                                            Send Direct Message
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Private Chat Modal */}
                        {privateChat && (
                            <div className="absolute bottom-6 right-6 w-80 bg-slate-900 border border-slate-600 rounded-2xl shadow-2xl z-[90] flex flex-col pointer-events-auto overflow-hidden">
                                <div className="bg-indigo-600 px-4 py-3 flex justify-between items-center text-white font-bold">
                                    <div className="flex items-center gap-2"><span className="text-xs">💬</span> {privateChat.name}</div>
                                    <button onClick={() => setPrivateChat(null)} className="text-white hover:text-slate-200">✕</button>
                                </div>
                                <div className="flex-1 p-4 flex flex-col gap-2 max-h-64 overflow-y-auto bg-slate-800/50">
                                    {privateChat.msgs.length === 0 && <div className="text-slate-500 text-xs text-center font-bold">Send a message to start chatting</div>}
                                    {privateChat.msgs.map((m, i) => (
                                        <div key={i} className={`flex flex-col ${m.sender === auth.username ? 'items-end' : 'items-start'}`}>
                                            <div className={`px-3 py-2 rounded-xl text-sm max-w-[80%] ${m.sender === auth.username ? 'bg-indigo-500 text-white rounded-tr-none' : 'bg-slate-700 text-white rounded-tl-none'}`}>
                                                {m.text}
                                            </div>
                                            <div className="text-[9px] text-slate-500 font-bold mt-1">{new Date(m.time).toLocaleTimeString()}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
                                    <input type="text" className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-400 outline-none" placeholder="Type..." value={privateChatMsg} onChange={e => setPrivateChatMsg(e.target.value)} onKeyDown={e => {
                                        if (e.key === 'Enter' && privateChatMsg.trim()) {
                                            const uName = auth.username || globalProfile.username;
                                            const uUid = auth.uid || globalProfile.uid;
                                            const newMsg = { fromUid: uUid, fromName: uName, toUid: privateChat.uid, text: privateChatMsg };
                                            socketRef.current?.emit('chat:private', newMsg);
                                            if (auth.isLoggedIn) supabase.from('private_chats').insert({ from_uid: auth.uid, to_uid: privateChat.uid, message: privateChatMsg }).then();
                                            setPrivateChat(prev => prev ? { ...prev, msgs: [...prev.msgs, { sender: uName, text: privateChatMsg, time: Date.now() }] } : prev);
                                            setPrivateChatMsg('');
                                        }
                                    }} />
                                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm font-bold" onClick={() => {
                                        if (privateChatMsg.trim()) {
                                            const uName = auth.username || globalProfile.username;
                                            const uUid = auth.uid || globalProfile.uid;
                                            const newMsg = { fromUid: uUid, fromName: uName, toUid: privateChat.uid, text: privateChatMsg };
                                            socketRef.current?.emit('chat:private', newMsg);
                                            if (auth.isLoggedIn) supabase.from('private_chats').insert({ from_uid: auth.uid, to_uid: privateChat.uid, message: privateChatMsg }).then();
                                            setPrivateChat(prev => prev ? { ...prev, msgs: [...prev.msgs, { sender: uName, text: privateChatMsg, time: Date.now() }] } : prev);
                                            setPrivateChatMsg('');
                                        }
                                    }}>Send</button>
                                </div>
                            </div>
                        )}
                        <div className="flex shrink-0 border-b border-slate-800 mt-4 mb-4">
                            <button onClick={() => setFriendTab('friends')} className={`flex-1 pb-2 font-bold uppercase tracking-wider text-sm transition-colors ${friendTab === 'friends' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>Friends ({friends.length})</button>
                            <button onClick={() => setFriendTab('requests')} className={`flex-1 pb-2 font-bold uppercase tracking-wider text-sm transition-colors ${friendTab === 'requests' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>Requests ({friendRequests.length})</button>
                            <button onClick={() => setFriendTab('all')} className={`flex-1 pb-2 font-bold uppercase tracking-wider text-sm transition-colors ${friendTab === 'all' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>All Players</button>
                        </div>

                        {/* Search Bar - only in ALL */}
                        {friendTab === 'all' && (
                            <div className="shrink-0 mb-4">
                                <input type="text" placeholder="Search Player by name or UID..." className="w-full bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-400 font-bold text-sm" value={addFriendInput} onChange={e => setAddFriendInput(e.target.value)} />
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
                            {/* TAB: FRIENDS */}
                            {friendTab === 'friends' && friends.map((f, i) => (
                                <div key={i} className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
                                        const idx = allPlayers.find(p => p.uid === f.uid);
                                        if (idx) setInspectUser(idx);
                                    }}>
                                        <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-500 overflow-hidden shrink-0">
                                            {allPlayers.find(p => p.uid === f.uid)?.avatar ? <img src={allPlayers.find(p => p.uid === f.uid)?.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-black">👤</div>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-lg">{f.name}</div>
                                            <div className={`text-xs font-bold mt-1 ${f.status === 'Online' ? 'text-emerald-400' : 'text-amber-400'}`}>• {f.status} {f.lastSeen ? `(Seen: ${new Date(f.lastSeen).toLocaleTimeString()})` : ''}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => openPrivateChat({ uid: f.uid, name: f.name })} className="text-xl px-2 text-indigo-400 hover:text-indigo-300" title="Private Chat">💬</button>
                                        <button onClick={async () => {
                                            if (window.confirm(`Unfriend ${f.name}?`)) {
                                                await supabase.from('friends').delete().match({ user_uid: auth.uid, friend_uid: f.uid });
                                                await supabase.from('friends').delete().match({ user_uid: f.uid, friend_uid: auth.uid });
                                                loadFriends();
                                            }
                                        }} className="text-xl px-2 text-red-400 hover:text-red-300" title="Remove Friend">✖</button>
                                        <button onClick={() => inviteToParty({ uid: f.uid, name: f.name })} disabled={party.some(p => p.uid === f.uid) || party.length >= 3} className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/50 px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                                            Invite Mode
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {friendTab === 'friends' && friends.length === 0 && <div className="text-center text-slate-500 py-8 font-bold text-sm">No friends added yet. Make some in "All Players"!</div>}

                            {/* TAB: REQUESTS */}
                            {friendTab === 'requests' && friendRequests.map((r, i) => (
                                <div key={i} className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-amber-500/30">
                                    <div>
                                        <div className="font-bold text-white text-lg">{r.name}</div>
                                        <div className="text-xs font-bold mt-1 text-amber-500">Wants to be friends</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={async () => {
                                            await supabase.from('friends').update({ status: 'accepted' }).match({ user_uid: r.uid, friend_uid: auth.uid });
                                            await supabase.from('friends').insert({ user_uid: auth.uid, friend_uid: r.uid, friend_name: r.name, status: 'accepted' });
                                            loadFriends();
                                        }} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-4 py-2 rounded-lg font-bold text-sm">Accept</button>
                                        <button onClick={async () => {
                                            await supabase.from('friends').delete().match({ user_uid: r.uid, friend_uid: auth.uid });
                                            loadFriends();
                                        }} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/50 px-4 py-2 rounded-lg font-bold text-sm">Reject</button>
                                    </div>
                                </div>
                            ))}
                            {friendTab === 'requests' && friendRequests.length === 0 && <div className="text-center text-slate-500 py-8 font-bold text-sm">No pending requests.</div>}

                            {/* TAB: ALL PLAYERS */}
                            {friendTab === 'all' && allPlayers.filter(p => p.username.toLowerCase().includes(addFriendInput.toLowerCase()) || p.uid.toLowerCase().includes(addFriendInput.toLowerCase())).map((f, i) => (
                                <div key={i} className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-500 overflow-hidden shrink-0 cursor-pointer" onClick={() => setInspectUser(f)}>
                                            {f.avatar ? <img src={f.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-black">👤</div>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-lg cursor-pointer hover:underline" onClick={() => setInspectUser(f)}>{f.username}</div>
                                            <div className={`text-xs font-bold mt-1 ${f.uid === auth.uid ? 'text-cyan-400' : 'text-slate-400'}`}>{f.uid === auth.uid ? '• (You)' : 'UID: ' + f.uid}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {f.uid !== auth.uid && !friends.find(x => x.uid === f.uid) && (
                                            <button onClick={async () => {
                                                addToast(`Send friend request to ${f.username}?`, 'invite', {
                                                    onAccept: async () => {
                                                        await supabase.from('friends').insert({ user_uid: auth.uid, friend_uid: f.uid, friend_name: f.username, status: 'pending' });
                                                        socketRef.current?.emit('friend:request', { user_uid: auth.uid, friend_uid: f.uid, user_name: auth.username || globalProfile.username });
                                                        addToast("Friend request sent", 'info');
                                                    }
                                                });
                                            }} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/50 px-3 py-2 rounded-lg font-bold text-sm transition-colors">
                                                + Add Friend
                                            </button>
                                        )}
                                        {f.uid !== auth.uid && (
                                            <button onClick={() => inviteToParty({ uid: f.uid, name: f.username })} disabled={party.some(p => p.uid === f.uid) || party.length >= 3} className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/50 px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                                                Invite
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {friendTab === 'all' && allPlayers.length === 0 && <div className="text-center text-slate-500 py-8 font-bold">No players found.</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* PROFILE MODAL */}
            {uiState.showProfile && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-[90%] max-w-md shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h2 className="text-xl font-bold text-cyan-400 tracking-widest uppercase">Commander Profile</h2>
                            <button onClick={() => setUiState(p => ({ ...p, showProfile: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                        </div>
                        <div className="flex flex-col gap-5">
                            <div className="flex justify-between items-end border-b border-slate-800 pb-4">
                                <div>
                                    <div className="flex items-center gap-4">
                                        <div className="relative group cursor-pointer w-16 h-16 rounded-full bg-slate-800 border-2 border-cyan-500 overflow-hidden">
                                            {globalProfile.avatar ? <img src={globalProfile.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center w-full h-full text-2xl">👤</div>}
                                            {auth.isLoggedIn && (
                                                <label className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest text-center">
                                                    Change
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => { saveProfile({ ...globalProfile, avatar: reader.result as string }); };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }} />
                                                </label>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-2xl font-black text-white">{auth.isLoggedIn ? auth.username : globalProfile.username}</div>
                                            <div className="text-sm font-mono text-cyan-500 mt-1">UID: {auth.isLoggedIn ? auth.uid : globalProfile.uid}</div>
                                        </div>
                                    </div>
                                </div>
                                {auth.isLoggedIn && <button onClick={logout} className="bg-red-500/20 text-red-400 border border-red-500/50 px-4 py-2 rounded-lg font-bold hover:bg-red-500/30 text-sm">Logout</button>}
                            </div>

                            {!auth.isLoggedIn && (
                                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
                                    <p className="text-amber-400 text-xs font-bold mb-3">You are playing as Guest. Your data might be lost.</p>
                                    <button onClick={() => { setUiState(p => ({ ...p, showProfile: false, showAuth: true })) }} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 rounded-lg text-sm">Register / Login Now</button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">High Score</div>
                                    <div className="text-2xl text-white font-mono font-black mt-1">{globalProfile.highscore}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">Total Kills</div>
                                    <div className="text-2xl text-emerald-400 font-mono font-black mt-1">{globalProfile.totalKills}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">Matches Played</div>
                                    <div className="text-2xl text-blue-400 font-mono font-black mt-1">{globalProfile.matches}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-amber-400/5"></div>
                                    <div className="text-[10px] text-amber-500/80 uppercase tracking-widest relative z-10 font-bold">Bank Balance</div>
                                    <div className="text-2xl text-amber-400 font-mono font-black mt-1 relative z-10">{globalProfile.coins} 🪙</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SETTINGS MENU */}
            {uiState.showSettings && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-[90%] max-w-md shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h2 className="text-xl font-bold text-cyan-400 tracking-widest uppercase">Settings</h2>
                            <button onClick={() => setUiState(p => ({ ...p, showSettings: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                        </div>

                        <div className="flex flex-col gap-6">
                            <div>
                                <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">Master Volume: <span className="text-white">{Math.round(settings.volume * 100)}%</span></label>
                                <input type="range" min="0" max="1" step="0.1" value={settings.volume} onChange={(e) => setSettings(p => ({ ...p, volume: parseFloat(e.target.value) }))} className="w-full accent-cyan-500" />
                            </div>

                            <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <label className="text-sm font-bold text-slate-300">Touch Mode</label>
                                <button onClick={() => setSettings(p => ({ ...p, isMobile: !p.isMobile }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.isMobile ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.isMobile ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                </button>
                            </div>

                            {settings.isMobile && (
                                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700">
                                    <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">Joystick Scale: <span className="text-white">{Math.round(settings.joystickScale * 100)}%</span></label>
                                    <input type="range" min="0.5" max="2" step="0.1" value={settings.joystickScale} onChange={(e) => setSettings(p => ({ ...p, joystickScale: parseFloat(e.target.value) }))} className="w-full accent-cyan-500" />
                                </div>
                            )}

                            <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <label className="text-sm font-bold text-slate-300">Show Minimap</label>
                                <button onClick={() => setSettings(p => ({ ...p, showMinimap: !p.showMinimap }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.showMinimap ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.showMinimap ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                </button>
                            </div>

                            <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <label className="text-sm font-bold text-slate-300">Graphics Level</label>
                                <select value={settings.graphics} onChange={(e) => setSettings(p => ({ ...p, graphics: e.target.value }))} className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-4 py-2 outline-none font-bold">
                                    <option value="high">High (Soft Shadows + FX)</option>
                                    <option value="low">Low (Performance Boost)</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <label className="text-sm font-bold text-slate-300">Particles & Effects</label>
                                <button onClick={() => setSettings(p => ({ ...p, particles: !p.particles }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.particles ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.particles ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                </button>
                            </div>

                            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700">
                                <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">UI Scale (HUD): <span className="text-white">{Math.round(settings.uiScale * 100)}%</span></label>
                                <input type="range" min="0.5" max="1.5" step="0.1" value={settings.uiScale} onChange={(e) => setSettings(p => ({ ...p, uiScale: parseFloat(e.target.value) }))} className="w-full accent-cyan-500" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* GOD MODE TANK SHOWCASE MODAL */}
            {showGodSelector && uiState.gameMode === 'god' && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex justify-center z-[100] pointer-events-auto overflow-y-auto custom-scrollbar py-10 md:py-20">
                    <div className="flex flex-col items-center gap-10 px-4 w-full max-w-7xl relative mx-auto h-max">
                        <div className="text-center w-full z-10">
                            <h2 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-500 to-amber-700 tracking-widest uppercase mb-2">
                                God Terminal
                            </h2>
                            <p className="text-amber-200/80 font-bold uppercase tracking-widest text-xs md:text-sm border-y border-amber-500/30 py-2 inline-block">Absolute Selection Authority Granted</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full z-10 pb-20">
                            {Object.values(CLASSES).map((cls: any) => {
                                const isEquipped = uiState.playerClass === cls.id;
                                return (
                                    <div key={cls.id} className={`relative flex flex-col bg-slate-900/80 border-2 rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 group ${isEquipped ? 'border-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.3)] bg-slate-800' : 'border-slate-700/80 hover:border-amber-500/60 hover:shadow-[0_20px_40px_rgba(245,158,11,0.15)] hover:bg-slate-800/90'}`}>

                                        <div className="absolute top-0 right-0 p-4 opacity-30 text-slate-500 font-mono font-black text-6xl group-hover:text-amber-500/10 transition-colors z-0 pointer-events-none">
                                            {cls.name.charAt(0)}
                                        </div>

                                        <div className="h-40 w-full flex items-center justify-center relative z-10 bg-slate-950/40 rounded-2xl mb-4 border border-slate-700/50">
                                            <div className="absolute inset-0 bg-amber-500/10 blur-2xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-500"></div>
                                            <img src={`/${cls.id === 'basic' ? 'biasa' : cls.id === 'warden' ? 'miaw' : cls.id === 'necromancer' ? 'necro' : 'tank_' + cls.id}.png`} className="w-28 h-28 object-contain filter drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300" />
                                        </div>

                                        <div className="flex flex-col gap-2 z-10 flex-1">
                                            <div className="text-xl font-black text-white uppercase tracking-wider">{cls.name}</div>
                                            <div className="text-xs font-bold text-slate-400 leading-relaxed flex-1 border-t border-slate-700/50 pt-2">{cls.desc}</div>
                                        </div>

                                        <button onClick={() => {
                                            setUiState(p => ({ ...p, playerClass: cls.id }));
                                            gameRef.current.player.class = cls.id;
                                            setShowGodSelector(false);
                                            playSound('levelup');
                                        }} className={`w-full mt-5 py-3 rounded-xl font-black text-xs md:text-sm uppercase tracking-widest transition-all z-10 border shadow-lg ${isEquipped ? 'bg-amber-500 text-amber-950 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-amber-600 hover:text-white hover:border-amber-400 active:scale-95'}`}>
                                            {isEquipped ? '✓ DEPLOYED' : 'TRANSFORM'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <button onClick={() => setShowGodSelector(false)} className="fixed top-6 right-6 w-12 h-12 bg-slate-800/80 backdrop-blur-sm border-2 border-slate-600 text-slate-300 hover:bg-red-600 hover:text-white hover:border-red-500 rounded-full flex items-center justify-center font-black text-xl shadow-2xl transition-all hover:scale-110 z-[110]">
                        ✕
                    </button>
                </div>
            )}

            {/* ARSENAL MENU */}
            {uiState.showShop && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className={`bg-slate-900 border border-amber-500/50 p-8 rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.15)] flex flex-col custom-scrollbar w-[90%] md:w-[900px] max-h-[90vh] overflow-y-auto`}>
                        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-amber-400 font-black text-3xl tracking-widest uppercase">Arsenal Terminal</h2>
                                <p className="text-slate-400 font-bold mt-1 text-sm">Money: <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded ml-1">{globalProfile.coins} 🪙</span> | Tokens: <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded ml-1">{globalProfile.tokens} 🎟️</span></p>
                            </div>
                            <button onClick={toggleShop} className="text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full w-12 h-12 flex items-center justify-center font-bold text-xl transition-colors">✕</button>
                        </div>

                        <div className="mb-8 bg-slate-800/50 border border-slate-700 rounded-2xl p-6 flex flex-col md:flex-row gap-4 justify-between items-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-emerald-500/5"></div>
                            <div className="relative z-10 text-center md:text-left">
                                <div className="text-emerald-400 font-black text-xl uppercase tracking-widest flex items-center gap-2 justify-center md:justify-start">🎟️ Respawn Token</div>
                                <div className="text-slate-400 text-sm mt-1">Use to instantly revive when destroyed. Cost: <span className="text-amber-400 font-bold">10 🪙</span></div>
                            </div>
                            <button disabled={globalProfile.coins < 10} onClick={() => {
                                if (globalProfile.coins >= 10) saveProfile({ ...globalProfile, coins: globalProfile.coins - 10, tokens: globalProfile.tokens + 1 });
                            }} className="relative z-10 w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 px-8 rounded-xl transition-colors text-lg uppercase tracking-wider shadow-lg">
                                Purchase Token
                            </button>
                        </div>

                        <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-4 ml-2">Tank Classes</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full z-10 pb-6">
                            {Object.values(CLASSES).map((cls: any) => {
                                const isGodMode = uiState.gameMode === 'god';
                                const isOwned = isGodMode || globalProfile.ownedClasses.includes(cls.id);
                                const isEquipped = uiState.playerClass === cls.id;
                                const canAfford = isGodMode || globalProfile.coins >= cls.price;

                                return (
                                    <div key={cls.id} className={`relative flex flex-col bg-slate-900/80 border-2 rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 group ${isEquipped ? 'border-cyan-400 shadow-[0_0_40px_rgba(6,182,212,0.3)] bg-slate-800' : 'border-slate-700/80 hover:border-cyan-500/60 hover:shadow-[0_20px_40px_rgba(6,182,212,0.15)] hover:bg-slate-800/90'}`}>
                                        <div className="absolute top-0 right-0 p-4 opacity-30 text-slate-500 font-mono font-black text-6xl group-hover:text-cyan-500/10 transition-colors z-0 pointer-events-none">
                                            {cls.name.charAt(0)}
                                        </div>

                                        <div className="h-40 w-full flex items-center justify-center relative z-10 bg-slate-950/40 rounded-2xl mb-4 border border-slate-700/50">
                                            <div className="absolute inset-0 bg-cyan-500/10 blur-2xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-500"></div>
                                            <img src={`/${cls.id === 'basic' ? 'biasa' : cls.id === 'warden' ? 'miaw' : cls.id === 'necromancer' ? 'necro' : 'tank_' + cls.id}.png`} className="w-28 h-28 object-contain filter drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300" />
                                        </div>

                                        <div className="flex flex-col gap-2 z-10 flex-1">
                                            <div className="flex justify-between items-center">
                                                <div className="text-xl font-black text-white uppercase tracking-wider">{cls.name}</div>
                                                <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${isOwned ? 'text-cyan-400 bg-cyan-500/10' : (canAfford ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10')}`}>
                                                    {isOwned ? (isGodMode ? 'FREE' : 'OWNED') : `🪙 ${cls.price}`}
                                                </div>
                                            </div>
                                            <div className="text-xs font-bold text-slate-400 leading-relaxed flex-1 border-t border-slate-700/50 pt-2 mt-1">{cls.desc}</div>
                                        </div>

                                        {/* Preview Skills (Icons only) */}
                                        <div className="flex gap-1 mt-3 mb-4 justify-center bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                            {cls.skills.map((s: any, i: number) => (
                                                <div key={i} className="w-8 h-8 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-400 group/skill relative cursor-help">
                                                    {i + 1}
                                                    <div className="absolute bottom-full mb-2 hidden group-hover/skill:block whitespace-nowrap bg-black text-white px-2 py-1 text-xs rounded z-10 border border-slate-700">
                                                        {s.name} <span className="text-amber-400">(Lv {(i + 1) * 15})</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button disabled={!isOwned && !canAfford} onClick={() => {
                                            if (isGodMode || globalProfile.ownedClasses.includes(cls.id)) {
                                                setUiState(p => ({ ...p, playerClass: cls.id }));
                                                gameRef.current.player.class = cls.id;
                                            } else if (globalProfile.coins >= cls.price) {
                                                saveProfile({ ...globalProfile, coins: globalProfile.coins - cls.price, ownedClasses: [...globalProfile.ownedClasses, cls.id] });
                                                setUiState(p => ({ ...p, playerClass: cls.id }));
                                                gameRef.current.player.class = cls.id;
                                            }
                                            playSound('levelup');
                                        }}
                                            className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all z-10 border shadow-lg ${isEquipped ? 'bg-cyan-500/20 text-cyan-300 cursor-default border-cyan-500/30' : isOwned ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.3)]' : canAfford ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'}`}
                                        > {isEquipped ? '✓ Equipped' : isOwned ? 'Equip' : 'Purchase'} </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* HUD UI */}
            {uiState.isPlaying && !uiState.isGameOver && (
                <div style={{ transform: `scale(${settings.uiScale || 1})`, transformOrigin: 'top left' }} className="absolute inset-x-0 top-0 bottom-0 pointer-events-none z-30 flex flex-col pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] pb-[var(--safe-bottom)]">
                    {/* KILL FEED */}
                    <div className="absolute top-24 right-6 flex flex-col gap-1 items-end z-30 pointer-events-none">
                        {killFeed.filter(k => Date.now() - k.time < 5000).map((k) => (
                            <div key={k.id} className="bg-slate-900/80 border border-slate-700 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-bold flex gap-2">
                                <span className="text-blue-400">{k.killer}</span> <span className="text-slate-400 text-[10px] mt-1">🔫</span> <span className="text-red-400">{k.victim}</span>
                            </div>
                        ))}
                    </div>

                    <div className="absolute top-6 right-6 flex flex-col items-end gap-3 z-40 pointer-events-none">
                        <div className="bg-slate-900/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-300 border border-slate-700/50 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${ping < 100 ? 'bg-emerald-400' : ping < 200 ? 'bg-amber-400' : 'bg-red-500'}`}></div> {ping} ms
                        </div>

                        {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && (
                            <div className="bg-red-900/60 backdrop-blur-md border border-red-500/50 rounded-2xl px-6 py-3 text-center shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse">
                                <div className="text-red-300 text-[10px] font-black uppercase tracking-widest mb-1">Alive</div>
                                <div className="text-3xl font-black text-white">{uiState.brAlive} <span className="text-red-400/50 text-xl">/ 30</span></div>
                            </div>
                        )}
                        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl px-6 py-3 text-right shadow-lg flex gap-4">
                            <div>
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Score</div>
                                <div className="text-xl font-mono font-black text-white">{uiState.score}</div>
                            </div>
                            <div className="border-l border-slate-700 pl-4">
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Coins</div>
                                <div className="text-xl font-mono font-black text-amber-400">{uiState.inGameCoins} 🪙</div>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full pointer-events-auto">
                            <button onClick={togglePause} className="bg-slate-800/80 hover:bg-slate-700 backdrop-blur-md border border-slate-600 rounded-xl text-white py-2 px-4 shadow-lg transition-all font-xl">
                                ⏸️
                            </button>
                        </div>
                    </div>

                    {/* Sector & Upgrades UI Layout (Right Side alignment) */}
                    <div className="absolute top-6 left-6 flex items-start gap-4 z-40">
                        <div className="flex flex-col gap-3 pointer-events-none">
                            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl px-5 py-2 flex flex-col items-center gap-1 min-w-[100px]">
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Sector</div>
                                <div className="text-sm font-bold text-emerald-400 uppercase tracking-wider">{uiState.biome}</div>
                            </div>

                            {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && (
                                <div className="bg-orange-900/60 backdrop-blur-md border border-orange-500/50 rounded-2xl px-5 py-2 flex flex-col items-center gap-1 min-w-[100px]">
                                    <div className="text-orange-300 text-[10px] font-black uppercase tracking-widest">Zone Closes</div>
                                    <div className="text-sm font-mono font-bold text-white">{uiState.brTimeLeft}s</div>
                                </div>
                            )}

                            {/* TANK SELECTOR FOR GOD MODE */}
                            {uiState.gameMode === 'god' && (
                                <div className="relative pointer-events-auto">
                                    <button
                                        onClick={() => setShowGodSelector(true)}
                                        className="bg-amber-950/40 backdrop-blur-md border border-amber-500/40 rounded-2xl p-2 pr-5 flex items-center gap-3 shadow-[0_0_25px_rgba(245,158,11,0.2)] hover:bg-amber-900/60 hover:border-amber-400 transition-all cursor-pointer group hover:scale-[1.03] active:scale-95"
                                    >
                                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl border border-amber-500/50 flex items-center justify-center relative overflow-hidden shrink-0 shadow-inner group-hover:bg-amber-500/30 transition-colors">
                                            <div className="absolute inset-0 bg-amber-400/20 blur-md animate-pulse" />
                                            <img src={`/${uiState.playerClass === 'basic' ? 'biasa' : uiState.playerClass === 'warden' ? 'miaw' : uiState.playerClass === 'necromancer' ? 'necro' : 'tank_' + uiState.playerClass}.png`} className="w-8 h-8 object-contain filter drop-shadow-lg relative z-10 group-hover:scale-125 transition-transform" />
                                        </div>
                                        <div className="flex flex-col text-left justify-center py-1">
                                            <span className="text-amber-400 text-[9px] font-black uppercase tracking-widest leading-none mb-1 drop-shadow-md">God Terminal</span>
                                            <span className="text-xs font-black text-white uppercase leading-none truncate max-w-[100px] group-hover:text-amber-100 transition-colors">{CLASSES[uiState.playerClass]?.name}</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>

                        {!settings.isMobile && (
                            <div className="flex flex-col gap-1 w-64 md:w-72 bg-slate-900/70 backdrop-blur-lg p-4 rounded-2xl border border-slate-700/50 shadow-2xl pointer-events-auto transition-all">
                                <div className="flex justify-between items-center border-b border-slate-700/80 pb-2">
                                    <span className="text-slate-200 font-bold text-sm">UPGRADES {uiState.statPoints > 0 && <span className="text-amber-400 animate-pulse font-mono bg-amber-400/10 px-2 py-0.5 rounded ml-2">Pts: {uiState.statPoints}</span>}</span>
                                    <button onClick={() => setUiState(p => ({ ...p, minimizeUpgrades: !p.minimizeUpgrades }))} className="text-slate-400 hover:text-white font-bold px-2 py-1 bg-slate-800 rounded">
                                        {uiState.minimizeUpgrades ? '+' : '-'}
                                    </button>
                                </div>

                                {!uiState.minimizeUpgrades && statsList.map((stat) => (
                                    <div key={stat.id} className="flex items-center gap-3 group py-1 mt-1">
                                        <button disabled={uiState.statPoints <= 0 || uiState.stats[stat.id] >= 8} onClick={() => handleUpgradeStat(stat.id)}
                                            className={`w-7 h-7 rounded flex items-center justify-center font-bold text-lg transition-all duration-200 ${uiState.statPoints > 0 && uiState.stats[stat.id] < 8 ? 'bg-slate-700 text-white hover:bg-white hover:text-slate-900 shadow-md cursor-pointer' : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'}`}>+</button>
                                        <div className="flex-1 text-[10px] text-slate-300 uppercase tracking-widest font-bold">{stat.name}</div>
                                        <div className="flex gap-[2px]">
                                            {[...Array(8)].map((_, idx) => (
                                                <div key={idx} className={`w-[8px] md:w-[12px] h-3.5 rounded-sm transition-all duration-300 ${idx < uiState.stats[stat.id] ? (uiState.gameMode === 'god' ? 'bg-cyan-400' : `${stat.color}`) : 'bg-slate-800 border border-slate-700'}`}></div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-xl flex flex-col items-center z-30 pointer-events-none">
                        <div className="text-white font-black mb-2 text-lg drop-shadow-md flex items-center gap-3 bg-slate-900/50 px-4 py-1 rounded-xl border border-slate-700/50 backdrop-blur">
                            Level {uiState.level} <span className="text-emerald-400 text-sm">{uiState.level >= 150 ? '(MAX)' : ''}</span>
                            <span className="text-cyan-300 font-mono">[{auth.isLoggedIn ? auth.username : globalProfile.username} - {CLASSES[uiState.playerClass]?.name}]</span>
                        </div>

                        {/* SPECIAL SKILLS (1 to 5) */}
                        <div className="flex gap-4 pointer-events-auto mb-4 bg-slate-900/30 p-2 rounded-3xl backdrop-blur-md border border-slate-700/30 shadow-2xl">
                            {CLASSES[uiState.playerClass]?.skills.map((skill: any, i: number) => {
                                const reqLvl = (i + 1) * 15;
                                const isUnlocked = uiState.level >= reqLvl || uiState.gameMode === 'god';
                                const cd = uiState.skillCooldowns[i] || 0;
                                const maxCd = skill.cd;
                                const pct = isUnlocked ? (cd > 0 ? (cd / maxCd) * 100 : 0) : 100;

                                return (
                                    <div key={i} className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl border-[3px] flex flex-col items-center justify-center overflow-hidden transition-all duration-300 select-none ${isUnlocked ? (cd <= 0 ? 'border-amber-400 bg-slate-800 shadow-[0_0_20px_rgba(245,158,11,0.5)] cursor-pointer hover:bg-slate-700 hover:-translate-y-2' : 'border-slate-700 bg-slate-900') : 'border-slate-800 bg-slate-950 opacity-40'}`}
                                        onMouseDown={() => isUnlocked && cd <= 0 && (gameRef.current.keys[(i + 1).toString()] = true)}
                                        onMouseUp={() => gameRef.current.keys[(i + 1).toString()] = false}
                                        onTouchStart={(e) => { e.preventDefault(); isUnlocked && cd <= 0 && (gameRef.current.keys[(i + 1).toString()] = true); }}
                                        onTouchEnd={(e) => { e.preventDefault(); gameRef.current.keys[(i + 1).toString()] = false; }}>

                                        <div className="absolute bottom-0 left-0 w-full bg-amber-500/20 shadow-[inset_0_-10px_20px_rgba(245,158,11,0.2)] mix-blend-overlay"></div>
                                        <div className="absolute bottom-0 left-0 w-full bg-slate-900/90 backdrop-blur-sm transition-all pointer-events-none" style={{ height: `${pct}%` }}></div>

                                        <span className="relative z-10 text-[10px] md:text-xs font-black text-amber-300 bg-black/60 px-1.5 py-0.5 rounded-md border border-amber-500/30 shadow-md">[{i + 1}]</span>
                                        <span className={`relative z-10 text-[9px] md:text-[10px] font-bold text-center leading-tight uppercase mt-1 px-1 drop-shadow-md ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>
                                            {isUnlocked ? skill.name : `Lvl ${reqLvl}`}
                                        </span>
                                        {cd > 0 && isUnlocked && (
                                            <span className="absolute inset-0 flex items-center justify-center font-black text-2xl md:text-3xl text-red-400 z-20 pointer-events-none drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] bg-black/50 backdrop-blur-[2px]">
                                                {Math.ceil(cd / 60)}s
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* LEVEL/XP BAR */}
                        <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700 h-6 rounded-full overflow-hidden relative shadow-lg p-1">
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono text-white z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                                {uiState.level >= 150 ? 'MAX LEVEL REACHED' : `${uiState.xp} / ${uiState.xpNeeded} XP`}
                            </div>
                            <div className="h-full rounded-full transition-all duration-300 ease-out relative"
                                style={{ width: `${uiState.level >= 150 ? 100 : (uiState.xp / uiState.xpNeeded) * 100}%`, backgroundColor: uiState.gameMode === 'god' ? '#22d3ee' : '#10b981' }}>
                                <div className="absolute inset-0 bg-white/20 rounded-full w-full h-1/2"></div>
                            </div>
                        </div>

                        {/* PLAYER HEALTH BAR */}
                        <div className="w-full mt-2 bg-slate-950/90 backdrop-blur-sm border border-red-900 h-6 rounded-full overflow-hidden relative shadow-[0_0_20px_rgba(220,38,38,0.4)] p-1">
                            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black font-mono text-white z-10 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] tracking-widest">
                                {Math.max(0, Math.floor(uiState.hp))} / {uiState.maxHp} HP
                            </div>
                            <div className="h-full rounded-full transition-all duration-200 ease-out relative flex items-center justify-end pr-1"
                                style={{ width: `${Math.min(100, Math.max(0, (uiState.hp / uiState.maxHp) * 100))}%`, backgroundImage: 'linear-gradient(to right, #7f1d1d, #dc2626, #f87171)' }}>
                                <div className="absolute inset-0 bg-white/20 rounded-full w-full h-1/2"></div>
                                <div className="w-2 h-full bg-white/60 blur-[2px] rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{
                __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.8); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 1); }
      `}} />
        </div>
    );
}
