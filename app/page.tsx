'use client';
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supa'; // Updated for build stability
import { io, Socket } from 'socket.io-client';

// === GAME CONSTANTS ===
const WORLD_SIZE = 8000;
const TILE_SIZE = 100;
const MAX_SHAPES = 80;
const MAX_PARTICLES = 50;
const MAX_DROPS = 40;
const VISIBILITY_MARGIN = 200;

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
    { type: 'dirt', textureId: 'dirt', hp: 10, xp: 10, size: 20, weight: 50, h: 25 },
    { type: 'wood', textureId: 'wood', hp: 30, xp: 25, size: 24, weight: 30, h: 30 },
    { type: 'stone', textureId: 'stone', hp: 100, xp: 100, size: 30, weight: 15, h: 40 },
    { type: 'tnt', textureId: 'tnt', hp: 20, xp: 50, size: 28, weight: 5, h: 35, isBomb: true },
    { type: 'diamond', textureId: 'diamond', hp: 500, xp: 500, size: 38, weight: 3, h: 50 },
    { type: 'emerald', textureId: 'emerald', hp: 1000, xp: 2000, size: 35, weight: 1, h: 55 },

    { type: 'creeper', textureId: 'creeper_local', hp: 30, xp: 40, size: 36, weight: 8, isBot: true, botType: 'melee', isBomb: true, h: 50, splatter: '#16a34a', framesConfig: [10, 10, 10] },
    { type: 'zombie', textureId: 'zolo', hp: 120, xp: 80, size: 36, weight: 6, isBot: true, botType: 'melee', h: 45, splatter: '#16a34a', framesConfig: [8, 8, 8] },
    { type: 'skeleton', textureId: 'skeleton_local', colorTop: '#E0E0E0', colorSide: '#BDBDBD', hp: 40, xp: 60, size: 32, weight: 5, isBot: true, botType: 'ranged', h: 42, splatter: '#e5e7eb', framesConfig: [12, 12, 12] },
    { type: 'slime', textureId: 'slime', hp: 80, xp: 50, size: 55, weight: 4, isBot: true, botType: 'melee', h: 40, splatter: '#22c55e', framesConfig: [8, 8, 8] },
    { type: 'spider', textureId: 'spid', hp: 50, xp: 70, size: 30, weight: 5, isBot: true, botType: 'climber', h: 20, splatter: '#991b1b', framesConfig: [8, 8, 8] },
    { type: 'golem', textureId: 'golem_local', colorTop: '#dddddd', colorSide: '#999999', hp: 500, xp: 300, size: 45, weight: 2, isBot: true, botType: 'neutral', h: 60, splatter: '#64748b', framesConfig: [12, 12, 12] },
    { type: 'enderman', textureId: 'ender', hp: 150, xp: 150, size: 38, weight: 4, isBot: true, botType: 'teleporter', h: 70, splatter: '#c084fc', framesConfig: [4, 4, 4] },
    { type: 'ghast', textureId: 'ghast', hp: 250, xp: 200, size: 70, weight: 3, isBot: true, botType: 'ranged', h: 80, splatter: '#f8fafc', framesConfig: [12, 12, 12] }
];

const CLASSES: Record<string, any> = {
    basic: {
        id: 'basic', name: 'Minecart', color: '#cbd5e1', price: 0, desc: 'Starter tank.', textureId: 'tank_basic', previewImg: '/biasa.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Overdrive', cd: 600, type: 'buff', buffType: 'overdrive', dur: 300 },
            { name: 'Heal Burst', cd: 900, type: 'heal', amt: 0.5 },
            { name: 'EMP Stun', cd: 1200, type: 'aoe', dmg: 50, rad: 400, effect: 'stun' },
            { name: 'Homing Missiles', cd: 800, type: 'projectile', bulletType: 'homing', count: 5 },
            { name: 'Orbital Strike', cd: 1800, type: 'aoe_delayed', dmg: 1500, rad: 500, delay: 60 }
        ]
    },
    machinegun: {
        id: 'machinegun', name: 'Rapid', color: '#fbbf24', price: 500, desc: 'Bullet hose. Inaccurate.', textureId: 'tank_machinegun', previewImg: '/gun.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Bullet Storm', cd: 600, type: 'buff', buffType: 'bulletstorm', dur: 250 },
            { name: 'Dash Strike', cd: 400, type: 'dash', power: 25 },
            { name: 'Bouncing Spray', cd: 900, type: 'projectile', bulletType: 'bounce', count: 16 },
            { name: 'Mine Trap', cd: 600, type: 'deploy', deployType: 'mine', count: 3 },
            { name: 'Auto Turret', cd: 1500, type: 'buff', buffType: 'turret', dur: 400 }
        ]
    },
    melee: {
        id: 'melee', name: 'Smasher', color: '#475569', price: 1800, desc: 'Spinning sawblades. Huge body damage.', textureId: 'tank_melee', previewImg: '/grund.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Earthquake', cd: 600, type: 'buff', buffType: 'earthquake', dur: 180 },
            { name: 'Hook Pull', cd: 500, type: 'projectile', bulletType: 'hook', count: 1 },
            { name: 'Saw Boomerang', cd: 400, type: 'projectile', bulletType: 'saw', count: 1 },
            { name: 'Reflect Shield', cd: 1000, type: 'buff', buffType: 'reflect', dur: 300 },
            { name: 'Blackhole', cd: 2000, type: 'deploy', deployType: 'blackhole', dur: 300 }
        ]
    },
    warden: {
        id: 'warden', name: 'Warden', color: '#0f766e', price: 2000, desc: 'Sonic Boom pierces all walls.', textureId: 'tank_warden', previewImg: '/miaw.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Sonic Wave', cd: 600, type: 'buff', buffType: 'sonicwave', dur: 100 },
            { name: 'Radar Scan', cd: 800, type: 'buff', buffType: 'radar', dur: 600 },
            { name: 'Echo Blast', cd: 500, type: 'projectile', bulletType: 'warden_sonic_wave', count: 5 },
            { name: 'Silence Area', cd: 1000, type: 'aoe_cloud', rad: 400, dur: 300, effect: 'silence' },
            { name: 'Wrath of Warden', cd: 1800, type: 'aoe', dmg: 1000, rad: 800 }
        ]
    },
    flamethrower: {
        id: 'flamethrower', name: 'Igniter', color: '#f97316', price: 2200, desc: 'Sprays close-range fire cone.', textureId: 'tank_flamethrower', previewImg: '/fire.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Inferno', cd: 600, type: 'buff', buffType: 'inferno', dur: 150 },
            { name: 'Lava Trail', cd: 900, type: 'buff', buffType: 'lava_trail', dur: 300 },
            { name: 'Napalm Bomb', cd: 800, type: 'projectile', bulletType: 'napalm', count: 1 },
            { name: 'Ring of Fire', cd: 1200, type: 'aoe_cloud', rad: 300, dur: 400 },
            { name: 'Meteor Swarm', cd: 1800, type: 'projectile', bulletType: 'meteor', count: 10 }
        ]
    },
    necromancer: {
        id: 'necromancer', name: 'Necromancer', color: '#d946ef', price: 3500, desc: 'Touch blocks to revive as loyal drones.', textureId: 'tank_necromancer', previewImg: '/necro.png', framesConfig: [1, 1, 1],
        skills: [
            { name: 'Mass Revive', cd: 800, type: 'summon', summonType: 'drone', count: 15 },
            { name: 'Life Drain', cd: 900, type: 'aoe_leech', rad: 400, dur: 200 },
            { name: 'Bone Spear', cd: 400, type: 'projectile', bulletType: 'sniper', count: 3 },
            { name: 'Drone Frenzy', cd: 1200, type: 'buff', buffType: 'drone_frenzy', dur: 300 },
            { name: 'Summon Giant', cd: 2000, type: 'summon', summonType: 'golem', count: 1 }
        ]
    },
};

const ENTITY_HP_CACHE: Record<string, number> = {};
ENTITIES.forEach(e => ENTITY_HP_CACHE[e.type] = e.hp);

// VISIBILITY_MARGIN already declared at top



const LeaderboardModal = ({ globalTop, setGlobalTop, setUiState, supabase, uiScale }: any) => {
    useEffect(() => {
        const fetchLeaderboard = async () => {
            const { data, error } = await supabase.from('players').select('username, highscore, total_kills, avatar, playtime, matches').order('highscore', { ascending: false }).limit(50);
            if (!error && data) setGlobalTop(data);
        };
        fetchLeaderboard();
    }, []);

    return (
        <div className="origin-center transition-all duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${uiScale})` }}>
            <div className="bg-slate-900/90 p-1 md:p-8 rounded-[2.5rem] border border-amber-500/30 w-full max-w-2xl shadow-[0_0_100px_rgba(245,158,11,0.1)] flex flex-col gap-6 max-h-[85vh] overflow-hidden backdrop-blur-2xl pointer-events-auto">
                <div className="flex justify-between items-center bg-gradient-to-r from-amber-500/10 to-transparent p-6 rounded-t-[2rem] shrink-0">
                    <div className="flex flex-col">
                        <h2 className="text-2xl md:text-4xl font-black text-amber-400 tracking-tighter uppercase flex items-center gap-3 italic">
                            <span className="text-3xl">🏆</span> Hall of Fame
                        </h2>
                        <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.3em] mt-1">Top 50 Legends Globally</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={async () => {
                            setGlobalTop(null);
                            const { data, error } = await supabase.from('players').select('username, highscore, total_kills, avatar, playtime, matches').order('highscore', { ascending: false }).limit(50);
                            if (!error && data) setGlobalTop(data);
                        }} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2 rounded-full font-black text-xs uppercase transition-all active:scale-90 shadow-[0_0_20px_rgba(245,158,11,0.3)]">Refresh</button>
                        <button onClick={() => setUiState((p: any) => ({ ...p, showLeaderboard: false }))} className="text-slate-400 hover:text-white bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center border border-slate-700 transition-colors">✕</button>
                    </div>
                </div>

                <div className="px-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-8">
                    {globalTop === null ? (
                        <div className="text-center text-slate-500 py-16 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin"></div>
                            <span className="font-black uppercase tracking-[0.2em] text-xs animate-pulse text-amber-500/50">Fetching Legends...</span>
                        </div>
                    ) : globalTop.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {globalTop.map((lb: any, i: number) => (
                                <div key={i} className={`flex justify-between items-center p-4 rounded-3xl border transition-all group relative overflow-hidden ${i === 0 ? 'bg-amber-500/10 border-amber-500/30' : i === 1 ? 'bg-slate-300/5 border-slate-300/20' : i === 2 ? 'bg-amber-700/10 border-amber-700/20' : 'bg-slate-800/40 border-slate-800/60'}`}>
                                    {i < 3 && <div className={`absolute top-0 right-0 w-16 h-16 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4 font-black text-6xl italic ${i === 0 ? 'text-amber-400' : 'text-slate-400'}`}>{i + 1}</div>}

                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="relative">
                                            <div className={`w-14 h-14 rounded-2xl rotate-3 flex items-center justify-center font-black italic text-xl ${i === 0 ? 'bg-amber-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-amber-700 text-amber-50' : 'bg-slate-700 text-slate-400'}`}>
                                                {i + 1}
                                            </div>
                                            {i === 0 && <div className="absolute -top-2 -left-2 text-2xl animate-bounce">👑</div>}
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-800 overflow-hidden border border-slate-700 group-hover:border-amber-400/50 transition-all shadow-xl">
                                                {lb.avatar ? <img src={lb.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 font-black text-slate-500">👤</div>}
                                            </div>
                                            <div>
                                                <div className="text-white font-black text-xl tracking-tight group-hover:text-amber-400 transition-colors uppercase italic">{lb.username}</div>
                                                <div className="flex gap-2 items-center mt-1">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{lb.matches} Matches</span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{lb.total_kills} Kills</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right relative z-10">
                                        <div className="text-amber-400 font-black text-2xl font-mono tabular-nums drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">{Math.floor(lb.highscore).toLocaleString()}</div>
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Global Score</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-500 italic font-bold">No legends recorded yet. Time to make history?</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function PixShotMega() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioBuffersRef = useRef<Record<string, AudioBuffer>>({});
    const texturesRef = useRef<Record<string, HTMLCanvasElement | HTMLImageElement>>({});
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const glProgramRef = useRef<WebGLProgram | null>(null);
    const glTexturesRef = useRef<Record<string, WebGLTexture>>({});
    const shadowTexRef = useRef<HTMLCanvasElement | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const glBufferRef = useRef<WebGLBuffer | null>(null);
    const glLocsRef = useRef<Record<string, any>>({});

    const [mounted, setMounted] = useState(false);
    // === AUTH & SOCIAL SYSTEM ===
    const [auth, setAuth] = useState({ isLoggedIn: false, username: '', uid: '', password: '' });
    const [friends, setFriends] = useState<{ uid: string, name: string, status: string, lastSeen?: number }[]>([
    ]);
    const [party, setParty] = useState<{ uid: string, name: string, isLeader?: boolean, isReady?: boolean, avatar?: string }[]>([]);
    const [addFriendInput, setAddFriendInput] = useState('');
    const [killFeed, setKillFeed] = useState<{ id: number, killer: string, victim: string, time: number }[]>([]);
    const [killNotify, setKillNotify] = useState<{ killer: string, victim: string, time: number } | null>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [globalTop, setGlobalTop] = useState<any[] | null>(null);
    const [onlineCount, setOnlineCount] = useState(1);
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
    const [socketUrl, setSocketUrl] = useState('http://localhost:3001');
    const [connStatus, setConnStatus] = useState<'Disconnected' | 'Connecting' | 'Connected' | 'Error'>('Disconnected');

    // === TOAST NOTIFICATION SYSTEM ===
    const [toasts, setToasts] = useState<{ id: number, message: string, type: 'info' | 'invite', extra?: any }[]>([]);

    const addToast = (message: string, type: 'info' | 'invite' = 'info', extra?: any) => {
        const id = Date.now() + Math.random();
        setToasts((prev: any) => [...prev, { id, message, type, extra }]);
        if (type !== 'invite') {
            setTimeout(() => setToasts((prev: any) => prev.filter((t: any) => t.id !== id)), 4000);
        }
    };

    const removeToast = (id: number) => {
        setToasts((prev: any) => prev.filter((t: any) => t.id !== id));
    };

    // === GLOBAL PROFILE (Local Storage) ===
    const [globalProfile, setGlobalProfile] = useState({
        username: 'Guest', uid: 'GUEST_0000', coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '', playtime: 0
    });

    const [serverList, setServerList] = useState<any[]>([]);

    // === REACT STATE ===
    const [uiState, setUiState] = useState<any>({
        isPlaying: false, isGameOver: false, isPaused: false, score: 0, inGameCoins: 0, level: 1, xp: 0, xpNeeded: 50,
        statPoints: 0, stats: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 } as Record<string, number>,
        playerClass: 'basic', dayTime: 0, showShop: false, showSettings: false, showProfile: false, showAuth: false, showLeaderboard: false, showFriends: false,
        minimizeUpgrades: false, gameMode: 'normal', biome: 'plains',
        skillCooldowns: [0, 0, 0, 0, 0], hp: 100, maxHp: 100,
        gameStats: { kills: 0, maxCombo: 0, timeSurvived: 0 },
        brAlive: 0, brMaxPlayers: 30, brTimeLeft: 300, brStarted: false, victory: false, triggerBR: false,
        showServerBrowser: false, brCountdownMsg: 'Waiting for players to be ready.', isPlayerReady: false, targetRoomId: null as string | null,
        lobbyPlayers: [] as { name: string, isReady: boolean, uid: string }[],
        showServerSettings: false, showLevelUp: false
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
    const [authInput, setAuthInput] = useState({ user: '', pass: '', avatar: '' });
    const [authView, setAuthView] = useState<'login' | 'register' | 'onboarding'>('login');
    const [onboardingData, setOnboardingData] = useState({ username: '', avatar: '' });

    // === MUTABLE GAME STATE ===
    const gameRef = useRef({
        isPaused: false, hasSynced: false,
        player: { x: WORLD_SIZE / 20, y: WORLD_SIZE / 20, vx: 0, vy: 0, size: 200, angle: 0, hp: 100, maxHp: 100, class: 'basic', cooldown: 0, dashCooldown: 0, skillCooldowns: [0, 0, 0, 0, 0], z: 0, idleTime: 0, activeUlt: null as string | null, ultDuration: 0, activeBuffs: { speed: 0, damage: 0, shield: 0, size: 0, turret: 0, drone_frenzy: 0, reflect: 0, radar: 0, lava_trail: 0 } },
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
        isGameOver: false,
        cachedWeights: null as any, cachedPrimaryBiome: null as any
    });

    useEffect(() => {
        setMounted(true);
        const ua = navigator.userAgent;
        const isAndroid = /Android/i.test(ua);
        const isMobile = isAndroid || /iPhone|iPad|iPod/i.test(ua);
        if (isMobile) {
            setSettings((p: any) => ({ ...p, isMobile: true }));
            gameRef.current.camera.zoom = 0.7;
        }

        // --- Handle OAuth Redirect Errors ---
        const handleOAuthErrors = () => {
            const hash = window.location.hash;
            const search = window.location.search;
            const params = new URLSearchParams(hash ? hash.substring(1) : search);
            const error = params.get('error_description') || params.get('error');
            if (error) {
                let msg = error.replace(/\+/g, ' ');
                if (msg.includes("user email")) {
                    msg = "Facebook didn't provide an email. Ensure 'email' permission is set to 'Advanced Access' in Meta Dashboard.";
                } else if (msg.toLowerCase().includes("internal email error")) {
                    msg = "Supabase Auth Error: Turn 'Skip email confirmation' ON in Facebook Provider settings.";
                } else if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many requests")) {
                    msg = "Email Rate Limit: Disable 'Confirm Email' in Supabase Auth Settings to skip email checks.";
                }
                addToast("Login Failed: " + msg, "info");
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        };
        handleOAuthErrors();

        // --- Calculate Socket URL on client mount ---
        let envUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let targetUrl = '';

        if (envUrl && envUrl.includes('.railway.internal')) {
            if (!isLocal) envUrl = undefined;
        }

        if (envUrl) {
            targetUrl = envUrl.replace('httpss://', 'https://');
        } else if (isLocal) {
            targetUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
        } else {
            targetUrl = window.location.origin;
        }
        setSocketUrl(targetUrl);

        // Update Guest UID with random on client
        setGlobalProfile(p => p.uid === 'GUEST_0000' ? { ...p, uid: `GUEST_${Math.floor(Math.random() * 10000)}` } : p);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const user = session.user;
                
                // Fetch real profile data
                const { data: profile } = await supabase.from('players').select('*').eq('uid', user.id).single();
                
                if (profile) {
                    setAuth({ isLoggedIn: true, username: profile.username || 'Player', uid: profile.uid, password: '' });
                    setUiState((p: any) => ({ ...p, showAuth: false }));
                    setGlobalProfile({
                        username: profile.username,
                        uid: profile.uid,
                        coins: profile.coins,
                        tokens: profile.tokens,
                        highscore: profile.highscore,
                        totalKills: profile.total_kills,
                        matches: profile.matches,
                        ownedClasses: profile.owned_classes || ['basic'],
                        avatar: profile.avatar || '',
                        playtime: profile.playtime || 0
                    });
                    socketRef.current?.emit('player:identify', { uid: profile.uid, name: profile.username, avatar: profile.avatar });
                } else {
                    // Skip Onboarding/Auth force if disabled
                    // setAuthView('onboarding');
                    // setUiState((p: any) => ({ ...p, showAuth: true }));
                }
            } else {
                const saved = localStorage.getItem('pixshot_profile');
                if (saved) {
                    try { setGlobalProfile((prev: any) => ({ ...prev, ...JSON.parse(saved) })); } catch (e) { }
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (uiState.showLeaderboard) {
            supabase.from('players').select('uid, username, highscore, total_kills').order('highscore', { ascending: false }).limit(50).then(({ data }: any) => {
                if (data) setLeaderboard(data);
            });
        }
    }, [uiState.showLeaderboard]);

    const loadFriends = async () => {
        if (!auth.uid) return;
        const { data } = await supabase.from('friends').select('*').eq('user_uid', auth.uid);
        if (data) {
            setFriends(data.filter((f: any) => f.status === 'accepted').map((f: any) => ({ uid: f.friend_uid, name: f.friend_name, status: 'Offline' })));
        }
        const { data: reqData } = await supabase.from('friends').select('*').eq('friend_uid', auth.uid).eq('status', 'pending');
        if (reqData) {
            setFriendRequests(reqData.map((f: any) => ({ uid: f.user_uid, name: f.user_uid }))); // Fallback name
        }
        socketRef.current?.emit('player:status', { uid: auth.uid, status: 'Online' });
    };

    useEffect(() => {
        if (uiState.triggerBR && !uiState.isPlaying) {
            setUiState((p: any) => ({ ...p, triggerBR: false }));
            startGame('battleroyale', uiState.targetRoomId || undefined);
        }
    }, [uiState.triggerBR, uiState.isPlaying, uiState.targetRoomId]);

    // === SUPABASE REALTIME SERVER BROWSER ===
    useEffect(() => {
        // Initial fetch from Supabase
        const fetchServers = async () => {
            const { data } = await supabase.from('game_servers').select('*');
            if (data) {
                setServerList(data.map((srv: any) => ({
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_servers' }, (payload: any) => {
                if (payload.eventType === 'INSERT') {
                    const srv = payload.new;
                    setServerList((prev: any) => [...prev, {
                        id: srv.room_id,
                        players: srv.players,
                        max: srv.max_players,
                        state: srv.status,
                        locked: srv.locked
                    }]);
                } else if (payload.eventType === 'UPDATE') {
                    const srv = payload.new;
                    setServerList((prev: any) => prev.map((s: any) => s.id === srv.room_id ? {
                        id: srv.room_id,
                        players: srv.players,
                        max: srv.max_players,
                        state: srv.status,
                        locked: srv.locked
                    } : s));
                } else if (payload.eventType === 'DELETE') {
                    setServerList((prev: any) => prev.filter((s: any) => s.id === payload.old.room_id));
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
            supabase.from('players').select('uid, username, avatar').then(({ data }: any) => {
                if (data) setAllPlayers(data);
            });
        }
    }, [uiState.showFriends, auth.uid]);

    // LOAD LEADERBOARD FALLBACK (If socket data is delayed)
    useEffect(() => {
        if (uiState.showLeaderboard && globalTop === null) {
            const timer = setTimeout(async () => {
                if (globalTop === null) {
                    const { data, error } = await supabase
                        .from('players')
                        .select('username, highscore, total_kills, avatar, playtime')
                        .order('highscore', { ascending: false })
                        .order('total_kills', { ascending: false })
                        .limit(20);
                    if (!error && data) setGlobalTop(data);
                    else if (error) setGlobalTop([]); // Error fallback to empty list
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [uiState.showLeaderboard, globalTop]);

    // Interval to keep online status active & Refresh all players list
    useEffect(() => {
        const loadAllPlayers = async () => {
            const { data, error } = await supabase.from('players').select('uid, username, coins, total_kills, matches, avatar, playtime, is_online, last_seen').limit(100);
            if (!error && data) setAllPlayers(data);
        };
        loadAllPlayers();

        const interval = setInterval(() => {
            if (auth.isLoggedIn && socketRef.current?.connected) {
                socketRef.current.emit('player:status', { uid: auth.uid, status: 'Online' });
            }
            // Optimization: Only refresh all players if friends menu or leaderboard is open
            if (uiStateRef.current.showFriends || uiStateRef.current.showLeaderboard) {
                loadAllPlayers();
            }
        }, 30000); // Increased interval to 30s to reduce lag
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

            // Presence Identify
            if (globalProfile.uid) {
                socketRef.current?.emit('player:identify', {
                    uid: globalProfile.uid,
                    name: globalProfile.username,
                    avatar: globalProfile.avatar
                });
            }
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

            if (window.location.hostname.includes('vercel.app') && !process.env.NEXT_PUBLIC_SOCKET_URL) {
                addToast('CRITICAL: NEXT_PUBLIC_SOCKET_URL is missing in Vercel settings!', 'info');
                console.error('You are running on Vercel but have not set the Railway Server URL in your Environment Variables.');
            }

            if (finalUrl.includes('.railway.internal')) {
                addToast('ERROR: Using INTERNAL Railway URL. Change to PUBLIC URL in Settings!', 'info');
                console.error('You are using a .internal Railway URL. Browsers cannot reach this. Use your Public Domain instead.');
            }

            if (error.message === 'xhr poll error' || error.message === 'websocket error') {
                console.warn('[Socket] Transport error. Check if server is running at:', finalUrl);
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

            setUiState((p: any) => ({
                ...p,
                brAlive: data.aliveCount,
                brMaxPlayers: data.maxPlayers || 30,
                isPlayerReady: false,
                brCountdownMsg: data.countingDown ? 'Starting in 10s...' : (data.aliveCount < 2 ? 'Waiting for players... (Min 2)' : 'Waiting for players to be ready.'),
                lobbyPlayers: allLobbyPlayers
            }));
        });
        socketRef.current.on('br:player_joined', (data: any) => {
            gameRef.current.brPlayers.push(data.pData);
            setUiState((p: any) => ({
                ...p,
                brAlive: data.aliveCount,
                brMaxPlayers: data.maxPlayers || 30,
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
                setUiState((p: any) => ({ ...p, isPlayerReady: data.isReady, lobbyPlayers: p.lobbyPlayers.map((lp: any) => (lp.uid === auth.uid || lp.uid === globalProfile.uid) ? { ...lp, isReady: data.isReady } : lp) }));
            } else {
                setUiState((p: any) => ({ ...p, lobbyPlayers: p.lobbyPlayers.map((lp: any) => lp.uid === data.uid ? { ...lp, isReady: data.isReady } : lp) }));
            }
        });

        socketRef.current.on('br:countdown_msg', (data: any) => {
            setUiState((p: any) => ({ ...p, brCountdownMsg: data.text }));
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
                setUiState((p: any) => ({
                    ...p,
                    brAlive: data.aliveCount,
                    lobbyPlayers: p.lobbyPlayers.filter((lp: any) => lp.uid !== data.uid)
                }));
            }
            syncUI();
        });
        socketRef.current.on('br:bullet', (data: any) => {
            gameRef.current.bullets.push({ ...data, isEnemy: true });
        });
        socketRef.current.on('br:zone_update', (data: any) => {
            gameRef.current.safeZone = data.safeZone;
            setUiState((p: any) => {
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
            const kData = { id: Date.now(), killer: data.killerName, victim: 'You', time: Date.now() };
            setKillFeed((prev: any) => [...prev, kData]);
            setKillNotify({ killer: data.killerName, victim: 'You', time: Date.now() });
            processGameOver();
        });
        socketRef.current.on('br:winner', (data: any) => {
            if (data.winner.socketId === socketRef.current?.id) {
                setUiState((p: any) => ({ ...p, isGameOver: true, victory: true }));
                playSound('levelup');
            }
        });
        socketRef.current.on('br:kill_feed', (data: any) => {
            const kData = { id: Math.random(), killer: data.killerName, victim: data.victimName, time: Date.now() };
            setKillFeed((prev: any) => [...prev, kData]);
            setKillNotify({ killer: data.killerName, victim: data.victimName, time: Date.now() });
            setUiState((p: any) => ({ ...p, brAlive: data.aliveCount }));
        });

        socketRef.current.on('stats:global_top', (data: any[]) => {
            setGlobalTop(data);
        });

        socketRef.current.on('stats:online_count', (count: number) => {
            setOnlineCount(count);
        });
        socketRef.current.on('friend:invite_received', (data: any) => {
            if (data.toUid === auth.uid) {
                addToast(`${data.fromName} invited you to party`, 'invite', {
                    onAccept: () => {
                        socketRef.current?.emit('friend:accept', { fromUid: data.fromUid, toUid: auth.uid, toName: auth.username, toAvatar: globalProfile.avatar });
                        setParty((prev: any) => { if (!prev.find((p: any) => p.uid === data.fromUid)) return [...prev, { uid: data.fromUid, name: data.fromName, isLeader: true }]; return prev; });
                        addToast(`Joined ${data.fromName}'s party!`, 'info');
                    }
                });
            }
        });
        socketRef.current.on('friend:accepted', (data: any) => {
            if (data.fromUid === auth.uid) {
                setParty((prev: any) => { if (!prev.find((p: any) => p.uid === data.toUid)) return [...prev, { uid: data.toUid, name: data.toName, isLeader: false, avatar: data.toAvatar }]; return prev; });
            }
        });

        socketRef.current.on('friend:request_received', (data: any) => {
            if (data.friend_uid === auth.uid) {
                setFriendRequests((prev: any) => { if (!prev.find((p: any) => p.uid === data.user_uid)) return [...prev, { uid: data.user_uid, name: data.user_name }]; return prev; });
            }
        });

        socketRef.current.on('player:status_update', (data: any) => {
            setFriends((prev: any) => prev.map((f: any) => f.uid === data.uid ? { ...f, status: data.status, lastSeen: data.lastSeen } : f));
        });

        socketRef.current.on('party:state_update', (data: any) => {
            if (data.kickUid === auth.uid) {
                setParty([]); addToast("You have been kicked from the party.", 'info');
            } else if (data.uid !== undefined) {
                setParty((prev: any) => prev.map((p: any) => p.uid === data.uid ? { ...p, isReady: data.isReady } : p));
            }
        });

        socketRef.current.on('party:trigger_start', (data: any) => {
            if (data.partyMembers && data.partyMembers.includes(auth.uid)) {
                setUiState((p: any) => ({ ...p, triggerBR: true }));
            }
        });

        socketRef.current.on('chat:private_receive', (data: any) => {
            if (data.toUid === auth.uid) {
                setPrivateChat((prev: any) => {
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
            await supabase.from('players').update({
                coins: newProfile.coins,
                tokens: newProfile.tokens,
                highscore: newProfile.highscore,
                total_kills: newProfile.totalKills,
                matches: newProfile.matches,
                owned_classes: newProfile.ownedClasses,
                avatar: newProfile.avatar,
                playtime: newProfile.playtime
            }).eq('uid', auth.uid);
        } else {
            localStorage.setItem('pixshot_profile', JSON.stringify(newProfile));
        }
    };

    const handleFacebookLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'facebook',
            options: {
                redirectTo: window.location.origin,
                scopes: 'email,public_profile'
            }
        });
        
        if (error) {
            if (error.message.includes("provider is not enabled")) {
                addToast("Supabase Config: Please enable Facebook Provider in your Dashboard.", 'info');
            } else {
                addToast("Facebook Login Error: " + error.message, 'info');
            }
        }
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>, isOnboarding = false) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 128; // Smaller for avatars
                    let w = img.width;
                    let h = img.height;
                    if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } }
                    else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, w, h);
                    const shrunkBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    if (isOnboarding) setOnboardingData(p => ({ ...p, avatar: shrunkBase64 }));
                    else setAuthInput(p => ({ ...p, avatar: shrunkBase64 }));
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const completeOnboarding = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!onboardingData.username) { addToast("Please enter a username", "info"); return; }

        const { error } = await supabase.from('players').insert([{
            uid: user.id,
            username: onboardingData.username,
            avatar: onboardingData.avatar || user.user_metadata?.avatar_url || '',
            coins: 0, tokens: 0, highscore: 0, total_kills: 0, matches: 0, owned_classes: ['basic']
        }]);

        if (!error) {
            addToast("Profile created!", "info");
            window.location.reload(); // Quickest way to re-trigger auth state with profile
        } else {
            addToast("Error creating profile. Username might be taken.", "info");
        }
    };

    const handleLoginRegister = async (isRegister: boolean) => {
        if (!authInput.user || !authInput.pass) {
            addToast("Username and Password are required", 'info');
            return;
        }
        
        const email = authInput.user.includes('@') ? authInput.user : `${authInput.user}@pixshot.internal`;

        if (isRegister) {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password: authInput.pass,
            });

            if (authError) {
                addToast("Register Error: " + authError.message, 'info');
                return;
            }

            if (authData.user) {
                await supabase.from('players').insert([{ 
                    uid: authData.user.id, 
                    username: authInput.user.split('@')[0], 
                    coins: 0, tokens: 0, highscore: 0, total_kills: 0, matches: 0, owned_classes: ['basic'],
                    avatar: authInput.avatar || ''
                }]);
                addToast("Success! Please check your email or Login now.", 'info');
                setAuthView('login');
            }
        } else {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password: authInput.pass,
            });

            if (authError) {
                addToast("Login Failed: " + authError.message, 'info');
                return;
            }
        }
    };

    const playAsGuest = () => {
        setUiState((p: any) => ({ ...p, showAuth: false }));
        addToast("Playing as Guest. Progress will not be saved to account.", 'info');
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setAuth({ isLoggedIn: false, username: '', uid: '', password: '' });
        localStorage.removeItem('pixshot_auth');
        setGlobalProfile({ username: 'Guest', uid: `GUEST_${Math.floor(Math.random() * 10000)}`, coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '', playtime: 0 });
        setUiState((p: any) => ({ ...p, showAuth: false, showProfile: false }));
        addToast("Logged out", 'info');
    }

    const syncCoinsToProfile = () => {
        if (gameRef.current.sessionCoins > 0) {
            saveProfile({ ...globalProfile, coins: globalProfile.coins + gameRef.current.sessionCoins });
            gameRef.current.sessionCoins = 0;
        }
    };

    const toggleShop = () => {
        if (!uiState.showShop) syncCoinsToProfile();
        setUiState((p: any) => ({ ...p, showShop: !p.showShop }));
    };

    const togglePause = () => {
        const newPauseState = !gameRef.current.isPaused;
        gameRef.current.isPaused = newPauseState;
        setUiState((p: any) => ({ ...p, isPaused: newPauseState }));
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

        setUiState((prev: any) => ({ ...prev, isGameOver: true, inGameCoins: 0, gameStats: { kills: state.kills, maxCombo: state.combo.max, timeSurvived: survived } }));
        socketRef.current?.emit('br:died');
    };

    const exitToMainMenu = () => {
        if (!uiState.isGameOver) processGameOver();
        gameRef.current.isPaused = false;
        setParty([]); // leave party on exit
        setUiState((p: any) => ({ ...p, isPlaying: false, isPaused: false, isGameOver: false }));
    };

    const respawnWithToken = () => {
        if (globalProfile.tokens > 0) {
            saveProfile({ ...globalProfile, tokens: globalProfile.tokens - 1 });
            gameRef.current.player.hp = gameRef.current.player.maxHp;
            setUiState((p: any) => ({ ...p, isGameOver: false }));
        }
    }

    const inviteToParty = (friend: any) => {
        if (!party.find((p: any) => p.uid === friend.uid)) {
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
                setPrivateChat((prev: any) => prev ? {
                    ...prev,
                    msgs: data.map((m: any) => ({ sender: m.from_uid === auth.uid ? auth.username : friendUser.name || friendUser.username, text: m.message, time: new Date(m.created_at).getTime() }))
                } : prev);
            }
        }
    };

    const hexToRgb = (hex: string) => {
        if (!hex) return [1, 1, 1, 1];
        if (hex.startsWith('rgba')) {
            const parts = hex.match(/[\d.]+/g);
            return parts ? parts.map((p, i) => i < 3 ? parseFloat(p) / 255 : parseFloat(p)) : [1, 1, 1, 1];
        }
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
            1.0
        ] : [1, 1, 1, 1];
    };

    const drawGL = (texId: string | null, x: number, y: number, w: number, h: number, angle: number, alpha: number, ux = 0, uy = 0, uw = 1, uh = 1, color = [1, 1, 1, 1]) => {
        const gameGl = glRef.current;
        const program = glProgramRef.current;
        const tex = texId ? glTexturesRef.current[texId] : null;
        const buffer = glBufferRef.current;
        const locs = glLocsRef.current;
        if (!gameGl || !program || !buffer || !locs || locs.pos === -1) return;

        gameGl.useProgram(program);
        gameGl.uniform2f(locs.res, gameGl.canvas.width, gameGl.canvas.height);
        gameGl.uniform4fv(locs.col, new Float32Array(color));
        gameGl.uniform1i(locs.useTex, tex ? 1 : 0);
        gameGl.uniform1i(locs.img, 0);

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const hw = w / 2;
        const hh = h / 2;

        const corners = [
            { lx: -hw, ly: -hh, u: ux, v: uy },
            { lx: hw, ly: -hh, u: ux + uw, v: uy },
            { lx: -hw, ly: hh, u: ux, v: uy + uh },
            { lx: hw, ly: hh, u: ux + uw, v: uy + uh }
        ];

        const data = new Float32Array(16);
        corners.forEach((c, i) => {
            data[i * 4] = x + (c.lx * cos - c.ly * sin);
            data[i * 4 + 1] = y + (c.lx * sin + c.ly * cos);
            data[i * 4 + 2] = c.u;
            data[i * 4 + 3] = c.v;
        });

        gameGl.bindBuffer(gameGl.ARRAY_BUFFER, buffer);
        gameGl.bufferData(gameGl.ARRAY_BUFFER, data, gameGl.DYNAMIC_DRAW);

        gameGl.enableVertexAttribArray(locs.pos);
        gameGl.vertexAttribPointer(locs.pos, 2, gameGl.FLOAT, false, 4 * 4, 0);
        gameGl.enableVertexAttribArray(locs.tex);
        gameGl.vertexAttribPointer(locs.tex, 2, gameGl.FLOAT, false, 4 * 4, 2 * 4);
        gameGl.vertexAttrib1f(locs.alpha, alpha);

        if (tex) {
            gameGl.activeTexture(gameGl.TEXTURE0);
            gameGl.bindTexture(gameGl.TEXTURE_2D, tex);
        }
        gameGl.drawArrays(gameGl.TRIANGLE_STRIP, 0, 4);
    };

    const uploadTextureToGL = (id: string, element: HTMLCanvasElement | HTMLImageElement) => {
        const gameGl = glRef.current;
        if (!gameGl) return;
        if (glTexturesRef.current[id]) gameGl.deleteTexture(glTexturesRef.current[id]);

        const tex = gameGl.createTexture();
        gameGl.bindTexture(gameGl.TEXTURE_2D, tex);
        gameGl.texImage2D(gameGl.TEXTURE_2D, 0, gameGl.RGBA, gameGl.RGBA, gameGl.UNSIGNED_BYTE, element);

        const tileable = ['grass', 'sand', 'ice', 'water', 'netherrack', 'bedrock', 'dirt', 'wood', 'stone'].includes(id);
        const wrap = tileable ? gameGl.REPEAT : gameGl.CLAMP_TO_EDGE;

        gameGl.texParameteri(gameGl.TEXTURE_2D, gameGl.TEXTURE_WRAP_S, wrap);
        gameGl.texParameteri(gameGl.TEXTURE_2D, gameGl.TEXTURE_WRAP_T, wrap);
        gameGl.texParameteri(gameGl.TEXTURE_2D, gameGl.TEXTURE_MIN_FILTER, tileable ? gameGl.NEAREST : gameGl.LINEAR);
        gameGl.texParameteri(gameGl.TEXTURE_2D, gameGl.TEXTURE_MAG_FILTER, tileable ? gameGl.NEAREST : gameGl.LINEAR);
        glTexturesRef.current[id] = tex;
    };
    useEffect(() => {
        const types = ['dirt', 'wood', 'stone', 'diamond', 'emerald', 'soulSand', 'sand', 'ice', 'water', 'netherrack', 'bedrock', 'tnt', 'tex_warden'];
        types.forEach(t => {
            const tex = generateTexture(t);
            texturesRef.current[t] = tex;
            uploadTextureToGL(t, tex);
        });
        shadowTexRef.current = createShadowTexture();
        uploadTextureToGL('shadow', shadowTexRef.current);

        const loadLocalTexture = (id: string, src: string) => {
            const img = new Image(); img.src = src;
            img.onload = () => {
                texturesRef.current[id] = img;
                uploadTextureToGL(id, img);
            };
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

        loadLocalTexture('tank_basic', '/biasa.png');
        loadLocalTexture('tank_warden', '/miaw.png');
        loadLocalTexture('tank_flamethrower', '/fire.png');
        loadLocalTexture('tank_melee', '/grund.png');
        loadLocalTexture('tank_machinegun', '/gun.png');
        loadLocalTexture('tank_necromancer', '/necro.png');

        //visual di arsenal
        loadLocalTexture('wiev', '/biasa.png');
        loadLocalTexture('warden', '/miaw.png');
        loadLocalTexture('flamethrower', '/fire.png');
        loadLocalTexture('melee', '/grund.png');
        loadLocalTexture('machinegun', '/gun.png');
        loadLocalTexture('necromancer', '/necro.png');

        if (!audioCtxRef.current) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) { audioCtxRef.current = new AudioContextClass(); }
        }
        // Enhanced Mobile Detection & Default Scaling
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 1024);
        const isAndroid = /Android/i.test(navigator.userAgent);
        setSettings((prev: any) => ({
            ...prev,
            isMobile: isMobile,
            joystickScale: isMobile ? 1.2 : 1.0,
            uiScale: isAndroid ? 0.8 : (isMobile ? 0.85 : 1.0)
        }));

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
            player: { 
                ...gameRef.current.player, 
                x: currentWS / 2, 
                y: currentWS / 2, 
                vx: 0, vy: 0, size: 200, hp: isGod ? 99999 : 100, maxHp: isGod ? 99999 : 100, 
                class: uiState.playerClass, z: 0, skillCooldowns: [0, 0, 0, 0, 0], activeUlt: null, ultDuration: 0, 
                activeBuffs: { speed: 0, damage: 0, shield: 0, size: 0, turret: 0, drone_frenzy: 0, reflect: 0, radar: 0, lava_trail: 0 } 
            },
            statLevels: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 },
            statPoints: isGod ? 99 : (isBR ? 20 : 0), score: 0, level: isGod ? 150 : (isBR ? 20 : 1), xp: 0, xpNeeded: 50, sessionCoins: 0,
            bullets: [], shapes: [], env: [], particles: [], aoeClouds: [], drops: [], damageTexts: [], decals: [], powerups: [], drones: [],
            brPlayers: [],
            safeZone: { x: currentWS / 2, y: currentWS / 2, radius: isBR ? currentWS / 2 : currentWS, targetRadius: isBR ? currentWS / 2 : currentWS, timer: isBR ? 1800 : 0 },
            camera: { x: currentWS / 2, y: currentWS / 2, zoom: isBR ? 0.5 : 1.0, shake: 0 },
            weather: { type: 'clear', timer: 1000, flash: 0 },
            gameMode: mode, combo: { count: 0, timer: 0, max: 0 },
            sessionStart: Date.now(), kills: 0,
            isGameOver: false, hasSynced: false,
            cachedWeights: null, cachedPrimaryBiome: null
        };

        const state = gameRef.current;

        for (let i = 0; i < 150; i++) {
            let type = Math.random() < 0.6 ? 'tree' : 'house';
            state.env.push({
                type: type,
                x: Math.random() * currentWS,
                y: Math.random() * currentWS,
                r: type === 'house' ? 150 : 60,
                h: type === 'house' ? 200 : 150,
                maxHp: 1000 // Just in case
            });
        }

        if (isBR || is1v1) {
            const tgtRoom = targetRoomId || uiState.targetRoomId;
            if (socketRef.current) {
                socketRef.current.emit('br:join', { uid: auth.isLoggedIn ? auth.uid : globalProfile.uid, name: auth.isLoggedIn ? auth.username : globalProfile.username, class: uiState.playerClass, mode: mode, roomId: tgtRoom });
            }
        }

        syncUI();
        setUiState((prev: any) => ({ ...prev, isPlaying: true, isPaused: false, isGameOver: false, victory: false, showShop: false, showSettings: false, showProfile: false, showLeaderboard: false, showFriends: false, showServerBrowser: false, minimizeUpgrades: false, gameMode: mode, brAlive: isBR && prev.brAlive === 0 ? 30 : prev.brAlive }));
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
        gameRef.current.camera.shake = 2.0; // Fixed intensity as requested
        gameRef.current.aoeClouds.push({ x: ex, y: ey, r: radius, life: 15, type: 'explosion' });
        const state = gameRef.current;

        const radSq = radius * radius;
        state.shapes.forEach(s => {
            const dx = s.x - ex;
            const dy = s.y - ey;
            if (dx * dx + dy * dy < radSq) {
                s.hp -= dmg; state.damageTexts.push({ x: s.x, y: s.y, text: Math.floor(dmg), life: 30 });
            }
        });
        state.brPlayers.forEach((p: any) => {
            const dx = p.x - ex;
            const dy = p.y - ey;
            if (dx * dx + dy * dy < radSq) {
                state.damageTexts.push({ x: p.x, y: p.y, text: Math.floor(dmg), life: 30 });
                if (socketRef.current && (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1')) {
                    socketRef.current.emit('br:hit', { targetSocketId: p.socketId, damage: dmg, isExplosion: true });
                }
            }
        });
        const dxP = state.player.x - ex;
        const dyP = state.player.y - ey;
        if (state.gameMode !== 'god' && dxP * dxP + dyP * dyP < radSq) {
            if (state.player.activeBuffs.shield <= 0) state.player.hp -= dmg;
            state.damageTexts.push({ x: state.player.x, y: state.player.y, text: Math.floor(dmg), life: 30, isPlayer: true });
        }
    };

    const syncUI = () => {
        const s = gameRef.current;
        setUiState((prev: any) => ({
            ...prev, score: Math.floor(s.score), level: s.level, xp: s.xp, xpNeeded: s.xpNeeded,
            statPoints: s.statPoints, stats: { ...s.statLevels },
            dayTime: s.globalTime, biome: getPrimaryBiome(getBiomeWeights(s.player.x, s.player.y)),
            skillCooldowns: [...s.player.skillCooldowns], hp: s.player.hp, maxHp: s.player.maxHp,
            inGameCoins: s.sessionCoins, brAlive: (s.gameMode === 'battleroyale' || s.gameMode === 'pvp1v1') ? s.brPlayers.length + 1 : 0
        }));
    };

    const upgradeStat = (statId: string) => {
        if (gameRef.current.statPoints > 0 && (gameRef.current.statLevels[statId] || 0) < 10) {
            gameRef.current.statLevels[statId] = (gameRef.current.statLevels[statId] || 0) + 1;
            gameRef.current.statPoints--;

            if (statId === 'maxHp') {
                const oldMax = gameRef.current.player.maxHp;
                gameRef.current.player.maxHp = 100 + (gameRef.current.statLevels.maxHp * 20);
                gameRef.current.player.hp += (gameRef.current.player.maxHp - oldMax);
            }

            syncUI();
            playSound('levelup');
        }
    };

    // === TOUCH/MOBILE CONTROLS ===
    const touchStateRef = useRef({ leftTouchId: null as number | null, rightTouchId: null as number | null });

    useEffect(() => {
        if (!settings.isMobile || !uiState.isPlaying || uiState.isPaused) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleTouch = (e: TouchEvent) => {
            if (e.target !== canvas) return;
            e.preventDefault();

            const touches = e.touches;

            // Pinch to Zoom - DISABLED as per user request (Only with buttons)
            /*
            if (touches.length === 2) {
                const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
                setJoystick((p: any) => {
                    if (p.pinchDist > 0) {
                        const diff = dist - p.pinchDist;
                        gameRef.current.camera.zoom = Math.min(Math.max(0.3, gameRef.current.camera.zoom + (diff * 0.005)), 2.5);
                    }
                    return { ...p, pinchDist: dist };
                });
                return;
            }
            */

            let newL: any = null, newR: any = null;
            let foundLeft = false, foundRight = false;

            const leftJoyOriginX = 140 * settings.joystickScale;
            const leftJoyOriginY = window.innerHeight - (140 * settings.joystickScale);
            const rightJoyOriginX = window.innerWidth - (140 * settings.joystickScale);
            const rightJoyOriginY = window.innerHeight - (140 * settings.joystickScale);

            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];

                // Check for Dash Button Touch
                const dashEl = document.getElementById('dash-btn');
                if (dashEl) {
                    const rect = dashEl.getBoundingClientRect();
                    if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
                        gameRef.current.keys.space = true;
                        continue;
                    }
                }

                // Left Joystick - Move
                const isLeftArea = t.clientX < window.innerWidth / 2;
                if (isLeftArea && (touchStateRef.current.leftTouchId === null || touchStateRef.current.leftTouchId === t.identifier)) {
                    touchStateRef.current.leftTouchId = t.identifier;
                    foundLeft = true;
                    let dx = t.clientX - leftJoyOriginX;
                    let dy = t.clientY - leftJoyOriginY;
                    let dist = Math.hypot(dx, dy);
                    let maxDist = 60 * settings.joystickScale;
                    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
                    newL = { active: true, dx: dx / maxDist, dy: dy / maxDist };
                }
                // Right Joystick - Attack
                else if (!isLeftArea && (touchStateRef.current.rightTouchId === null || touchStateRef.current.rightTouchId === t.identifier)) {
                    touchStateRef.current.rightTouchId = t.identifier;
                    foundRight = true;
                    let dx = t.clientX - rightJoyOriginX;
                    let dy = t.clientY - rightJoyOriginY;
                    let dist = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx);
                    newR = { active: true, x: t.clientX, y: t.clientY, angle, originX: rightJoyOriginX, originY: rightJoyOriginY, distance: dist };
                }
            }

            if (!foundLeft) touchStateRef.current.leftTouchId = null;
            if (!foundRight) touchStateRef.current.rightTouchId = null;

            setJoystick((prev: any) => ({
                left: newL || { active: false, x: 0, y: 0, dx: 0, dy: 0 },
                right: newR || { active: false, x: 0, y: 0, angle: 0, originX: rightJoyOriginX, originY: rightJoyOriginY, distance: 0 },
                pinchDist: 0
            }));
        };

        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        canvas.addEventListener('touchmove', handleTouch, { passive: false });
        canvas.addEventListener('touchend', handleTouch, { passive: false });
        canvas.addEventListener('touchcancel', handleTouch, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', handleTouch);
            canvas.removeEventListener('touchmove', handleTouch);
            canvas.removeEventListener('touchend', handleTouch);
            canvas.removeEventListener('touchcancel', handleTouch);
        };
    }, [settings.isMobile, settings.joystickScale, uiState.isPlaying, uiState.isPaused]);

    // === WEBGL ENGINE INITIALIZATION ===
    useEffect(() => {
        const canvas = glCanvasRef.current;
        if (!canvas) return;
        const gameGl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
        if (!gameGl) return;
        glRef.current = gameGl;

        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            attribute float a_alpha;
            varying vec2 v_texCoord;
            varying float v_alpha;
            uniform vec2 u_resolution;
            void main() {
                vec2 zeroToOne = a_position / u_resolution;
                vec2 zeroToTwo = zeroToOne * 2.0;
                vec2 clipSpace = zeroToTwo - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_texCoord = a_texCoord;
                v_alpha = a_alpha;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform sampler2D u_image;
            uniform vec4 u_color;
            uniform bool u_useTexture;
            varying vec2 v_texCoord;
            varying float v_alpha;
            void main() {
                vec4 texColor = vec4(1.0);
                if (u_useTexture) {
                    texColor = texture2D(u_image, v_texCoord);
                }
                if (texColor.a < 0.01) discard;
                
                vec4 finalColor = texColor * u_color * vec4(1.0, 1.0, 1.0, v_alpha);
                
                // REINHARD TONEMAPPING
                vec3 mapped = finalColor.rgb / (finalColor.rgb + vec3(1.0));
                
                gl_FragColor = vec4(mapped, finalColor.a);
            }
        `;

        const createShader = (glContext: WebGLRenderingContext, type: number, source: string) => {
            const shader = glContext.createShader(type)!;
            glContext.shaderSource(shader, source);
            glContext.compileShader(shader);
            if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
                console.error(glContext.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        };

        const vShader = createShader(gameGl, gameGl.VERTEX_SHADER, vsSource);
        const fShader = createShader(gameGl, gameGl.FRAGMENT_SHADER, fsSource);
        if (!vShader || !fShader) return;

        const program = gameGl.createProgram()!;
        gameGl.attachShader(program, vShader);
        gameGl.attachShader(program, fShader);
        gameGl.linkProgram(program);
        glProgramRef.current = program;

        gameGl.useProgram(program);
        gameGl.enable(gameGl.BLEND);
        gameGl.blendFunc(gameGl.SRC_ALPHA, gameGl.ONE_MINUS_SRC_ALPHA);

        glLocsRef.current = {
            pos: gameGl.getAttribLocation(program, 'a_position'),
            tex: gameGl.getAttribLocation(program, 'a_texCoord'),
            alpha: gameGl.getAttribLocation(program, 'a_alpha'),
            res: gameGl.getUniformLocation(program, 'u_resolution'),
            col: gameGl.getUniformLocation(program, 'u_color'),
            useTex: gameGl.getUniformLocation(program, 'u_useTexture'),
            img: gameGl.getUniformLocation(program, 'u_image')
        };

        // CREATE GLOBAL BUFFER
        glBufferRef.current = gameGl.createBuffer();

        // RE-UPLOAD ALL TEXTURES TO GL ONCE INITIALIZED
        Object.entries(texturesRef.current).forEach(([id, tex]) => {
            uploadTextureToGL(id, tex);
        });
        if (shadowTexRef.current) uploadTextureToGL('shadow', shadowTexRef.current);
    }, []);

    const drawWorldSprite = (texId: string | null, x: number, y: number, w: number, h: number, angle: number, alpha: number, color = [1, 1, 1, 1]) => {
        const gameGl = glRef.current;
        if (!gameGl) return;
        const screenX = (x - gameRef.current.camera.x) * gameRef.current.camera.zoom + gameGl.canvas.width / 2;
        const screenY = (y - gameRef.current.camera.y) * gameRef.current.camera.zoom + gameGl.canvas.height / 2;
        const drawW = w * gameRef.current.camera.zoom;
        const drawH = h * gameRef.current.camera.zoom;
        drawGL(texId, screenX, screenY, drawW, drawH, angle, alpha, 0, 0, 1, 1, color);
    };

    const drawSprite = (ctx: CanvasRenderingContext2D | null, x: number, y: number, width: number, height: number, depth: number, angle: number, textureType: any, colorTop: any, colorSide: any, isBot: boolean, zOffset = 0, alpha = 1, frameCount = 0, isSprite = false, animState = 'idle', framesConfig: number[] = [8, 8, 8], flipX = false) => {
        const gameGl = glRef.current;
        const tex = textureType ? texturesRef.current[textureType] : null;

        if (gameGl) {
            const depthY = depth * 0.8;
            const screenX = (x - gameRef.current.camera.x) * gameRef.current.camera.zoom + gameGl.canvas.width / 2;
            const screenY = (y + zOffset - gameRef.current.camera.y) * gameRef.current.camera.zoom + gameGl.canvas.height / 2;
            const drawW = width * gameRef.current.camera.zoom;
            const drawH = height * gameRef.current.camera.zoom;
            const depthH = depthY * gameRef.current.camera.zoom;

            if (isSprite && tex && tex instanceof HTMLImageElement && typeof textureType === 'string' && !textureType.startsWith('tex_')) {
                // Determine if this is a legacy 3-row sprite or a modern single-image sprite
                const isSingleImage = framesConfig.length === 3 && framesConfig[0] === 1 && framesConfig[1] === 1 && framesConfig[2] === 1;

                const rows = isSingleImage ? 1 : 3;
                let rowIdx = 0;
                if (!isSingleImage) {
                    if (animState === 'walk') rowIdx = 1;
                    else if (animState === 'attack') rowIdx = 2;
                }

                const maxFrames = isSingleImage ? 1 : (framesConfig[rowIdx] || 8);
                const ticksPerFrame = 6;
                const currentFrame = isSingleImage ? 0 : (Math.floor(frameCount / ticksPerFrame) % maxFrames);

                const ux = currentFrame / maxFrames;
                const uy = rowIdx / rows;
                const uw = 1 / maxFrames;
                const uh = 1 / rows;

                const spriteW = drawW;
                const spriteH = isSingleImage ? (spriteW * (tex.height / tex.width)) : (spriteW * (tex.height / rows / (tex.width / maxFrames)));
                const spriteY = screenY + (drawH / 2) + depthH - (spriteH / 2);

                const maxTilt = 30 * (Math.PI / 180);
                let tilt = angle;
                if (flipX) tilt = angle - Math.PI;
                while (tilt > Math.PI) tilt -= Math.PI * 4;
                while (tilt < -Math.PI) tilt += Math.PI * 4;
                const drawAngle = Math.max(-maxTilt, Math.min(maxTilt, tilt));

                drawGL(textureType, screenX, spriteY, flipX ? -spriteW : spriteW, spriteH, drawAngle, alpha, ux, uy, uw, uh);
                return;
            }

            const topY = screenY - depthH;
            const frontY = screenY;

            if (glTexturesRef.current[textureType] && !isSprite) {
                const faceH = depthH * 1.3; 
                // Sederhanakan: Hanya Front dan Top untuk menghindari artifact samping
                // Front Face (Shaded/Darker)
                drawGL(textureType, screenX, screenY, drawW, faceH, angle, alpha, 0, 0, 1, 1, [0.6, 0.6, 0.6, 1.0]);
                // Top Face (Bright/Original)
                drawGL(textureType, screenX, screenY - faceH, drawW, drawH, angle, alpha, 0, 0, 1, 1, [1.0, 1.0, 1.0, 1.0]);
            } else if (glTexturesRef.current[textureType]) {
                const sprH = drawH * (tex ? tex.height / tex.width : 1);
                drawGL(textureType, screenX, screenY, drawW, sprH, angle, alpha, 0, 0, 1, 1, [1.0, 1.0, 1.0, 1.0]);
            } else {
                const rgbTop = hexToRgb(colorTop);
                const rgbSide = hexToRgb(colorSide);
                // Simple 3D Cube with colors
                drawGL(null, screenX, screenY, drawW, depthH * 1.3, angle, alpha, 0, 0, 1, 1, rgbSide);
                drawGL(null, screenX, screenY - depthH * 1.3, drawW, drawH, angle, alpha, 0, 0, 1, 1, rgbTop);
            }
            return;
        }

        if (!ctx) return;
        ctx.save();
        // Fallback code removed for brevity but could stay if needed.
        ctx.restore();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        const handleResize = () => {
            if (!canvas || !glCanvasRef.current) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            glCanvasRef.current.width = window.innerWidth;
            glCanvasRef.current.height = window.innerHeight;
            if (glRef.current) glRef.current.viewport(0, 0, window.innerWidth, window.innerHeight);
        };
        handleResize(); window.addEventListener('resize', handleResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
        }

        const handleWheel = (e: WheelEvent) => {
            // Wheel Zoom - DISABLED as per user request (Only with buttons)
            /*
            if (!uiState.isPlaying || uiState.isPaused) return;
            gameRef.current.camera.zoom = Math.min(Math.max(0.3, gameRef.current.camera.zoom - e.deltaY * 0.001), 2.5);
            */
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
            const gameState = gameRef.current;
            const gameGl = glRef.current;
            if (gameGl) {
                gameGl.clearColor(0.06, 0.09, 0.16, 1.0);
                gameGl.clear(gameGl.COLOR_BUFFER_BIT);
            }

            if (!uiState.isPlaying) {
                if (gameGl) {
                    // Render a simple star field or background in GL for the menu
                    const time = frameCount * 0.01;
                    for (let i = 0; i < 20; i++) {
                        const ang = time + i * 0.5;
                        const dist = 300 + Math.sin(time + i) * 50;
                        drawGL(null, gameGl.canvas.width / 2 + Math.cos(ang) * dist, gameGl.canvas.height / 2 + Math.sin(ang) * dist, 10, 10, 0, 0.4, 0, 0, 1, 1, [0.06, 0.71, 0.84, 1.0]);
                    }
                }
                frameCount++;
                if (gameState.animationFrameId !== null) cancelAnimationFrame(gameState.animationFrameId);
                gameState.animationFrameId = requestAnimationFrame(gameLoop);
                return;
            }

            if (uiState.isGameOver) {
                if (gameState.animationFrameId !== null) cancelAnimationFrame(gameState.animationFrameId);
                gameState.animationFrameId = requestAnimationFrame(gameLoop);
                return;
            }

            if (!gameState.isPaused) {
                gameState.globalTime += 0.0005;
                frameCount++;

                gameState.weather.timer--;
                if (gameState.weather.timer <= 0) {
                    gameState.weather.type = gameState.weather.type === 'clear' ? 'rain' : 'clear';
                    gameState.weather.timer = Math.random() * 2000 + 1000;
                }
                if (gameState.weather.type === 'rain' && Math.random() < 0.01) { gameState.weather.flash = 1.0; playSound('thunder'); }
                if (gameState.weather.flash > 0) gameState.weather.flash -= 0.05;

                // BATTLE ROYALE LOGIC
                if (gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1') {
                    if (frameCount % 3 === 0 && socketRef.current && gameState.hasSynced) {
                        socketRef.current.emit('br:update', { x: gameState.player.x, y: gameState.player.y, vx: gameState.player.vx, vy: gameState.player.vy, angle: gameState.player.angle });
                    }

                    // Notice: other players locations are automatically updated by socket!
                    // However, calculate damage from zone for self
                    const dxZ = gameState.player.x - gameState.safeZone.x;
                    const dyZ = gameState.player.y - gameState.safeZone.y;
                    if (dxZ * dxZ + dyZ * dyZ > gameState.safeZone.radius * gameState.safeZone.radius) {
                        if (frameCount % 30 === 0) { gameState.player.hp -= 5; playSound('hit'); }
                    }

                    for (let i = gameState.brPlayers.length - 1; i >= 0; i--) {
                        let p = gameState.brPlayers[i];
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
                            gameState.brPlayers.splice(i, 1);
                            if (uiState.brAlive !== gameState.brPlayers.length + 1) syncUI();
                        }
                    }
                }

                const sLvl = gameState.statLevels; const bStat = gameState.baseStats;
                let calcAccel = bStat.speed + (sLvl.moveSpd * 0.25);
                let calcReload = Math.max(5, bStat.reload - (sLvl.reload * 2.5));
                let calcBSpd = bStat.bSpd + (sLvl.bulletSpd * 2);
                let calcBDmg = bStat.bDmg + (sLvl.bulletDmg * 4);
                let calcBPen = bStat.bPen + (sLvl.bulletPen * 1);
                let calcBodyDmg = bStat.bodyDmg + (sLvl.bodyDmg * 6);
                let calcRegen = bStat.regen + (sLvl.regen * 0.1);

                if (gameState.player.class === 'melee') { calcBodyDmg *= 3; calcAccel *= 1.3; }
                if (gameState.player.activeBuffs.speed > 0) { calcAccel *= 1.5; gameState.player.activeBuffs.speed--; }
                if (gameState.player.activeBuffs.damage > 0) { calcBDmg *= 2.0; gameState.player.activeBuffs.damage--; }
                if (gameState.player.activeBuffs.shield > 0) { gameState.player.activeBuffs.shield--; }
                if (gameState.player.activeBuffs.size > 0) { gameState.player.size = 20; calcBodyDmg *= 3; gameState.player.activeBuffs.size--; } else { gameState.player.size = 20; }
                if (gameState.player.activeBuffs.reflect > 0) gameState.player.activeBuffs.reflect--;
                if (gameState.player.activeBuffs.radar > 0) gameState.player.activeBuffs.radar--;
                if (gameState.player.activeBuffs.lava_trail > 0) {
                    if (frameCount % 5 === 0 && (Math.abs(gameState.player.vx) > 0 || Math.abs(gameState.player.vy) > 0)) {
                        gameState.aoeClouds.push({ x: gameState.player.x, y: gameState.player.y, r: 40, life: 100, type: 'explosion' });
                    }
                    gameState.player.activeBuffs.lava_trail--;
                }

                if (gameState.combo.timer > 0) {
                    gameState.combo.timer--;
                    if (gameState.combo.timer <= 0) gameState.combo.count = 0;
                }

                // Optimization: Cache biome weights
                if (frameCount % 30 === 0 || !gameState.cachedWeights) {
                    gameState.cachedWeights = getBiomeWeights(gameState.player.x, gameState.player.y);
                    gameState.cachedPrimaryBiome = getPrimaryBiome(gameState.cachedWeights);
                }
                const weights = gameState.cachedWeights;
                const primaryBiome = gameState.cachedPrimaryBiome;
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
                    gameState.bullets.push(b);
                    if (!isRemote && (gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1') && socketRef.current) {
                        socketRef.current.emit('br:shoot', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life, maxLife: b.maxLife, damage: b.damage, penetration: b.penetration, type: b.type, h: b.h, targetX: b.targetX, targetY: b.targetY, a: b.a, carriedType: b.carriedType });
                    }
                };

                if (gameState.player.activeBuffs.turret > 0) {
                    if (frameCount % 15 === 0) {
                        for (let i = 0; i < 8; i++) { fireBullet(gameState.player.x, gameState.player.y, (Math.PI * 2 / 8) * i, 'basic', 0, 1.5, 0.5, 1); }
                    }
                    gameState.player.activeBuffs.turret--;
                }

                // SPECIAL SKILLS LOGIC (1-5)
                for (let i = 0; i < 5; i++) {
                    if (gameState.player.skillCooldowns[i] > 0) gameState.player.skillCooldowns[i]--;

                    const reqLvl = (i + 1) * 15;
                    if (gameState.keys[(i + 1).toString()] && (gameState.level >= reqLvl || gameState.gameMode === 'god') && gameState.player.skillCooldowns[i] <= 0 && !uiState.showShop && !uiState.showSettings) {
                        const skillDef = CLASSES[gameState.player.class].skills[i];
                        playSound('ult');
                        gameState.player.skillCooldowns[i] = skillDef.cd;

                        if (skillDef.type === 'buff') {
                            if (skillDef.buffType === 'overdrive') { gameState.player.activeUlt = 'overdrive'; gameState.player.ultDuration = skillDef.dur; spawnParticles(gameState.player.x, gameState.player.y, 0, 'diamond', 50); }
                            else if (skillDef.buffType === 'bulletstorm') { gameState.player.activeUlt = 'bulletstorm'; gameState.player.ultDuration = skillDef.dur; }
                            else if (skillDef.buffType === 'sonicwave') { gameState.player.activeUlt = 'sonicwave'; gameState.player.ultDuration = skillDef.dur; gameState.weather.flash = 0.8; playSound('thunder'); }
                            else if (skillDef.buffType === 'inferno') { gameState.player.activeUlt = 'inferno'; gameState.player.ultDuration = skillDef.dur; }
                            else if (skillDef.buffType === 'earthquake') { gameState.player.activeUlt = 'earthquake'; gameState.player.ultDuration = skillDef.dur; playSound('explode'); }
                            else if (skillDef.buffType === 'shield') { gameState.player.activeBuffs.shield = skillDef.dur; }
                            else if (skillDef.buffType === 'speed') { gameState.player.activeBuffs.speed = skillDef.dur; }
                            else if (skillDef.buffType === 'size') { gameState.player.activeBuffs.size = skillDef.dur; }
                            else if (skillDef.buffType === 'turret') { gameState.player.activeBuffs.turret = skillDef.dur; }
                            else if (skillDef.buffType === 'drone_frenzy') { gameState.player.activeBuffs.drone_frenzy = skillDef.dur; spawnParticles(gameState.player.x, gameState.player.y, 10, 'emerald', 30); }
                            else if (skillDef.buffType === 'reflect') { gameState.player.activeBuffs.reflect = skillDef.dur; }
                            else if (skillDef.buffType === 'radar') { gameState.player.activeBuffs.radar = skillDef.dur; }
                            else if (skillDef.buffType === 'lava_trail') { gameState.player.activeBuffs.lava_trail = skillDef.dur; }
                        } else if (skillDef.type === 'heal') {
                            gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + gameState.player.maxHp * skillDef.amt);
                            spawnParticles(gameState.player.x, gameState.player.y, 10, 'heal', 20);
                        } else if (skillDef.type === 'dash') {
                            gameState.player.vx += Math.cos(gameState.player.angle) * skillDef.power;
                            gameState.player.vy += Math.sin(gameState.player.angle) * skillDef.power;
                            spawnParticles(gameState.player.x, gameState.player.y, 10, 'tnt', 30);
                        } else if (skillDef.type === 'projectile') {
                            let a = gameState.player.angle;
                            if (skillDef.bulletType === 'basic' && skillDef.count > 10) {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, (Math.PI * 2 / skillDef.count) * j, 'basic', 0, 1.5, 1, 1);
                            } else if (skillDef.bulletType === 'bounce') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, a + (Math.random() - 0.5), 'bounce', 0, 1.5, 1, 2, 5);
                            } else if (skillDef.bulletType === 'warden_sonic_wave') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, a + (j - 2) * 0.2, 'warden_sonic_wave', 0, 3, 10, 1.5, 9999);
                            } else if (skillDef.bulletType === 'fireball') {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'fireball', 0, 1, 5, 2, 1);
                            } else if (skillDef.bulletType === 'meteor') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, a + (Math.random() - 0.5) * 2, 'fireball', 0, 1.5, 5, 1, 1);
                            } else if (skillDef.bulletType === 'bomb') {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'thrown_block', 0, 1.5, 5, 1.5, 1, 'tnt');
                            } else if (skillDef.bulletType === 'saw') {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'saw', 0, 1.2, 5, 2, 99);
                            } else if (skillDef.bulletType === 'hook') {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'hook', 0, 2.5, 1, 0.8, 1);
                            } else if (skillDef.bulletType === 'sniper') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, a + (j - 1) * 0.1, 'sniper', 0, 4, 10, 2, 10);
                            } else if (skillDef.bulletType === 'homing') {
                                for (let j = 0; j < skillDef.count; j++) fireBullet(gameState.player.x, gameState.player.y, a + (Math.random() - 0.5) * 1.5, 'homing', 0, 1.2, 3, 2, 1);
                            } else if (skillDef.bulletType === 'napalm') {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'napalm', 0, 1, 5, 1, 1);
                            } else {
                                fireBullet(gameState.player.x, gameState.player.y, a, 'missile', 0, 1.5, 10, 2, 1);
                            }
                        } else if (skillDef.type === 'deploy') {
                            if (skillDef.deployType === 'mine') {
                                for (let j = 0; j < skillDef.count; j++) gameState.powerups.push({ x: gameState.player.x + (Math.random() - 0.5) * 100, y: gameState.player.y + (Math.random() - 0.5) * 100, type: 'mine', life: 1000, z: 0, vz: 0 });
                            } else if (skillDef.deployType === 'blackhole') {
                                gameState.bullets.push({ x: gameState.player.x, y: gameState.player.y, vx: 0, vy: 0, life: skillDef.dur, maxLife: skillDef.dur, damage: 1, penetration: 999, type: 'blackhole' });
                            }
                        } else if (skillDef.type === 'aoe') {
                            const spawnX = gameState.mouse.worldX || gameState.player.x;
                            const spawnY = gameState.mouse.worldY || gameState.player.y;
                            spawnExplosion(spawnX, spawnY, skillDef.dmg || 500, skillDef.rad || 300);
                            if (skillDef.effect === 'stun') {
                                const radSq = skillDef.rad * skillDef.rad;
                                gameState.shapes.forEach(s => {
                                    const dxS = s.x - gameState.player.x;
                                    const dyS = s.y - gameState.player.y;
                                    if (dxS * dxS + dyS * dyS < radSq) s.cooldown = 150;
                                });
                            }
                        } else if (skillDef.type === 'aoe_delayed') {
                            setTimeout(() => {
                                spawnExplosion(gameState.mouse.worldX || gameState.player.x, gameState.mouse.worldY || gameState.player.y, skillDef.dmg, skillDef.rad);
                            }, skillDef.delay * 16);
                        } else if (skillDef.type === 'aoe_cloud') {
                            gameState.aoeClouds.push({ x: gameState.player.x, y: gameState.player.y, r: skillDef.rad, life: skillDef.dur, type: 'explosion' });
                        } else if (skillDef.type === 'aoe_leech') {
                            const radSq = skillDef.rad * skillDef.rad;
                            gameState.shapes.forEach(s => {
                                const dxL = s.x - gameState.player.x;
                                const dyL = s.y - gameState.player.y;
                                if (dxL * dxL + dyL * dyL < radSq) {
                                    s.hp -= 200; gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + 50);
                                    spawnParticles(s.x, s.y, 10, 'heal', 5);
                                }
                            });
                        }
                        else if (skillDef.type === 'summon') {
                            if (skillDef.summonType === 'drone') {
                                for (let j = 0; j < skillDef.count; j++) gameState.drones.push({ x: gameState.player.x + (Math.random() - 0.5) * 200, y: gameState.player.y + (Math.random() - 0.5) * 200, hp: 150, maxHp: 150, type: 'diamond', angle: 0 });
                                spawnParticles(gameState.player.x, gameState.player.y, 0, 'diamond', 50);
                            } else if (skillDef.summonType === 'golem') {
                                gameState.drones.push({ x: gameState.player.x, y: gameState.player.y, hp: 1000, maxHp: 1000, type: 'golem', angle: 0, isGiant: true });
                            }
                        }
                    }
                }

                let inputX = 0, inputY = 0;
                let isFiring = false;
                let aimAngle = gameState.player.angle;

                if (settings.isMobile) {
                    if (joystick.left.active) { inputX = joystick.left.dx; inputY = joystick.left.dy; }
                    if (joystick.right.active && joystick.right.distance > 10) {
                        isFiring = true; aimAngle = joystick.right.angle; gameState.player.angle = aimAngle;
                    }
                } else {
                    if (gameState.keys.w) inputY -= 1; if (gameState.keys.s) inputY += 1;
                    if (gameState.keys.a) inputX -= 1; if (gameState.keys.d) inputX += 1;

                    gameState.mouse.worldX = (gameState.mouse.x - canvas.width / 2) / gameState.camera.zoom + gameState.camera.x;
                    gameState.mouse.worldY = (gameState.mouse.y - canvas.height / 2) / gameState.camera.zoom + gameState.camera.y;

                    gameState.player.angle = Math.atan2(gameState.mouse.worldY - gameState.player.y, gameState.mouse.worldX - gameState.player.x);
                    aimAngle = gameState.player.angle;
                    if (gameState.mouse.isDown) isFiring = true;
                }

                let speedMod = (gameState.player.activeUlt === 'overdrive') ? 3.0 : (gameState.player.activeUlt === 'earthquake' ? 2.5 : 1.0);

                if (inputX !== 0 || inputY !== 0) {
                    const l = Math.hypot(inputX, inputY);
                    gameState.player.vx += (inputX / l) * calcAccel * speedMod; gameState.player.vy += (inputY / l) * calcAccel * speedMod;
                    gameState.player.idleTime = 0;
                } else gameState.player.idleTime++;

                gameState.player.vx *= friction; gameState.player.vy *= friction;

                if (gameState.keys.space && gameState.player.dashCooldown <= 0) {
                    gameState.player.vx *= 10; gameState.player.vy *= 10; gameState.player.dashCooldown = 150;
                }
                if (gameState.player.dashCooldown > 0) gameState.player.dashCooldown--;

                let nextX = gameState.player.x + gameState.player.vx; let nextY = gameState.player.y + gameState.player.vy;
                nextX = Math.max(gameState.player.size + 100, Math.min(gameState.worldSize - gameState.player.size - 100, nextX));
                nextY = Math.max(gameState.player.size + 100, Math.min(gameState.worldSize - gameState.player.size - 100, nextY));

                gameState.env.forEach(e => {
                    if (e.type === 'house' || e.type === 'tree') {
                        const dx = nextX - e.x;
                        const dy = nextY - e.y;
                        const distSq = dx * dx + dy * dy;
                        const combinedR = e.r + gameState.player.size;
                        if (distSq < combinedR * combinedR) {
                            if (nextX > e.x - e.r && nextX < e.x + e.r && gameState.player.y > e.y - e.r && gameState.player.y < e.y + e.r) { nextX = gameState.player.x; gameState.player.vx *= 0.5; }
                            if (gameState.player.x > e.x - e.r && gameState.player.x < e.x + e.r && nextY > e.y - e.r && nextY < e.y + e.r) { nextY = gameState.player.y; gameState.player.vy *= 0.5; }
                        }
                    }
                });

                gameState.player.x = nextX; gameState.player.y = nextY;

                gameState.camera.x += (gameState.player.x - gameState.camera.x) * 0.15;
                gameState.camera.y += (gameState.player.y - gameState.camera.y) * 0.15;

                if (gameState.player.cooldown > 0) gameState.player.cooldown--;

                if (isFiring && gameState.player.cooldown <= 0 && !uiState.showShop && !uiState.showSettings) {
                    const cls = gameState.player.class;
                    let cReload = calcReload;
                    if (gameState.player.activeUlt === 'overdrive') cReload *= 0.2;
                    if (gameState.player.activeUlt === 'bulletstorm') cReload = 1;

                    if (cls === 'basic') { fireBullet(gameState.player.x, gameState.player.y, aimAngle, 'basic'); gameState.player.cooldown = cReload; playSound('shoot'); }
                    else if (cls === 'machinegun') {
                        if (gameState.player.activeUlt === 'bulletstorm') {
                            for (let i = 0; i < 3; i++) fireBullet(gameState.player.x, gameState.player.y, aimAngle, 'basic', (Math.random() - 0.5) * 1.5, Math.random() * 0.5 + 0.8, 0.8);
                        } else fireBullet(gameState.player.x, gameState.player.y, aimAngle, 'basic', (Math.random() - 0.5) * 0.5, 1.2, 0.5);
                        gameState.player.cooldown = cReload * 0.3; playSound('shoot');
                    }
                    else if (cls === 'warden') { fireBullet(gameState.player.x, gameState.player.y, aimAngle, 'tex_warden', 0, 0.8, 5, 1.5); gameState.player.cooldown = cReload * 4; playSound('sonic'); }
                    else if (cls === 'flamethrower') {
                        for (let i = 0; i < 3; i++) fireBullet(gameState.player.x, gameState.player.y, aimAngle, 'fire', (Math.random() - 0.5) * 0.8, Math.random() * 0.5 + 0.8, 0.4, 0.3, 1);
                        gameState.player.cooldown = 2;
                    }
                }

                let isFrenzy = gameState.player.activeBuffs.drone_frenzy > 0;
                gameState.drones.forEach((d: any, index: number) => {
                    d.angle += 0.05; let tx, ty;
                    if (isFiring) { tx = gameState.mouse.worldX; ty = gameState.mouse.worldY; }
                    else { tx = gameState.player.x + Math.cos(index) * 100; ty = gameState.player.y + Math.sin(index) * 100; }
                    const a = Math.atan2(ty - d.y, tx - d.x);
                    let dSpeed = isFrenzy ? 12 : 6;
                    d.x += Math.cos(a) * dSpeed; d.y += Math.sin(a) * dSpeed;

                    gameState.shapes.forEach((s: any) => {
                        let hitDist = d.isGiant ? s.size + 40 : s.size + 15;
                        if (s.isBot && Math.hypot(s.x - d.x, s.y - d.y) < hitDist) {
                            s.hp -= isFrenzy ? calcBDmg * 1.5 : calcBDmg * 0.5; d.hp -= 5;
                            if (frameCount % 10 === 0) spawnParticles(d.x, d.y, 2, d.type, 1);
                        }
                    });
                    if (d.hp <= 0) {
                        gameState.drones.splice(index, 1);
                        spawnParticles(d.x, d.y, 5, d.type, 10);
                    }
                });

                // Optimization: Replace Math.hypot with squared distance for tight loops
                const pX = gameState.player.x, pY = gameState.player.y;
                const pSize = gameState.player.size;

                // COIN DROPS UPDATE
                for (let i = gameState.drops.length - 1; i >= 0; i--) {
                    let d = gameState.drops[i];
                    d.x += d.vx; d.y += d.vy; d.z += d.vz; d.vz -= 0.5;
                    if (d.z <= 0) { d.z = 0; d.vz *= -0.5; d.vx *= 0.8; d.vy *= 0.8; }
                    d.life--;

                    const dx = pX - d.x, dy = pY - d.y;
                    if (dx * dx + dy * dy < (pSize + 15) * (pSize + 15)) {
                        playSound('coin');
                        gameState.sessionCoins++;
                        gameState.score += 5;
                        gameState.drops.splice(i, 1);
                    } else if (d.life <= 0) {
                        gameState.drops.splice(i, 1);
                    }
                }

                for (let i = gameState.powerups.length - 1; i >= 0; i--) {
                    let p = gameState.powerups[i];
                    p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vz -= 0.5;
                    if (p.z <= 0) { p.z = 0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
                    p.life--;

                    if (Math.hypot(gameState.player.x - p.x, gameState.player.y - p.y) < gameState.player.size + 15) {
                        if (p.type === 'mine') {
                            spawnExplosion(p.x, p.y, 300, 250);
                            gameState.powerups.splice(i, 1); continue;
                        }
                        if (p.type === 'heal') gameState.player.hp = gameState.player.maxHp;
                        if (p.type === 'speed') gameState.player.activeBuffs.speed = 600;
                        if (p.type === 'damage') gameState.player.activeBuffs.damage = 600;
                        if (p.type === 'shield') gameState.player.activeBuffs.shield = 600;
                        playSound('levelup'); gameState.powerups.splice(i, 1);
                    } else if (p.life <= 0) gameState.powerups.splice(i, 1);
                }

                for (let i = gameState.aoeClouds.length - 1; i >= 0; i--) {
                    let c = gameState.aoeClouds[i]; c.life--;
                    if (c.life <= 0) gameState.aoeClouds.splice(i, 1);
                }

                for (let i = gameState.particles.length - 1; i >= 0; i--) {
                    let p = gameState.particles[i]; p.x += p.vx; p.y += p.vy; p.z += p.vz; p.rot += p.rotV; p.vz -= 0.5;
                    if (p.z < 0) { p.z = 0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
                    p.life -= 0.02; if (p.life <= 0) gameState.particles.splice(i, 1);
                }

                for (let i = gameState.decals.length - 1; i >= 0; i--) { gameState.decals[i].life--; if (gameState.decals[i].life <= 0) gameState.decals.splice(i, 1); }
                for (let i = gameState.damageTexts.length - 1; i >= 0; i--) { let dt = gameState.damageTexts[i]; dt.y -= 1; dt.life--; if (dt.life <= 0) gameState.damageTexts.splice(i, 1); }

                for (let i = gameState.bullets.length - 1; i >= 0; i--) {
                    let b = gameState.bullets[i];

                    if (!b.isEnemy && (gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1')) {
                        gameState.brPlayers.forEach((p: any) => {
                            if (p.hp > 0) {
                                const dx = p.x - b.x, dy = p.y - b.y;
                                const distSq = dx * dx + dy * dy;
                                const combinedR = (p.size || 20) + 10;
                                if (distSq < combinedR * combinedR) {
                                    socketRef.current?.emit('br:hit', { targetSocketId: p.socketId, damage: b.damage });
                                    b.penetration--;
                                    spawnParticles(p.x, p.y, 10, 'blood', 3);
                                }
                            }
                        });
                    }

                    if (b.type === 'homing') {
                        let nearestDistSq = 1000 * 1000, nearestObj = null;
                        gameState.shapes.forEach(s => {
                            const dx = s.x - b.x, dy = s.y - b.y;
                            const dSq = dx * dx + dy * dy;
                            if (dSq < nearestDistSq) { nearestDistSq = dSq; nearestObj = s; }
                        });
                        if (nearestObj) {
                            let a2t = Math.atan2((nearestObj as any).y - b.y, (nearestObj as any).x - b.x);
                            b.vx += Math.cos(a2t) * 0.5; b.vy += Math.sin(a2t) * 0.5;
                            b.a = Math.atan2(b.vy, b.vx);
                        }
                    }
                    if (b.type === 'blackhole') {
                        gameState.shapes.forEach(s => {
                            const dx = b.x - s.x, dy = b.y - s.y;
                            const dSq = dx * dx + dy * dy;
                            if (dSq < 300 * 300) {
                                let a2b = Math.atan2(dy, dx);
                                s.x += Math.cos(a2b) * 3; s.y += Math.sin(a2b) * 3;
                            }
                        });
                    }

                    b.x += b.vx; b.y += b.vy; b.life--;

                    if (b.type === 'warden_sonic_wave') {
                        gameState.env.forEach((e: any, eIdx: number) => {
                            const dx = e.x - b.x, dy = e.y - b.y;
                            const combinedR = e.r + 20;
                            if (dx * dx + dy * dy < combinedR * combinedR) {
                                gameState.env.splice(eIdx, 1); spawnParticles(e.x, e.y, 10, 'stone', 10);
                            }
                        });
                    } else if (b.type !== 'tex_warden' && b.type !== 'saw' && b.type !== 'sniper' && b.type !== 'blackhole') {
                        if (b.type === 'bounce') {
                            gameState.env.forEach((e: any) => {
                                if (e.type === 'house' || e.type === 'tree') {
                                    const dx = e.x - b.x, dy = e.y - b.y;
                                    if (dx * dx + dy * dy < e.r * e.r) { b.vx *= -1; b.vy *= -1; }
                                }
                            });
                        } else {
                            gameState.env.forEach((e: any) => {
                                if (e.type === 'house' || e.type === 'tree') {
                                    const dx = e.x - b.x, dy = e.y - b.y;
                                    if (dx * dx + dy * dy < e.r * e.r) b.life = 0;
                                }
                            });
                        }
                    }

                    const pDistX = b.x - gameState.player.x, pDistY = b.y - gameState.player.y;
                    const combinedP = gameState.player.size + 5;
                    if (b.isEnemy && pDistX * pDistX + pDistY * pDistY < combinedP * combinedP) {
                        if (gameState.player.activeBuffs.reflect > 0) {
                            b.isEnemy = false; b.vx *= -1; b.vy *= -1; b.a += Math.PI;
                        } else if (gameState.gameMode !== 'god' && gameState.player.activeUlt !== 'earthquake' && gameState.player.activeBuffs.shield <= 0) {
                            gameState.player.hp -= b.damage; gameState.damageTexts.push({ x: gameState.player.x, y: gameState.player.y, text: Math.floor(b.damage), life: 30, isPlayer: true });
                            b.life = 0; playSound('hit');
                        }
                    }
                    if (b.life <= 0) {
                        if (b.type === 'fireball' || b.type === 'napalm') spawnExplosion(b.x, b.y, b.damage * 2, 150);
                        if (b.type === 'missile') spawnExplosion(b.x, b.y, b.damage * 5, 200);
                        if (b.type === 'blackhole') spawnExplosion(b.x, b.y, 500, 300);
                        gameState.bullets.splice(i, 1);
                    }
                }

                const maxCurrentShapes = (gameState.gameMode === 'peaceful' || gameState.gameMode === 'god') ? MAX_SHAPES : MAX_SHAPES; // Keep count stable
                if (gameState.shapes.length < maxCurrentShapes) {
                    const spawnDist = Math.random() * 800 + 600; const spawnAngle = Math.random() * Math.PI * 2;
                    const sx = gameState.player.x + Math.cos(spawnAngle) * spawnDist; const sy = gameState.player.y + Math.sin(spawnAngle) * spawnDist;
                    if (sx > 100 && sx < gameState.worldSize - 100 && sy > 100 && sy < gameState.worldSize - 100) {
                        // Anti-spawn in environment logic
                        const overlap = gameState.env.some((e: any) => {
                            const dx = sx - e.x;
                            const dy = sy - e.y;
                            return dx * dx + dy * dy < (e.r + 50) * (e.r + 50);
                        });
                        
                        if (!overlap) {
                            let validEntities = ENTITIES.filter(e => {
                                if (gameState.gameMode === 'peaceful') return !e.isBot;
                                return true;
                            });
                            const totalW = validEntities.reduce((acc, b) => acc + b.weight, 0);
                            let rand = Math.random() * totalW; let sel = validEntities[0];
                            for (const b of validEntities) { if (rand < b.weight) { sel = b; break; } rand -= b.weight; }
                            gameState.shapes.push({ id: Math.random(), x: sx, y: sy, ...sel, vx: 0, vy: 0, angle: 0, z: 0, cooldown: 0, carriedBlock: null });
                        }
                    }
                }

                for (let i = gameState.shapes.length - 1; i >= 0; i--) {
                    let shape = gameState.shapes[i];
                    const dxP = shape.x - gameState.player.x;
                    const dyP = shape.y - gameState.player.y;
                    const distSqP = dxP * dxP + dyP * dyP;
                    if (distSqP > 2500 * 2500) { gameState.shapes.splice(i, 1); continue; }

                    if (shape.isBot) {
                        let target = (distSqP < 800 * 800) ? gameState.player : null;
                        if (shape.botType === 'neutral' && !shape.provoked) target = null as any;

                        const dxT = target ? target.x - shape.x : 0;
                        const dyT = target ? target.y - shape.y : 0;
                        const distSqT = target ? dxT * dxT + dyT * dyT : 0;
                        const a2t = target ? Math.atan2(dyT, dxT) : 0;

                        if (shape.type === 'creeper' && distSqP < 80 * 80 && shape.hp > 0) {
                            spawnExplosion(shape.x, shape.y, 20, 200); shape.hp = 0;
                            gameState.shapes.splice(i, 1);
                            continue;
                        }

                        if (shape.type === 'enderman') {
                            if (Math.random() < 0.005) {
                                spawnParticles(shape.x, shape.y, 10, 'ender', 20); shape.x = gameState.player.x + (Math.random() - 0.5) * 800; shape.y = gameState.player.y + (Math.random() - 0.5) * 800; spawnParticles(shape.x, shape.y, 10, 'ender', 20);
                            }
                            if (!shape.carriedBlock && Math.random() < 0.05) {
                                let tbIdx = gameState.shapes.findIndex((s: any) => {
                                    if (s.isBot || s.type === 'bedrock') return false;
                                    const dx = s.x - shape.x, dy = s.y - shape.y;
                                    return dx * dx + dy * dy < 100 * 100;
                                });
                                if (tbIdx > -1) { shape.carriedBlock = gameState.shapes[tbIdx].type; gameState.shapes.splice(tbIdx, 1); }
                            }
                            if (shape.carriedBlock && target && distSqT < 400 * 400 && shape.cooldown <= 0) {
                                fireBullet(shape.x, shape.y, a2t, 'thrown_block', 0, 1.5, 3, 1.5, 1, shape.carriedBlock);
                                gameState.bullets[gameState.bullets.length - 1].isEnemy = true; shape.carriedBlock = null; shape.cooldown = 100;
                            }
                        }

                        if (target) {
                            if (shape.botType === 'melee' || shape.botType === 'neutral') {
                                let spd = shape.type === 'zombie' ? 1.0 : 2.0; shape.vx = Math.cos(a2t) * spd; shape.vy = Math.sin(a2t) * spd;
                            } else if (shape.botType === 'ranged') {
                                let attackRangeSq = shape.type === 'ghast' ? 900 * 900 : 600 * 600;
                                let stopRangeSq = shape.type === 'ghast' ? 400 * 400 : 200 * 200;

                                if (distSqT < attackRangeSq && distSqT > stopRangeSq) {
                                    shape.vx = 0; shape.vy = 0; shape.cooldown--;
                                    if (shape.cooldown <= 0) {
                                        if (shape.type === 'ghast') {
                                            fireBullet(shape.x, shape.y, a2t, 'fireball', 0, 0.8, 1.5, 1.5);
                                            gameState.bullets[gameState.bullets.length - 1].isEnemy = true;
                                            shape.cooldown = 150; playSound('shoot');
                                        } else {
                                            fireBullet(shape.x, shape.y, a2t, 'basic', 0, 0.6, 0.5, 1);
                                            gameState.bullets[gameState.bullets.length - 1].isEnemy = true; shape.cooldown = 100;
                                        }
                                    }
                                } else if (distSqT <= stopRangeSq) { shape.vx = -Math.cos(a2t) * 1.5; shape.vy = -Math.sin(a2t) * 1.5; }
                                else { shape.vx = Math.cos(a2t) * 1.5; shape.vy = Math.sin(a2t) * 1.5; }
                            }
                            else if (shape.botType === 'climber') { shape.vx = Math.cos(a2t) * 2.5; shape.vy = Math.sin(a2t) * 2.5; }
                            else if (shape.botType === 'teleporter') { shape.vx = Math.cos(a2t) * 1.5; shape.vy = Math.sin(a2t) * 1.5; }
                        } else { shape.vx = 0; shape.vy = 0; }

                        if (shape.type === 'ghast') shape.z = 80 + Math.sin(frameCount * 0.05) * 15;
                        else if (shape.z < 0) shape.z += 2;
                    }

                    if (shape.x < 100 || shape.x > gameState.worldSize - 100) shape.vx *= -1;
                    if (shape.y < 100 || shape.y > gameState.worldSize - 100) shape.vy *= -1;

                    if (shape.botType !== 'climber' && shape.botType !== 'teleporter') {
                        gameState.env.forEach((e: any) => {
                            if (e.type === 'house' || e.type === 'tree') {
                                const dx = shape.x - e.x, dy = shape.y - e.y;
                                if (dx * dx + dy * dy < (e.r + shape.size) * (e.r + shape.size)) {
                                    if (shape.x > e.x - e.r && shape.x < e.x + e.r && shape.y - shape.vy > e.y - e.r && shape.y - shape.vy < e.y + e.r) { shape.x -= shape.vx; shape.vx *= -1; }
                                    if (shape.x - shape.vx > e.x - e.r && shape.x - shape.vx < e.x + e.r && shape.y > e.y - e.r && shape.y < e.y + e.r) { shape.y -= shape.vy; shape.vy *= -1; }
                                }
                            }
                        });
                    }

                    shape.x += shape.vx;
                    shape.y += shape.vy;

                    for (let j = gameState.bullets.length - 1; j >= 0; j--) {
                        let b = gameState.bullets[j];
                        if (b.isEnemy || b.type === 'potion' || b.type === 'bomb' || b.type === 'blackhole') continue;

                        let hitDist = (b.type === 'tex_warden' || b.type === 'warden_sonic_wave' || b.type === 'laser') ? shape.size + 40 : shape.size + 5;
                        const dxBS = shape.x - b.x;
                        const dyBS = shape.y - b.y;
                        if (dxBS * dxBS + dyBS * dyBS < hitDist * hitDist) {
                            let actualDmg = b.damage;
                            if (b.type === 'warden_sonic_wave') actualDmg *= 10;
                            if (Math.random() < 0.1) { actualDmg *= 2; gameState.damageTexts.push({ x: shape.x, y: shape.y, text: "CRIT!", life: 40 }); }

                            if (b.type === 'hook') {
                                let a2p = Math.atan2(gameState.player.y - shape.y, gameState.player.x - shape.x);
                                shape.x += Math.cos(a2p) * 100; shape.y += Math.sin(a2p) * 100;
                            }

                            shape.hp -= actualDmg; b.penetration--; playSound('hit');
                            spawnParticles(shape.x, shape.y, 10, shape.type || 'stone', 3);
                            gameState.damageTexts.push({ x: shape.x, y: shape.y, text: Math.floor(actualDmg), life: 30 });

                            if (shape.type === 'golem' && b.damage > 0) shape.provoked = true;
                            if (b.penetration <= 0) gameState.bullets.splice(j, 1);

                            if (shape.hp <= 0) {
                                if (shape.type === 'tnt') spawnExplosion(shape.x, shape.y, 100, 200);

                                gameState.combo.count++; gameState.combo.timer = 180;
                                if (gameState.combo.count > gameState.combo.max) gameState.combo.max = gameState.combo.count;
                                let comboMult = 1 + (gameState.combo.count * 0.1);

                                let xpGain = Math.floor(shape.xp * comboMult);
                                gameState.xp += xpGain; gameState.score += xpGain; gameState.kills++;

                                if (Math.random() < 0.05) gameState.powerups.push({ x: shape.x, y: shape.y, type: ['heal', 'speed', 'damage', 'shield'][Math.floor(Math.random() * 4)], life: 600, z: 20, vz: 5 });

                                if (shape.splatter) {
                                    for (let s = 0; s < 3; s++) gameState.decals.push({ x: shape.x + (Math.random() - 0.5) * 40, y: shape.y + (Math.random() - 0.5) * 40, r: Math.random() * 15 + 5, color: shape.splatter, life: 1000 });
                                }

                                // Spawn Coins Drop
                                let coinCount = Math.floor(Math.random() * (shape.isBot ? 3 : 1)) + (shape.type === 'emerald' ? 5 : 0) + (shape.type === 'diamond' ? 3 : 0);
                                for (let c = 0; c < coinCount; c++) {
                                    if (gameState.drops.length < MAX_DROPS) {
                                        gameState.drops.push({ x: shape.x, y: shape.y, z: 20, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, vz: Math.random() * 6 + 4, life: 1000, type: 'coin' });
                                    }
                                }

                                gameState.shapes.splice(i, 1);
                                spawnParticles(shape.x, shape.y, 10, shape.type, 20);

                                let leveledUp = false;
                                while (gameState.xp >= gameState.xpNeeded && gameState.level < 150) {
                                    gameState.level++; gameState.xp -= gameState.xpNeeded; gameState.xpNeeded = Math.floor(gameState.xpNeeded * 1.1 + 20);
                                    gameState.statPoints++; gameState.player.hp = gameState.player.maxHp; leveledUp = true;
                                }
                                if (leveledUp) {
                                    playSound('levelup');
                                    setUiState((prev: any) => ({ ...prev, showLevelUp: true }));
                                    setTimeout(() => setUiState((prev: any) => ({ ...prev, showLevelUp: false })), 2000);
                                }
                                syncUI(); break;
                            }
                        }
                    }

                    if (shape.hp <= 0) continue;

                    if (shape.hp > 0) {
                        const dxPS = shape.x - gameState.player.x;
                        const dyPS = shape.y - gameState.player.y;
                        const distSqPS = dxPS * dxPS + dyPS * dyPS;
                        const combinedSizePS = shape.size + gameState.player.size;
                        if (distSqPS < combinedSizePS * combinedSizePS && gameState.player.z > -20) {
                            if (gameState.player.class === 'necromancer' && !shape.isBot && gameState.drones.length < 20) {
                                shape.hp = 0; gameState.shapes.splice(i, 1);
                                gameState.drones.push({ x: shape.x, y: shape.y, hp: 50, maxHp: 50, type: shape.type, angle: 0 });
                                spawnParticles(shape.x, shape.y, 10, 'diamond', 10);
                                continue;
                            }
                            if (gameState.gameMode !== 'god' && gameState.player.activeUlt !== 'earthquake' && gameState.player.activeBuffs.shield <= 0) {
                                if (!((gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1') && !uiState.brStarted)) {
                                    gameState.player.hp -= (shape.isBot ? 10 : 2);
                                    gameState.damageTexts.push({ x: gameState.player.x, y: gameState.player.y, text: (shape.isBot ? 10 : 2), life: 30, isPlayer: true });
                                    gameState.camera.shake = 15;
                                }
                            }
                            shape.hp -= calcBodyDmg;
                            if (shape.type === 'golem') shape.provoked = true;
                            const angle = Math.atan2(shape.y - gameState.player.y, shape.x - gameState.player.x);
                            shape.x += Math.cos(angle) * 15; shape.y += Math.sin(angle) * 15;
                            if (shape.hp <= 0) {
                                gameState.shapes.splice(i, 1);
                                if (shape.splatter) {
                                    for (let s = 0; s < 3; s++) gameState.decals.push({ x: shape.x + (Math.random() - 0.5) * 40, y: shape.y + (Math.random() - 0.5) * 40, r: Math.random() * 15 + 5, color: shape.splatter, life: 1000 });
                                }
                            }
                            if (gameState.player.hp <= 0 && gameState.gameMode !== 'god' && !gameState.isGameOver) {
                                processGameOver();
                            }
                        }
                    }
                }

                if (gameState.player.hp <= 0 && gameState.gameMode !== 'god' && !gameState.isGameOver) {
                    processGameOver();
                } else if (gameState.player.hp < gameState.player.maxHp && gameState.player.hp > 0) {
                    gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + calcRegen);
                }

                if (frameCount % 15 === 0) syncUI();

            } // END OF isPaused BLOCK

            // Camera smoothing (Stabilize)
            gameState.camera.x += (gameState.player.x - gameState.camera.x) * 0.15;
            gameState.camera.y += (gameState.player.y - gameState.camera.y) * 0.15;

            // === RENDER PIPELINE (WEBGL WORLD / 2D UI OVERLAY) ===
            const gameCam = gameState.camera;

            // 1. UPDATE CAMERA EFFECTS
            let camX = gameCam.x;
            let camY = gameCam.y;
            if (gameCam.shake > 0) {
                camX += (Math.random() - 0.5) * gameCam.shake;
                camY += (Math.random() - 0.5) * gameCam.shake;
                gameCam.shake *= 0.9;
                if (gameCam.shake < 0.5) gameCam.shake = 0;
            }
            if (gameState.player.activeUlt === 'earthquake') {
                camX += (Math.random() - 0.5) * 20;
                camY += (Math.random() - 0.5) * 20;
            }

            // 2. WEBGL WORLD PASS
            const oldCamX = gameCam.x;
            const oldCamY = gameCam.y;
            if (gameGl) {
                // Sync camera view with shaken coordinates
                gameCam.x = camX;
                gameCam.y = camY;

                // Biomes
                const weights = getBiomeWeights(camX, camY);
                const biomes = [
                    { id: 'grass', name: 'plains' },
                    { id: 'ice', name: 'ice' },
                    { id: 'sand', name: 'desert' },
                    { id: 'water', name: 'ocean' },
                    { id: 'netherrack', name: 'nether' }
                ];
                biomes.forEach(b => {
                    const alpha = weights[b.name] || 0;
                    if (alpha > 0.01 && glTexturesRef.current[b.id]) {
                        const zoom = gameCam.zoom;
                        const uvW = (gameGl.canvas.width / 100) / zoom;
                        const uvH = (gameGl.canvas.height / 100) / zoom;
                        drawGL(b.id, gameGl.canvas.width / 2, gameGl.canvas.height / 2, gameGl.canvas.width, gameGl.canvas.height, 0, alpha, (camX / 100) - uvW / 2, (camY / 100) - uvH / 2, uvW, uvH);
                    }
                });
            }

            // 3. GATHER AND SORT RENDERABLES
            const renderables: any[] = [];
            const vw = gameGl ? gameGl.canvas.width : canvas.width;
            const vh = gameGl ? gameGl.canvas.height : canvas.height;
            const viewW = (vw / gameCam.zoom) / 2;
            const viewH = (vh / gameCam.zoom) / 2;

            // Frustum Culling & Collection
            gameState.decals.forEach((d: any) => { if (Math.abs(d.x - camX) < viewW + d.r) drawWorldSprite(null, d.x, d.y, d.r * 2, d.r * 2, 0, d.life / 1000, hexToRgb(d.color)); });
            gameState.shapes.forEach((s: any) => { if (Math.abs(s.x - camX) < viewW + 100) renderables.push({ type: 'shape', obj: s, sortY: s.y }); });
            gameState.brPlayers.forEach((p: any) => { if (Math.abs(p.x - camX) < viewW + 100) renderables.push({ type: 'br_player', obj: p, sortY: p.y }); });
            gameState.env.forEach((e: any) => { if ((e.type === 'house' || e.type === 'tree') && Math.abs(e.x - camX) < viewW + e.r) renderables.push({ type: 'env', obj: e, sortY: e.y + e.r }); });
            gameState.bullets.forEach((b: any) => { if (Math.abs(b.x - camX) < viewW + 100) renderables.push({ type: 'bullet', obj: b, sortY: b.y }); });
            gameState.particles.forEach((p: any) => { if (Math.abs(p.x - camX) < viewW + 100) renderables.push({ type: 'particle', obj: p, sortY: p.y }); });
            gameState.drops.forEach((d: any) => { if (Math.abs(d.x - camX) < viewW + 100) renderables.push({ type: 'drop', obj: d, sortY: d.y }); });
            gameState.powerups.forEach((p: any) => { if (Math.abs(p.x - camX) < viewW + 100) renderables.push({ type: 'powerup', obj: p, sortY: p.y }); });
            gameState.drones.forEach((d: any) => { if (Math.abs(d.x - camX) < viewW + 100) renderables.push({ type: 'drone', obj: d, sortY: d.y }); });
            renderables.push({ type: 'player', obj: gameState.player, sortY: gameState.player.y });
            renderables.sort((a, b) => a.sortY - b.sortY);

            // 4. DRAW WORLD SPRITES (WEBGL)
            const sunAngle = gameState.globalTime * 0.5;
            const lDirX = Math.cos(sunAngle); 
            const lDirY = Math.sin(sunAngle);
            const shadowIntensity = Math.sin(gameState.globalTime * 0.5);
            const shadowOpacity = 0.3 + Math.max(0, shadowIntensity) * 0.3; 

            renderables.forEach(item => {
                const o = item.obj;
                
                // DYNAMIC SHADOW SYSTEM - Ground shadows for depth
                if (item.type === 'shape' || item.type === 'player' || item.type === 'drone' || item.type === 'br_player') {
                    const baseSize = (o.isGiant ? 150 : (o.size || 20));
                    const sSize = baseSize * (item.type === 'br_player' ? 2.8 : 3.8);
                    // Shadow shifts based on "Sun" position (Global Time)
                    const offX = lDirX * 12;
                    const offY = lDirY * 12 + 10;
                    drawWorldSprite('shadow', o.x + offX, o.y + (o.z || 0) + offY, sSize, sSize * 0.35, 0, shadowOpacity);
                }

                if (item.type === 'env') {
                    drawWorldSprite(texturesRef.current[o.type] ? o.type : null, o.x, o.y, o.r * 2, o.r * 2, 0, 1.0, texturesRef.current[o.type] ? [1, 1, 1, 1] : (o.type === 'house' ? [0.44, 0.25, 0.07, 1] : [0.08, 0.33, 0.18, 1]));
                }
                else if (item.type === 'shape' || item.type === 'drone') {
                    const isMoving = Math.abs(o.vx) > 0.1 || Math.abs(o.vy) > 0.1;
                    const anim = o.cooldown > 0 ? 'attack' : (isMoving ? 'walk' : 'idle');
                    const size = o.isGiant ? 150 : (o.size || 25);
                    drawSprite(null, o.x, o.y, size * 2.8, size * 2.8, o.h || 20, o.isBot ? o.angle : 0, o.textureId || o.type, o.colorTop, o.colorSide, o.isBot, o.z || 0, 1.0, frameCount, o.isBot === true, anim, o.framesConfig);
                    if (o.carriedBlock) drawSprite(null, o.x, o.y, 15, 15, 15, 0, o.carriedBlock, null, null, false, (o.z || 0) - 35);

                    const shapeMaxHp = ENTITY_HP_CACHE[o.type] || o.maxHp || 10;
                    if (o.hp < shapeMaxHp && o.hp > 0) {
                        const hW = size * 3.5; // Proporsional dengan ukuran visual
                        drawWorldSprite(null, o.x, o.y + size + 40 + (o.z || 0), hW, 6, 0, 0.6, [0, 0, 0, 1]);
                        drawWorldSprite(null, o.x - hW / 2 + (hW * (o.hp / shapeMaxHp)) / 2, o.y + size + 40 + (o.z || 0), hW * (o.hp / shapeMaxHp), 6, 0, 1.0, [0.06, 0.73, 0.51, 1]);
                    }
                }
                else if (item.type === 'br_player') {
                    const cls = CLASSES[o.class];
                    let fX = (o.angle > Math.PI / 2 || o.angle < -Math.PI / 2);
                    drawSprite(null, o.x, o.y, 400, 400, 60, o.angle, cls?.textureId, o.isParty ? '#3b82f6' : '#ef4444', '#64748b', false, 0, 1.0, frameCount, true, Math.abs(o.vx) > 0 ? 'walk' : 'idle', cls?.framesConfig, fX);
                    drawWorldSprite(null, o.x, o.y + 220, 250, 10, 0, 0.5, [0, 0, 0, 1]);
                    drawWorldSprite(null, o.x - 125 + (250 * (o.hp / o.maxHp)) / 2, o.y + 220, 250 * (o.hp / o.maxHp), 10, 0, 1.0, o.isParty ? [0.23, 0.51, 0.96, 1] : [0.94, 0.27, 0.27, 1]);
                }
                else if (item.type === 'bullet') {
                    if (o.type === 'tex_warden') drawWorldSprite(null, o.x, o.y, 80, 80, 0, 0.6, [0.08, 0.72, 0.65, 1]);
                    else if (o.type === 'warden_sonic_wave') drawWorldSprite('sonic', o.x, o.y, 60, 60, o.a, 1.0);
                    else if (o.type === 'fire' || o.type === 'fireball' || o.type === 'napalm') drawWorldSprite(null, o.x, o.y, 30, 30, 0, o.life / 100, [0.98, 0.45, 0.09, 1]);
                    else if (o.type === 'saw') drawWorldSprite(null, o.x, o.y, 40, 40, frameCount * 0.5, 1.0, [0.58, 0.64, 0.72, 1]);
                    else if (o.type === 'sniper') drawWorldSprite(null, o.x, o.y, 30, 6, o.a, 1.0, [1, 1, 1, 1]);
                    else if (o.type === 'missile' || o.type === 'homing') drawWorldSprite(null, o.x, o.y, 20, 10, o.a, 1.0, [0.94, 0.27, 0.27, 1]);
                    else if (o.type === 'blackhole') drawWorldSprite(null, o.x, o.y, 60, 60, frameCount * 0.2, 0.8, [0, 0, 0, 1]);
                    else drawWorldSprite(null, o.x, o.y, 10, 10, 0, 1.0, o.isEnemy ? [0.94, 0.27, 0.27, 1] : [1, 1, 1, 1]);
                }
                else if (item.type === 'drop') {
                    // Better Coins Drop Visuals
                    drawWorldSprite('shadow', o.x, o.y + 10, 25, 8, 0, 0.3); // Tiny coin shadow
                    drawWorldSprite(null, o.x, o.y - (o.z || 0), 22, 22, frameCount * 0.1, 1.0, [1.0, 0.84, 0.0, 1]); // PURE GOLD COLOR
                }
                else if (item.type === 'powerup') {
                    const col = o.type === 'heal' ? [0.13, 0.77, 0.37, 1] : o.type === 'speed' ? [0.23, 0.51, 0.96, 1] : o.type === 'damage' ? [0.94, 0.27, 0.27, 1] : [0.92, 0.70, 0.03, 1];
                    drawWorldSprite(null, o.x, o.y - (o.z || 0), 20, 20, 0, 1.0, o.type === 'mine' ? [0.94, 0.27, 0.27, 1] : col);
                }
                else if (item.type === 'particle') drawWorldSprite(null, o.x, o.y - (o.z || 0), 8, 8, o.rot, o.life, o.type === 'tnt' ? [0.98, 0.45, 0.09, 1] : hexToRgb(o.color || '#ffffff'));
                else if (item.type === 'player') {
                    if ((o.hp <= 0 && gameState.gameMode !== 'god') || gameState.isGameOver) return;
                    if (gameState.player.ultDuration > 0) {
                        let uRgb = [0.13, 0.83, 0.93, 0.3];
                        if (gameState.player.activeUlt === 'earthquake') uRgb = [0.94, 0.27, 0.27, 0.3];
                        else if (gameState.player.activeUlt === 'inferno') uRgb = [0.98, 0.45, 0.09, 0.3];
                        else if (gameState.player.activeUlt === 'giant') uRgb = [0.66, 0.33, 0.97, 0.3];
                        drawWorldSprite(null, o.x, o.y, o.size * 5, o.size * 5, 0, 1.0, uRgb);
                    }
                    if (gameState.player.activeBuffs.shield > 0 || gameState.player.activeBuffs.reflect > 0) drawWorldSprite(null, o.x, o.y, (o.size + 15) * 2, (o.size + 15) * 2, 0, 0.4, gameState.player.activeBuffs.reflect > 0 ? [0.66, 0.33, 0.97, 1] : [0.92, 0.70, 0.03, 1]);
                    const cls = CLASSES[o.class];
                    let fX = (o.angle > Math.PI / 2 || o.angle < -Math.PI / 2);
                    drawSprite(null, o.x, o.y, o.size * 8, o.size * 8, 30, o.angle, cls?.textureId || 'tank_basic', cls?.color || '#cbd5e1', '#64748b', false, o.z, 1.0, frameCount, true, o.idleTime === 0 ? 'walk' : 'idle', cls?.framesConfig, fX);
                    // HILANGKAN HEALTH BAR DI DUNIA AGAR HANYA ADA DI UI
                }
            });

            // 5. RENDER UI OVERLAY (2D)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            const sx = (v: number) => (v - camX) * gameCam.zoom + canvas.width / 2;
            const sy = (v: number) => (v - camY) * gameCam.zoom + canvas.height / 2;

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(gameCam.zoom, gameCam.zoom); ctx.translate(-camX, -camY);

            // World boundaries in 2D for high quality lines
            ctx.strokeStyle = ctx.createPattern(texturesRef.current['bedrock'], 'repeat') as CanvasPattern; ctx.lineWidth = 200; ctx.strokeRect(-100, -100, (gameState.worldSize || WORLD_SIZE) + 200, (gameState.worldSize || WORLD_SIZE) + 200);
            if (gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1') {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.2)'; ctx.beginPath(); ctx.rect(-100, -100, (gameState.worldSize || WORLD_SIZE) + 200, (gameState.worldSize || WORLD_SIZE) + 200);
                ctx.arc(gameState.safeZone.x, gameState.safeZone.y, gameState.safeZone.radius, 0, Math.PI * 2, true); ctx.fill();
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(gameState.safeZone.x, gameState.safeZone.y, gameState.safeZone.radius, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();

            renderables.forEach(item => {
                const o = item.obj;
                if (item.type === 'player') {
                    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(globalProfile.username, sx(o.x), sy(o.y - o.size - 60 + o.z));
                } else if (item.type === 'br_player') {
                    ctx.fillStyle = o.isParty ? '#60a5fa' : '#ef4444'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(o.name, sx(o.x), sy(o.y - 250));
                }
            });

            gameState.aoeClouds.forEach((c: any) => {
                const isSonic = c.type === 'sonic_ult'; const isExp = c.type === 'explosion';
                const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
                grad.addColorStop(0, isSonic ? `rgba(20, 184, 166, ${c.life / 30})` : isExp ? `rgba(249, 115, 22, ${c.life / 15})` : `rgba(16, 185, 129, ${c.life / 300 * 0.6})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
            });

            gameState.damageTexts.forEach((dt: any) => {
                ctx.save(); ctx.globalAlpha = dt.life / 30; ctx.fillStyle = dt.isPlayer ? '#ef4444' : '#fbbf24';
                ctx.font = 'bold 16px "Courier New", monospace'; ctx.textAlign = 'center';
                ctx.fillText(dt.text, Math.round(dt.x), Math.round(dt.y - 30)); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeText(dt.text, Math.round(dt.x), Math.round(dt.y - 30));
                ctx.restore();
            });

            ctx.restore(); // END Zoom Transformation Matrix Restore

            if (gameState.weather.type === 'rain') {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'rgba(186, 230, 253, 0.3)'; ctx.lineWidth = 1.5; ctx.beginPath();
                for (let i = 0; i < 150; i++) { let rx = Math.random() * canvas.width; let ry = Math.random() * canvas.height; ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 25); } ctx.stroke();
            }

            const cycleVal = Math.sin(gameState.globalTime * 0.5);
            if (cycleVal < 0 || gameState.weather.flash > 0) {
                if (gameState.weather.flash > 0) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${gameState.weather.flash})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
                } else if (settings.graphics === 'high') {
                    const darkAlpha = Math.abs(cycleVal) * 0.7;
                    ctx.save();

                    ctx.fillStyle = `rgba(2, 6, 23, ${darkAlpha})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    ctx.globalCompositeOperation = 'destination-out';
                    const glowRadius = (gameState.gameMode === 'god' ? 600 : 350) * gameState.camera.zoom;
                    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 50 * gameState.camera.zoom, canvas.width / 2, canvas.height / 2, glowRadius);
                    grad.addColorStop(0, `rgba(255,255,255,1)`); grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, glowRadius, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            }

            if (gameState.combo.timer > 0) {
                ctx.fillStyle = `rgba(251, 191, 36, ${gameState.combo.timer / 180})`;
                ctx.font = '900 40px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(`COMBO x${gameState.combo.count}!`, canvas.width / 2, 100);
            }

            if (uiState.isPlaying && !uiState.isGameOver && settings.showMinimap) {
                const mapSize = 160 * (settings.isMobile ? 0.8 : 1.0) * settings.uiScale;
                const mapX = canvas.width - mapSize - 24 - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-right')) || 0);
                const mapY = (settings.isMobile ? 24 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0) : canvas.height - mapSize - 24 - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0));
                ctx.save();
                ctx.beginPath(); ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize / 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; ctx.fill();
                ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
                ctx.clip();
                const scale = mapSize / gameState.worldSize;
                gameState.shapes.forEach((s: any) => {
                    if (s.isBot || gameState.player.activeBuffs.radar > 0) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(mapX + s.x * scale, mapY + s.y * scale, 1.5, 0, Math.PI * 2); ctx.fill(); }
                    else if (s.type === 'emerald') { ctx.fillStyle = '#10b981'; ctx.fillRect(mapX + s.x * scale, mapY + s.y * scale, 2, 2); }
                });
                gameState.brPlayers.forEach((p: any) => {
                    ctx.fillStyle = p.isParty ? '#3b82f6' : '#ef4444'; ctx.beginPath(); ctx.arc(mapX + p.x * scale, mapY + p.y * scale, 2, 0, Math.PI * 2); ctx.fill();
                });
                if (gameState.gameMode === 'battleroyale' || gameState.gameMode === 'pvp1v1') {
                    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mapX + gameState.safeZone.x * scale, mapY + gameState.safeZone.y * scale, gameState.safeZone.radius * scale, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(mapX + gameState.player.x * scale, mapY + gameState.player.y * scale, 3, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
                ctx.strokeRect(mapX + (gameState.camera.x - viewW) * scale, mapY + (gameState.camera.y - viewH) * scale, (viewW * 2) * scale, (viewH * 2) * scale);
                ctx.restore();
            }

            gameState.animationFrameId = requestAnimationFrame(gameLoop);

            // Restore original camera position after ALL render passes
            gameCam.x = oldCamX;
            gameCam.y = oldCamY;
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

    if (!mounted) return <div className="bg-slate-950 min-h-screen"></div>;

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none font-sans text-slate-100 touch-none overscroll-none"
            style={{
                paddingTop: 'max(var(--safe-top), 10px)',
                paddingBottom: 'max(var(--safe-bottom), 10px)',
                paddingLeft: 'max(var(--safe-left), 10px)',
                paddingRight: 'max(var(--safe-right), 10px)',
                fontSize: `${settings.uiScale * 100}%`
            }}>
            <canvas ref={glCanvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#0f172a' }} />
            <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair', pointerEvents: 'none' }} />

            {/* TOAST SYSTEM */}
            <div className="absolute top-20 right-4 left-4 md:left-auto md:w-auto flex flex-col items-center md:items-end gap-2 z-[9999] pointer-events-none">
                {toasts.map((toast: any) => (
                    <div key={toast.id} className="bg-slate-900/95 border border-slate-700 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-3 w-full max-w-[320px] pointer-events-auto animate-[slideInRight_0.3s_ease-out] backdrop-blur-md">
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
                        <div className="absolute left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-500/40 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-40 text-center w-[90%] max-w-[400px] pointer-events-auto flex flex-col"
                            style={{ top: 'max(calc(var(--safe-top) + 2rem), 40px)' }}>
                            <div className="text-sm md:text-base font-black text-amber-500 tracking-[0.2em] uppercase mb-1">WAITING ROOM</div>
                            <div className="text-slate-300 font-bold text-xs md:text-sm mb-2">Players: <span className="text-cyan-400 font-black">{uiState.brAlive} / {uiState.brMaxPlayers}</span></div>
                            <div className="text-[10px] md:text-xs font-bold text-white mb-3 animate-pulse bg-slate-800/80 rounded-xl p-2">{uiState.brCountdownMsg || 'Waiting for players...'}</div>

                            <div className="bg-slate-950/50 p-2 border border-slate-700/50 rounded-xl mb-3 text-left overflow-y-auto custom-scrollbar flex-1 max-h-32">
                                {uiState.lobbyPlayers.map((p: any, idx: number) => (
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
                                setUiState((p: any) => ({ ...p, isPlayerReady: !p.isPlayerReady }));
                                socketRef.current?.emit('br:ready', !uiState.isPlayerReady);
                            }} className={`w-full py-2.5 text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md shrink-0 ${uiState.isPlayerReady ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white' : 'bg-amber-600/90 hover:bg-amber-500 border border-amber-400 text-white animate-pulse'}`}>
                                {uiState.isPlayerReady ? '✔ READY' : 'CLICK TO READY'}
                            </button>
                        </div>
                    )}
                </>
            )}

            {uiState.isPlaying && !uiState.isGameOver && !uiState.isPaused && settings.isMobile && (
                <>
                    {/* Left Joystick - Move */}
                    <div className="absolute rounded-full border-2 border-cyan-500/30 bg-slate-900/40 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.1)] pointer-events-none"
                        style={{
                            left: `calc(${140 * settings.joystickScale}px + var(--safe-left))`,
                            bottom: `calc(${140 * settings.joystickScale}px + var(--safe-bottom))`,
                            width: 120 * settings.joystickScale,
                            height: 120 * settings.joystickScale,
                            transform: 'translate(-50%, 50%)'
                        }}>
                        <div className="absolute bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.5)] transition-all duration-75"
                            style={{
                                left: (60 * settings.joystickScale) + (joystick.left.active ? joystick.left.dx * 45 * settings.joystickScale : 0) - (25 * settings.joystickScale),
                                top: (60 * settings.joystickScale) + (joystick.left.active ? joystick.left.dy * 45 * settings.joystickScale : 0) - (25 * settings.joystickScale),
                                width: 50 * settings.joystickScale,
                                height: 50 * settings.joystickScale
                            }}></div>
                    </div>

                    {/* Right Joystick - Attack */}
                    <div className="absolute rounded-full border-2 border-red-500/30 bg-slate-900/40 backdrop-blur-md shadow-[0_0_20px_rgba(239,68,68,0.1)] pointer-events-none"
                        style={{
                            right: `calc(${140 * settings.joystickScale}px + var(--safe-right))`,
                            bottom: `calc(${140 * settings.joystickScale}px + var(--safe-bottom))`,
                            width: 120 * settings.joystickScale,
                            height: 120 * settings.joystickScale,
                            transform: 'translate(50%, 50%)'
                        }}>
                        <div className="absolute bg-gradient-to-br from-red-400 to-rose-600 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all duration-75"
                            style={{
                                left: (60 * settings.joystickScale) + (joystick.right.active ? Math.cos(joystick.right.angle) * 45 * settings.joystickScale : 0) - (25 * settings.joystickScale),
                                top: (60 * settings.joystickScale) + (joystick.right.active ? Math.sin(joystick.right.angle) * 45 * settings.joystickScale : 0) - (25 * settings.joystickScale),
                                width: 50 * settings.joystickScale,
                                height: 50 * settings.joystickScale
                            }}></div>
                    </div>

                    {/* Dash Button */}
                    <div className="absolute"
                        style={{
                            bottom: 'calc(var(--safe-bottom) + 12rem)',
                            right: 'calc(var(--safe-right) + 2rem)',
                            transform: `scale(${settings.uiScale})`,
                            transformOrigin: 'bottom right'
                        }}>
                        <button id="dash-btn" className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-cyan-600/40 border-2 border-cyan-400/50 backdrop-blur-xl text-white font-black active:bg-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)] pointer-events-auto flex items-center justify-center text-[10px] md:text-sm uppercase tracking-[0.2em] transition-all active:scale-90"
                            onMouseDown={() => { gameRef.current.keys.space = true; }}
                            onMouseUp={() => { gameRef.current.keys.space = false; }}
                            onMouseLeave={() => { gameRef.current.keys.space = false; }}
                            onTouchStart={(e) => { e.preventDefault(); gameRef.current.keys.space = true; }}
                            onTouchEnd={(e) => { e.preventDefault(); gameRef.current.keys.space = false; }}>DASH</button>
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
                            <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: true }))} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase rounded-xl border border-slate-600 transition-all">Settings</button>
                            <button onClick={exitToMainMenu} className="w-full py-3 bg-red-600/80 hover:bg-red-500 text-white font-bold uppercase rounded-xl border border-red-400 transition-all mt-4">Exit to Menu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AUTH MENU (Refactored View) */}
            {uiState.showAuth && !auth.isLoggedIn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[100] bg-slate-950/95 backdrop-blur-3xl">
                    <div className="bg-slate-900 md:p-12 p-8 rounded-[3.5rem] border border-cyan-500/30 shadow-[0_0_120px_rgba(6,182,212,0.1)] flex flex-col items-center w-[95%] max-w-md transition-all duration-500 animate-in fade-in zoom-in slide-in-from-bottom-12" style={{ transform: `scale(${settings.uiScale})` }}>
                        
                        <div className="mb-10 text-center">
                            <h1 className="text-6xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 tracking-tighter drop-shadow-2xl">PIXSHOT</h1>
                            <div className="h-1.5 w-32 bg-gradient-to-r from-cyan-500 via-indigo-500 to-blue-500 mx-auto rounded-full shadow-[0_0_20px_rgba(6,182,212,0.5)]"></div>
                            {authView === 'login' && <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.5em] mt-6">Secure Sign In</p>}
                            {authView === 'register' && <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.5em] mt-6">Create Operative</p>}
                            {authView === 'onboarding' && <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.5em] mt-6">Final Integration</p>}
                        </div>

                        <button onClick={() => setUiState((p: any) => ({ ...p, showAuth: false }))} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors text-xl">✕</button>

                        {/* LOGIN VIEW */}
                        {authView === 'login' && (
                            <div className="w-full flex flex-col gap-6">
                                <div className="space-y-4">
                                    <div className="relative group">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-cyan-400 transition-colors">👤</span>
                                        <input type="text" placeholder="Username" className="w-full bg-slate-950/50 border-2 border-slate-800 text-white pl-14 pr-6 py-5 rounded-3xl outline-none focus:border-cyan-500 focus:bg-slate-800/80 transition-all font-bold placeholder:text-slate-600 shadow-inner" value={authInput.user} onChange={e => setAuthInput((p: any) => ({ ...p, user: e.target.value }))} />
                                    </div>
                                    <div className="relative group">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-cyan-400 transition-colors">🔑</span>
                                        <input type="password" placeholder="Password" className="w-full bg-slate-950/50 border-2 border-slate-800 text-white pl-14 pr-6 py-5 rounded-3xl outline-none focus:border-cyan-500 focus:bg-slate-800/80 transition-all font-bold placeholder:text-slate-600 shadow-inner" value={authInput.pass} onChange={e => setAuthInput((p: any) => ({ ...p, pass: e.target.value }))} />
                                    </div>
                                </div>
                                <button onClick={() => handleLoginRegister(false)} className="w-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-5 rounded-3xl shadow-[0_10px_30px_rgba(6,182,212,0.3)] active:scale-95 transition-all text-sm uppercase tracking-widest border-t border-white/20">Authorize Terminal</button>
                                
                                <div className="flex items-center gap-4 py-2">
                                    <div className="h-px flex-1 bg-slate-800/50"></div>
                                    <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Connect Matrix</span>
                                    <div className="h-px flex-1 bg-slate-800/50"></div>
                                </div>
                                
                                <button onClick={handleFacebookLogin} className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-black py-5 rounded-3xl flex items-center justify-center gap-4 active:scale-95 transition-all shadow-xl group overflow-hidden relative">
                                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white group-hover:scale-125 transition-transform duration-500">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                    <span className="text-xs uppercase tracking-[0.2em]">Connect with Facebook</span>
                                    <div className="absolute inset-0 bg-white/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                </button>
                                
                                <p className="text-center text-slate-500 text-xs font-bold mt-2">New pilot? <button onClick={() => setAuthView('register')} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-cyan-900">Enlist here</button></p>
                            </div>
                        )}

                        {/* REGISTER VIEW */}
                        {authView === 'register' && (
                            <div className="w-full flex flex-col gap-5">
                                <div className="flex flex-col items-center mb-4">
                                     <div className="relative group w-24 h-24 rounded-[2rem] bg-slate-800 border-2 border-dashed border-indigo-500/50 overflow-hidden cursor-pointer hover:border-indigo-400 transition-all">
                                        {authInput.avatar ? (
                                            <img src={authInput.avatar} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full opacity-50 group-hover:opacity-100">
                                                <span className="text-2xl">📸</span>
                                                <span className="text-[8px] font-black uppercase mt-1">Upload ID</span>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAvatarUpload} />
                                     </div>
                                     <p className="text-[9px] text-slate-500 font-bold uppercase mt-2 tracking-widest">Optional Profile Identity</p>
                                </div>
                                
                                <div className="space-y-3">
                                    <input type="text" placeholder="Proposed Username" className="w-full bg-slate-800 border-2 border-slate-700 text-white px-6 py-4 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold" value={authInput.user} onChange={e => setAuthInput((p: any) => ({ ...p, user: e.target.value }))} />
                                    <input type="password" placeholder="Access Code (Password)" className="w-full bg-slate-800 border-2 border-slate-700 text-white px-6 py-4 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold" value={authInput.pass} onChange={e => setAuthInput((p: any) => ({ ...p, pass: e.target.value }))} />
                                </div>
                                
                                <button onClick={() => handleLoginRegister(true)} className="w-full bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black py-5 rounded-3xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-widest">Initiate Enrollment</button>
                                
                                <button onClick={() => setAuthView('login')} className="text-center text-slate-500 text-xs font-bold hover:text-white transition-colors">← Back to Login Terminal</button>
                            </div>
                        )}

                        {/* ONBOARDING VIEW (POST-SOCIAL) */}
                        {authView === 'onboarding' && (
                            <div className="w-full flex flex-col gap-6 text-center">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl mb-2">
                                    <p className="text-[10px] text-emerald-400 font-bold tracking-wider leading-relaxed">System Sync Active. Please establish your combat handle to continue.</p>
                                </div>

                                <div className="flex flex-col items-center gap-6">
                                    <div className="relative group w-28 h-28 rounded-full bg-slate-800 border-4 border-emerald-500/30 overflow-hidden shadow-2xl">
                                        {onboardingData.avatar ? <img src={onboardingData.avatar} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-4xl">🤖</div>}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleAvatarUpload(e, true)} />
                                    </div>
                                    
                                    <div className="w-full space-y-4">
                                        <div className="text-left">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2 mb-2 block">Choose Handle</label>
                                            <input type="text" placeholder="E.g. X_Terminator_99" className="w-full bg-slate-800/80 border-2 border-slate-700 text-white px-6 py-4 rounded-2xl outline-none focus:border-emerald-500 transition-all font-black" value={onboardingData.username} onChange={e => setOnboardingData(p => ({ ...p, username: e.target.value }))} />
                                        </div>
                                        <button onClick={completeOnboarding} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-3xl shadow-xl active:scale-95 transition-all text-sm uppercase tracking-widest border-t border-white/10">Finalize Identity</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-12 flex flex-col items-center gap-5">
                            <button onClick={playAsGuest} className="text-slate-600 hover:text-cyan-400 font-black text-[10px] uppercase tracking-[0.3em] transition-all hover:scale-110 active:scale-95">Proceed as Guest Operative</button>
                            <div className="flex gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(!uiState.isPlaying || uiState.isGameOver) && !uiState.showAuth && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[50] overflow-y-auto custom-scrollbar pointer-events-auto bg-slate-950/60 py-4 md:py-10 select-none">
                    <div className="origin-center transition-transform duration-700 flex items-center justify-center w-full min-h-full p-2 md:p-6" style={{ transform: 'scale(' + settings.uiScale + ')' }}>
                        <div className="w-full max-w-[1400px] z-[10] flex flex-col landscape:flex-row gap-6 md:gap-16 py-6 items-center justify-center min-h-[85vh]">
                            {/* LEFT PANEL: HERO SHOWCASE */}
                            <div className="flex-1 flex flex-col items-center justify-center pt-8 md:pt-0 pointer-events-none relative">
                                <h1 className="text-6xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-500 to-cyan-400 tracking-tighter drop-shadow-[0_0_40px_rgba(6,182,212,0.6)] mb-2 md:mb-6 text-center z-10 uppercase w-full">PixShot.io</h1>

                                <div className="z-10 mb-6 md:mb-12 flex items-center gap-3 bg-slate-900/60 px-5 py-2 rounded-full border border-emerald-500/30 backdrop-blur-xl pointer-events-auto shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                    <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${connStatus === 'Connected' ? 'bg-emerald-400 shadow-[0_0_12px_#10b981]' : connStatus === 'Connecting' ? 'bg-amber-400 shadow-[0_0_12px_#f59e0b]' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'}`}></div>
                                    <span className={`text-[10px] md:text-[13px] font-black uppercase tracking-[0.3em] ${connStatus === 'Connected' ? 'text-emerald-400' : connStatus === 'Connecting' ? 'text-amber-400' : 'text-red-400'}`}>• Server: {connStatus}</span>
                                </div>

                                {!uiState.isGameOver && (
                                    <div className="relative w-56 h-56 md:w-[28rem] md:h-[28rem] mx-auto z-10 flex items-center justify-center group cursor-pointer pointer-events-auto mt-4" onClick={() => setUiState((p: any) => ({ ...p, showShop: true }))}>
                                        <div className="absolute inset-0 bg-cyan-500/5 rounded-full blur-[100px] animate-pulse"></div>
                                        <img src={CLASSES[uiState.playerClass]?.previewImg || '/biasa.png'} alt="Hero Tank" className="w-full h-full object-contain relative z-10 animate-float group-hover:scale-110 transition-transform duration-700 drop-shadow-[0_45px_35px_rgba(0,0,0,0.9)] filter contrast-[1.1] saturate-[1.2]" />
                                    </div>
                                )}

                                {!uiState.isGameOver && (
                                    <div className="flex items-center gap-6 mt-8 md:mt-12 z-10 flex-wrap justify-center bg-slate-950/40 backdrop-blur-2xl p-2 rounded-[2rem] border border-white/5 shadow-2xl pointer-events-auto">
                                        <button onClick={() => setUiState((p: any) => ({ ...p, showShop: true }))} className="bg-amber-900/20 border border-amber-500/20 px-10 py-5 rounded-2xl min-w-[140px] flex flex-col items-center gap-1 group transition-all hover:bg-amber-600/20 hover:border-amber-500/50 active:scale-95">
                                            <span className="text-2xl opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-transform">🛒</span>
                                            <span className="text-amber-500 font-black text-xs tracking-[0.2em] uppercase">Arsenal</span>
                                        </button>
                                        <div className="h-10 w-px bg-white/10 mx-2 hidden md:block"></div>
                                        <div className="flex flex-col items-center justify-center px-4">
                                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Credits</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-black text-white font-mono">{globalProfile.coins}</span>
                                                <span className="w-4 h-4 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></span>
                                            </div>
                                        </div>
                                        <div className="h-10 w-px bg-white/10 mx-2 hidden md:block"></div>
                                        <button onClick={() => setUiState((p: any) => ({ ...p, showProfile: true }))} className="bg-sky-900/20 border border-sky-500/20 px-10 py-5 rounded-2xl min-w-[140px] flex flex-col items-center gap-1 group transition-all hover:bg-sky-600/20 hover:border-sky-500/50 active:scale-95">
                                            <span className="text-2xl opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-transform">👤</span>
                                            <span className="text-sky-400 font-black text-xs tracking-[0.2em] uppercase">Profile</span>
                                        </button>
                                    </div>
                                )}

                                {uiState.isGameOver && (
                                    <div className="z-10 flex flex-col items-center gap-6 max-w-sm w-full pointer-events-auto">
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
                                        </div>
                                        <button onClick={exitToMainMenu} className="text-white font-bold uppercase tracking-widest bg-slate-800 hover:bg-slate-700 px-8 py-4 rounded-xl w-full border border-slate-600 transiton-all shadow-lg active:scale-95">Back To HQ</button>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT PANEL: MODES & ACTION */}
                            <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full z-10 py-8 pointer-events-auto">
                                {!uiState.isGameOver && (
                                    <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-6 md:p-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] flex flex-col gap-8">
                                        <div className="flex justify-between items-center px-2">
                                            <div className="flex flex-col">
                                                <div className="text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-[0.4em]">Deployment</div>
                                                <div className="text-lg md:text-xl font-black text-white italic tracking-tighter">CENTER</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => setUiState((p: any) => ({ ...p, showFriends: true }))} className="bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl w-12 h-12 flex items-center justify-center border border-white/5 relative transition-all active:scale-90">👥{(friendRequests.length > 0) && <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 font-black">{friendRequests.length}</span>}</button>
                                                <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: true }))} className="bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl w-12 h-12 flex items-center justify-center border border-white/5 transition-all active:scale-90">⚙️</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'normal' }))} className={`group relative h-28 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'normal' ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">🌍</span>
                                                    <span className="font-black uppercase tracking-widest text-[10px] md:text-xs">Survival</span>
                                                </div>
                                                {uiState.gameMode === 'normal' && <div className="absolute inset-0 border-2 border-cyan-400 rounded-3xl animate-pulse"></div>}
                                            </button>
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'battleroyale', showServerBrowser: true, targetRoomId: null }))} className={`group relative h-28 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'battleroyale' ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">🪂</span>
                                                    <span className="font-black uppercase tracking-widest text-[10px] md:text-xs">B. Royale</span>
                                                </div>
                                                {uiState.gameMode === 'battleroyale' && <div className="absolute inset-0 border-2 border-red-400 rounded-3xl animate-pulse"></div>}
                                            </button>
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'pvp1v1', showServerBrowser: true, targetRoomId: null }))} className={`group relative h-28 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'pvp1v1' ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">⚔️</span>
                                                    <span className="font-black uppercase tracking-widest text-[10px] md:text-xs">1v1 Arena</span>
                                                </div>
                                                {uiState.gameMode === 'pvp1v1' && <div className="absolute inset-0 border-2 border-purple-400 rounded-3xl animate-pulse"></div>}
                                            </button>
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'peaceful' }))} className={`group relative h-28 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'peaceful' ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">🕊️</span>
                                                    <span className="font-black uppercase tracking-widest text-[10px] md:text-xs">Peaceful</span>
                                                </div>
                                                {uiState.gameMode === 'peaceful' && <div className="absolute inset-0 border-2 border-emerald-400 rounded-3xl animate-pulse"></div>}
                                            </button>
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'god' }))} className={`group relative h-16 rounded-3xl border transition-all duration-300 overflow-hidden col-span-2 ${uiState.gameMode === 'god' ? 'border-amber-500/50 bg-amber-500/10 scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex items-center justify-center gap-3 h-full">
                                                    <span className="text-xl">⚚</span>
                                                    <span className="font-black uppercase tracking-[0.3em] text-[10px]">God Mode (Creative)</span>
                                                </div>
                                            </button>
                                        </div>

                                        <div className="flex flex-col gap-2 mt-2 w-full">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] ml-2 mb-1 text-center">Pilot Handle</div>
                                            <input 
                                                type="text" 
                                                placeholder="Enter Name" 
                                                maxLength={16}
                                                className="w-full bg-slate-900/50 border-2 border-slate-800 text-white px-6 py-4 rounded-2xl outline-none focus:border-cyan-500 transition-all font-black text-center text-lg placeholder:text-slate-700" 
                                                value={globalProfile.username} 
                                                onChange={e => setGlobalProfile(p => ({ ...p, username: e.target.value || 'Guest' }))} 
                                            />
                                            <div className="flex items-center gap-2 mt-2">
                                                <button onClick={() => { setUiState((p: any) => ({ ...p, showFriends: true })); setFriendTab('all'); }} className="flex-1 py-4 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-indigo-600/20 active:scale-95 transition-all">
                                                    <span className="text-sm">➕</span> Find Party
                                                </button>
                                                <button onClick={() => setUiState((p: any) => ({ ...p, showAuth: true }))} className="flex-1 py-4 bg-slate-800/50 border border-slate-700 text-slate-400 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-slate-700 active:scale-95 transition-all">
                                                    <span className="text-sm">🔑</span> Login
                                                </button>
                                            </div>
                                        </div>

                                        <button onClick={() => {
                                            if (party.length > 0 && party.some((p: any) => p.isReady === false)) { alert("All party members must be Ready!"); return; }
                                            if (uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') { setUiState((p: any) => ({ ...p, showServerBrowser: true })); socketRef.current?.emit('br:get_rooms'); } else { startGame(uiState.gameMode); }
                                        }} className="group relative w-full h-24 md:h-32 rounded-[2rem] overflow-hidden transition-all active:scale-[0.98] shadow-2xl">
                                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600 group-hover:from-cyan-400 group-hover:to-blue-500"></div>
                                            <div className="absolute inset-0 shadow-[inset_0_2px_20px_rgba(255,255,255,0.3)]"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-2xl md:text-4xl font-black text-white italic tracking-[0.1em] drop-shadow-lg uppercase">
                                                    {uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1' ? 'FIND MATCH' : 'DEPLOY TANK'}
                                                </span>
                                            </div>
                                            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
                                            <div className="absolute inset-0 opacity-20 pointer-events-none shadow-[0_0_50px_rgba(6,182,212,0.5)]"></div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* SERVER BROWSER MENU */}
            {uiState.showServerBrowser && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="origin-center transition-transform duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-cyan-500/50 w-full max-w-3xl shadow-[0_0_80px_rgba(6,182,212,0.2)] flex flex-col gap-6 max-h-[85vh] overflow-hidden">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                                <h2 className="text-xl md:text-2xl font-black text-cyan-400 tracking-widest uppercase flex items-center gap-3">🌐 Server Browser</h2>
                                <div className="flex gap-4">
                                    <button onClick={() => socketRef.current?.emit('br:get_rooms')} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-600 font-bold transition-colors text-xs md:text-sm">🔄 Refresh</button>
                                    <button onClick={() => setUiState((p: any) => ({ ...p, showServerBrowser: false }))} className="text-slate-500 hover:text-white bg-slate-800 hover:bg-red-500/20 px-4 rounded-xl border border-slate-600 hover:border-red-500/50 transition-colors text-lg font-bold">✕</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-12 text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 pb-2 border-b border-slate-800 shrink-0">
                                <div className="col-span-6">Region ID</div>
                                <div className="col-span-3 text-center">Players</div>
                                <div className="col-span-3 text-right">Action</div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 p-1">
                                {serverList.filter((s: any) => s.mode === uiState.gameMode).length === 0 && (
                                    <div className="text-center text-slate-500 font-bold py-10 opacity-50">No active {uiState.gameMode} servers.</div>
                                )}
                                {serverList.filter((s: any) => s.mode === uiState.gameMode).map((srv: any) => (
                                    <div key={srv.id} className="grid grid-cols-12 items-center bg-slate-800/40 p-4 rounded-xl border border-slate-800/50 hover:bg-slate-800 hover:border-cyan-500/30 transition-all">
                                        <div className="col-span-6 font-mono text-white text-xs truncate pr-4">{srv.id}</div>
                                        <div className="col-span-3 text-center text-cyan-400 font-mono font-bold">{srv.players}/{srv.max}</div>
                                        <div className="col-span-3">
                                            <button onClick={() => startGame(srv.mode || 'battleroyale', srv.id)} className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-[10px] uppercase shadow-lg">Join</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="shrink-0 pt-4 border-t border-slate-800">
                                <button onClick={() => startGame(uiState.gameMode === 'pvp1v1' ? 'pvp1v1' : 'battleroyale')} className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl">Quick Start / New Lobby</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* LEADERBOARD MENU (HALL OF FAME REBUILT) */}
            {uiState.showLeaderboard && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <LeaderboardModal
                        globalTop={globalTop}
                        setGlobalTop={setGlobalTop}
                        setUiState={setUiState}
                        supabase={supabase}
                        uiScale={settings.uiScale}
                    />
                </div>
            )}

            {/* FRIENDS MENU (Advanced) */}
            {uiState.showFriends && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="origin-center transition-transform duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="bg-slate-900 p-8 rounded-3xl border border-blue-500/50 w-full max-w-lg shadow-[0_0_50px_rgba(59,130,246,0.15)] flex flex-col max-h-[85vh] overflow-hidden">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                                <h2 className="text-2xl font-black text-blue-400 tracking-widest uppercase flex items-center gap-3">👥 Connections</h2>
                                <button onClick={() => setUiState((p: any) => ({ ...p, showFriends: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
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
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Kills</div>
                                                    <div className="text-xl font-black text-red-400 font-mono">{inspectUser.total_kills || inspectUser.totalKills || 0}</div>
                                                </div>
                                                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Highscore</div>
                                                    <div className="text-xl font-black text-amber-400 font-mono">{inspectUser.highscore || 0}</div>
                                                </div>
                                                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 col-span-2">
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Total Playtime</div>
                                                    <div className="text-sm font-black text-cyan-400 font-mono">
                                                        {Math.floor((inspectUser.playtime || 0) / 3600)}h {Math.floor(((inspectUser.playtime || 0) % 3600) / 60)}m
                                                    </div>
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
                                                setPrivateChat((prev: any) => prev ? { ...prev, msgs: [...prev.msgs, { sender: uName, text: privateChatMsg, time: Date.now() }] } : prev);
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
                                                setPrivateChat((prev: any) => prev ? { ...prev, msgs: [...prev.msgs, { sender: uName, text: privateChatMsg, time: Date.now() }] } : prev);
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
                                {friendTab === 'friends' && friends.map((f: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
                                            const idx = allPlayers.find((p: any) => p.uid === f.uid);
                                            if (idx) setInspectUser(idx);
                                        }}>
                                            <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-500 overflow-hidden shrink-0">
                                                {allPlayers.find((p: any) => p.uid === f.uid)?.avatar ? <img src={allPlayers.find((p: any) => p.uid === f.uid)?.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-black">👤</div>}
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
                                            <button onClick={() => inviteToParty({ uid: f.uid, name: f.name })} disabled={party.some((p: any) => p.uid === f.uid) || party.length >= 3} className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/50 px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                                                Invite Mode
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {friendTab === 'friends' && friends.length === 0 && <div className="text-center text-slate-500 py-8 font-bold text-sm">No friends added yet. Make some in "All Players"!</div>}

                                {/* TAB: REQUESTS */}
                                {friendTab === 'requests' && friendRequests.map((r: any, i: number) => (
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
                                {friendTab === 'all' && allPlayers.filter((p: any) => p.username.toLowerCase().includes(addFriendInput.toLowerCase()) || (p.uid || '').toLowerCase().includes(addFriendInput.toLowerCase())).map((f: any, i: number) => (
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
                                                <button onClick={() => inviteToParty({ uid: f.uid, name: f.username })} disabled={party.some((p: any) => p.uid === f.uid) || party.length >= 3} className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/50 px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                                                    Invite
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PROFILE MODAL */}
            {uiState.showProfile && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="origin-center transition-transform duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-full max-w-md shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                <h2 className="text-xl font-bold text-cyan-400 tracking-widest uppercase">Commander Profile</h2>
                                <button onClick={() => setUiState((p: any) => ({ ...p, showProfile: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                            </div>
                            <div className="flex flex-col gap-5">
                                <div className="border-b border-slate-800 pb-6 mb-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="relative group cursor-pointer w-20 h-20 rounded-2xl bg-slate-800 border-2 border-cyan-500 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                                                {globalProfile.avatar ? <img src={globalProfile.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center w-full h-full text-3xl">👤</div>}
                                                {auth.isLoggedIn && (
                                                    <label className="absolute inset-0 bg-black/70 flex items-center justify-center text-[10px] font-black text-white opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest text-center cursor-pointer p-2">
                                                        Change Avatar
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
                                                <div className="text-2xl font-black text-white tracking-tight">{auth.isLoggedIn ? auth.username : globalProfile.username}</div>
                                                <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full mt-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                                                    <div className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest">UID: {auth.isLoggedIn ? auth.uid : globalProfile.uid}</div>
                                                </div>
                                            </div>
                                        </div>
                                        {auth.isLoggedIn && <button onClick={logout} className="bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl font-black hover:bg-red-500/20 text-xs uppercase tracking-widest transition-all">Logout</button>}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 py-2 flex flex-col gap-6">
                                    {/* STATS GRID */}
                                    <div className="grid grid-cols-2 gap-3 md:gap-4 shrink-0">
                                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex flex-col gap-1 hover:bg-slate-800/60 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">High Score</div>
                                            <div className="text-xl md:text-2xl font-black text-amber-400 font-mono tracking-tight">{globalProfile.highscore}</div>
                                        </div>
                                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex flex-col gap-1 hover:bg-slate-800/60 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Total Kills</div>
                                            <div className="text-xl md:text-2xl font-black text-red-500 font-mono tracking-tight">{globalProfile.totalKills}</div>
                                        </div>
                                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex flex-col gap-1 hover:bg-slate-800/60 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Matches</div>
                                            <div className="text-xl md:text-2xl font-black text-cyan-400 font-mono tracking-tight">{globalProfile.matches}</div>
                                        </div>
                                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex flex-col gap-1 hover:bg-slate-800/60 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Total Win</div>
                                            <div className="text-xl md:text-2xl font-black text-emerald-400 font-mono tracking-tight">{Math.floor(globalProfile.matches * 0.1)}</div>
                                        </div>
                                    </div>

                                    {/* PLAYTIME SECTION */}
                                    <div className="bg-indigo-500/5 p-5 rounded-2xl border border-indigo-500/20 flex flex-col gap-2 shrink-0">
                                        <div className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] flex items-center justify-between">
                                            <span>Total Playtime</span>
                                            <span className="text-slate-500 font-bold">Accumulated</span>
                                        </div>
                                        <div className="text-2xl md:text-3xl font-black text-white font-mono tracking-tighter">
                                            {Math.floor((globalProfile.playtime || 0) / 3600)}h {Math.floor(((globalProfile.playtime || 0) % 3600) / 60)}m <span className="text-indigo-400/50">{(globalProfile.playtime || 0) % 60}s</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                                            <div className="h-full bg-indigo-500" style={{ width: Math.min(100, (globalProfile.playtime || 0) / 36000 * 100) + '%' }}></div>
                                        </div>
                                    </div>

                                    {!auth.isLoggedIn && (
                                        <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col gap-4 shrink-0 shadow-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="text-2xl">⚠️</div>
                                                <p className="text-amber-400 text-xs font-black uppercase tracking-wider leading-relaxed">Guest Session Active. Progress is stored locally and may be lost.</p>
                                            </div>
                                            <button onClick={() => { setUiState((p: any) => ({ ...p, showProfile: false, showAuth: true })) }} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-4 rounded-xl text-xs uppercase tracking-[0.2em] transform active:scale-95 transition-all">Secure Account Now</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SETTINGS MENU */}
            {uiState.showSettings && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="origin-center transition-transform duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-full max-w-md shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                <h2 className="text-xl font-bold text-cyan-400 tracking-widest uppercase">Settings</h2>
                                <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: false }))} className="text-slate-500 hover:text-white text-xl font-bold">✕</button>
                            </div>

                            <div className="flex flex-col gap-6">
                                <div>
                                    <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">Master Volume: <span className="text-white">{Math.round(settings.volume * 100)}%</span></label>
                                    <input type="range" min="0" max="1" step="0.1" value={settings.volume} onChange={(e) => setSettings((p: any) => ({ ...p, volume: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">UI Scale: <span className="text-white">{Math.round(settings.uiScale * 100)}%</span></label>
                                    <input type="range" min="0.5" max="1.5" step="0.05" value={settings.uiScale} onChange={(e) => setSettings((p: any) => ({ ...p, uiScale: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                                    <div className="flex justify-between mt-2">
                                        <span className="text-[10px] text-slate-500 font-bold">Small</span>
                                        <span className="text-[10px] text-slate-500 font-bold">Large</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <label className="text-sm font-bold text-slate-300">Touch Mode</label>
                                    <button onClick={() => setSettings((p: any) => ({ ...p, isMobile: !p.isMobile }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.isMobile ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.isMobile ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                    </button>
                                </div>

                                {settings.isMobile && (
                                    <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700">
                                        <label className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3">Joystick Scale: <span className="text-white">{Math.round(settings.joystickScale * 100)}%</span></label>
                                        <input type="range" min="0.5" max="2" step="0.1" value={settings.joystickScale} onChange={(e) => setSettings((p: any) => ({ ...p, joystickScale: parseFloat(e.target.value) }))} className="w-full accent-cyan-500" />
                                    </div>
                                )}

                                <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <label className="text-sm font-bold text-slate-300">Show Minimap</label>
                                    <button onClick={() => setSettings((p: any) => ({ ...p, showMinimap: !p.showMinimap }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.showMinimap ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.showMinimap ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <label className="text-sm font-bold text-slate-300">Graphics Level</label>
                                    <select value={settings.graphics} onChange={(e) => setSettings((p: any) => ({ ...p, graphics: e.target.value }))} className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-4 py-2 outline-none font-bold">
                                        <option value="high">High (Soft Shadows + FX)</option>
                                        <option value="low">Low (Performance Boost)</option>
                                    </select>
                                </div>

                                <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <label className="text-sm font-bold text-slate-300">Particles & Effects</label>
                                    <button onClick={() => setSettings((p: any) => ({ ...p, particles: !p.particles }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.particles ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.particles ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                    </button>
                                </div>

                                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                                    <label className="text-xs text-slate-400 uppercase tracking-widest font-black block mb-4">UI Global Scale: <span className="text-cyan-400">{Math.round(settings.uiScale * 100)}%</span></label>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setSettings((p: any) => ({ ...p, uiScale: Math.max(0.5, p.uiScale - 0.1) }))} className="w-14 h-14 md:w-16 md:h-16 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg active:scale-95 transition-all text-2xl">-</button>
                                        <input type="range" min="0.5" max="1.5" step="0.1" value={settings.uiScale} onChange={(e) => setSettings((p: any) => ({ ...p, uiScale: parseFloat(e.target.value) }))} className="flex-1 accent-cyan-500 h-2 bg-slate-700 rounded-full appearance-none cursor-pointer" />
                                        <button onClick={() => setSettings((p: any) => ({ ...p, uiScale: Math.min(1.5, p.uiScale + 0.1) }))} className="w-14 h-14 md:w-16 md:h-16 bg-cyan-600 hover:bg-cyan-500 rounded-xl flex items-center justify-center font-black text-white shadow-lg active:scale-95 transition-all text-2xl">+</button>
                                    </div>
                                </div>
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
                                            <img src={cls.previewImg} className="w-28 h-28 object-contain filter drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300" />
                                        </div>

                                        <div className="flex flex-col gap-2 z-10 flex-1">
                                            <div className="text-xl font-black text-white uppercase tracking-wider">{cls.name}</div>
                                            <div className="text-xs font-bold text-slate-400 leading-relaxed flex-1 border-t border-slate-700/50 pt-2">{cls.desc}</div>
                                        </div>

                                        <button onClick={() => {
                                            setUiState((p: any) => ({ ...p, playerClass: cls.id }));
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
                                            <img src={cls.previewImg} className="w-28 h-28 object-contain filter drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300" />
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
                                                setUiState((p: any) => ({ ...p, playerClass: cls.id }));
                                                gameRef.current.player.class = cls.id;
                                            } else if (globalProfile.coins >= cls.price) {
                                                saveProfile({ ...globalProfile, coins: globalProfile.coins - cls.price, ownedClasses: [...globalProfile.ownedClasses, cls.id] });
                                                setUiState((p: any) => ({ ...p, playerClass: cls.id }));
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

            {/* HUD UI - TOP LEVEL OVERLAYS */}
            {uiState.isPlaying && (
                <div className="absolute inset-0 pointer-events-none z-40 select-none game-overlay flex flex-col p-4 md:p-6 transition-all">
                    {/* TOP HUD GRID */}
                    <div className="flex justify-between items-start w-full relative">

                        {/* LEFT WING: STATUS, ACTIONS & UPGRADES */}
                        <div className="flex flex-col gap-3 pointer-events-auto portrait-shrink" style={{ transform: `scale(${settings.uiScale})`, transformOrigin: 'top left' }}>
                            {/* Status UI */}
                            <div className="bg-slate-900/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-3">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">{uiState.gameMode.toUpperCase()}</span>
                                    </div>
                                </div>
                                {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && (
                                    <>
                                        <div className="w-px h-8 bg-white/5"></div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Alive</span>
                                            <span className="text-lg font-black text-white font-mono">{uiState.brAlive} / {uiState.brMaxPlayers}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Action Strip (Under Status) */}
                            <div className="flex gap-2 bg-slate-900/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shadow-xl w-fit">
                                <button onClick={togglePause} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center border border-slate-700 transition-all">⏸️</button>
                                <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: true }))} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center border border-slate-700 transition-all">⚙️</button>
                                <div className="flex flex-col gap-1 ml-1">
                                    <button onClick={() => { gameRef.current.camera.zoom = Math.min(2.5, gameRef.current.camera.zoom + 0.1); }} className="w-10 h-6 bg-slate-700 hover:bg-slate-600 text-white rounded-md flex items-center justify-center border border-slate-600 text-[12px] font-black" title="Zoom In">+</button>
                                    <button onClick={() => { gameRef.current.camera.zoom = Math.max(0.3, gameRef.current.camera.zoom - 0.1); }} className="w-10 h-6 bg-slate-700 hover:bg-slate-600 text-white rounded-md flex items-center justify-center border border-slate-600 text-[12px] font-black" title="Zoom Out">-</button>
                                </div>
                            </div>

                            {/* God Mode: Tank Class Change */}
                            {uiState.gameMode === 'god' && (
                                <div className="flex gap-2 overflow-x-auto max-w-[280px] p-2 bg-slate-900/40 backdrop-blur-md rounded-2xl border border-amber-500/30 custom-scrollbar pointer-events-auto">
                                    {Object.keys(CLASSES).map(clsId => (
                                        <button key={clsId} onClick={() => {
                                            if (gameRef.current.player) {
                                                setUiState((p: any) => ({ ...p, playerClass: clsId as any }));
                                                gameRef.current.player.class = clsId as any;
                                                playSound('levelup');
                                            }
                                        }} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all shrink-0 ${uiState.playerClass === clsId ? 'bg-amber-500 text-slate-900 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}>
                                            {clsId}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Upgrade Terminal (Under Actions) */}
                            {/* Upgrade Terminal (Simplified Pop-up Strip) */}
                            <div className={`transition-all duration-700 ${uiState.statPoints > 0 ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
                                <div className="bg-slate-950/80 backdrop-blur-2xl p-3 md:p-4 rounded-[2rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)] w-40 md:w-48">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-cyan-400 tracking-widest uppercase">Upgrades</span>
                                            <span className="text-sm font-black text-white">{uiState.statPoints} <span className="text-[9px] opacity-60">PTS</span></span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs animate-pulse">⚡</div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {statsList.map(stat => (
                                            <button key={stat.id} onClick={() => upgradeStat(stat.id)}
                                                className={`p-2 rounded-xl border transition-all flex flex-col gap-1 group relative overflow-hidden ${(uiState.stats[stat.id] || 0) >= 10 ? 'border-amber-500/20 bg-slate-800/50 opacity-50' : 'border-white/5 bg-white/5 hover:bg-white/10 active:scale-95'}`}
                                            >
                                                <div className="flex justify-between items-center z-10 w-full">
                                                    <span className="text-[8px] font-bold text-slate-300 uppercase">{stat.name}</span>
                                                    <span className="text-[9px] font-black text-cyan-400">{uiState.stats[stat.id] || 0}</span>
                                                </div>
                                                <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                                                    <div className={`h-full ${stat.color} shadow-[0_0_5px_currentColor]`} style={{ width: `${(uiState.stats[stat.id] || 0) * 10}%` }}></div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CENTER HUB: SCORE, COINS, KILLS, STREAK */}
                        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 portrait-shrink" style={{ transform: `translateX(-50%) scale(${settings.uiScale})` }}>
                            {/* Score & Coins */}
                            <div className="bg-slate-950/80 backdrop-blur-2xl px-6 py-2 md:px-8 md:py-3 rounded-2xl md:rounded-3xl border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col items-center min-w-[160px] md:min-w-[200px]">
                                <span className="text-[8px] font-black text-amber-500 uppercase tracking-[0.4em] leading-none mb-1">Terminal Master</span>
                                <div className="flex items-baseline gap-3 md:gap-4">
                                    <span className="text-2xl md:text-4xl font-black text-white font-mono tracking-tighter">{Math.floor(uiState.score).toLocaleString()}</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] font-bold text-amber-400 font-mono">🪙 {uiState.inGameCoins}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Kills & Streak Terminal */}
                            <div className="bg-slate-900/60 backdrop-blur-md px-4 py-1 md:px-6 md:py-1.5 rounded-full border border-white/10 flex items-center gap-4 md:gap-6 shadow-xl">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kills:</span>
                                    <span className="text-sm font-black text-red-500 italic">{uiState.gameStats.kills}</span>
                                </div>
                                <div className="w-px h-3 bg-white/10"></div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Streak:</span>
                                    <span className="text-sm font-black text-amber-400 italic">x{uiState.gameStats.maxCombo}</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* SPACE FILLER (Keep bottom areas empty for thumbs) */}
                    <div className="flex-1"></div>

                    {/* LEVEL UP NOTIFICATION */}
                    {uiState.showLevelUp && (
                        <div className="fixed top-[30%] left-1/2 -translate-x-1/2 z-[100] pointer-events-none animate-bounce">
                            <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-10 py-4 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.6)] border-2 border-white/20">
                                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">LEVEL UP!</h2>
                                <div className="text-center text-cyan-100 font-bold text-xs uppercase tracking-widest mt-1">+1 STAT POINT</div>
                            </div>
                        </div>
                    )}

                    {killNotify && (
                        <div key={killNotify.time} className="fixed top-[25%] left-1/2 -translate-x-1/2 z-[100] pointer-events-none animate-in fade-in zoom-in slide-in-from-top-10 duration-500 fill-mode-forwards opacity-0"
                            style={{ animation: 'kill-notify 3.5s ease-in-out forwards' }}>
                            <div className="bg-slate-900/90 backdrop-blur-xl border-x-4 border-red-500 px-8 py-3 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.3)] flex items-center gap-6">
                                <span className="text-xl font-black text-white italic tracking-tighter">{killNotify.killer.toUpperCase()}</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-red-500 font-extrabold text-2xl animate-pulse leading-none">ELIMINATED</span>
                                    <div className="h-0.5 w-full bg-red-500/50 mt-1"></div>
                                </div>
                                <span className="text-xl font-black text-slate-400 italic tracking-tighter">{killNotify.victim.toUpperCase()}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* BARS & SKILLS - Bottom Center */}
            {uiState.isPlaying && !uiState.isGameOver && (
                <div className={`absolute left-1/2 transform -translate-x-1/2 w-full max-w-xl flex flex-col items-center z-40 pointer-events-none transition-all portrait-center ${settings.isMobile ? 'bottom-2' : 'bottom-10'}`}
                    style={{ transform: `translateX(-50%) scale(${settings.uiScale})`, transformOrigin: 'bottom center' }}>

                    <div className="flex flex-col items-center w-[90%] md:w-full gap-2">
                        <div className="text-white font-black px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/50 backdrop-blur-md shadow-2xl flex items-center gap-3 text-xs md:text-sm uppercase tracking-widest mb-1">
                            <span className="text-emerald-400">LVL {uiState.level}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                            <span className="text-cyan-400">{auth.isLoggedIn ? auth.username : globalProfile.username}</span>
                        </div>

                        {/* SPECIAL SKILLS */}
                        <div className="flex gap-1.5 md:gap-3 pointer-events-auto p-1.5 md:p-3 bg-slate-900/40 rounded-3xl backdrop-blur-xl border border-white/5 shadow-2xl">
                            {CLASSES[uiState.playerClass]?.skills.map((skill: any, i: number) => {
                                const reqLvl = (i + 1) * 15;
                                const isUnlocked = uiState.level >= reqLvl || uiState.gameMode === 'god';
                                const cd = uiState.skillCooldowns[i] || 0;
                                const pct = isUnlocked ? (cd > 0 ? (cd / skill.cd) * 100 : 0) : 100;

                                return (
                                    <div key={i} className={`relative w-14 h-14 md:w-24 md:h-24 rounded-2xl border-2 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 select-none ${isUnlocked ? (cd <= 0 ? 'border-amber-400 bg-slate-800 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer hover:bg-slate-700 hover:-translate-y-1' : 'border-slate-700 bg-slate-900 shadow-inner') : 'border-slate-800 bg-slate-950 opacity-40'}`}
                                        onMouseDown={(e) => { e.preventDefault(); isUnlocked && cd <= 0 && (gameRef.current.keys[(i + 1).toString()] = true); }}
                                        onMouseUp={(e) => { e.preventDefault(); gameRef.current.keys[(i + 1).toString()] = false; }}
                                        onMouseLeave={() => { gameRef.current.keys[(i + 1).toString()] = false; }}
                                        onTouchStart={(e) => { e.preventDefault(); isUnlocked && cd <= 0 && (gameRef.current.keys[(i + 1).toString()] = true); }}
                                        onTouchEnd={(e) => { e.preventDefault(); gameRef.current.keys[(i + 1).toString()] = false; }}>
                                        <div className="absolute bottom-0 left-0 w-full bg-cyan-500/20 backdrop-blur-sm transition-all pointer-events-none" style={{ height: `${pct}%` }}></div>
                                        <div className="absolute top-1 left-2 text-[10px] font-black text-amber-300/50 z-10">{i + 1}</div>
                                        <span className="relative z-10 text-[7px] md:text-[10px] font-black text-center leading-tight uppercase px-1 text-white">
                                            {isUnlocked ? skill.name : `Lv ${reqLvl}`}
                                        </span>
                                        {cd > 0 && isUnlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center font-black text-xl md:text-3xl text-white z-20 pointer-events-none bg-black/60 backdrop-blur-[2px]">
                                                {Math.ceil(cd / 60)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* STAT BARS (Combined HP & XP) */}
                        <div className="w-full flex flex-col gap-1.5 md:gap-2">
                            {/* HP BAR SEKARANG DI ATAS */}
                            <div className="w-full h-5 md:h-7 bg-slate-950/90 border border-red-500/20 rounded-full overflow-hidden relative shadow-2xl p-0.5 md:p-1">
                                <div className="absolute inset-0 flex items-center justify-center text-[9px] md:text-[11px] font-black tracking-widest text-white z-10">
                                    {Math.max(0, Math.floor(uiState.hp))} / {uiState.maxHp || 100} HP
                                </div>
                                <div className="h-full rounded-full transition-all duration-200 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                                    style={{ width: `${Math.min(100, Math.max(0, (uiState.hp / (uiState.maxHp || 100)) * 100))}%`, backgroundImage: 'linear-gradient(to right, #991b1b, #ef4444)' }}></div>
                            </div>

                            {/* XP BAR DI BAWAH */}
                            <div className="w-full h-4 md:h-6 bg-slate-950/90 border border-white/5 rounded-full overflow-hidden relative shadow-2xl p-0.5 md:p-1">
                                <div className="absolute inset-0 flex items-center justify-center text-[8px] md:text-[10px] font-black tracking-widest text-white/80 z-10">
                                    {uiState.level >= 150 ? 'MAXIMUM LEVEL' : `${uiState.xp} / ${uiState.xpNeeded} XP`}
                                </div>
                                <div className="h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                                    style={{ width: `${uiState.level >= 150 ? 100 : (uiState.xp / (uiState.xpNeeded || 50)) * 100}%`, backgroundColor: '#10b981' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* DECIMATED SCREEN (DEATH UI) */}
            {uiState.isGameOver && (
                <div className="absolute inset-0 z-[100] bg-red-950/40 backdrop-blur-xl flex items-center justify-center p-6 pointer-events-auto">
                    <div className="flex flex-col items-center gap-8 w-full max-w-lg transform shadow-[0_0_100px_rgba(220,38,38,0.3)] p-12 rounded-[3rem] bg-slate-900/90 border-2 border-red-500/20"
                        style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="relative group">
                            <h1 className="text-7xl md:text-8xl font-black text-white italic tracking-tighter uppercase drop-shadow-2xl animate-pulse">DEATH</h1>
                            <div className="absolute -bottom-2 inset-x-0 h-1 bg-red-600 shadow-[0_0_20px_rgba(220,38,38,1)]"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full">
                            <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kills</span>
                                <span className="text-3xl font-black text-red-500 italic">{uiState.gameStats.kills}</span>
                            </div>
                            <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time</span>
                                <span className="text-3xl font-black text-cyan-400 italic">{uiState.gameStats.timeSurvived}s</span>
                            </div>
                            <div className="col-span-2 bg-gradient-to-r from-amber-600/20 to-transparent p-6 rounded-3xl border border-amber-500/20 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest">Coins Earned</span>
                                    <span className="text-3xl font-black text-amber-400 font-mono">+{Math.floor(uiState.score / 25)}</span>
                                </div>
                                <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">🪙</div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 w-full">
                            {globalProfile.tokens > 0 && (
                                <button onClick={respawnWithToken} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all text-sm border-b-4 border-emerald-800">
                                    <span>Respawn (1 Token)</span>
                                    <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">Stock: {globalProfile.tokens}</span>
                                </button>
                            )}
                            <button onClick={exitToMainMenu} className="w-full bg-slate-100 hover:bg-white text-slate-900 font-black py-5 rounded-2xl uppercase tracking-widest shadow-xl active:scale-95 transition-all text-sm border-b-4 border-slate-400">
                                Exit to Base
                            </button>
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
        
        /* Mobile Safe Area Fixes */
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
        .safe-top { padding-top: env(safe-area-inset-top); }
        .safe-left { padding-left: env(safe-area-inset-left); }
        .safe-right { padding-right: env(safe-area-inset-right); }
        
        /* Apply to main UI containers if needed */
        .game-overlay {
            padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }

        @media (orientation: portrait) {
            .portrait-shrink { transform: scale(0.8) !important; }
            .portrait-hide { display: none !important; }
            .portrait-center { left: 50% !important; transform: translateX(-50%) scale(0.9) !important; }
        }

        @keyframes kill-notify {
            0% { opacity: 0; transform: translate(-50%, -30px) scale(0.9); }
            10% { opacity: 1; transform: translate(-50%, 0) scale(1); }
            90% { opacity: 1; transform: translate(-50%, 0) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -15px) scale(0.95); }
        }

        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0); }
            50% { transform: translateY(-20px) rotate(2deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}} />
        </div>
    );
}
