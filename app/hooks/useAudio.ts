import { useRef, useEffect, useCallback } from 'react';

// Defines the structure for the audio hook's return values
interface UseAudioReturn {
    playSound: (type: string, options?: { playbackRate?: number, volume?: number }) => void;
}

// Custom hook for managing and playing audio
export const useAudio = (settings: { volume: number }): UseAudioReturn => {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioBuffersRef = useRef<Record<string, AudioBuffer>>({});

    // Initialize AudioContext once
    useEffect(() => {
        if (!audioCtxRef.current) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                audioCtxRef.current = new AudioContextClass();
            }
        }
    }, []);

    // Function to load a sound from a given source
    const loadSound = useCallback(async (id: string, src: string) => {
        if (!audioCtxRef.current) return;
        try {
            const response = await fetch(src);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
                audioBuffersRef.current[id] = audioBuffer;
            }
        } catch (e) {
            console.error(`Failed to load sound: ${id}`, e);
        }
    }, []);

    // Load all necessary game sounds on mount
    useEffect(() => {
        const soundsToLoad = ['shoot', 'hit', 'explode', 'coin', 'levelup', 'ult', 'thunder'];
        soundsToLoad.forEach(sound => loadSound(sound, `/${sound}.mp3`));
    }, [loadSound]);

    // Function to play a loaded sound
    const playSound = useCallback((type: string, options: { playbackRate?: number, volume?: number } = {}) => {
        const audioCtx = audioCtxRef.current;
        const audioBuffer = audioBuffersRef.current[type];
        const globalVolume = settings.volume;

        if (!audioCtx || !audioBuffer || globalVolume === 0) return;

        // Resume context if it's suspended (e.g., due to browser policy)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;

        const gainNode = audioCtx.createGain();
        
        // Set playback rate, default to 1
        source.playbackRate.value = options.playbackRate || 1;
        
        // Set volume, combining global and per-sound settings
        const specificVolume = options.volume !== undefined ? options.volume : (type === 'shoot' ? 0.3 : 0.6);
        gainNode.gain.value = globalVolume * specificVolume;

        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start(0);

    }, [settings.volume]);

    return { playSound };
};