export const generateTexture = (type: string) => {
    if (typeof document === 'undefined') return null;
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

export const createShadowTexture = () => {
    if (typeof document === 'undefined') return null;
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

// --- REPOSITORY ASSET LOKAL (LOCAL ASSET REPO) ---
// Mudahkan modifikasi path file di satu tempat (Easy to modify paths here)
export const ASSET_PATHS = {
    images: {
        // Tank Images
        tank_basic: '/biasa.png',
        tank_fire: '/fire.png',
        tank_warden: '/miaw.png',
        tank_necromancer: '/necro.png',
        tank_grund: '/grund.png',
        tank_gun: '/gun.png',
        tank_machinegun: '/gun.png',
        tank_sniper: '/ghost.png',
        tank_melee: '/grund.png',
        tank_flamethrower: '/fire.png',
        
        // Shape Images  
        shape_stone: '/stone.png',
        shape_tnt: '/tnt.png',
        shape_planks: '/planks.png',
        shape_dirt: '/dirt.png',
        ground_grass: '/grass.png',
        
        // Enemy Images
        enemy_skeleton: '/skeleton.png',
        enemy_zombie: '/zombie.png',
        enemy_creeper: '/creeper.png',
        enemy_ghast: '/ghast.png',
        enemy_spider: '/spid.png',
        enemy_slime: '/slime.png',
        enemy_golem: '/golem.png',
        
        // UI Icons
        ui_coin: '/coin.png',
        coin_local: '/coin.png',
        ui_ammo: '/ammo.png',
        ui_health: '/health.png',
        ui_shield: '/shield.png',
        ui_speed: '/speed.png',

        // Environment
        tree: '/tree.png',
        house: '/house.png'
    },
    sounds: {
        shoot: '/sounds/shoot.mp3',
        hit: '/sounds/hit.mp3',
        explode: '/explode.mp3',
        levelup: '/sounds/levelup.mp3',
        coin_pick: '/sounds/coin.mp3',
        dash: '/sounds/dash.mp3',
        heal: '/sounds/heal.mp3'
    }
};

export const loadLocalTexture = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject();
        img.src = src;
    });
};