export const WORLD_SIZE = 8000; // Battle Royale Map Size
export const PVP_WORLD_SIZE = 1000; // PVP 1v1 Map Size - LEBIH KECIL UNTUK PVP (SMALLER FOR PVP)
export const TILE_SIZE = 100;
export const MAX_SHAPES = 80;
export const MAX_DROPS = 100;
export const MAX_PARTICLES = 50;

export const CLASSES: any = {
    basic: {
        id: 'basic', name: 'Basic', color: '#cbd5e1', price: 0, desc: 'Versatile standard tank for all operations.', textureId: 'tank_basic', previewImg: '/biasa.png',
        maxAmmo: 10, reloadTime: 300, fireRate: 60, // 1 shot/s
        skills: [
            { name: 'Rapid Dash', cd: 180, type: 'buff', buffType: 'speed', dur: 30 },
            { name: 'Quick Patch', cd: 600, type: 'heal', amt: 40 },
            { name: 'Steel Shield', cd: 900, type: 'buff', buffType: 'shield', dur: 120 },
            { name: 'Overdrive', cd: 1200, type: 'buff', buffType: 'damage', dur: 200 },
            { name: 'Air Blast', cd: 800, type: 'aoe', dmg: 20, rad: 400, effect: 'knockback' }
        ]
    },
    machinegun: {
        id: 'machinegun', name: 'Striker', color: '#94a3b8', price: 500, desc: 'Extreme fire rate minigun suppresses all enemies.', textureId: 'tank_machinegun', previewImg: '/gun.png',
        maxAmmo: 60, reloadTime: 300, fireRate: 15, // 4 shots/s
        skills: [
            { name: 'Lead Rain', cd: 500, type: 'projectile', bulletType: 'player_bullet', count: 20, pattern: 'circle', dmg: 15 },
            { name: 'Turbo Cycle', cd: 400, type: 'buff', buffType: 'speed', dur: 100 },
            { name: 'Bullet Storm', cd: 800, type: 'buff', buffType: 'damage', dur: 300 },
            { name: 'Land Mines', cd: 600, type: 'deploy', deployType: 'mine', count: 5 },
            { name: 'Sentry Mode', cd: 1500, type: 'buff', buffType: 'turret', dur: 450 }
        ]
    },
    sniper: {
        id: 'sniper', name: 'Ghost', color: '#64748b', price: 1500, desc: 'Long range precision. One shot, one kill.', textureId: 'tank_sniper', previewImg: '/ghost.png',
        maxAmmo: 5, reloadTime: 400, fireRate: 120, // 1 shot/2s
        skills: [
            { name: 'Target Lock', cd: 600, type: 'buff', buffType: 'radar', dur: 600 },
            { name: 'Stealth Pass', cd: 1200, type: 'buff', buffType: 'stealth', dur: 300 },
            { name: 'Railgun V', cd: 800, type: 'projectile', bulletType: 'sniper', count: 1, dmg: 150 },
            { name: 'Cloak Shield', cd: 1000, type: 'buff', buffType: 'shield', dur: 400 },
            { name: 'EMP Shock', cd: 1200, type: 'aoe', dmg: 100, rad: 500, effect: 'slow' }
        ]
    },
    melee: {
        id: 'melee', name: 'Smasher', color: '#475569', price: 1800, desc: 'Spinning sawblades. Huge body damage.', textureId: 'tank_melee', previewImg: '/grund.png', framesConfig: [1, 1, 1],
        maxAmmo: 0, reloadTime: 0, fireRate: 0,
        skills: [
            { name: 'Earthquake', cd: 600, type: 'aoe', dmg: 50, rad: 400, effect: 'shake' },
            { name: 'Chain Hook', cd: 500, type: 'projectile', bulletType: 'hook', count: 3, dmg: 30 },
            { name: 'Dual Saws', cd: 400, type: 'projectile', bulletType: 'saw', count: 2, dmg: 40 },
            { name: 'Fortify', cd: 1000, type: 'buff', buffType: 'shield', dur: 300 },
            { name: 'Blackhole', cd: 2000, type: 'deploy', deployType: 'blackhole', dur: 300 }
        ]
    },
    warden: {
        id: 'warden', name: 'Warden', color: '#0f766e', price: 2000, desc: 'Sonic Boom pierces all enemies.', textureId: 'tank_warden', previewImg: '/miaw.png',
        maxAmmo: 15, reloadTime: 300, fireRate: 120, // 1 shot/2s
        skills: [
            { name: 'Sonic Wave', cd: 600, type: 'buff', buffType: 'sonicwave', dur: 100 },
            { name: 'Radar Scan', cd: 800, type: 'buff', buffType: 'radar', dur: 600 },
            { name: 'Echo Blast', cd: 500, type: 'projectile', bulletType: 'warden_sonic_wave', count: 12, pattern: 'circle', dmg: 25 },
            { name: 'Silence Area', cd: 1000, type: 'aoe_cloud', rad: 400, dur: 300, effect: 'silence' },
            { name: 'Wrath of Warden', cd: 1800, type: 'aoe', dmg: 1000, rad: 800 }
        ]
    },
    flamethrower: {
        id: 'flamethrower', name: 'Igniter', color: '#f97316', price: 2200, desc: 'Sprays fire and shoots TNT.', textureId: 'tank_flamethrower', previewImg: '/fire.png',
        maxAmmo: 9, reloadTime: 300, fireRate: 60, // 1 shot/s
        skills: [
            { name: 'Inferno', cd: 600, type: 'buff', buffType: 'inferno', dur: 150 },
            { name: 'Lava Trail', cd: 900, type: 'buff', buffType: 'lava_trail', dur: 300 },
            { name: 'Napalm Bomb', cd: 800, type: 'projectile', bulletType: 'tnt', count: 1 },
            { name: 'Ring of Fire', cd: 1200, type: 'aoe_cloud', rad: 300, dur: 400 },
            { name: 'Meteor Swarm', cd: 1800, type: 'projectile', bulletType: 'meteor', count: 15, pattern: 'circle' }
        ]
    },
    necromancer: {
        id: 'necromancer', name: 'Necromancer', color: '#d946ef', price: 3500, desc: 'Converts shapes into flying drones.', textureId: 'tank_necromancer', previewImg: '/necro.png',
        maxAmmo: 20, reloadTime: 300, fireRate: 20,
        skills: [
            { name: 'Mass Revive', cd: 800, type: 'summon', summonType: 'drone', count: 20 },
            { name: 'Life Drain', cd: 900, type: 'aoe_leech', rad: 500, dur: 200 },
            { name: 'Bone Spear', cd: 400, type: 'projectile', bulletType: 'sniper', count: 3 },
            { name: 'Drone Frenzy', cd: 1200, type: 'buff', buffType: 'drone_frenzy', dur: 300 },
            { name: 'Summon Giant', cd: 2000, type: 'summon', summonType: 'golem', count: 1 }
        ]
    },
};

export const ENTITIES: any = {
    // Shapes
    stone: { size: 40, hp: 25, xp: 10, colorTop: '#a8a29e', colorSide: '#44403c', splatter: '#a8a29e', textureId: 'shape_stone' },
    tnt: { size: 40, hp: 15, xp: 20, colorTop: '#ef4444', colorSide: '#b91c1c', splatter: '#ef4444', textureId: 'shape_tnt', explosive: true, damage: 100, radius: 250 },
    planks: { size: 45, hp: 15, xp: 15, colorTop: '#d97706', colorSide: '#92400e', splatter: '#d97706', textureId: 'shape_planks' },
    dirt: { size: 35, hp: 10, xp: 5, colorTop: '#78350f', colorSide: '#451a03', splatter: '#78350f', textureId: 'shape_dirt' },
    grass: { size: 30, hp: 5, xp: 2, colorTop: '#22c55e', colorSide: '#166534', splatter: '#22c55e', textureId: 'ground_grass' },

    // Enemies
    golem: { size: 120, hp: 400, xp: 1000, colorTop: '#4b5563', colorSide: '#1f2937', splatter: '#4b5563', isEnemy: true, textureId: 'enemy_golem', framesConfig: [12, 12, 12] },
    ghast: { size: 95, hp: 60, xp: 300, colorTop: '#f8fafc', colorSide: '#cbd5e1', splatter: '#f8fafc', isEnemy: true, textureId: 'enemy_ghast', framesConfig: [12, 12, 12] },
    skeleton: { size: 60, hp: 30, xp: 150, colorTop: '#e2e8f0', colorSide: '#94a3b8', splatter: '#e2e8f0', isEnemy: true, textureId: 'enemy_skeleton', framesConfig: [12, 12, 12] },
    zombie: { size: 60, hp: 40, xp: 100, colorTop: '#166534', colorSide: '#064e3b', splatter: '#166534', isEnemy: true, textureId: 'enemy_zombie', framesConfig: [8, 8, 8] },
    spider: { size: 65, hp: 25, xp: 120, colorTop: '#1e293b', colorSide: '#0f172a', splatter: '#1e293b', isEnemy: true, textureId: 'enemy_spider', framesConfig: [8, 8, 8] },
    slime: { size: 50, hp: 15, xp: 50, colorTop: '#4ade80', colorSide: '#166534', splatter: '#4ade80', isEnemy: true, textureId: 'enemy_slime', framesConfig: [8, 8, 8] },
    creeper: { size: 55, hp: 40, xp: 200, colorTop: '#22c55e', colorSide: '#166534', splatter: '#22c55e', isEnemy: true, textureId: 'enemy_creeper', framesConfig: [12, 12, 12], explosive: true, damage: 20, radius: 300 },
    boulder: { size: 25, hp: 10, xp: 0, colorTop: '#78716c', colorSide: '#57534e', splatter: '#a8a29e', isEnemy: true, isBullet: true, damage: 20, penetration: 1 },
    ghast_fireball: { size: 30, hp: 10, xp: 0, colorTop: '#f97316', colorSide: '#ea580c', splatter: '#fb923c', isEnemy: true, isBullet: true, damage: 30, penetration: 1 }
};

export const DROP_CONFIG = {
    coinChance: 0.7,
    coinValue: [1, 10] // min, max
};