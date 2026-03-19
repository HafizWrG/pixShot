import { GameState, Entity, Particle, Bullet, Drop } from './types';
import { WORLD_SIZE, PVP_WORLD_SIZE, MAX_PARTICLES, ENTITIES, DROP_CONFIG, CLASSES } from './Config';

export class GameSystems {
    // Memperbarui status pemain (Update player state)
    static playerUpdate(state: GameState, dt: number) {
        const { player, keys, mouse, statLevels, baseStats, combo } = state;
        
        // 1. Hitung Statistik (Calculate Stats)
        // Memperlambat akselerasi secara signifikan (Significantly slowing down acceleration)
        const calcAccel = (baseStats.speed * 0.3 + (statLevels.moveSpd * 0.05)) * (player.activeBuffs?.speed ? 1.5 : 1);
        
        // 2. Input Handling (WASD / Panah)
        let ax = 0, ay = 0;
        if (keys.w || keys.arrowup) ay -= 1;
        if (keys.s || keys.arrowdown) ay += 1;
        if (keys.a || keys.arrowleft) ax -= 1;
        if (keys.d || keys.arrowright) ax += 1;
        
        if (ax !== 0 || ay !== 0) {
            const mag = Math.hypot(ax, ay);
            // Terapkan akselerasi ke vektor kecepatan
            player.vx += (ax / mag) * calcAccel;
            player.vy += (ay / mag) * calcAccel;
            player.animState = 'walk'; // Animasi jalan
        } else {
            player.animState = 'idle'; // Animasi diam
        }
        
        // 3. Aiming (Handled by handleMouseMove/Joy in page.tsx for smoothness)
        // if (!keys.joystickActive) {
        //     player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        // }
        
        // 4. Reload Logic
        const reloadSpeedMult = 1 + (state.statLevels.reload * 0.2);
        const maxAmmo = state.baseStats.magazine + (state.statLevels.magazine * 5);
        player.maxAmmo = maxAmmo;

        if (player.ammo <= 0 && !player.isReloading) {
            player.isReloading = true;
            player.reloadTimer = 180 / reloadSpeedMult; // base ~3s
        }
        
        if (player.isReloading) {
            player.reloadTimer -= (dt / 16.6);
            if (player.reloadTimer <= 0) {
                player.isReloading = false;
                player.ammo = player.maxAmmo;
            }
        }

        // 5. Cooldowns & Buffs
        if (player.cooldown > 0) player.cooldown -= (dt / 16.6);
        if (player.dashCooldown > 0) player.dashCooldown -= (dt / 16.6);

        if (player.activeBuffs) {
            Object.keys(player.activeBuffs).forEach(k => {
                if (player.activeBuffs[k] > 0) player.activeBuffs[k] -= (dt / 16.6);
            });
        }
        
        if (combo.timer > 0) {
            combo.timer -= (dt / 16.6);
            if (combo.timer <= 0) combo.count = 0;
        }

        // 6. HP Regen
        const currentMaxHp = baseStats.maxHp + (statLevels.maxHp * 25);
        player.maxHp = currentMaxHp;
        if (player.hp < player.maxHp) {
            player.hp = Math.min(player.maxHp, player.hp + (baseStats.regen + statLevels.regen * 0.2) * (dt / 16.6));
        }

        // 7. Level Up System
        const currentLevel = player.level ?? 1;
        if (player.xp >= state.xpNeeded && currentLevel < 100) {
            player.xp -= state.xpNeeded;
            player.level = (player.level ?? 1) + 1;
            state.xpNeeded = Math.floor(state.xpNeeded * 1.25);
            state.statPoints++;
            (state as any).pendingLevelUp = true; 
        }

        // 8. Environment Collision
        state.env.forEach((ev: any) => {
            const dx = player.x - ev.x;
            const dy = player.y - ev.y;
            const dist = Math.hypot(dx, dy);
            const minDist = (player.size/2) + ev.r;
            if (dist < minDist) {
                const angle = Math.atan2(dy, dx);
                player.x = ev.x + Math.cos(angle) * minDist;
                player.y = ev.y + Math.sin(angle) * minDist;
                // Reflect velocity slightly
                player.vx *= -0.2; player.vy *= -0.2;
            }
        });

        // 9. Shooting (Primary Fire)
        if (player.ammo > 0 && !player.isReloading && (player.cooldown || 0) <= 0) {
            const isFiring = keys.mouseLeft || (state as any).joystickRightActive; // Support for mouse and joystick
            if (isFiring) {
                const angle = player.angle || 0;
                const fireRateMult = 1 + (statLevels.fireRate * 0.1);
                const classCfg = (state as any).CLASSES?.[player.class] || { fireRate: 30 };
                
                // Fire Bullet logic
                (state as any).pendingShot = {
                    x: player.x + Math.cos(angle) * (player.size/2),
                    y: player.y + Math.sin(angle) * (player.size/2),
                    angle: angle,
                    type: (player.class === 'warden' ? 'warden_sonic_wave' : (player.class === 'sniper' ? 'sniper_bullet' : 'player_bullet')),
                    ownerId: player.id
                };
                
                player.ammo--;
                player.cooldown = (classCfg.fireRate || 30) / fireRateMult;
                state.camera.shake = 5;
                (state as any).pendingSound = 'shoot';
            }
        }

        // 10. Skills Handling
        const skillList = CLASSES[player.class]?.skills || [];
        player.skillCooldowns = player.skillCooldowns || [0, 0, 0, 0, 0];
        
        for (let i = 0; i < 5; i++) {
            if (player.skillCooldowns[i] > 0) player.skillCooldowns[i] -= (dt / 16.6);
            
            const reqLvl = (i + 1) * 15;
            if ((player.level || 1) < reqLvl && state.gameMode !== 'god') continue;

            const isSkillActivated = keys[(i + 1).toString()] && player.skillCooldowns[i] <= 0;
            if (isSkillActivated) {
                const skill = skillList[i];
                if (!skill) continue;

                // Reset key and set cooldown
                keys[(i + 1).toString()] = false;
                player.skillCooldowns[i] = skill.cd;

                // --- MAJOR SKILL UPDATE: ADVANCED MECHANICS ---
                if (skill.type === 'buff') {
                    player.activeBuffs = player.activeBuffs || {};
                    player.activeBuffs[skill.buffType] = skill.dur;
                    
                    // Specific Buff VFX
                    const particles = (state as any).pendingParticles = (state as any).pendingParticles || [];
                    const color = skill.buffType === 'speed' ? '#06b6d4' : (skill.buffType === 'damage' ? '#ef4444' : '#fbbf24');
                    particles.push({ x: player.x, y: player.y, color: color, size: 12, count: 25 });
                    state.camera.shake = 10;
                    (state as any).pendingSound = 'dash';
                } else if (skill.type === 'heal') {
                    player.hp = Math.min(player.maxHp, player.hp + (skill.amt || 30));
                    (state as any).pendingParticles = (state as any).pendingParticles || [];
                    (state as any).pendingParticles.push({ x: player.x, y: player.y, color: '#10b981', size: 10, count: 20 });
                    (state as any).pendingSound = 'heal';
                } else if (skill.type === 'aoe') {
                    // Larger, more impactful explosions
                    const explDmg = skill.dmg || 150;
                    const explRad = skill.rad || (skill.name === 'Wrath of Warden' ? 1000 : 350);
                    (state as any).pendingExplosion = { x: player.x, y: player.y, damage: explDmg, radius: explRad, color: '#f59e0b', ownerId: player.id };
                    state.camera.shake = 25;
                    (state as any).pendingSound = 'explode';
                } else if (skill.type === 'projectile') {
                    const angle = player.angle || 0;
                    const count = skill.count || 1;
                    const pattern = skill.pattern || 'spread'; // spread or circle
                    
                    (state as any).pendingShots = (state as any).pendingShots || [];
                    for(let j=0; j<count; j++){
                         let finalAngle = angle;
                         if (pattern === 'circle') {
                             finalAngle = (j / count) * Math.PI * 2;
                         } else {
                             const offset = (Math.PI * 0.25); 
                             finalAngle += (j - (count-1)/2) * offset;
                         }

                         (state as any).pendingShots.push({
                            x: player.x + Math.cos(finalAngle) * (player.size/2),
                            y: player.y + Math.sin(finalAngle) * (player.size/2),
                            angle: finalAngle,
                            type: skill.bulletType || 'player_bullet',
                            ownerId: player.id,
                            damage: skill.dmg || 45
                        });
                    }
                    (state as any).pendingSound = 'shoot';
                    state.camera.shake = count > 1 ? 15 : 5;
                } else if (skill.type === 'summon') {
                    // Improved Summons
                    const count = skill.count || 5;
                    (state as any).pendingSound = 'levelup';
                    if (skill.summonType === 'drone') {
                        for (let j = 0; j < count; j++) {
                            const offset = (j / count) * Math.PI * 2;
                            state.drones.push({
                                id: 'drone_' + Math.random(),
                                x: player.x + Math.cos(offset) * 80,
                                y: player.y + Math.sin(offset) * 80,
                                z: 0, vx: 0, vy: 0, size: 35, hp: 60, maxHp: 60,
                                type: 'tank_basic', angle: offset, class: 'drone', isAlly: true
                            } as any);
                        }
                    } else if (skill.summonType === 'golem') {
                        state.entities.push({
                            id: 'golem_' + Math.random(), name: 'Ally Guardian',
                            x: player.x + Math.cos(player.angle) * 150,
                            y: player.y + Math.sin(player.angle) * 150,
                            z: 0, vx: 0, vy: 0, size: 200, hp: 1000, maxHp: 1000,
                            type: 'enemy_golem', angle: player.angle, class: 'ally', isAlly: true, teamId: 'player'
                        } as any);
                    }
                } else if (skill.type === 'aoe_cloud') {
                    state.aoeClouds.push({
                        id: 'cloud_' + Math.random(),
                        x: player.x, y: player.y,
                        rad: skill.rad || 350, dur: skill.dur || 400,
                        effect: skill.effect || 'fire', ownerId: player.id
                    } as any);
                    (state as any).pendingSound = 'dash';
                } else if (skill.type === 'deploy') {
                    if (skill.deployType === 'blackhole') {
                        // Gravity Trap
                        state.aoeClouds.push({
                            id: 'bh_' + Math.random(),
                            x: player.x + Math.cos(player.angle) * 200,
                            y: player.y + Math.sin(player.angle) * 200,
                            rad: 500, dur: 300, effect: 'pull', ownerId: player.id
                        } as any);
                    } else if (skill.deployType === 'mine') {
                        for (let j = 0; j < (skill.count || 3); j++) {
                           // Mines logic here
                        }
                    }
                    (state as any).pendingSound = 'shoot';
                }
            }
        }
    }
    
    // Kamera mengikuti pemain (Camera follows player)
    static cameraUpdate(state: GameState, dt: number) {
        const { camera, player } = state;
        const ratio = dt / 16.6;
        
        // Position clamping (Clamp inside boarder)
        const margin = 50;
        const currentSize = state.worldSize || WORLD_SIZE;
        const halfSize = currentSize / 2;
        
        player.x = Math.max(-halfSize + margin, Math.min(halfSize - margin, player.x));
        player.y = Math.max(-halfSize + margin, Math.min(halfSize - margin, player.y));

        // Direct Follow (No lag)
        const followSpeed = 0.25; 
        camera.x += (player.x - camera.x) * followSpeed;
        camera.y += (player.y - camera.y) * followSpeed;
        
        // Direct Zoom
        const speed = Math.hypot(player.vx, player.vy);
        const targetZoom = Math.max(0.7, Math.min(1.0, 1.1 - (speed / 50)));
        camera.zoom += (targetZoom - camera.zoom) * 0.05;
        
        // Apply Screen Shake
        if (camera.shake > 0) {
            camera.x += (Math.random() - 0.5) * camera.shake;
            camera.y += (Math.random() - 0.5) * camera.shake;
            camera.shake *= 0.9;
            if (camera.shake < 0.1) camera.shake = 0;
        }
        
        // 7. Visual Flipper (Visual Only Flip - Disabled for 360 rotation)
        // const mouseDx = state.mouse.worldX - player.x;
        // (player as any).scaleX = mouseDx < 0 ? -1 : 1; 
    }

    static movement(state: GameState, dt: number) {
        this.playerUpdate(state, dt);
        this.cameraUpdate(state, dt);
        
        const friction = 0.95;
        const ratio = (dt / 16.6);
        const gravity = 0.45;
        
        // Player
        state.player.x += state.player.vx * ratio;
        state.player.y += state.player.vy * ratio;
        state.player.vx *= Math.pow(friction, ratio);
        state.player.vy *= Math.pow(friction, ratio);

        // Player Flip & Angle (Now handled smoothly by 360 rotation logic)
        // const mouseDx = state.mouse.worldX - state.player.x;
        // state.player.angle = mouseDx < 0 ? Math.PI : 0;
        // (state.player as any).scaleX = mouseDx < 0 ? -1 : 1; 
        
        // Tilt for movement effect
        const tiltTarget = Math.max(-15, Math.min(15, (state.player.vx || 0) * 2)) * (Math.PI / 180);
        (state.player as any).tilt = (state.player as any).tilt || 0;
        (state.player as any).tilt += (tiltTarget - (state.player as any).tilt) * 0.1;

        // Border Logic (Clamp)
        const currentSize = state.worldSize || WORLD_SIZE;
        const halfSize = currentSize / 2;
        
        state.player.x = Math.max(-halfSize, Math.min(halfSize, state.player.x));
        state.player.y = Math.max(-halfSize, Math.min(halfSize, state.player.y));

        // Entities & Shapes
        [...state.entities, ...state.shapes].forEach(e => {
            e.x += (e.vx || 0) * ratio;
            e.y += (e.vy || 0) * ratio;
            e.vx = (e.vx || 0) * Math.pow(friction, ratio);
            e.vy = (e.vy || 0) * Math.pow(friction, ratio);

            const margin = e.size / 2;
            e.x = Math.max(-halfSize + margin, Math.min(halfSize - margin, e.x));
            e.y = Math.max(-halfSize + margin, Math.min(halfSize - margin, e.y));

            if (e.z > 0 || e.vz !== 0) {
                e.vz -= gravity * ratio;
                e.z += e.vz * ratio;
                if (e.z < 0) { e.z = 0; e.vz = 0; }
            }
            
            state.env.forEach((ev: any) => {
                const dx = e.x - ev.x;
                const dy = e.y - ev.y;
                const dist = Math.hypot(dx, dy);
                const minDist = (e.size/2) + ev.r;
                if (dist < minDist) {
                    const angle = Math.atan2(dy, dx);
                    e.x = ev.x + Math.cos(angle) * minDist;
                    e.y = ev.y + Math.sin(angle) * minDist;
                    e.vx *= -0.2; e.vy *= -0.2;
                }
            });

            // Animation Update
            e.animFrame = (e.animFrame || 0) + ratio;
            if (Math.abs(e.vx) < 0.2 && Math.abs(e.vy) < 0.2 && e !== state.player) {
                e.animState = 'idle';
            } else if (e !== state.player) {
                e.animState = 'walk';
            }
        });

        // brPlayers (Multiplayer / Bots)
        if (state.brPlayers) {
            state.brPlayers.forEach((p: any) => {
                if (p.targetX !== undefined && p.targetY !== undefined) {
                    const lerpSpeed = 0.25;
                    p.x += (p.targetX - p.x) * lerpSpeed;
                    p.y += (p.targetY - p.y) * lerpSpeed;
                } else {
                    p.x += (p.vx || 0) * ratio;
                    p.y += (p.vy || 0) * ratio;
                }

                if (p.targetAngle !== undefined) {
                    let diff = p.targetAngle - (p.angle || 0);
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    p.angle = (p.angle || 0) + diff * 0.2;
                }
                
                const margin = (p.size || 80) / 2;
                p.x = Math.max(-halfSize + margin, Math.min(halfSize - margin, p.x));
                p.y = Math.max(-halfSize + margin, Math.min(halfSize - margin, p.y));
            });
        }

        // Bullets Removal Out of World
        state.bullets = state.bullets.filter((b: Bullet) => {
            b.x += b.vx * ratio;
            b.y += b.vy * ratio;
            b.life -= ratio;
            const out = Math.abs(b.x) > halfSize || Math.abs(b.y) > halfSize;
            return b.life > 0 && !out;
        });

        // Particles
        state.particles = state.particles.filter((p: Particle) => {
            p.x += p.vx * ratio;
            p.y += p.vy * ratio;
            p.vz -= 0.3 * ratio;
            p.z += p.vz * ratio;
            p.life -= 0.02 * ratio;
            return p.life > 0 && p.z > -1000;
        });

        // Drops
        state.drops = state.drops.filter((d: Drop) => {
            d.x += (d.vx || 0) * ratio;
            d.y += (d.vy || 0) * ratio;
            d.vx = (d.vx || 0) * Math.pow(0.9, ratio);
            d.vy = (d.vy || 0) * Math.pow(0.9, ratio);
            d.life -= ratio;
            return d.life > 0;
        });
    }

    static collision(state: GameState) {
        const { player, entities, shapes, bullets, drops } = state;

        // Player vs Entities & Shapes (Repel & Melee Damage)
        [...entities, ...shapes].forEach((e: Entity) => {
            if (e.id === player.id) return; // Skip self-collision check
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            const distSq = dx * dx + dy * dy;
            const combinedSize = (e.size / 2) + (player.size / 2);

            if (distSq < combinedSize * combinedSize) {
                const dist = Math.sqrt(distSq);
                const angle = Math.atan2(dy, dx);
                const overlap = combinedSize - dist;

                // Repel
                const force = e.class === 'neutral' ? 0.3 : 0.1;
                e.x += Math.cos(angle) * overlap * 0.5;
                e.y += Math.sin(angle) * overlap * 0.5;
                player.vx -= Math.cos(angle) * overlap * force;
                player.vy -= Math.sin(angle) * overlap * force;

                // Melee Damage from Enemies
                if (e.isEnemy && e.cooldown <= 0 && state.gameMode !== 'waiting') {
                    if (state.gameMode !== 'god') {
                        player.hp -= 5; // Damage dikurangi
                        (player as any).pendingDamage = 5;
                    }
                    e.cooldown = 30; // Attack cooldown
                    e.animState = 'attack';
                    e.animFrame = 0;
                }
            }
        });

        // --- Combat Interactions (only if not in 'waiting' mode) ---
        if (state.gameMode !== 'waiting') {
            // Bullets vs Entities & Shapes
            for (let i = bullets.length - 1; i >= 0; i--) {
                const b = bullets[i];
                if (!b) continue;

                // Player bullets should not hit the player
                if (!b.isEnemy) {
                    const dx = b.x - player.x;
                    const dy = b.y - player.y;
                    if (dx * dx + dy * dy < (player.size / 2) * (player.size / 2)) {
                        continue; // Skip, don't hit self
                    }
                }

                const targets = [...entities, ...shapes, ...(state.brPlayers || []).filter((bp: any) => bp.alive !== false)];
                for (let j = targets.length - 1; j >= 0; j--) {
                    const e = targets[j];
                    if (!e) continue;
                    // Don't hit owner (check both id and socketId for bot compatibility)
                    if (b.ownerId === e.id || b.ownerId === (e as any).socketId) continue;

                    const dx = b.x - e.x;
                    const dy = b.y - e.y;
                    if (dx * dx + dy * dy < (e.size/2) * (e.size/2)) {
                        // Notify server if it's a multiplayer match
                        if (state.gameMode === 'battleroyale' || state.gameMode === 'pvp1v1') {
                             if (!b.isEnemy) { // Only send hits from local player bullets
                                 (state as any).pendingHit = { targetSocketId: (e as any).socketId || e.id, damage: b.damage };
                             }
                        }

                        e.hp -= b.damage;
                        (e as any).pendingDamage = b.damage;
                        state.damageTexts.push({
                            x: e.x + (Math.random() - 0.5) * 30,
                            y: e.y - e.size/2,
                            text: b.damage.toString(),
                            life: 60,
                            color: '#fbbf24'
                        });
                        b.penetration--;

                        const angle = Math.atan2(b.vy, b.vx);
                        e.vx += Math.cos(angle) * 2;
                        e.vy += Math.sin(angle) * 2;

                        if (b.penetration <= 0) {
                            bullets.splice(i, 1);
                            break; // Bullet is destroyed, stop checking for this bullet
                        }
                    }
                }
            }

            // Enemy Bullets vs Player
            for (let i = bullets.length - 1; i >= 0; i--) {
                const b = bullets[i];
                if (!b || !b.isEnemy) continue;

                const dx = b.x - player.x;
                const dy = b.y - player.y;
                if (dx * dx + dy * dy < (player.size/2) * (player.size/2)) {
                    if (state.gameMode !== 'god') {
                        player.hp -= b.damage;
                        (player as any).pendingDamage = b.damage;
                        state.damageTexts.push({
                            x: player.x,
                            y: player.y - player.size/2,
                            text: b.damage.toString(),
                            life: 60,
                            color: '#ef4444'
                        });
                    }
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
        // --- End Combat Interactions ---

        // Player vs Drops
        for (let i = state.drops.length - 1; i >= 0; i--) {
            const d = state.drops[i];
            const dx = d.x - player.x;
            const dy = d.y - player.y;
            if (dx * dx + dy * dy < (player.size + 20) * (player.size + 20)) {
                state.sessionCoins += d.value;
                (state as any).pendingSound = 'coin_pick';
                state.drops.splice(i, 1);
            }
        }

        // Remove dead shapes & Entities
        [state.shapes, state.entities].forEach((list, typeIdx) => {
            for (let i = list.length - 1; i >= 0; i--) {
                const e = list[i];
                if (e.hp <= 0) {
                    const cfg = ENTITIES[e.type] || {};
                    // Drop System
                    if (Math.random() < DROP_CONFIG.coinChance) {
                        state.drops.push({
                            id: 'coin_' + Math.random(),
                            type: 'coin',
                            textureId: 'coin_local', // Menambahkan tekstur lokal untuk koin
                            x: e.x, y: e.y, z: 0,
                            vx: (Math.random() - 0.5) * 5,
                            vy: (Math.random() - 0.5) * 5,
                            vz: 0,
                            life: 600,
                            value: Math.floor(Math.random() * (DROP_CONFIG.coinValue[1] - DROP_CONFIG.coinValue[0])) + DROP_CONFIG.coinValue[0]
                        });
                    }

                    // TNT / Creeper Explosion
                    if (cfg.explosive) {
                        (state as any).pendingExplosions = (state as any).pendingExplosions || [];
                        (state as any).pendingExplosions.push({ x: e.x, y: e.y, damage: cfg.damage || 150, radius: cfg.radius || 350 });
                    }

                    // Necromancer Drone Conversion
                    if (player.class === 'necromancer' && typeIdx === 0) { // typeIdx 0 is shapes
                        state.drones.push({
                            ...e,
                            id: 'drone_' + Math.random(),
                            class: 'drone',
                            hp: 10, maxHp: 10,
                            angle: Math.random() * Math.PI * 2,
                            vx: 0, vy: 0
                        } as Entity);
                    }

                    player.xp += (e.xp || 0);
                    state.score += (e.xp || 0);
                    list.splice(i, 1);
                }
            }
        });
    }

    static ai(state: GameState, dt: number) {
        if (state.gameMode === 'waiting') return;
    
        const player = state.player;
        const ratio = dt / 16.6;
        
        // Mobs and Bot-Players follow the same AI loop
        const aiActors = [...state.entities, ...state.brPlayers].filter((e: any) => e.isBot && e.hp > 0);
    
        aiActors.forEach((e: any) => {
            
            // 1. Find Nearest Target (Player, Other Players, or Other Bots)
            const targets = [player, ...state.brPlayers].filter(t => t.hp > 0);
            let nearest: any = null;
            let minDist = Infinity;
            
            targets.forEach(t => {
                const d = Math.hypot(t.x - e.x, t.y - e.y);
                if (d < minDist) {
                    minDist = d;
                    nearest = t;
                }
            });

            if (!nearest) {
                e.aiState = 'wandering';
                return;
            }

            const dx = nearest.x - e.x;
            const dy = nearest.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            e.aiTimer = (e.aiTimer || 0) - ratio;
    
            // State transitions
            if (e.aiTimer <= 0) {
                switch (e.aiState) {
                    case 'idle':
                    case 'wandering':
                        if (dist < 600) {
                            e.aiState = 'chasing';
                            e.target = nearest;
                            e.aiTimer = 10;
                        } else {
                            e.aiState = 'wandering';
                            const wanderAngle = Math.random() * Math.PI * 2;
                            e.wanderTarget = {
                                x: e.x + Math.cos(wanderAngle) * (300 + Math.random() * 300),
                                y: e.y + Math.sin(wanderAngle) * (300 + Math.random() * 300)
                            };
                            e.aiTimer = 180 + Math.random() * 180;
                        }
                        break;
                    case 'chasing':
                        if (dist > 1000) {
                            e.aiState = 'idle';
                            e.target = null;
                            e.aiTimer = 180;
                        } else if (dist < 120) {
                            e.aiState = 'attacking';
                            e.aiTimer = 45 + Math.random() * 30;
                        } else if (Math.random() < 0.1) {
                            e.aiState = 'strafing';
                            e.aiTimer = 60 + Math.random() * 60;
                        }
                        break;
                    case 'strafing':
                        e.aiState = 'chasing';
                        e.target = nearest;
                        break;
                    case 'attacking':
                        if (Math.random() < 0.8) {
                            e.aiState = 'chasing';
                            e.target = nearest;
                        } else {
                            e.aiState = 'idle';
                            e.aiTimer = 30;
                        }
                        break;
                }
            }
    
            // State actions
            let targetAngle = e.angle;
            let speed = 2.5;
            let angularSpeed = 0.1;
    
            switch (e.aiState) {
                case 'wandering':
                    if (e.wanderTarget) {
                        const wdx = e.wanderTarget.x - e.x;
                        const wdy = e.wanderTarget.y - e.y;
                        if (Math.hypot(wdx, wdy) > 50) {
                            targetAngle = Math.atan2(wdy, wdx);
                            speed = 1.2;
                            e.animState = 'walk';
                        } else { e.aiState = 'idle'; e.aiTimer = 120; e.animState = 'idle'; }
                    }
                    break;
                case 'chasing':
                    if (e.target) {
                        targetAngle = Math.atan2(e.target.y - e.y, e.target.x - e.x);
                        speed = 3.0;
                        e.animState = 'walk';
                    }
                    break;
                case 'strafing':
                    if (e.target) {
                        const angleToTarget = Math.atan2(e.target.y - e.y, e.target.x - e.x);
                        targetAngle = angleToTarget + (Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1);
                        speed = 2.2;
                        e.animState = 'walk';
                    }
                    break;
                case 'attacking':
                     if (e.target) {
                        targetAngle = Math.atan2(e.target.y - e.y, e.target.x - e.x);
                        angularSpeed = 0.3;
                        speed = 0.5;
                        e.animState = 'attack';
                    }
                    break;
                case 'idle':
                    speed = 0;
                    e.animState = 'idle';
                    break;
            }
            
            let angleDiff = targetAngle - e.angle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            e.angle += angleDiff * angularSpeed;
    
            if (speed > 0) {
                const targetVx = Math.cos(e.angle) * speed;
                const targetVy = Math.sin(e.angle) * speed;
                e.vx = (e.vx || 0) * 0.7 + targetVx * 0.3;
                e.vy = (e.vy || 0) * 0.7 + targetVy * 0.3;
            }
            
            // Bot Shooting Logic
            if (e.aiState === 'attacking' || (e.aiState === 'chasing' && Math.random() < 0.05)) {
                if (e.cooldown <= 0) {
                    const angle = e.angle;
                    (state as any).pendingShot = {
                        x: e.x + Math.cos(angle) * (e.size/2),
                        y: e.y + Math.sin(angle) * (e.size/2),
                        angle: angle,
                        type: e.type === 'ghast' ? 'ghast_fireball' : 'bullet',
                        isEnemy: true,
                        ownerId: e.id,
                        damage: (ENTITIES[e.type]?.damage || 10)
                    };
                    e.cooldown = 60 + Math.random() * 60;
                    (state as any).pendingSounds = (state as any).pendingSounds || [];
                    (state as any).pendingSounds.push('shoot');
                }
            }
    
            if (e.cooldown > 0) e.cooldown -= ratio;
        });
    }
}