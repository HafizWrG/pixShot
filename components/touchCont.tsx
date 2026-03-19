import React, { useEffect, useRef } from 'react';

interface TouchControlsProps {
    settings: any;
    uiState: any;
    gameRef: React.MutableRefObject<any>;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    setJoystick: React.Dispatch<React.SetStateAction<any>>;
}

const TouchControls: React.FC<TouchControlsProps> = ({ settings, uiState, gameRef, canvasRef, setJoystick }) => {
    const touchStateRef = useRef({ leftTouchId: null as number | null, rightTouchId: null as number | null });

    useEffect(() => {
        if (!settings.isMobile || !uiState.isPlaying || uiState.isPaused) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleTouch = (e: TouchEvent) => {
            if (e.target !== canvas) return;
            e.preventDefault();

            const touches = e.touches;

            let newL: any = null, newR: any = null;
            let foundLeft = false, foundRight = false;

            const leftJoyOriginX = 140 * settings.joystickScale;
            const leftJoyOriginY = window.innerHeight - (140 * settings.joystickScale);
            const rightJoyOriginX = window.innerWidth - (140 * settings.joystickScale);
            const rightJoyOriginY = window.innerHeight - (140 * settings.joystickScale);

            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];

                // Dash button handling
                const dashEl = document.getElementById('dash-btn');
                if (dashEl) {
                    const rect = dashEl.getBoundingClientRect();
                    if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
                        gameRef.current.keys.space = true;
                        continue;
                    }
                }

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
                    
                    // Update movement keys based on joystick direction
                    gameRef.current.keys.w = newL.dy < -0.3;
                    gameRef.current.keys.s = newL.dy > 0.3;
                    gameRef.current.keys.a = newL.dx < -0.3;
                    gameRef.current.keys.d = newL.dx > 0.3;
                } else if (!isLeftArea && (touchStateRef.current.rightTouchId === null || touchStateRef.current.rightTouchId === t.identifier)) {
                    touchStateRef.current.rightTouchId = t.identifier;
                    foundRight = true;
                    let dx = t.clientX - rightJoyOriginX;
                    let dy = t.clientY - rightJoyOriginY;
                    let dist = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx);
                    newR = { active: true, x: t.clientX, y: t.clientY, angle, originX: rightJoyOriginX, originY: rightJoyOriginY, distance: dist };
                    
                    // Update player angle and shoot if joystick is moved significantly
                    gameRef.current.player.angle = angle;
                    gameRef.current.keys.joystickActive = true;
                    if (dist > 10) {
                        gameRef.current.keys.mouseLeft = true;
                    } else {
                        gameRef.current.keys.mouseLeft = false;
                    }
                }
            }

            if (!foundLeft) {
                touchStateRef.current.leftTouchId = null;
                gameRef.current.keys.w = false;
                gameRef.current.keys.s = false;
                gameRef.current.keys.a = false;
                gameRef.current.keys.d = false;
            }
            if (!foundRight) {
                touchStateRef.current.rightTouchId = null;
                gameRef.current.keys.mouseLeft = false;
                gameRef.current.keys.joystickActive = false;
            }

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
    }, [settings.isMobile, settings.joystickScale, uiState.isPlaying, uiState.isPaused, canvasRef, gameRef, setJoystick]);

    return null; // This component does not render anything itself
};

export default TouchControls;