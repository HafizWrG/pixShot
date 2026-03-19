'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supa';
import { io, Socket } from 'socket.io-client';
import { GameEngine } from '@/lib/engine/GameEngine';
import { BiomeManager } from '@/lib/engine/BiomeManager';
import { GameRenderer } from '@/lib/engine/Renderer';
import { GameSystems } from '@/lib/engine/Systems';
import { CLASSES, ENTITIES, WORLD_SIZE, PVP_WORLD_SIZE, MAX_DROPS, MAX_PARTICLES } from '@/lib/engine/Config';
import GameCanvas from '@/components/GameCanvas';
import TouchControls from '@/components/touchCont';
import LeaderboardModal from '@/components/LeaderboardModal';
import { useAudio } from '@/hooks/useAudio';
import { useSocket } from '@/hooks/useSocket';
import { generateTexture, createShadowTexture } from '@/lib/engine/Assets';

const VISIBILITY_MARGIN = 200;
const ENTITY_HP_CACHE: Record<string, number> = {};
Object.keys(ENTITIES).forEach((type: string) => ENTITY_HP_CACHE[type] = ENTITIES[type].hp);

export default function PixShotMega() {
    const [mounted, setMounted] = useState(false);
    const [auth, setAuth] = useState({ isLoggedIn: false, username: '', uid: '', password: '' });
    const [uiState, setUiState] = useState<any>({
        isPlaying: false, isGameOver: false, isPaused: false, score: 0, level: 1, xp: 0, xpNeeded: 50,
        playerClass: 'basic', hp: 100, maxHp: 100,
        gameStats: { kills: 0, timeSurvived: 0 },
        stats: { regen: 0, maxHp: 0, bodyDmg: 0, bulletSpd: 0, bulletPen: 0, bulletDmg: 0, reload: 0, moveSpd: 0 },
        statPoints: 0,
        showAuth: true, showShop: false, showSettings: false, showLeaderboard: false, showFriends: false,
        brAlive: 0, brMaxPlayers: 30, brTimeLeft: 300, brStarted: false, victory: false, triggerBR: false,
        showServerBrowser: false, brCountdownMsg: 'Waiting for players...', isPlayerReady: false, targetRoomId: null,
        showUpgrades: false,
        lobbyPlayers: [],
        skillCooldowns: [0, 0, 0, 0, 0],
        godTerminalMinimized: false
    });
    const [settings, setSettings] = useState({
        volume: 0.5, isMobile: false, showMinimap: true, graphics: 'high', particles: true, joystickScale: 1.0, uiScale: 1.0
    });
    const [globalProfile, setGlobalProfile] = useState({
        username: 'Guest', uid: Math.random().toString(36).substring(2, 10).toUpperCase(), coins: 0, tokens: 1, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '', playtime: 0
    });
    const [authInput, setAuthInput] = useState<any>({ user: '', pass: '', email: '', avatar: '' });
    const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'onboarding'>('login');
    const [showGodSelector, setShowGodSelector] = useState(false);
    const [killNotify, setKillNotify] = useState<any>(null);

    const [addFriendInput, setAddFriendInput] = useState('');
    const [onboardingData, setOnboardingData] = useState<any>({ username: '', avatar: '' });
    const [joystick, setJoystick] = useState({
        left: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
        right: { active: false, x: 0, y: 0, angle: 0, originX: 0, originY: 0, distance: 0 },
        pinchDist: 0
    });
    const [friends, setFriends] = useState<{ uid: string, name: string, status: string, lastSeen?: number }[]>([]);
    const [party, setParty] = useState<{ uid: string, name: string, isLeader?: boolean, isReady?: boolean, avatar?: string }[]>([]);
    const [toasts, setToasts] = useState<{ id: number, message: string, type: 'info' | 'invite', extra?: any }[]>([]);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [globalTop, setGlobalTop] = useState<any[] | null>(null);

    const [allPlayers, setAllPlayers] = useState<any[]>([]);
    const [friendRequests, setFriendRequests] = useState<any[]>([]);
    const [friendTab, setFriendTab] = useState<'friends' | 'all' | 'requests'>('friends');
    const [inspectUser, setInspectUser] = useState<any | null>(null);
    const [privateChat, setPrivateChat] = useState<{ uid: string, name: string, msgs: { sender: string, text: string, time: number }[] } | null>(null);
    const [privateChatMsg, setPrivateChatMsg] = useState('');
    const [socketUrl, setSocketUrl] = useState(() => {
        // 1. SSR Check
        if (typeof window === 'undefined') return 'http://localhost:3001';

        // 2. Environment Variables
        const envSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
        if (envSocketUrl) return envSocketUrl;

        // 3. Fallback for Local/Production detection
        const envIp = process.env.NEXT_PUBLIC_GAME_IP;
        const envPort = process.env.NEXT_PUBLIC_GAME_PORT || '3001';
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;

        if (envIp && envIp !== 'localhost') return `${protocol}//${envIp}:${envPort}`;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        return isLocal ? `http://localhost:3000` : `${protocol}//${hostname}`;
    });

    const { playSound } = useAudio(settings);
    const {
        connStatus, setConnStatus,
        ping, setPing,
        serverList, setServerList,
        onlineCount, setOnlineCount,
        killFeed, setKillFeed,
        socketRef,
        emit: socketEmit
    } = useSocket(socketUrl, auth, globalProfile);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<GameEngine>(new GameEngine());

    // --- AUTO SCALING & SAFE AREA HOOK ---
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isMobile = width < 1024 || (height < 600 && width > height);
            
            // Auto scale logic: Standard target is approx 1280px width for desktop
            // and 450px for portrait mobile.
            let autoScale = 1.0;
            if (isMobile) {
                if (width < height) { // Portrait
                    autoScale = Math.max(0.7, Math.min(1.0, width / 480));
                } else { // Landscape
                    autoScale = Math.max(0.6, Math.min(1.0, height / 600));
                }
            } else if (width < 1400) {
                autoScale = Math.max(0.85, width / 1400);
            }

            setSettings(prev => ({ 
                ...prev, 
                uiScale: autoScale, 
                isMobile: isMobile 
            }));
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);
    const rendererRef = useRef<GameRenderer | null>(null);
    const lastSyncRef = useRef<number>(0);

    const upgradeStat = (statId: string) => {
        const state = engineRef.current.state;
        const sId = statId as keyof typeof state.statLevels;
        if (state.statPoints > 0 && (state.statLevels[sId] || 0) < 10) {
            state.statLevels[sId] = (state.statLevels[sId] || 0) + 1;
            state.statPoints--;
            playSound('levelup');
            syncUI();
        }
    };

    const fireBullet = (x: number, y: number, angle: number, type = 'player_bullet', isEnemy = false) => {
        const engine = engineRef.current;
        const state = engine.state;
        const bSpd = state.baseStats.bSpd + state.statLevels.bulletSpd * 2;
        const bDmg = state.baseStats.bDmg + state.statLevels.bulletDmg * 5;
        const bPen = state.baseStats.bPen + state.statLevels.bulletPen;

        state.bullets.push({
            x, y,
            vx: Math.cos(angle) * bSpd,
            vy: Math.sin(angle) * bSpd,
            a: angle,
            life: 120,
            maxLife: 120,
            damage: bDmg,
            type: type,
            penetration: bPen,
            isEnemy: isEnemy
        });

        if (!isEnemy && (uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1')) {
            socketEmit('br:shoot', { x, y, angle, damage: bDmg, penetration: bPen });
        }
    };

    const uiStateRef = useRef(uiState);
    const globalProfileRef = useRef(globalProfile);
    const settingsRef = useRef(settings);
    const joystickRef = useRef(joystick);
    const loopActiveRef = useRef(true);

    const glRef = useRef<WebGLRenderingContext | null>(null);
    const glProgramRef = useRef<WebGLProgram | null>(null);
    const glTexturesRef = useRef<Record<string, WebGLTexture>>({});
    const texturesRef = useRef<Record<string, HTMLCanvasElement | HTMLImageElement>>({});

    // Texture Loading
    useEffect(() => {
        if (!mounted) return;
        const loadAssets = async () => {
            const { ASSET_PATHS, loadLocalTexture, generateTexture } = await import('@/lib/engine/Assets');
            const texs: Record<string, HTMLImageElement | HTMLCanvasElement> = {};

            // Load Images from ASSET_PATHS
            const promises = Object.entries(ASSET_PATHS.images).map(async ([key, path]) => {
                try {
                    const img = await loadLocalTexture(path);
                    texs[key] = img;
                } catch (e) {
                    console.warn(`Failed to load texture: ${key} from ${path}. Using fallback.`);
                    // Fallback to generated texture if possible
                    const fallback = (generateTexture as any)(key.replace('shape_', ''));
                    if (fallback) texs[key] = fallback;
                }
            });

            await Promise.all(promises);

            // Add generated fallbacks/procedural textures
            ['stone', 'tnt', 'wood', 'dirt', 'grass'].forEach(type => {
                if (!texs[type]) texs[type] = (generateTexture as any)(type);
            });

            texturesRef.current = texs;
        };
        loadAssets();
    }, [mounted]);

    const glLocsRef = useRef<any>({});
    const glBufferRef = useRef<WebGLBuffer | null>(null);
    const shadowTexRef = useRef<HTMLCanvasElement | null>(null);

    const peersRef = useRef<Record<string, RTCPeerConnection>>({});
    const localStreamRef = useRef<MediaStream | null>(null);

    const gameRef = { get current() { return engineRef.current.state; } } as any;

    useEffect(() => { uiStateRef.current = uiState; }, [uiState]);
    useEffect(() => { globalProfileRef.current = globalProfile; }, [globalProfile]);
    useEffect(() => { settingsRef.current = settings; }, [settings]);
    useEffect(() => { joystickRef.current = joystick; }, [joystick]);

    useEffect(() => {
        const checkSession = async () => {
            const sessionStr = localStorage.getItem('pixshot_session');
            if (sessionStr) {
                try {
                    const session = JSON.parse(sessionStr);
                    if (session && session.uid) {
                        const { data: profile, error } = await supabase
                            .from('players')
                            .select('*')
                            .eq('uid', session.uid)
                            .single();

                        if (!error && profile) {
                            const cloudProfile = {
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
                            };
                            setAuth({ isLoggedIn: true, username: profile.username, uid: profile.uid, password: '' });
                            setGlobalProfile(cloudProfile);
                            // Auto-cache latest cloud profile to local storage for offline support
                            localStorage.setItem('pixshot_profile', JSON.stringify(cloudProfile));
                            
                            setUiState((p: any) => ({ ...p, showAuth: false }));
                            addToast(`Welcome back, ${profile.username}!`, 'info');
                        } else {
                            // Fallback to purely local saved profile if Supabase is unreachable
                            const localStr = localStorage.getItem('pixshot_profile');
                            if (localStr) {
                                const localP = JSON.parse(localStr);
                                if (localP && localP.uid === session.uid) {
                                    setAuth({ isLoggedIn: true, username: localP.username, uid: localP.uid, password: '' });
                                    setGlobalProfile(localP);
                                    setUiState((p: any) => ({ ...p, showAuth: false }));
                                    addToast(`Playing Offline (Local Data Loaded)`, 'info');
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }
        };
        checkSession();
    }, []);

    const spawnParticles = (x: number, y: number, z: number, type: string, count: number) => {
        engineRef.current.spawnParticles(x, y, z, type, count);
    };

    const spawnExplosion = (ex: number, ey: number, dmg: number, radius: number) => {
        engineRef.current.spawnExplosion(ex, ey, dmg, radius);
    };

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

    const getPrimaryBiome = (weights: Record<string, number>) => {
        if (uiState.gameMode === 'pvp1v1') return 'plains';
        return Object.keys(weights).reduce((a, b) => weights[a] > weights[b] ? a : b);
    };

    const lastUiUpdateRef = useRef(0);
    const syncUI = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;
        const state = engine.state;
        const now = Date.now();

        // 1. Update UI State (Throttled to ~10fps to fix frame drops)
        if (now - lastUiUpdateRef.current > 100) {
            lastUiUpdateRef.current = now;
            setUiState((prev: any) => ({
                ...prev,
                hp: state.player.hp,
                maxHp: state.player.maxHp,
                score: state.player.xp,
                xp: state.player.xp,
                xpNeeded: state.xpNeeded,
                level: state.player.level || 1,
                stats: state.statLevels,
                statPoints: state.statPoints,
                inGameCoins: state.sessionCoins,
                ammo: state.player.ammo,
                maxAmmo: state.player.maxAmmo,
                isReloading: state.player.isReloading,
                // brAlive is now managed exclusively by socket events for accuracy
                skillCooldowns: [...(state.player.skillCooldowns || [0, 0, 0, 0, 0])]
            }));
        }

        // 2. Handle Server Synchronization (Non-React)
        const anyState = state as any;

        // Sync Shots
        if (anyState.pendingServerActions && anyState.pendingServerActions.length > 0) {
            anyState.pendingServerActions.forEach((action: any) => {
                if (action.type === 'shoot') {
                    socketEmit('br:shoot', action.data);
                }
            });
            anyState.pendingServerActions = [];
        }

        // Sync Hits (Damage done to other players)
        if (anyState.pendingHits && anyState.pendingHits.length > 0) {
            anyState.pendingHits.forEach((hit: any) => {
                socketEmit('br:hit', hit);
            });
            anyState.pendingHits = [];
        }

        // Sync Sounds (Local Client)
        if (anyState.pendingSound) {
            playSound(anyState.pendingSound);
            anyState.pendingSound = null;
        }

        if (anyState.pendingSounds && anyState.pendingSounds.length > 0) {
            anyState.pendingSounds.forEach((s: string) => playSound(s));
            anyState.pendingSounds = [];
        }

        // Sync Player Death
        if (state.player.hp <= 0 && !uiState.isGameOver) {
            processGameOver();
        }

        // Sync Level Up Sound
        if (anyState.pendingLevelUp) {
            playSound('levelup');
            anyState.pendingLevelUp = false;
            addToast(`Level Up! You reached Level ${state.player.level || 1}`, 'info');
            setUiState((p: any) => ({ ...p, showLevelUp: true }));
            setTimeout(() => setUiState((p: any) => ({ ...p, showLevelUp: false })), 2000);
        }

        // 3. Sync Player Placement (Throttled)
        if (uiState.isPlaying && (uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1')) {
            const now = Date.now();
            if (now - lastSyncRef.current > 45) {
                socketEmit('br:update', {
                    x: state.player.x,
                    y: state.player.y,
                    vx: state.player.vx,
                    vy: state.player.vy,
                    angle: state.player.angle
                });
                lastSyncRef.current = now;
            }
        }
    }, [uiState.isPlaying, uiState.gameMode, socketEmit, playSound]);

    const startGame = (mode = 'normal', targetRoomId?: string) => {
        const engine = engineRef.current;
        engine.state = engine.getInitialState();
        engine.state.gameMode = mode;
        engine.state.player.class = uiState.playerClass;

        const getWorldSize = (gameMode: string) => {
            switch (gameMode) {
                case 'battleroyale':
                case 'survival':
                    return 8000;
                case 'pvp1v1':
                    return 1000;
                case 'peaceful':
                case 'god':
                    return 5000;
                default:
                    return 8000;
            }
        };
        const wSize = getWorldSize(mode);
        const gridSize = mode === 'pvp1v1' ? 250 : 500;
        engine.state.worldSize = wSize;
        engine.state.camera.x = 0;
        engine.state.camera.y = 0;
        engine.state.player.x = 0;
        engine.state.player.y = 0;

        const biomeManager = new BiomeManager(wSize, gridSize);
        engine.state.env = biomeManager.generateEnvironment();
        // Initial spawn of shapes (engine will refill dynamically based on size)
        engine.spawnNeutralShapes([]);

        setUiState((p: any) => ({
            ...p,
            isPlaying: true,
            isGameOver: false,
            showAuth: false,
            showServerBrowser: false,
            gameMode: mode,
            targetRoomId: targetRoomId || null,
            hp: 150, // Standard BR/PVP HP
            maxHp: 150
        }));
        if (mode === 'battleroyale' || mode === 'pvp1v1') {
            socketEmit('br:join', {
                uid: auth.isLoggedIn ? auth.uid : globalProfile.uid,
                name: auth.isLoggedIn ? auth.username : globalProfile.username,
                class: uiState.playerClass,
                mode: mode,
                roomId: targetRoomId
            });
        }
    };

    // Keyboard and mouse controls
    useEffect(() => {
        if (!mounted || !uiState.isPlaying) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', ' ', '1', '2', '3', '4', '5'].includes(key)) {
                gameRef.current.keys[key === ' ' ? 'space' : key] = true;
                if (['w', 'a', 's', 'd'].includes(key)) e.preventDefault();
            }
            if (e.key === 'ArrowUp') gameRef.current.keys.w = true;
            if (e.key === 'ArrowDown') gameRef.current.keys.s = true;
            if (e.key === 'ArrowLeft') gameRef.current.keys.a = true;
            if (e.key === 'ArrowRight') gameRef.current.keys.d = true;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', ' ', '1', '2', '3', '4', '5'].includes(key)) {
                gameRef.current.keys[key === ' ' ? 'space' : key] = false;
            }
            if (e.key === 'ArrowUp') gameRef.current.keys.w = false;
            if (e.key === 'ArrowDown') gameRef.current.keys.s = false;
            if (e.key === 'ArrowLeft') gameRef.current.keys.a = false;
            if (e.key === 'ArrowRight') gameRef.current.keys.d = false;
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 0) gameRef.current.keys.mouseLeft = true;
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.button === 0) gameRef.current.keys.mouseLeft = false;
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!canvasRef.current || !engineRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate world coordinates
            const worldX = (mouseX - window.innerWidth / 2) / gameRef.current.camera.zoom + gameRef.current.camera.x;
            const worldY = (mouseY - window.innerHeight / 2) / gameRef.current.camera.zoom + gameRef.current.camera.y;

            gameRef.current.mouse.worldX = worldX;
            gameRef.current.mouse.worldY = worldY;
            gameRef.current.mouse.x = mouseX;
            gameRef.current.mouse.y = mouseY;

            // Immediate update for smooth look (optional but recommended)
            const dx = worldX - gameRef.current.player.x;
            const dy = worldY - gameRef.current.player.y;
            gameRef.current.player.angle = Math.atan2(dy, dx);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [mounted, uiState.isPlaying]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setMounted(true);
            if (canvasRef.current && glCanvasRef.current) {
                rendererRef.current = new GameRenderer(canvasRef.current, glCanvasRef.current);
            }
        }
    }, [mounted]);

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
            setFriendRequests(reqData.map((f: any) => ({ uid: f.user_uid, name: f.user_uid })));
        }
        socketEmit('player:status', { uid: auth.uid, status: 'Online' });
    };

    useEffect(() => {
        if (uiState.triggerBR && !uiState.isPlaying) {
            setUiState((p: any) => ({ ...p, triggerBR: false }));
            startGame('battleroyale', uiState.targetRoomId || undefined);
        }
    }, [uiState.triggerBR, uiState.isPlaying, uiState.targetRoomId]);

    useEffect(() => {
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
                    else if (error) setGlobalTop([]);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [uiState.showLeaderboard, globalTop]);

    useEffect(() => {
        const loadAllPlayers = async () => {
            const { data, error } = await supabase.from('players').select('uid, username, coins, total_kills, matches, avatar, playtime').limit(100);
            if (!error && data) setAllPlayers(data);
        };
        loadAllPlayers();

        const interval = setInterval(() => {
            if (auth.isLoggedIn) {
                socketEmit('player:status', { uid: auth.uid, status: 'Online' });
            }
            if (uiStateRef.current.showFriends || uiStateRef.current.showLeaderboard) {
                loadAllPlayers();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [auth.isLoggedIn, auth.uid]);

    useEffect(() => {
        console.log('[Socket] Connecting to:', socketUrl);
        setConnStatus('Connecting');

        const finalUrl = socketUrl.endsWith('/') ? socketUrl.slice(0, -1) : socketUrl;

        fetch(`${finalUrl}/health`).then(r => {
            console.log('[Socket] Health check response:', r.status);
        }).catch(e => {
            console.warn('[Socket] Health check FAILED.');
        });

        socketRef.current = io(finalUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            transports: ['polling', 'websocket'],
            withCredentials: false,
            extraHeaders: {
                "bypass-tunnel-reminder": "true"
            }
        });

        socketRef.current.on('connect', () => {
            setConnStatus('Connected');
            addToast('Connected to Game Server', 'info');
            socketRef.current?.emit('br:get_rooms');

            if (globalProfile.uid) {
                socketRef.current?.emit('player:identify', {
                    uid: globalProfile.uid,
                    name: globalProfile.username,
                    avatar: globalProfile.avatar
                });
            }
        });

        socketRef.current.on('disconnect', (reason) => {
            setConnStatus('Disconnected');
            if (reason === 'io server disconnect') {
                socketRef.current?.connect();
            }
            addToast('Lost connection to server. Retrying...', 'info');
        });

        socketRef.current.on('connect_error', (error) => {
            setConnStatus('Error');
            if (error.message === 'xhr poll error') {
                addToast('Connection Error: Server unreachable!', 'info');
            }
        });

        socketRef.current.on('br:init', (data: any) => {
            gameRef.current.safeZone = data.safeZone;
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
            addToast(`${data.pData.name} joined`, 'info');
            syncUI();
        });

        socketRef.current.on('br:room_list', (data: any[]) => {
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

        socketRef.current.on('br:batch_update', (updates: any[]) => {
            updates.forEach(u => {
                let p = gameRef.current.brPlayers.find((pp: any) => pp.socketId === u.socketId);
                if (p) {
                    p.targetX = u.x; p.targetY = u.y;
                    p.vx = u.vx; p.vy = u.vy; p.targetAngle = u.angle;
                    if (u.hp !== undefined) p.hp = u.hp;
                }
            });
        });
        socketRef.current.on('br:player_left', (data: any) => {
            const leftPlayer = gameRef.current.brPlayers.find((pp: any) => pp.socketId === data.socketId);
            if (leftPlayer) addToast(`${leftPlayer.name} left`, 'info');

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
            gameRef.current.bullets.push({ ...data, isEnemy: true, penetration: data.penetration || 1 });
        });
        socketRef.current.on('br:zone_update', (data: any) => {
            gameRef.current.safeZone = data.safeZone;
            setUiState((p: any) => {
                if (p.brTimeLeft !== data.timeLeft || p.brStarted !== data.started) {
                    return { ...p, brTimeLeft: data.timeLeft, brStarted: data.started };
                }
                return p;
            });
        });
        socketRef.current.on('br:hp_update', (data: any) => {
            let p = gameRef.current.brPlayers.find((pp: any) => pp.socketId === data.socketId);
            if (p) {
                p.hp = data.hp;
                p.alive = data.alive;
                if (!data.alive) p.hp = 0;
            }
            if (data.socketId === socketRef.current?.id && gameRef.current.player) {
                gameRef.current.player.hp = data.hp;
            }
        });
        socketRef.current.on('br:kill_feed', (data: any) => {
            if (data.aliveCount !== undefined) {
                setUiState((p: any) => ({ ...p, brAlive: data.aliveCount }));
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
            
            // Notification for our own kills
            const myName = auth.isLoggedIn ? auth.username : globalProfile.username;
            if (data.killerName === myName) {
                addToast(`Killed ${data.victimName}!`, 'info');
                playSound('levelup'); 
            }
            
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

        const pingInterval = setInterval(() => {
            socketEmit('br:ping', Date.now());
        }, 2000);

        return () => {
            clearInterval(pingInterval);
            socketRef.current?.disconnect();
        };
    }, [auth.uid, auth.username, socketUrl]);

    const saveProfile = async (newProfile: any) => {
        setGlobalProfile(newProfile);
        // 1. Save into local storage FIRST
        localStorage.setItem('pixshot_profile', JSON.stringify(newProfile));
        
        // 2. Send to Supabase asynchronously
        if (newProfile.uid) {
            try {
                await supabase.from('players').update({
                    coins: newProfile.coins,
                    tokens: newProfile.tokens,
                    highscore: newProfile.highscore,
                    total_kills: newProfile.totalKills,
                    matches: newProfile.matches,
                    owned_classes: newProfile.ownedClasses,
                    avatar: newProfile.avatar,
                    playtime: newProfile.playtime
                }).eq('uid', newProfile.uid);
            } catch (err) {
                console.warn("Failed to sync to Supabase (playing offline)", err);
            }
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
                    const MAX_SIZE = 128;
                    let w = img.width;
                    let h = img.height;
                    if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } }
                    else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, w, h);
                    const shrunkBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    if (isOnboarding) setOnboardingData((p: any) => ({ ...p, avatar: shrunkBase64 }));
                    else setAuthInput((p: any) => ({ ...p, avatar: shrunkBase64 }));
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
            window.location.reload();
        } else {
            addToast("Error creating profile. Username might be taken.", "info");
        }
    };

    const handleLoginRegister = async (isRegister: boolean) => {
        if (!authInput.user || !authInput.pass) {
            addToast("Username and Password are required", 'info');
            return;
        }

        const username = authInput.user.trim();
        const password = authInput.pass.trim();

        if (isRegister) {
            const { data: existing } = await supabase.from('players').select('uid').eq('username', username).single();
            if (existing) {
                addToast("Username already taken.", 'info');
                return;
            }

            const newUid = Math.random().toString(36).substring(2, 10).toUpperCase();
            const { error } = await supabase.from('players').insert([{
                uid: newUid,
                username: username,
                password: password,
                coins: 0, tokens: 0, highscore: 0, total_kills: 0, matches: 0, owned_classes: ['basic'],
                avatar: authInput.avatar || ''
            }]);

            if (error) {
                addToast("Register Error: " + error.message, 'info');
            } else {
                addToast("Success! You can now login.", 'info');
                setAuthView('login');
            }
        } else {
            const { data: profile, error } = await supabase
                .from('players')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (error || !profile) {
                addToast("Login Failed: Invalid username or password", 'info');
                return;
            }

            setAuth({ isLoggedIn: true, username: profile.username, uid: profile.uid, password: '' });
            localStorage.setItem('pixshot_session', JSON.stringify({ uid: profile.uid }));

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

            setUiState((p: any) => ({ ...p, showAuth: false }));
            addToast(`Welcome back, ${profile.username}!`, 'info');
        }
    };

    const playAsGuest = async () => {
        const newUid = Math.random().toString(36).substring(2, 10).toUpperCase();
        const guestName = 'Guest_' + newUid.substring(0, 4);
        
        const { error } = await supabase.from('players').insert([{
            uid: newUid,
            username: guestName,
            password: '', 
            coins: 0, tokens: 0, highscore: 0, total_kills: 0, matches: 0, owned_classes: ['basic'],
            avatar: ''
        }]);
        
        if (!error) {
            setAuth({ isLoggedIn: true, username: guestName, uid: newUid, password: '' });
            localStorage.setItem('pixshot_session', JSON.stringify({ uid: newUid }));
            
            setGlobalProfile({
                username: guestName, uid: newUid, coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '', playtime: 0
            });
            
            setUiState((p: any) => ({ ...p, showAuth: false }));
            addToast(`Playing as ${guestName}. Progress synced to cloud!`, 'info');
        } else {
            addToast("Failed to initialize guest connection to server.", 'info');
        }
    };

    const logout = async () => {
        setAuth({ isLoggedIn: false, username: '', uid: '', password: '' });
        localStorage.removeItem('pixshot_session');
        setGlobalProfile({ username: 'Guest', uid: Math.random().toString(36).substring(2, 10).toUpperCase(), coins: 0, tokens: 0, highscore: 0, totalKills: 0, matches: 0, ownedClasses: ['basic'], avatar: '', playtime: 0 });
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
        if (uiState.gameMode === 'god') return;
        const state = gameRef.current;
        if (state.isGameOver) return;
        state.isGameOver = true;
        const survived = Math.floor((Date.now() - state.sessionStart) / 1000);
        const earnedCoins = Math.floor(state.score / 25) + state.sessionCoins;

        const currentProfile = globalProfileRef.current;
        let newP = { ...currentProfile, coins: currentProfile.coins + earnedCoins, totalKills: currentProfile.totalKills + state.kills, matches: currentProfile.matches + 1 };
        if (state.score > newP.highscore) newP.highscore = Math.floor(state.score);
        if (!newP.playtime || survived > newP.playtime) newP.playtime = survived;
        saveProfile(newP);
        state.sessionCoins = 0;

        setUiState((prev: any) => ({ ...prev, isGameOver: true, inGameCoins: 0, gameStats: { kills: state.kills, maxCombo: state.combo.max, timeSurvived: survived } }));
        socketEmit('br:died');
    };

    const exitToMainMenu = () => {
        if (!uiState.isGameOver) processGameOver();
        gameRef.current.isPaused = false;
        setParty([]);
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
            socketEmit('friend:invite', { toUid: friend.uid, fromName: auth.isLoggedIn ? auth.username : globalProfile.username, fromUid: auth.isLoggedIn ? auth.uid : globalProfile.uid });
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

    useEffect(() => {
        const canvas = glCanvasRef.current;
        if (!canvas) return;
        const gameGl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
        if (!gameGl) { console.error("WebGL failed to initialize context"); return; }
        glRef.current = gameGl;

        if (canvasRef.current && glCanvasRef.current) {
            rendererRef.current = new GameRenderer(canvasRef.current, glCanvasRef.current);
        }

        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            uniform vec2 u_resolution;
            varying vec2 v_texCoord;
            void main() {
                vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_texCoord = a_texCoord;
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform vec4 u_color;
            uniform float u_useTexture;
            void main() {
                vec4 tex = vec4(1.0);
                if (u_useTexture > 0.5) tex = texture2D(u_image, v_texCoord);
                gl_FragColor = tex * u_color;
            }
        `;

        const createShader = (glContext: WebGLRenderingContext, type: number, source: string) => {
            const shader = glContext.createShader(type)!;
            glContext.shaderSource(shader, source);
            glContext.compileShader(shader);
            if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
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
        if (!gameGl.getProgramParameter(program, gameGl.LINK_STATUS)) {
            return;
        }
        glProgramRef.current = program;

        gameGl.useProgram(program);
        gameGl.enable(gameGl.BLEND);
        gameGl.blendFunc(gameGl.SRC_ALPHA, gameGl.ONE_MINUS_SRC_ALPHA);

        glLocsRef.current = {
            pos: gameGl.getAttribLocation(program, 'a_position'),
            tex: gameGl.getAttribLocation(program, 'a_texCoord'),
            res: gameGl.getUniformLocation(program, 'u_resolution'),
            col: gameGl.getUniformLocation(program, 'u_color'),
            useTex: gameGl.getUniformLocation(program, 'u_useTexture'),
            img: gameGl.getUniformLocation(program, 'u_image')
        };
        glBufferRef.current = gameGl.createBuffer();

        const types = ['dirt', 'wood', 'stone', 'diamond', 'emerald', 'soulSand', 'sand', 'ice', 'water', 'netherrack', 'bedrock', 'tnt', 'tex_warden'];
        types.forEach(t => {
            const tex = generateTexture(t);
            if (tex) {
                texturesRef.current[t] = tex;
            }
        });
        shadowTexRef.current = createShadowTexture();

        const loadLocalTexture = (id: string, src: string) => {
            const img = new Image(); img.src = src;
            img.onload = () => {
                if (img) texturesRef.current[id] = img;
            };
        };

        const localItems = {
            'shape_grass': '/grass.png',
            'enemy_creeper': '/creeper.png',
            'enemy_enderman': '/enderman.png',
            'enemy_zombie': '/Zombie.png',
            'enemy_spider': '/spider.png',
            'enemy_slime': '/slime.png',
            'enemy_skeleton': '/skeleton.png',
            'enemy_golem': '/golem.png',
            'shape_planks': '/planks.png',
            'shape_stone': '/stone.png',
            'shape_dirt': '/dirt.png',
            'enemy_sonic': '/sonic.png',
            'enemy_ghast': '/ghast.png',
            'shape_tnt': '/tnt.png',
            'tree': '/tree.png',
            'house': '/House.png',
            'tank_basic': '/biasa.png',
            'tank_warden': '/miaw.png',
            'tank_flamethrower': '/fire.png',
            'tank_melee': '/grund.png',
            'tank_machinegun': '/gun.png',
            'tank_necromancer': '/necro.png',
            'coin_local': '/coin.png'
        };
        Object.entries(localItems).forEach(([id, src]) => loadLocalTexture(id, src));

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 1024);
        setSettings((prev: any) => ({ ...prev, isMobile: isMobile, joystickScale: isMobile ? 1.2 : 1.0, uiScale: isMobile ? 0.75 : 1.0 }));

    }, [mounted]);

    const statsList = [
        { id: 'regen', name: 'Regeneration', color: 'bg-pink-500' }, { id: 'maxHp', name: 'Health', color: 'bg-red-500' },
        { id: 'bodyDmg', name: 'Body Damage', color: 'bg-purple-500' }, { id: 'bulletSpd', name: 'Bullet Speed', color: 'bg-blue-500' },
        { id: 'bulletPen', name: 'Bullet Pen', color: 'bg-yellow-400' }, { id: 'bulletDmg', name: 'Damage', color: 'bg-orange-500' },
        { id: 'reload', name: 'Reload', color: 'bg-green-500' }, { id: 'moveSpd', name: 'Move Speed', color: 'bg-teal-400' },
        { id: 'magazine', name: 'Magazine', color: 'bg-amber-400' }, { id: 'skill', name: 'Skill', color: 'bg-cyan-400' },
        { id: 'fireRate', name: 'Fire Rate', color: 'bg-indigo-400' }
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

            <GameCanvas
                uiState={uiState}
                settings={settings}
                engineRef={engineRef}
                rendererRef={rendererRef}
                canvasRef={canvasRef}
                glCanvasRef={glCanvasRef}
                glRef={glRef}
                glProgramRef={glProgramRef}
                glTexturesRef={glTexturesRef}
                texturesRef={texturesRef}
                glLocsRef={glLocsRef}
                glBufferRef={glBufferRef}
                shadowTexRef={shadowTexRef}
                gameRef={gameRef}
                uiStateRef={uiStateRef}
                settingsRef={settingsRef}
                loopActiveRef={loopActiveRef}
                onGameUpdate={syncUI}
            />
            <TouchControls
                settings={settings}
                uiState={uiState}
                gameRef={gameRef}
                canvasRef={canvasRef}
                setJoystick={setJoystick}
            />

            {/* TOAST SYSTEM */}
            <div className="absolute top-24 right-4 flex flex-col items-end gap-1.5 z-[9999] pointer-events-none">
                {toasts.map((toast: any) => (
                    <div key={toast.id} className="bg-slate-900/80 border border-slate-700/50 text-white px-3 py-2 rounded-lg shadow-xl flex flex-col gap-2 w-full max-w-[200px] pointer-events-auto animate-[slideInRight_0.2s_ease-out] backdrop-blur-lg">
                        <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-base drop-shadow-md ${toast.type === 'invite' ? 'text-amber-400' : 'text-cyan-400'}`}>
                                    {toast.type === 'invite' ? '✉️' : '🔔'}
                                </span>
                                <div className="font-bold text-[11px] uppercase tracking-wider truncate flex-1">{toast.message}</div>
                            </div>
                            {toast.type !== 'invite' && <button onClick={() => removeToast(toast.id)} className="text-slate-500 hover:text-white text-[10px]">✕</button>}
                        </div>
                        {toast.type === 'invite' && (
                            <div className="flex gap-1.5">
                                <button onClick={() => { toast.extra?.onAccept?.(); removeToast(toast.id); }} className="flex-1 bg-emerald-600/90 hover:bg-emerald-500 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border border-emerald-400/50">Accept</button>
                                <button onClick={() => removeToast(toast.id)} className="flex-1 bg-slate-700/90 hover:bg-slate-600 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border border-slate-500/50">Decline</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* TOUCH CONTROLS */}
            {uiState.isPlaying && !uiState.isGameOver && !uiState.isPaused && settings.isMobile && (
                <>
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

            {/* GODMODE CLASS SWITCHER - LOWERED TO AVOID HUD */}
            {uiState.isPlaying && uiState.gameMode === 'god' && !uiState.isGameOver && !uiState.isPaused && (
                <div className="absolute top-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[100] animate-in fade-in slide-in-from-top-8">
                    {!uiState.godTerminalMinimized ? (
                        <>
                            <div className="bg-slate-900/95 backdrop-blur-2xl p-4 rounded-[2.5rem] border-2 border-cyan-500/40 flex gap-4 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_20px_rgba(6,182,212,0.3)] overflow-x-auto max-w-[95vw] scrollbar-hide py-6 px-8 relative">
                                <button 
                                    onClick={() => setUiState((p: any) => ({ ...p, godTerminalMinimized: true }))}
                                    className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 text-white flex items-center justify-center hover:bg-slate-700 hover:scale-110 transition-all z-10 shadow-lg"
                                >
                                    ✕
                                </button>
                                {Object.entries(CLASSES).map(([id, cfg]: any) => (
                                    <button
                                        key={id}
                                        onClick={() => {
                                            if (gameRef.current.player) {
                                                gameRef.current.player.class = id;
                                                gameRef.current.player.type = 'tank_' + id;
                                                gameRef.current.player.hp = gameRef.current.player.maxHp;
                                                setUiState((p: any) => ({ ...p, playerClass: id }));
                                                playSound('click');
                                            }
                                        }}
                                        className={`group relative flex flex-col items-center gap-2 p-2 rounded-2xl transition-all duration-300 ${uiState.playerClass === id ? 'bg-cyan-500/20 scale-110' : 'hover:bg-slate-800/50 hover:-translate-y-1'}`}
                                    >
                                        <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl border-2 flex items-center justify-center p-2 transition-all ${uiState.playerClass === id ? 'border-cyan-400 bg-cyan-900/40 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-slate-700 bg-slate-950/60 group-hover:border-slate-500'}`}>
                                            <img src={cfg.previewImg || '/biasa.png'} alt={cfg.name} className="w-full h-full object-contain drop-shadow-lg" />
                                        </div>
                                        <span className={`text-[9px] md:text-[11px] font-black uppercase tracking-widest ${uiState.playerClass === id ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                            {cfg.name}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* SHOWCASE PANEL */}
                            <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-700/50 p-7 rounded-[2.5rem] flex flex-col md:flex-row gap-8 shadow-2xl animate-in zoom-in slide-in-from-bottom-4 max-w-2xl ring-1 ring-white/10">
                                <div className="flex flex-col gap-3 min-w-[200px]">
                                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                                        {CLASSES[uiState.playerClass]?.name} <span className="text-cyan-400 text-[10px] tracking-[0.4em] font-normal block mt-2 opacity-80">OPERATIVE DATA</span>
                                    </h3>
                                    <div className="h-1 w-12 bg-cyan-500 rounded-full mb-1"></div>
                                    <p className="text-slate-400 text-[11px] leading-relaxed max-w-[250px] font-medium">
                                        {CLASSES[uiState.playerClass]?.desc || 'Standard battle variant for specialized operations.'}
                                    </p>
                                </div>
                                
                                <div className="flex-1 flex flex-col gap-5 border-l border-slate-800 md:pl-10">
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        {CLASSES[uiState.playerClass]?.skills?.slice(0, 5).map((s: any, i: number) => (
                                            <div key={i} className="flex items-center gap-4 group">
                                                <div className="w-10 h-10 rounded-xl bg-slate-950 border-2 border-slate-800 flex items-center justify-center text-xs font-black text-cyan-400 group-hover:border-cyan-500 group-hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all">
                                                    {i + 1}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-black text-slate-100 uppercase tracking-wide group-hover:text-cyan-400 transition-colors">{s.name}</span>
                                                    <span className="text-[9px] text-slate-500 uppercase font-black">CD: {Math.ceil(s.cd / 60)}s • {s.type}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <button 
                            onClick={() => setUiState((p: any) => ({ ...p, godTerminalMinimized: false }))}
                            className="bg-cyan-500/10 hover:bg-cyan-500/20 backdrop-blur-xl px-10 py-5 rounded-full border-2 border-cyan-500/40 text-cyan-400 font-black uppercase tracking-[0.3em] text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all animate-in zoom-in"
                        >
                            Open God Terminal
                        </button>
                    )}
                </div>
            )}

            {/* PAUSE OVERLAY */}
            {uiState.isPaused && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[999]">
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

            {/* AUTH MENU */}
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
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-cyan-400 transition-colors">🔒</span>
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
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
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
                                                <span className="text-2xl">👤</span>
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

                                <button onClick={() => setAuthView('login')} className="text-center text-slate-500 text-xs font-bold hover:text-white transition-colors">Back to Login Terminal</button>
                            </div>
                        )}

                        {/* ONBOARDING VIEW */}
                        {authView === 'onboarding' && (
                            <div className="w-full flex flex-col gap-6 text-center">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl mb-2">
                                    <p className="text-[10px] text-emerald-400 font-bold tracking-wider leading-relaxed">System Sync Active. Please establish your combat handle to continue.</p>
                                </div>

                                <div className="flex flex-col items-center gap-6">
                                    <div className="relative group w-28 h-28 rounded-full bg-slate-800 border-4 border-emerald-500/30 overflow-hidden shadow-2xl">
                                        {onboardingData.avatar ? <img src={onboardingData.avatar} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-4xl">👤</div>}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleAvatarUpload(e, true)} />
                                    </div>

                                    <div className="w-full space-y-4">
                                        <div className="text-left">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2 mb-2 block">Choose Handle</label>
                                            <input type="text" placeholder="E.g. X_Terminator_99" className="w-full bg-slate-800/80 border-2 border-slate-700 text-white px-6 py-4 rounded-2xl outline-none focus:border-emerald-500 transition-all font-black" value={onboardingData.username} onChange={e => setOnboardingData((p: any) => ({ ...p, username: e.target.value }))} />
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

            {/* MAIN MENU */}
            {(!uiState.isPlaying || uiState.isGameOver) && !uiState.showAuth && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto custom-scrollbar">
                    <div className="w-full max-w-7xl flex flex-col lg:flex-row items-center gap-8 lg:gap-16 transition-all duration-700 h-full max-h-[90vh]" style={{ transform: `scale(${settings.uiScale})` }}>
                        
                        {/* LEFT PANEL: HERO SHOWCASE */}
                        <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-left-12 duration-1000">
                                <h1 className="text-6xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-500 to-cyan-400 tracking-tighter drop-shadow-[0_0_40px_rgba(6,182,212,0.6)] mb-2 md:mb-6 text-center z-10 uppercase w-full">PixShot.io</h1>

                                <div className="z-10 mb-6 md:mb-12 flex items-center gap-3 bg-slate-900/60 px-5 py-2 rounded-full border border-emerald-500/30 backdrop-blur-xl pointer-events-auto shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                    <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${connStatus === 'Connected' ? 'bg-emerald-400 shadow-[0_0_12px_#10b981]' : connStatus === 'Connecting' ? 'bg-amber-400 shadow-[0_0_12px_#f59e0b]' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'}`}></div>
                                    <span className={`text-[10px] md:text-[13px] font-black uppercase tracking-[0.3em] ${connStatus === 'Connected' ? 'text-emerald-400' : connStatus === 'Connecting' ? 'text-amber-400' : 'text-red-400'}`}>Server: {connStatus}</span>
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
                                            <span className="text-2xl opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-transform">💰</span>
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
                                                <button onClick={() => setUiState((p: any) => ({ ...p, showFriends: true }))} className="bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl w-12 h-12 flex items-center justify-center border border-white/5 relative transition-all active:scale-90 text-xl">
                                                    👥
                                                    {(friendRequests.length > 0) && <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 font-black">{friendRequests.length}</span>}
                                                </button>
                                                <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: true }))} className="bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl w-12 h-12 flex items-center justify-center border border-white/5 transition-all active:scale-90 text-xl">⚙️</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 md:gap-4 overflow-y-auto max-h-[300px] md:max-h-none pr-2 custom-scrollbar">
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'normal' }))} className={`group relative h-24 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'normal' ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">🛡️</span>
                                                    <span className="font-black uppercase tracking-widest text-[10px] md:text-xs">Survival</span>
                                                </div>
                                                {uiState.gameMode === 'normal' && <div className="absolute inset-0 border-2 border-cyan-400 rounded-3xl animate-pulse"></div>}
                                            </button>
                                            <button onClick={() => setUiState((p: any) => ({ ...p, gameMode: 'battleroyale', showServerBrowser: true, targetRoomId: null }))} className={`group relative h-28 md:h-32 rounded-3xl border transition-all duration-300 overflow-hidden ${uiState.gameMode === 'battleroyale' ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.15)] scale-105 z-20' : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'}`}>
                                                <div className="flex flex-col items-center justify-center gap-2 h-full">
                                                    <span className="text-3xl filter saturate-150">👑</span>
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
                                                    <span className="text-xl">⚡</span>
                                                    <span className="font-black uppercase tracking-[0.3em] text-[10px]">God Mode (Creative)</span>
                                                </div>
                                            </button>
                                        </div>

                                        <button onClick={() => {
                                            if (party.length > 0 && party.some((p: any) => p.isReady === false)) { alert("All party members must be Ready!"); return; }
                                            if (uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') { setUiState((p: any) => ({ ...p, showServerBrowser: true })); socketEmit('br:get_rooms'); } else { startGame(uiState.gameMode); }
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
            )}

            {/* SERVER BROWSER MENU */}
            {uiState.showServerBrowser && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] pointer-events-auto">
                    <div className="origin-center transition-transform duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${settings.uiScale})` }}>
                        <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-cyan-500/50 w-full max-w-4xl shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[85vh] overflow-hidden">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                                <h2 className="text-2xl font-black text-cyan-400 tracking-widest uppercase flex items-center gap-3">🌐 Server Browser</h2>
                                <div className="flex gap-4">
                                    <button onClick={() => socketRef.current?.emit('br:get_rooms')} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-600 font-bold transition-colors text-xs md:text-sm">🔄 Refresh</button>
                                    <button onClick={() => setUiState((p: any) => ({ ...p, showServerBrowser: false }))} className="text-slate-500 hover:text-white bg-slate-800 hover:bg-red-500/20 px-4 rounded-xl border border-slate-600 hover:border-red-500/50 transition-colors text-lg font-bold">✕</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-12 text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 pb-2 border-b border-slate-800 shrink-0 mt-4">
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
                                <h2 className="text-2xl font-black text-blue-400 tracking-widest uppercase flex items-center gap-3">🌐 Connections</h2>
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
                                            <div className="flex-1">
                                                <div className="font-bold text-white text-2xl">{inspectUser.username || inspectUser.name}</div>
                                                <div className="text-xs font-bold mt-1 text-slate-400">UID: {inspectUser.uid}</div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 w-full mt-2">
                                                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Highscore</div>
                                                    <div className="text-xl font-black text-amber-400 font-mono">{inspectUser.highscore || 0}</div>
                                                </div>
                                                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Total Kills</div>
                                                    <div className="text-xl font-black text-red-400 font-mono">{inspectUser.total_kills || 0}</div>
                                                </div>
                                                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 col-span-2">
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Total Playtime</div>
                                                    <div className="text-sm font-black text-cyan-400 font-mono">
                                                        {Math.floor((inspectUser.playtime || 0) / 3600)}h {Math.floor(((inspectUser.playtime || 0) % 3600) / 60)}m
                                                    </div>
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
                                {/* TAB: FRIENDS/ALL */}
                                {(friendTab === 'friends' || friendTab === 'all') && (friendTab === 'friends' ? friends : allPlayers.filter(p => p.username.toLowerCase().includes(addFriendInput.toLowerCase()) || p.uid.includes(addFriendInput))).map((f: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
                                            const idx = allPlayers.find((p: any) => p.uid === f.uid);
                                            if (idx) setInspectUser(idx);
                                        }}>
                                            <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-500 overflow-hidden shrink-0">
                                                {allPlayers.find((p: any) => p.uid === f.uid)?.avatar ? <img src={allPlayers.find((p: any) => p.uid === f.uid)?.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-black">👤</div>}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white text-lg">{f.username || f.name}</div>
                                                <div className={`text-xs font-bold mt-1 ${f.uid === auth.uid ? 'text-cyan-400' : 'text-slate-400'}`}>{f.uid === auth.uid ? '👤 (You)' : 'UID: ' + f.uid}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            {friendTab === 'friends' && (
                                                <>
                                                    <button onClick={() => openPrivateChat({ uid: f.uid, name: f.name })} className="text-xl px-2 text-indigo-400 hover:text-indigo-300" title="Private Chat">💬</button>
                                                    <button onClick={async () => {
                                                        if (window.confirm(`Unfriend ${f.name}?`)) {
                                                            await supabase.from('friends').delete().match({ user_uid: auth.uid, friend_uid: f.uid });
                                                            await supabase.from('friends').delete().match({ user_uid: f.uid, friend_uid: auth.uid });
                                                            loadFriends();
                                                        }
                                                    }} className="text-xl px-2 text-red-400 hover:text-red-300" title="Remove Friend">🗑️</button>
                                                    <button onClick={() => inviteToParty({ uid: f.uid, name: f.name })} disabled={party.some((p: any) => p.uid === f.uid) || party.length >= 3} className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/50 px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                                                        Invite Mode
                                                    </button>
                                                </>
                                            )}
                                            {friendTab === 'all' && f.uid !== auth.uid && !friends.find(x => x.uid === f.uid) && (
                                                <button onClick={async () => {
                                                    addToast(`Send friend request to ${f.username}?`, 'invite', {
                                                        onAccept: async () => {
                                                            await supabase.from('friends').insert({ user_uid: auth.uid, friend_uid: f.uid, friend_name: f.username, status: 'pending' });
                                                            socketRef.current?.emit('friend:request', { user_uid: auth.uid, friend_uid: f.uid, user_name: auth.username || globalProfile.username });
                                                            addToast("Friend request sent", 'info');
                                                        }
                                                    });
                                                }} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/50 px-3 py-2 rounded-lg font-bold text-sm transition-colors">
                                                    ➕ Add Friend
                                                </button>
                                            )}
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
                                            }} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-3 py-2 rounded-lg font-bold text-sm transition-colors">
                                                Accept
                                            </button>
                                            <button onClick={async () => {
                                                await supabase.from('friends').delete().match({ user_uid: r.uid, friend_uid: auth.uid });
                                                loadFriends();
                                            }} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/50 px-3 py-2 rounded-lg font-bold text-sm transition-colors">
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {friendTab === 'requests' && friendRequests.length === 0 && <div className="text-center text-slate-500 py-8 font-bold text-sm">No pending friend requests.</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PROFILE MODAL */}
            {uiState.showProfile && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] pointer-events-auto">
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
                <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] pointer-events-auto">
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
                                            {isEquipped ? 'DEPLOYED' : 'TRANSFORM'}
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
                                <p className="text-slate-400 font-bold mt-1 text-sm">Money: <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded ml-1">{globalProfile.coins} 💰</span> | Tokens: <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded ml-1">{globalProfile.tokens} 💎</span></p>
                            </div>
                            <button onClick={toggleShop} className="text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full w-12 h-12 flex items-center justify-center font-bold text-xl transition-colors">✕</button>
                        </div>

                        <div className="mb-8 bg-slate-800/50 border border-slate-700 rounded-2xl p-6 flex flex-col md:flex-row gap-4 justify-between items-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-emerald-500/5"></div>
                            <div className="relative z-10 text-center md:text-left">
                                <div className="text-emerald-400 font-black text-xl uppercase tracking-widest flex items-center gap-2 justify-center md:justify-start">Respawn Token</div>
                                <div className="text-slate-400 text-sm mt-1">Use to instantly revive when destroyed. Cost: <span className="text-amber-400 font-bold">10 💰</span></div>
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
                                                    {isOwned ? (isGodMode ? 'FREE' : 'OWNED') : `Cost: ${cls.price} 💰`}
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
                                        > {isEquipped ? 'EQUIPPED' : isOwned ? 'EQUIP' : 'PURCHASE'} </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* HUD GAMEPLAY (ATAS) */}
            {uiState.isPlaying && !uiState.showSettings && !uiState.isPaused && (
                <div className="absolute inset-0 pointer-events-none z-40 select-none game-overlay flex flex-col p-4 md:p-6 transition-all">
                    <div className="flex justify-between items-start w-full relative">

                        {/* LEFT WING: STATUS, ACTIONS & UPGRADES */}
                        <div className="flex flex-col gap-3 pointer-events-auto portrait-shrink" style={{ transform: `scale(${settings.uiScale})`, transformOrigin: 'top left' }}>
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
                                        <div className="w-px h-8 bg-white/5"></div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ping</span>
                                            <span className="text-lg font-black text-white font-mono">{ping}ms</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-2 bg-slate-900/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shadow-xl w-fit">
                                <button onClick={togglePause} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center border border-slate-700 transition-all font-bold">||</button>
                                <button onClick={() => setUiState((p: any) => ({ ...p, showSettings: true }))} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center border border-slate-700 transition-all text-xl">⚙️</button>

                                {uiState.statPoints > 0 && (
                                    <button onClick={() => setUiState((p: any) => ({ ...p, showUpgrades: !p.showUpgrades }))}
                                        className="px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl flex items-center gap-2 border border-cyan-400/50 transition-all animate-pulse">
                                        <span className="text-sm font-black uppercase italic">Evolve</span>
                                        <span className="bg-white/20 px-1.5 rounded text-[10px]">{uiState.statPoints}</span>
                                    </button>
                                )}

                                <div className="flex flex-col gap-1 ml-1">
                                    <button onClick={() => { gameRef.current.camera.zoom = Math.min(2.5, gameRef.current.camera.zoom + 0.1); }} className="w-10 h-6 bg-slate-700 hover:bg-slate-600 text-white rounded-md flex items-center justify-center border border-slate-600 text-[12px] font-black" title="Zoom In">+</button>
                                    <button onClick={() => { gameRef.current.camera.zoom = Math.max(0.3, gameRef.current.camera.zoom - 0.1); }} className="w-10 h-6 bg-slate-700 hover:bg-slate-600 text-white rounded-md flex items-center justify-center border border-slate-600 text-[12px] font-black" title="Zoom Out">-</button>
                                </div>
                            </div>

                            {uiState.showUpgrades && uiState.statPoints > 0 && (
                                <div className="mt-4 bg-slate-950/90 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.3)] w-80 animate-in slide-in-from-top duration-300">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-black text-white tracking-tighter italic">AUGMENTATION</h3>
                                        <button onClick={() => setUiState((p: any) => ({ ...p, showUpgrades: false }))} className="text-slate-500 hover:text-white transition-colors">✕</button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2.5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {statsList.map(s => (
                                            <button key={s.id} onClick={() => upgradeStat(s.id)}
                                                className={`group flex items-center justify-between p-3 rounded-2xl border transition-all ${(uiState.stats[s.id] || 0) >= 10 ? 'opacity-50 border-white/5 bg-slate-900 cursor-default' : 'bg-slate-900 border-white/5 hover:border-cyan-500/50 hover:bg-slate-800 active:scale-95'}`}>
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-cyan-400">{s.name}</span>
                                                    <div className="flex gap-0.5">
                                                        {[...Array(10)].map((_, i) => (
                                                            <div key={i} className={`w-3.5 h-1 rounded-full ${i < (uiState.stats[s.id] || 0) ? s.color : 'bg-white/5'}`}></div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <span className="text-xs font-black text-white bg-white/5 px-2 py-1 rounded-lg">{uiState.stats[s.id] || 0}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* CENTER HUB: SCORE, COINS, KILLS, STREAK */}
                        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 portrait-shrink" style={{ transform: `translateX(-50%) scale(${settings.uiScale})` }}>
                            <div className="bg-slate-950/80 backdrop-blur-2xl px-6 py-2 md:px-8 md:py-3 rounded-2xl md:rounded-3xl border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col items-center min-w-[160px] md:min-w-[200px]">
                                <span className="text-[8px] font-black text-amber-500 uppercase tracking-[0.4em] leading-none mb-1">Terminal Master</span>
                                <div className="flex items-baseline gap-3 md:gap-4">
                                    <span className="text-2xl md:text-4xl font-black text-white font-mono tracking-tighter">{Math.floor(uiState.score).toLocaleString()}</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] font-bold text-amber-400 font-mono">{uiState.inGameCoins} 💰</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
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
                                <div className="bg-slate-900/60 backdrop-blur-md px-4 py-1 rounded-full border border-white/10 flex items-center justify-between shadow-xl">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ammo</span>
                                    <div className="flex items-center gap-2">
                                        {uiState.isReloading ? (
                                            <span className="text-[10px] font-black text-cyan-400 animate-pulse uppercase tracking-wider">Reloading...</span>
                                        ) : (
                                            <span className="text-sm font-black text-white font-mono">{uiState.ammo} / {uiState.maxAmmo}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* WAITING ROOM UI */}
                            {(uiState.gameMode === 'battleroyale' || uiState.gameMode === 'pvp1v1') && !uiState.brStarted && (
                                <div className="bg-slate-900/95 border border-amber-500/40 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-40 text-center w-[90%] max-w-[400px] pointer-events-auto flex flex-col mt-2">
                                    <div className="text-sm md:text-base font-black text-amber-500 tracking-[0.2em] uppercase mb-1 italic">Lobby Terminal</div>
                                    <div className="text-slate-300 font-bold text-xs md:text-sm mb-2">Survivors: <span className="text-cyan-400 font-black">{uiState.brAlive} / {uiState.brMaxPlayers}</span></div>
                                    <div className="text-[10px] md:text-xs font-bold text-white mb-3 animate-pulse bg-slate-800/80 rounded-xl p-2">{uiState.brCountdownMsg || 'Gathering operatives...'}</div>

                                    <div className="bg-slate-950/50 p-2 border border-slate-700/50 rounded-xl mb-3 text-left overflow-y-auto custom-scrollbar flex-1 max-h-32">
                                        {uiState.lobbyPlayers.map((p: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0 pointer-events-none">
                                                <div className={`font-bold text-[10px] md:text-xs ${(p.uid === globalProfile.uid || p.uid === auth.uid) ? 'text-amber-400' : 'text-slate-200'} truncate mr-2`}>{p.name}</div>
                                                <div className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider whitespace-nowrap ${p.isReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                                    {p.isReady ? 'Ready' : 'Wait'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button onClick={() => {
                                        setUiState((p: any) => ({ ...p, isPlayerReady: !p.isPlayerReady }));
                                        socketRef.current?.emit('br:ready', !uiState.isPlayerReady);
                                    }} className={`w-full py-2.5 text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md shrink-0 ${uiState.isPlayerReady ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white' : 'bg-amber-600/90 hover:bg-amber-500 border border-amber-400 text-white animate-pulse'}`}>
                                        {uiState.isPlayerReady ? 'READY' : 'START INTEGRATION'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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

            {/* INGAME HUD (BOTTOM) */}
            {uiState.isPlaying && !uiState.isGameOver && !uiState.showSettings && !uiState.isPaused && (
                <div className={`absolute left-1/2 transform -translate-x-1/2 w-full max-w-4xl flex flex-col items-center z-[100] pointer-events-none transition-all portrait-center ${settings.isMobile ? 'bottom-2' : 'bottom-10'}`}
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
                                        onClick={(e) => { e.preventDefault(); if (isUnlocked && cd <= 0) gameRef.current.keys[(i + 1).toString()] = true; }}
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

                        <div className="w-full flex flex-col gap-1.5 md:gap-2">
                            <div className="w-full h-5 md:h-7 bg-slate-950/90 border border-red-500/20 rounded-full overflow-hidden relative shadow-2xl p-0.5 md:p-1">
                                <div className="absolute inset-0 flex items-center justify-center text-[9px] md:text-[11px] font-black tracking-widest text-white z-10">
                                    {Math.max(0, Math.floor(uiState.hp))} / {uiState.maxHp || 100} HP
                                </div>
                                <div className="h-full rounded-full transition-all duration-200 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                                    style={{ width: `${Math.min(100, Math.max(0, (uiState.hp / (uiState.maxHp || 100)) * 100))}%`, backgroundImage: 'linear-gradient(to right, #991b1b, #ef4444)' }}></div>
                            </div>

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
                                <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)]"></div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 w-full">
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
        
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
        .safe-top { padding-top: env(safe-area-inset-top); }
        .safe-left { padding-left: env(safe-area-inset-left); }
        .safe-right { padding-right: env(safe-area-inset-right); }
        
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
