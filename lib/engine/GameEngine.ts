import { GameState, Entity, Bullet, Particle, Drop, Powerup, Camera } from './types';
import { GameSystems } from './Systems';
import { WORLD_SIZE, MAX_PARTICLES, ENTITIES } from './Config';

const INDONESIAN_NAMES = [
    "Budi Santoso", "Agus Setiawan", "Siti Aminah", "Eko Prasetyo", "Dewi Lestari",
    "Ahmad Fauzi", "Bambang Pamungkas", "Joko Susilo", "Rina Wulandari", "Santi Wijaya",
    "Hafiz Ramadhan", "Syamsul Arifin", "Putu Gede", "Made Wirawan", "Nyoman Sukarja",
    "Wahyu Hidayat", "Dian Purnama", "Rizky Pratama", "Fitri Handayani", "Yoga Prasetya",
    "Adi Nugroho", "Sri Rahayu", "Arief Budiman", "Lina Marlina", "Fajar Maulana",
    "Nanda Kusuma", "Toni Sucipto", "Mega Sari", "Bayu Saputra", "Citra Dewi"
];

export class GameEngine {
    state: GameState;
    lastTime: number;
    accumulatedTime: number;
    readonly timeStep: number = 1000 / 60; // 60 FPS fixed step
    socket: any;

    constructor() {
        this.state = this.getInitialState();
        this.lastTime = performance.now();
        this.accumulatedTime = 0;
    }

    getInitialState(): GameState {
        return {
            player: this.createDefaultPlayer(),
            entities: [],
            bullets: [],
            particles: [],
            drops: [],
            powerups: [],
            decals: [],
            aoeClouds: [],
            env: [],
            camera: { x: 0, y: 0, zoom: 0.8, shake: 0 },
            worldSize: WORLD_SIZE,
            gameMode: 'normal',
            globalTime: 0,
            sessionCoins: 0,
            brPlayers: [],
            keys: {},
            mouse: { x: 0, y: 0, worldX: 0, worldY: 0, isDown: false },
            weather: { type: 'clear', timer: 1000, flash: 0 },
            safeZone: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: WORLD_SIZE / 2 },
            combo: { count: 0, timer: 0 },
            statLevels: { moveSpd: 0, reload: 0, bulletSpd: 0, bulletDmg: 0, bulletPen: 0, bodyDmg: 0, regen: 0, maxHp: 0, magazine: 0, skill: 0, fireRate: 0 },
            baseStats: { speed: 1.4, reload: 30, bSpd: 15, bDmg: 10, bPen: 1, bodyDmg: 5, regen: 0.1, maxHp: 100, magazine: 10, skill: 1, fireRate: 1 }, // KECEPATAN DILAMBATKAN: dari 3.0 ke 2.4 (SLOWED DOWN: 3.0 to 2.4)
            hasSynced: false,
            shapes: [],
            drones: [],
            isPaused: false,
            isGameOver: false,
            sessionStart: Date.now(),
            score: 0,
            kills: 0,
            xp: 0,
            xpNeeded: 50,
            statPoints: 0,
            damageTexts: []
        };
    }

    createDefaultPlayer(): Entity {
        return {
            id: 'local_player',
            type: 'tank_basic',
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0,
            hp: 100, maxHp: 100,
            size: 80,
            angle: (120 * Math.PI) / 180, // Initial rotation set to 120 degrees
            cooldown: 0,
            xp: 0,
            level: 1,
            class: 'basic',
            skillCooldowns: [0, 0, 0, 0, 0],
            activeBuffs: { speed: 0, damage: 0, shield: 0, size: 0, reflect: 0, radar: 0, lava_trail: 0, turret: 0, drone_frenzy: 0 },
            dashCooldown: 0,
            idleTime: 0,
            activeUlt: '',
            ultDuration: 0,
            ammo: 10, maxAmmo: 10,
            isReloading: false,
            reloadTimer: 0,
            animState: 'idle',
            animFrame: 0
        } as Entity;
    }

    update() {
        const now = performance.now();
        const deltaTime = Math.min(now - this.lastTime, 100);
        this.lastTime = now;

        this.accumulatedTime += deltaTime;

        while (this.accumulatedTime >= this.timeStep) {
            this.processTick(this.timeStep);
            this.accumulatedTime -= this.timeStep;
        }
    }

    processTick(dt: number) {
        this.state.globalTime += 0.016;
        const allObjects = [...this.state.entities, ...this.state.shapes];

        // Spawn Neutral Shapes & Enemies periodically
        if (this.state.globalTime % 1 < 0.05) { // Check every 1 second
            this.spawnNeutralShapes(allObjects);
        }

        // Execute Pipeline
        GameSystems.movement(this.state, dt);
        GameSystems.collision(this.state);
        GameSystems.ai(this.state, dt);

        // --- Handle Pending Actions ---
        const anyState = this.state as any;

        // 1. Handle Multiple Pending Shots (if any)
        if (anyState.pendingShots && anyState.pendingShots.length > 0) {
            anyState.pendingShots.forEach((s: any) => {
                this.fireBullet(s.x, s.y, s.angle, s.type, s.isEnemy, s.ownerId, s.damage);
            });
            anyState.pendingShots = [];
        }

        // 2. Handle Single Pending Shot (from Systems)
        if (anyState.pendingShot) {
            const s = anyState.pendingShot;
            this.fireBullet(s.x, s.y, s.angle, s.type, s.isEnemy, s.ownerId, s.damage);
            anyState.pendingShot = null;
        }

        // 3. Handle Pending Explosions
        const exploders = [...this.state.entities, ...this.state.shapes].filter(e =>
            ((e.hp <= 0 && ENTITIES[e.type]?.explosive) || (e as any).pendingExplode) && !(e as any).hasExploded
        );

        exploders.forEach(e => {
            const cfg = ENTITIES[e.type];
            if (cfg && cfg.explosive) {
                (e as any).hasExploded = true;
                this.spawnExplosion(e.x, e.y, cfg.damage || 150, cfg.radius || 350);
            }
        });

        // 4. Manual Pending Explosions (from Skills / TNT)
        if (anyState.pendingExplosions && anyState.pendingExplosions.length > 0) {
            anyState.pendingExplosions.forEach((e: any) => {
                this.spawnExplosion(e.x, e.y, e.damage, e.radius);
            });
            anyState.pendingExplosions = [];
        }

        if (anyState.pendingExplosion) {
            const e = anyState.pendingExplosion;
            this.spawnExplosion(e.x, e.y, e.damage, e.radius);
            anyState.pendingExplosion = null;
        }

        // 5. Particles (from Skills/VFX)
        if (anyState.pendingParticles && anyState.pendingParticles.length > 0) {
            anyState.pendingParticles.forEach((p: any) => {
                for (let i = 0; i < (p.count || 10); i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 4;
                    this.state.particles.push({
                        x: p.x, y: p.y, z: 0,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        vz: 2 + Math.random() * 5,
                        size: (p.size || 5) * (0.5 + Math.random()),
                        color: p.color || '#fff',
                        life: 1.0,
                        maxLife: 1.0,
                        type: 'rect',
                        rot: Math.random() * Math.PI * 2,
                        rotV: (Math.random() - 0.5) * 0.1
                    });
                }
            });
            anyState.pendingParticles = [];
        }

        // 6. Damage Indicators
        for (let i = this.state.damageTexts.length - 1; i >= 0; i--) {
            const dt = this.state.damageTexts[i];
            dt.life -= 1;
            dt.y -= 1; // Float up
            if (dt.life <= 0) this.state.damageTexts.splice(i, 1);
        }

        // Remove dead entities
        this.state.entities = this.state.entities.filter(e => e.hp > 0);
        this.state.shapes = this.state.shapes.filter(s => s.hp > 0);
    }

    spawnNeutralShapes(allObjects?: any[]) {
        const { shapes, entities, worldSize, gameMode } = this.state;
        const multiplier = (worldSize / 8000);
        const LIMIT = Math.max(20, Math.floor(250 * multiplier));
        const margin = 100; // Margin to prevent spawning at the very edge
        const minDistance = 150; // Increased distance to reduce clustering

        for (let j = 0; j < 10; j++) { // Try to spawn more entities per tick
            if (!allObjects) allObjects = [...this.state.shapes, ...this.state.entities];
            if (shapes.length + entities.length >= LIMIT) break;

            const isEnemyAllowed = gameMode !== 'peaceful' && gameMode !== 'pvp1v1' && gameMode !== 'battleroyale';
            const roll = Math.random();

            let spawnX, spawnY, isValidPosition = false;

            // Try to find a valid position
            for (let attempt = 0; attempt < 10; attempt++) {
                spawnX = -worldSize / 2 + margin + Math.random() * (worldSize - 2 * margin);
                spawnY = -worldSize / 2 + margin + Math.random() * (worldSize - 2 * margin);

                let tooClose = false;
                for (const obj of allObjects) {
                    if (Math.hypot(spawnX - obj.x, spawnY - obj.y) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }
                if (!tooClose) {
                    isValidPosition = true;
                    break;
                }
            }

            if (!isValidPosition) continue;

            if (isEnemyAllowed && roll < 0.45) { // Slightly increased enemy spawn rate
                const enemies = Object.keys(ENTITIES).filter(t => ENTITIES[t].isEnemy);
                if (enemies.length === 0) continue;
                const type = enemies[Math.floor(Math.random() * enemies.length)];
                const config = ENTITIES[type];
                const botName = INDONESIAN_NAMES[Math.floor(Math.random() * INDONESIAN_NAMES.length)];

                entities.push({
                    id: 'enemy_' + Math.random().toString(36).substr(2, 9),
                    name: botName, // Assign name
                    type,
                    x: spawnX,
                    y: spawnY,
                    z: 0,
                    vx: 0, vy: 0, vz: 0,
                    size: config.size,
                    hp: config.hp,
                    maxHp: config.hp,
                    angle: Math.random() * Math.PI * 2,
                    xp: config.xp,
                    class: 'enemy',
                    isEnemy: true,
                    isBot: true, // Add a bot flag
                    cooldown: 0,
                    skillCooldowns: [],
                    activeBuffs: {},
                    dashCooldown: 0,
                    idleTime: 0,
                    ultDuration: 0,
                    ammo: 0, maxAmmo: 0, isReloading: false, reloadTimer: 0, animState: 'idle', animFrame: 0,
                    target: null, // For AI
                    aiState: 'idle', // For AI
                    aiTimer: 0 // For AI
                } as any as Entity);
            } else {
                const shapesList = Object.keys(ENTITIES).filter(t => !ENTITIES[t].isEnemy && !ENTITIES[t].isBullet);
                if (shapesList.length === 0) continue;
                const type = shapesList[Math.floor(Math.random() * shapesList.length)];
                const config = ENTITIES[type];
                shapes.push({
                    id: 'shape_' + Math.random().toString(36).substr(2, 9),
                    type,
                    x: spawnX,
                    y: spawnY,
                    z: 0,
                    vx: 0, vy: 0, vz: 0,
                    size: config.size,
                    hp: config.hp,
                    maxHp: config.hp,
                    angle: Math.random() * Math.PI * 2,
                    xp: config.xp,
                    class: 'neutral',
                    cooldown: 0,
                    skillCooldowns: [],
                    activeBuffs: {},
                    dashCooldown: 0,
                    idleTime: 0,
                    ultDuration: 0,
                    ammo: 0, maxAmmo: 0, isReloading: false, reloadTimer: 0, animState: 'idle', animFrame: 0
                } as any as Entity);
            }
        }
    }

    spawnParticles(x: number, y: number, z: number, type: string, count: number, size = 10) {
        for (let i = 0; i < count; i++) {
            if (this.state.particles.length > MAX_PARTICLES) this.state.particles.shift();
            this.state.particles.push({
                x, y, z: z + Math.random() * 20,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                vz: Math.random() * 8 + 2,
                type,
                size: size * (0.5 + Math.random()),
                life: 1.0,
                maxLife: 1.0,
                rot: Math.random() * Math.PI * 2,
                rotV: (Math.random() - 0.5) * 0.2
            });
        }
    }

    spawnDrop(x: number, y: number) {
        this.state.drops.push({
            id: 'drop_' + Math.random().toString(36).substr(2, 9),
            type: 'coin',
            x, y, z: 0,
            vx: 0, vy: 0, vz: 0,
            value: Math.floor(Math.random() * 10) + 1,
            life: 600
        });
    }

    spawnExplosion(ex: number, ey: number, baseDmg: number, radius: number) {
        // 1. Efek Suara & Guncangan Kamera (Sound Effect & Camera Shake)
        (this.state as any).pendingSounds = (this.state as any).pendingSounds || [];
        (this.state as any).pendingSounds.push('explosion');
        this.state.camera.shake = 15; // Guncangan lebih kuat

        // 2. Efek Partikel yang Lebih Realistis (More Realistic Particle Effects)
        this.spawnParticles(ex, ey, 25, 'explosion', 50); // Ledakan utama
        this.spawnParticles(ex, ey, 30, 'smoke', 40);      // Asap tebal
        this.spawnParticles(ex, ey, 20, 'fire', 60);       // Api
        this.spawnParticles(ex, ey, 20, 'spark', 70);      // Percikan

        // 3. Kerusakan & Knockback (Damage & Knockback)
        const radSq = radius * radius;
        // Include brPlayers so TNT can damage bots and multiplayer players
        const aliveBrPlayers = (this.state.brPlayers || []).filter((bp: any) => bp.alive !== false);
        const allEntities = [...this.state.entities, this.state.player, ...this.state.shapes, ...aliveBrPlayers];

        allEntities.forEach(e => {
            if (!e) return;
            const dx = e.x - ex;
            const dy = e.y - ey;
            const distSq = dx * dx + dy * dy;

            if (distSq < radSq) {
                const dist = Math.sqrt(distSq);
                const falloff = 1 - (dist / radius); // Kerusakan berkurang seiring jarak
                const actualDmg = baseDmg * falloff;

                // Terapkan kerusakan, jangan kenai diri sendiri jika itu ledakan dari pemain
                if (e.id !== (this.state as any).exploderId) {
                    if (e === this.state.player && this.state.gameMode === 'god') {
                        // Tidak ada damage di god mode
                    } else {
                        e.hp -= actualDmg;
                    }
                }

                // Send hit to server for brPlayers (multiplayer damage sync)
                if ((e as any).socketId && (this.state.gameMode === 'battleroyale' || this.state.gameMode === 'pvp1v1')) {
                    if (!(this.state as any).pendingHits) (this.state as any).pendingHits = [];
                    (this.state as any).pendingHits.push({
                        targetSocketId: (e as any).socketId,
                        damage: actualDmg,
                        isExplosion: true
                    });
                }

                // Terapkan knockback
                const angle = Math.atan2(dy, dx);
                const knockbackForce = 25 * falloff; // Knockback lebih kuat di pusat
                e.vx = (e.vx || 0) + Math.cos(angle) * knockbackForce;
                e.vy = (e.vy || 0) + Math.sin(angle) * knockbackForce;
            }
        });
        // Reset exploderId
        (this.state as any).exploderId = null;
    }

    fireBullet(x: number, y: number, angle: number, type = 'player_bullet', isEnemy = false, ownerId?: string, customDmg?: number) {
        const state = this.state;
        const bSpd = state.baseStats.bSpd + state.statLevels.bulletSpd * 2;
        const bDmg = customDmg || (state.baseStats.bDmg + state.statLevels.bulletDmg * 5);
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
            isEnemy: isEnemy,
            ownerId: ownerId
        });

        // Sync with server if it's a local player shooting in BR or PVP mode
        if (!isEnemy && (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1')) {
            (state as any).pendingServerActions = (state as any).pendingServerActions || [];
            (state as any).pendingServerActions.push({
                type: 'shoot',
                data: { x, y, angle, damage: bDmg, penetration: bPen }
            });
        }
    }
}