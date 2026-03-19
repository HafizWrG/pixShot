'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '@/lib/engine/GameEngine';
import { GameRenderer } from '@/lib/engine/Renderer';
import { CLASSES } from '@/lib/engine/Config';

interface GameCanvasProps {
    uiState: any;
    settings: any;
    engineRef: React.MutableRefObject<GameEngine>;
    rendererRef: React.MutableRefObject<GameRenderer | null>;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    glCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    glRef: React.MutableRefObject<WebGLRenderingContext | null>;
    glProgramRef: React.MutableRefObject<WebGLProgram | null>;
    glTexturesRef: React.MutableRefObject<Record<string, WebGLTexture>>;
    texturesRef: React.MutableRefObject<Record<string, HTMLCanvasElement | HTMLImageElement>>;
    glLocsRef: React.MutableRefObject<any>;
    glBufferRef: React.MutableRefObject<WebGLBuffer | null>;
    shadowTexRef: React.MutableRefObject<HTMLCanvasElement | null>;
    gameRef: React.MutableRefObject<any>;
    uiStateRef: React.MutableRefObject<any>;
    settingsRef: React.MutableRefObject<any>;
    loopActiveRef: React.MutableRefObject<boolean>;
    onGameUpdate: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
    uiState,
    settings,
    engineRef,
    rendererRef,
    canvasRef,
    glCanvasRef,
    glRef,
    glProgramRef,
    glTexturesRef,
    texturesRef,
    glLocsRef,
    glBufferRef,
    shadowTexRef,
    gameRef,
    uiStateRef,
    settingsRef,
    loopActiveRef,
    onGameUpdate
}) => {
    const frameCountRef = useRef(0);

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
        if (!gameGl || !program || !buffer || !locs || locs.pos === -1) return false;

        gameGl.useProgram(program);
        if (locs.res) gameGl.uniform2f(locs.res, gameGl.canvas.width, gameGl.canvas.height);
        if (locs.col) gameGl.uniform4f(locs.col, color[0], color[1], color[2], color[3] * alpha);
        if (locs.useTex) gameGl.uniform1f(locs.useTex, tex ? 1.0 : 0.0);

        if (tex && locs.img) {
            gameGl.activeTexture(gameGl.TEXTURE0);
            gameGl.bindTexture(gameGl.TEXTURE_2D, tex);
            gameGl.uniform1i(locs.img, 0);
        }

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
        gameGl.vertexAttribPointer(locs.pos, 2, gameGl.FLOAT, false, 16, 0);
        gameGl.enableVertexAttribArray(locs.tex);
        gameGl.vertexAttribPointer(locs.tex, 2, gameGl.FLOAT, false, 16, 8);

        gameGl.drawArrays(gameGl.TRIANGLE_STRIP, 0, 4);
        return true;
    };

    const drawSprite = (ctx: CanvasRenderingContext2D | null, x: number, y: number, width: number, height: number, depth: number, angle: number, textureType: any, colorTop: any, colorSide: any, isBot: boolean, zOffset = 0, alpha = 1, frameCount = 0, isSprite = false, animState = 'idle', framesConfig: number[] = [8, 8, 8], flipX = false) => {
        const gameGl = glRef.current;
        const tex = textureType ? texturesRef.current[textureType] : null;

        const cw = gameGl ? gameGl.canvas.width : (canvasRef.current?.width || 0);
        const ch = gameGl ? gameGl.canvas.height : (canvasRef.current?.height || 0);
        const depthY = depth * 0.8;
        const screenX = (x - gameRef.current.camera.x) * gameRef.current.camera.zoom + cw / 2;
        const screenY = (y + zOffset - gameRef.current.camera.y) * gameRef.current.camera.zoom + ch / 2;
        const drawW = width * gameRef.current.camera.zoom;
        const drawH = height * gameRef.current.camera.zoom;
        const depthH = depthY * gameRef.current.camera.zoom;

        let glRes = false;
        if (gameGl && glProgramRef.current) {
            if (isSprite && textureType && animState !== 'idle') {
                const frameIndex = Math.floor(frameCount / 6) % framesConfig[0];
                const ux = frameIndex / framesConfig[0];
                const uy = 0;
                const uw = 1 / framesConfig[0];
                const uh = 1;

                const spriteW = drawW;
                const spriteH = drawH * (tex ? (tex.height / tex.width) : 1);
                const spriteY = screenY - spriteH / 2;

                let tilt = 0;
                const maxTilt = 0.4;

                while (tilt < -Math.PI) tilt += Math.PI * 4;
                const drawAngle = Math.max(-maxTilt, Math.min(maxTilt, tilt));

                glRes = drawGL(textureType, screenX, spriteY, flipX ? -spriteW : spriteW, spriteH, drawAngle, alpha, ux, uy, uw, uh);
            } else if (glTexturesRef.current[textureType] && !isSprite) {
                const faceH = depthH * 1.3;
                drawGL(textureType, screenX, screenY, drawW, faceH, angle, alpha, 0, 0, 1, 1, [0.6, 0.6, 0.6, 1.0]);
                glRes = drawGL(textureType, screenX, screenY - faceH, drawW, drawH, angle, alpha, 0, 0, 1, 1, [1.0, 1.0, 1.0, 1.0]);
            } else if (glTexturesRef.current[textureType] || (isSprite && textureType)) {
                if (isSprite && !glTexturesRef.current[textureType]) {
                    glRes = drawGL(null, screenX, screenY, drawW, drawH, angle, alpha, 0, 0, 1, 1, [0.5, 0.5, 0.5, 1.0]);
                } else {
                    const sprH = drawH * (tex ? tex.height / tex.width : 1);
                    glRes = drawGL(textureType, screenX, screenY, drawW, sprH, angle, alpha, 0, 0, 1, 1, [1.0, 1.0, 1.0, 1.0]);
                }
            } else {
                const rgbTop = hexToRgb(colorTop);
                const rgbSide = hexToRgb(colorSide);
                drawGL(null, screenX, screenY, drawW, depthH * 1.3, angle, alpha, 0, 0, 1, 1, rgbSide);
                glRes = drawGL(null, screenX, screenY - depthH * 1.3, drawW, drawH, angle, alpha, 0, 0, 1, 1, rgbTop);
            }
        }

        if (!glRes && ctx) {
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(angle);

            if (isSprite && textureType && animState !== 'idle') {
                const frameIndex = Math.floor(frameCount / 6) % framesConfig[0];
                const frameW = tex ? tex.width / framesConfig[0] : 0;
                const frameH = tex ? tex.height : 0;

                if (tex && frameW > 0 && frameH > 0) {
                    ctx.scale(flipX ? -1 : 1, 1);
                    ctx.drawImage(tex, frameIndex * frameW, 0, frameW, frameH, -drawW / 2, -drawH / 2, drawW, drawH);
                } else {
                    ctx.fillStyle = `rgba(128,128,128,${alpha})`;
                    ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
                }
            } else if (tex && !isSprite) {
                const pattern = ctx.createPattern(tex, 'repeat');
                if (pattern) {
                    ctx.fillStyle = pattern;
                    ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
                }
            } else if (tex || (isSprite && textureType)) {
                if (tex) {
                    ctx.drawImage(tex, -drawW / 2, -drawH / 2, drawW, drawH);
                } else {
                    ctx.fillStyle = `rgba(128,128,128,${alpha})`;
                    ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
                }
            } else {
                const rgbTop = hexToRgb(colorTop);
                const rgbSide = hexToRgb(colorSide);
                ctx.fillStyle = `rgba(${rgbSide[0] * 255},${rgbSide[1] * 255},${rgbSide[2] * 255},${rgbSide[3] * alpha})`;
                ctx.fillRect(-drawW / 2, -drawH / 2, drawW, depthH * 1.3);
                ctx.fillStyle = `rgba(${rgbTop[0] * 255},${rgbTop[1] * 255},${rgbTop[2] * 255},${rgbTop[3] * alpha})`;
                ctx.fillRect(-drawW / 2, -drawH / 2 - depthH * 1.3, drawW, drawH);
            }
            ctx.restore();
        }
    };

    useEffect(() => {
        if (!uiState.isPlaying) return;

        const gameLoop = () => {
            if (!loopActiveRef.current) return;
            frameCountRef.current++;
            onGameUpdate();
            requestAnimationFrame(gameLoop);
        };

        requestAnimationFrame(gameLoop);
    }, [uiState.isPlaying, onGameUpdate]);

    useEffect(() => {
        if (!uiState.isPlaying) return;

        // 1. WEBGL BASE CONTEXT
        const canvas = glCanvasRef.current;
        if (!canvas) return;
        const gameGl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
        if (!gameGl) { console.error("WebGL failed to initialize context"); return; }
        glRef.current = gameGl;

        // Initialize Renderer
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
                console.error("SHADER COMPILE ERROR:", glContext.getShaderInfoLog(shader));
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
            console.error("PROGRAM LINK ERROR:", gameGl.getProgramInfoLog(program));
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

        return () => {
            // Cleanup WebGL resources
            if (glProgramRef.current) {
                gameGl.deleteProgram(glProgramRef.current);
            }
            if (glBufferRef.current) {
                gameGl.deleteBuffer(glBufferRef.current);
            }
        };
    }, [uiState.isPlaying]);

    if (!uiState.isPlaying) return null;

    return (
        <div className="fixed inset-0 pointer-events-none">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ imageRendering: 'pixelated' }}
            />
            <canvas
                ref={glCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ imageRendering: 'pixelated' }}
            />
        </div>
    );
};

export default GameCanvas;