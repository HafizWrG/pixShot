export interface Vector2 {
    x: number;
    y: number;
}

export interface Entity {
    id: string;
    type: string;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    size: number;
    hp: number;
    maxHp: number;
    angle: number;
    colorTop?: string;
    colorSide?: string;
    textureId?: string;
    isBot?: boolean;
    isGiant?: boolean;
    isEnemy?: boolean;
    botType?: string;
    cooldown: number;
    h?: number;
    targetId?: string | null;
    provoked?: boolean;
    splatter?: string;
    xp: number;
    level?: number;
    class: string;
    skillCooldowns: number[];
    activeBuffs: any;
    framesConfig?: any;
    carriedBlock?: string | null;
    dashCooldown: number;
    idleTime: number;
    activeUlt?: string;
    ultDuration: number;
    ammo: number;
    maxAmmo: number;
    isReloading: boolean;
    reloadTimer: number;
    animState: 'idle' | 'walk' | 'attack';
    animFrame: number;
    // AI and Multiplayer Bot additions
    aiTimer?: number;
    aiState?: string;
    target?: Entity | null;
    targetX?: number;
    targetY?: number;
    wanderTarget?: { x: number, y: number } | null;
    socketId?: string;
    name?: string;
    alive?: boolean;
    hasChanged?: boolean;
    flipX?: boolean;
    tilt?: number;
}

export interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    a: number;
    life: number;
    maxLife: number;
    damage: number;
    type: string;
    penetration: number;
    isEnemy: boolean;
    shooterId?: string;
    ownerId?: string;
    h?: number;
    targetX?: number;
    targetY?: number;
    carriedType?: string;
}

export interface Particle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    size: number;
    color?: string;
    rot: number;
    rotV?: number;
    type: string;
}

export interface Drop {
    id: string;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    type: string;
    value: number;
    textureId?: string;
}

export interface Powerup {
    x: number;
    y: number;
    z: number;
    vx?: number;
    vy?: number;
    vz: number;
    type: string;
    life: number;
}

export interface Camera {
    x: number;
    y: number;
    zoom: number;
    shake: number;
}

export interface GameState {
    player: Entity;
    entities: Entity[];
    bullets: Bullet[];
    particles: Particle[];
    drops: Drop[];
    powerups: Powerup[];
    decals: any[];
    aoeClouds: any[];
    env: any[];
    camera: Camera;
    worldSize: number;
    gameMode: string;
    globalTime: number;
    sessionCoins: number;
    brPlayers: any[];
    keys: Record<string, boolean>;
    mouse: { x: number; y: number; worldX: number; worldY: number; isDown: boolean };
    weather: { type: string; timer: number; flash: number };
    safeZone: { x: number; y: number; radius: number };
    combo: { count: number; timer: number; max?: number };
    statLevels: { moveSpd: number; reload: number; bulletSpd: number; bulletDmg: number; bulletPen: number; bodyDmg: number; regen: number; maxHp: number; magazine: number; skill: number; fireRate: number };
    baseStats: { speed: number; reload: number; bSpd: number; bDmg: number; bPen: number; bodyDmg: number; regen: number; maxHp: number; magazine: number; skill: number; fireRate: number };
    hasSynced: boolean;
    shapes: Entity[];
    drones: Entity[];
    animationFrameId?: number;
    isPaused: boolean;
    cachedWeights?: Record<string, number>;
    cachedPrimaryBiome?: string;
    isGameOver: boolean;
    sessionStart: number;
    score: number;
    kills: number;
    xp: number;
    xpNeeded: number;
    statPoints: number;
    damageTexts: any[];
}
