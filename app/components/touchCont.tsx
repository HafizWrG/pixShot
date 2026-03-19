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
                } else if (!isLeftArea && (touchStateRef.current.rightTouchId === null || touchStateRef.current.rightTouchId === t.identifier)) {
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
    }, [settings.isMobile, settings.joystickScale, uiState.isPlaying, uiState.isPaused, canvasRef, gameRef, setJoystick]);

    return null; // This component does not render anything itself
};

export default TouchControls;