import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Define the shape of the data and functions the hook will expose
export interface UseSocketReturn {
    connStatus: 'Disconnected' | 'Connecting' | 'Connected' | 'Error';
    setConnStatus: React.Dispatch<React.SetStateAction<'Disconnected' | 'Connecting' | 'Connected' | 'Error'>>;
    ping: number;
    setPing: React.Dispatch<React.SetStateAction<number>>;
    serverList: any[];
    setServerList: React.Dispatch<React.SetStateAction<any[]>>;
    onlineCount: number;
    setOnlineCount: React.Dispatch<React.SetStateAction<number>>;
    killFeed: any[];
    setKillFeed: React.Dispatch<React.SetStateAction<any[]>>;
    socketRef: React.MutableRefObject<Socket | null>;
    emit: (event: string, data?: any) => void;
}

export const useSocket = (socketUrl: string, auth: any, globalProfile: any): UseSocketReturn => {
    const socketRef = useRef<Socket | null>(null);
    const [connStatus, setConnStatus] = useState<'Disconnected' | 'Connecting' | 'Connected' | 'Error'>('Disconnected');
    const [ping, setPing] = useState(0);
    const [serverList, setServerList] = useState<any[]>([]);
    const [onlineCount, setOnlineCount] = useState(0);
    const [killFeed, setKillFeed] = useState<any[]>([]);

    useEffect(() => {
        if (!socketUrl) return;

        // Disconnect previous socket if URL changes
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        console.log(`[Socket] Attempting to connect to: ${socketUrl}`);
        setConnStatus('Connecting');

        const socket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            transports: ['websocket', 'polling'], // Faster websocket, with polling fallback for reliability
            auth: {
                uid: auth.isLoggedIn ? auth.uid : globalProfile.uid,
                username: auth.isLoggedIn ? auth.username : globalProfile.username,
            }
        });
        socketRef.current = socket;

        // Basic connection events
        socket.on('connect', () => {
            console.log('[Socket] Successfully connected! ID:', socket.id);
            setConnStatus('Connected');
            // Identify the player to the server
            if (auth.isLoggedIn) {
                socket.emit('player:identify', {
                    uid: auth.uid,
                    username: auth.username,
                    avatar: globalProfile.avatar
                });
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Disconnected: ${reason}`);
            setConnStatus('Disconnected');
        });

        socket.on('connect_error', (error) => {
            console.error(`[Socket] Connection Error: ${error.message}`);
            setConnStatus('Error');
        });

        // Game-specific listeners
        socket.on('br:room_list', (data: any[]) => setServerList(data));
        socket.on('stats:online_count', (count: number) => setOnlineCount(count));
        socket.on('br:kill_feed', (data: any) => {
            setKillFeed(prev => [data, ...prev].slice(0, 5));
        });
        socket.on('br:pong', (time: number) => {
            setPing(Date.now() - time);
        });

        // Ping interval
        const pingInterval = setInterval(() => {
            if (socket.connected) socket.emit('br:ping', Date.now());
        }, 2000);

        // Cleanup on unmount
        return () => {
            console.log('[Socket] Cleaning up and disconnecting.');
            clearInterval(pingInterval);
            socket.disconnect();
        };
    }, [socketUrl, auth.isLoggedIn, auth.uid, auth.username, globalProfile.uid, globalProfile.username, globalProfile.avatar]);

    // Exposed emit function
    const emit = useCallback((event: string, data?: any) => {
        socketRef.current?.emit(event, data);
    }, []);

    return { 
        connStatus, setConnStatus, 
        ping, setPing, 
        serverList, setServerList, 
        onlineCount, setOnlineCount, 
        killFeed, setKillFeed, 
        socketRef, 
        emit 
    };
};