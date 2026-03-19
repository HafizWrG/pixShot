import { GameState, Camera, Entity } from './types';
import { CLASSES, ENTITIES, WORLD_SIZE } from './Config';

export class GameRenderer {
    canvas2d: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    canvasGL: HTMLCanvasElement;
    gl: WebGLRenderingContext | null;
    textures: Record<string, HTMLCanvasElement | HTMLImageElement> = {};
    
    constructor(canvas2d: HTMLCanvasElement, canvasGL: HTMLCanvasElement) {
        this.canvas2d = canvas2d;
        this.ctx2d = canvas2d.getContext('2d')!;
        this.canvasGL = canvasGL;
        this.gl = canvasGL.getContext('webgl', { antialias: true, alpha: true });
    }

    // Fungsi Utama Render (Main Render Loop)
    render(state: GameState, time: number) {
        const ctx = this.ctx2d;
        const { camera, player, entities, bullets, particles, drops, env, brPlayers } = state;

        // 1. Bersihkan Canvas dengan latar belakang sangat gelap untuk atmosfer (Atmospheric background)
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, this.canvas2d.width, this.canvas2d.height);
        
        // 2. Transformasi Kamera (Camera Transformation)
        ctx.save();
        ctx.translate(this.canvas2d.width / 2, this.canvas2d.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        
        ctx.translate(-camera.x, -camera.y);

        // 3. Draw Background & Biome effects
        this.drawWorldBackground(ctx, state);
        this.drawGrid(ctx, state);

        // Draw World Border with Glow
        const worldSize = state.worldSize || WORLD_SIZE;
        const halfSize = worldSize / 2;
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ef4444';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 15;
        ctx.strokeRect(-halfSize, -halfSize, worldSize, worldSize);
        ctx.restore();

        // 4. Draw Environment Objects
        env.forEach(ev => this.drawEnvObject(ctx, ev));

        // 5. Draw Drops
        drops.forEach(d => {
            if ((state as any).settings?.graphics === 'high') this.drawShadow(ctx, d.x, d.y, 10, (d as any).z || 0, camera);
            this.drawDrop(ctx, d);
        });

        // 6. Draw Shapes (Neutral objects)
        state.shapes.forEach(s => {
            if ((state as any).settings?.graphics === 'high') this.drawShadow(ctx, s.x, s.y, s.size * 0.7, s.z || 0, camera);
            this.drawEntity(ctx, s);
        });

        // 7. Draw Multiplayer/BR Players
        if (brPlayers) {
            brPlayers.forEach(p => {
                if (p.alive && p.hp > 0) {
                    if ((state as any).settings?.graphics === 'high') this.drawShadow(ctx, p.x, p.y, (p.size || 20) * 0.8, (p as any).z || 0, camera);
                    this.drawMultiplayerPlayer(ctx, p);
                }
            });
        }

        // 8. Draw Entities (Mobs)
        entities.forEach(e => {
            if ((state as any).settings?.graphics === 'high') this.drawShadow(ctx, e.x, e.y, e.size * 0.7, e.z || 0, camera);
            this.drawEntity(ctx, e);
        });

        // 9. Draw local Player
        if ((state as any).settings?.graphics === 'high') this.drawShadow(ctx, player.x, player.y, player.size * 0.8, player.z || 0, camera);
        this.drawPlayer(ctx, player);

        // 10. Draw Bullets & Bullet Lighting
        bullets.forEach(b => {
             this.drawBullet(ctx, b);
             if ((state as any).settings?.graphics === 'high') this.drawLight(ctx, b.x, b.y, b.isEnemy ? 40 : 60, b.isEnemy ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)');
        });

        // 11. Draw Particles
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach(p => this.drawParticle(ctx, p));
        ctx.globalCompositeOperation = 'source-over';

        // 12. Draw Damage Indicators
        state.damageTexts.forEach((dt: any) => {
            ctx.save();
            const opacity = Math.min(1.0, dt.life / 20);
            ctx.translate(dt.x, dt.y);
            ctx.font = 'black 24px "Outfit", sans-serif';
            ctx.fillStyle = dt.color || '#fff';
            ctx.globalAlpha = opacity;
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText(dt.text, 0, 0);
            ctx.restore();
        });

        ctx.restore();

        // 12. DRAW POST-PROCESSING LIGHTING (SIMULATED PATH TRACING)
        if ((state as any).settings?.graphics === 'high') {
            this.drawPostProcessing(ctx, state);
        }
    }

    drawPostProcessing(ctx: CanvasRenderingContext2D, state: GameState) {
        const { camera } = state;
        // Vignette & Darkness
        const grad = ctx.createRadialGradient(
            this.canvas2d.width / 2, this.canvas2d.height / 2, 
            this.canvas2d.width * 0.2, 
            this.canvas2d.width / 2, this.canvas2d.height / 2, 
            this.canvas2d.width * 0.8
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.canvas2d.width, this.canvas2d.height);

        // Global ambient blue-ish overlay
        ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
        ctx.fillRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    }

    drawLight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
        ctx.save();
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawWorldBackground(ctx: CanvasRenderingContext2D, state: GameState) {
        const grassTex = this.textures['ground_grass'];
        if (grassTex) {
            const tileSize = 256;
            const halfSize = state.worldSize / 2;
            const startX = Math.max(-halfSize, Math.floor((state.camera.x - (this.canvas2d.width / 2) / state.camera.zoom) / tileSize) * tileSize);
            const startY = Math.max(-halfSize, Math.floor((state.camera.y - (this.canvas2d.height / 2) / state.camera.zoom) / tileSize) * tileSize);
            const endX = Math.min(halfSize, Math.ceil((state.camera.x + (this.canvas2d.width / 2) / state.camera.zoom) / tileSize) * tileSize);
            const endY = Math.min(halfSize, Math.ceil((state.camera.y + (this.canvas2d.height / 2) / state.camera.zoom) / tileSize) * tileSize);

            for (let x = startX; x < endX; x += tileSize) {
                for (let y = startY; y < endY; y += tileSize) {
                    ctx.drawImage(grassTex, x, y, tileSize, tileSize);
                }
            }
        } else {
            let color = '#064e3b';
            const primary = state.cachedPrimaryBiome || 'plains';
            if (primary === 'desert') color = '#451a03';
            else if (primary === 'ice') color = '#0c4a6e';
            else if (primary === 'nether') color = '#450a0a';
            ctx.fillStyle = color;
            const wSize = state.worldSize || WORLD_SIZE;
            ctx.fillRect(-wSize/2, -wSize/2, wSize, wSize);
        }
    }

    drawGrid(ctx: CanvasRenderingContext2D, state: GameState) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const step = 200;
        const worldSize = state.worldSize || WORLD_SIZE;
        const halfSize = worldSize / 2;
        for (let x = -halfSize; x <= halfSize; x += step) {
            ctx.beginPath(); ctx.moveTo(x, -halfSize); ctx.lineTo(x, halfSize); ctx.stroke();
        }
        for (let y = -halfSize; y <= halfSize; y += step) {
            ctx.beginPath(); ctx.moveTo(-halfSize, y); ctx.lineTo(halfSize, y); ctx.stroke();
        }
    }

    drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number = 0, camera: Camera) {
        ctx.save();
        const factor = Math.max(0.1, 1 - (z / 300));
        
        // Parallax Effect: Shadow moves depending on its distance from camera center
        const dx = (x - camera.x) * 0.05;
        const dy = (y - camera.y) * 0.05;
        
        ctx.translate(x + dx, y + 5 + dy);
        ctx.scale(1.2 * factor, 0.6 * factor);
        
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, `rgba(0, 0, 0, ${0.4 * factor})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawEnvObject(ctx: CanvasRenderingContext2D, ev: any) {
        ctx.save();
        ctx.translate(ev.x, ev.y);
        const tex = this.textures[ev.type];
        if (tex) {
            ctx.drawImage(tex, -ev.r, -ev.r, ev.r * 2, ev.r * 2);
        } else {
            ctx.fillStyle = ev.type === 'tree' ? '#14532d' : '#334155';
            ctx.beginPath();
            ctx.arc(0, 0, ev.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawEntity(ctx: CanvasRenderingContext2D, e: any) {
        ctx.save();
        ctx.translate(e.x, e.y - (e.z || 0));
        const zScale = 1 + (e.z || 0) / 400;
        const scaleX = (e as any).scaleX || 1;
        ctx.scale(zScale * scaleX, zScale);
        
        const config = ENTITIES[e.type] || {};
        const isShape = e.class === 'neutral';
        
        if (isShape) {
            ctx.rotate(e.angle || 0);
            const depth = e.size * 0.3;
            const texID = config.textureId || e.type;
            const tex = this.textures[texID];
            
            // Draw Sides (Depth) with Darker Effect
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            if (tex) {
                ctx.drawImage(tex, -e.size/2, -e.size/2, e.size, e.size + depth);
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillRect(-e.size/2, -e.size/2, e.size, e.size + depth);
            } else {
                ctx.fillStyle = config.colorSide || '#334155';
                ctx.fillRect(-e.size/2, -e.size/2, e.size, e.size + depth);
            }
            ctx.restore();
            
            // Draw Bottom side even darker
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(-e.size/2, e.size/2, e.size, depth);
            ctx.restore();
            
            // Draw Top Face
            if (tex) {
                ctx.drawImage(tex, -e.size/2, -e.size/2 - depth/2, e.size, e.size);
            } else {
                ctx.fillStyle = config.colorTop || '#94a3b8';
                ctx.fillRect(-e.size/2, -e.size/2 - depth/2, e.size, e.size);
            }
        } else {
            const tex = this.textures[config.textureId || e.type];
            if (tex) {
                const stateIdx = e.animState === 'idle' ? 0 : (e.animState === 'walk' ? 1 : 2);
                const frameCount = (config.framesConfig && config.framesConfig[stateIdx]) || 1;
                const frameIdx = Math.floor(e.animFrame / 10) % frameCount;
                const sw = tex.width / (config.framesConfig ? Math.max(...config.framesConfig) : 1);
                const sh = tex.height / 3;
                ctx.drawImage(tex, frameIdx * sw, stateIdx * sh, sw, sh, -e.size/2, -e.size/2, e.size, e.size);
            } else {
                ctx.rotate(e.angle);
                ctx.fillStyle = config.colorTop || '#ef4444';
                ctx.fillRect(-e.size/2, -e.size/2, e.size, e.size);
            }
        }
        ctx.restore();

        if (e.hp < e.maxHp) {
            ctx.save();
            ctx.translate(e.x, e.y - e.size - 15);
            ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
            ctx.fillRect(-22, -1, 44, 6);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-20, 0, 40 * (e.hp / e.maxHp), 4);
            ctx.restore();
        }
    }

    drawPlayer(ctx: CanvasRenderingContext2D, p: Entity) {
        ctx.save();
        ctx.translate(p.x, p.y - (p.z || 0));
        const zScale = 1 + (p.z || 0) / 400;
        
        const mouseDx = Math.cos(p.angle);
        const flipX = mouseDx < 0 ? -1 : 1;
        ctx.scale(zScale * flipX, zScale);
        
        const classCfg = CLASSES[p.class] || CLASSES.basic;
        const tex = this.textures[classCfg.textureId];

        // --- STEALTH EFFECT ---
        ctx.globalAlpha = p.activeBuffs?.stealth ? 0.35 : 1.0;

        if (tex) {
            ctx.save();
            let drawAngle = p.angle;
            if (flipX === -1) {
                // Adjust rotation for the flipped sprite to keep it upright
                drawAngle = Math.PI - p.angle;
            }
            ctx.rotate(drawAngle);
            ctx.drawImage(tex, -p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        } else {
            ctx.rotate(p.angle);
            ctx.shadowBlur = 25;
            ctx.shadowColor = classCfg.color || '#38bdf8';
            ctx.fillStyle = classCfg.color || '#0ea5e9';
            ctx.beginPath();
            ctx.moveTo(p.size / 2, 0);
            ctx.lineTo(-p.size / 2, -p.size / 2);
            ctx.lineTo(-p.size / 3, 0);
            ctx.lineTo(-p.size / 2, p.size / 2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    drawMultiplayerPlayer(ctx: CanvasRenderingContext2D, p: any) {
        ctx.save();
        ctx.translate(p.x, p.y - (p.z || 0));
        const classCfg = CLASSES[p.class] || CLASSES.basic;
        const tex = this.textures[classCfg.textureId];
        const size = Math.max(60, p.size || 60);

        // Glow ring
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.isBot ? '#fbbf24' : '#06b6d4';
        ctx.strokeStyle = p.isBot ? 'rgba(234, 179, 8, 0.5)' : 'rgba(6, 182, 212, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Draw character
        ctx.save();
        ctx.rotate(p.angle || 0);
        if (tex) {
            ctx.drawImage(tex, -size / 2, -size / 2, size, size);
        } else {
            ctx.fillStyle = classCfg.color || '#ef4444';
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // HP and Name
        const hpRatio = Math.max(0, p.hp) / (p.maxHp || 100);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.fillRect(-25, -size / 2 - 15, 50, 6);
        ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : (hpRatio > 0.2 ? '#f59e0b' : '#ef4444');
        ctx.fillRect(-25, -size / 2 - 15, 50 * hpRatio, 6);

        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || 'Bot', 0, -size / 2 - 20);

        ctx.restore();
    }

    drawBullet(ctx: CanvasRenderingContext2D, b: any) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = b.isEnemy ? '#ef4444' : '#3b82f6';
        
        if (b.type === 'boulder') {
            const tex = this.textures.stone;
            if (tex) ctx.drawImage(tex, -15, -15, 30, 30);
            else { ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); }
        } else if (b.type === 'tnt') {
             const tex = this.textures.shape_tnt;
             if (tex) ctx.drawImage(tex, -12, -12, 24, 24);
             else { ctx.fillStyle = '#ef4444'; ctx.fillRect(-12, -12, 24, 24); }
        } else {
            ctx.fillStyle = b.isEnemy ? '#ef4444' : '#3b82f6';
            ctx.fillRect(-8, -3, 16, 6);
        }
        ctx.restore();
    }

    drawDrop(ctx: CanvasRenderingContext2D, d: any) {
        ctx.save();
        ctx.translate(d.x, d.y);
        const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.1;
        ctx.scale(pulse, pulse);
        
        const tex = this.textures['ui_coin'];
        if (tex) {
            ctx.drawImage(tex, -12, -12, 24, 24);
        } else {
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawParticle(ctx: CanvasRenderingContext2D, p: any) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color || '#38bdf8';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        const size = p.size * p.life;
        ctx.fillRect(-size/2, -size/2, size, size);
        ctx.restore();
    }
}
