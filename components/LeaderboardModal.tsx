'use client';
import React, { useEffect } from 'react';

interface LeaderboardModalProps {
    globalTop: any[] | null;
    setGlobalTop: (data: any[] | null) => void;
    setUiState: React.Dispatch<React.SetStateAction<any>>;
    supabase: any; // Sebaiknya gunakan tipe SupabaseClient jika tersedia
    uiScale: number;
}

const LeaderboardModal = ({ globalTop, setGlobalTop, setUiState, supabase, uiScale }: LeaderboardModalProps) => {
    useEffect(() => {
        const fetchLeaderboard = async () => {
            const { data, error } = await supabase.from('players').select('username, highscore, total_kills, avatar, playtime, matches').order('highscore', { ascending: false }).limit(50);
            if (!error && data) setGlobalTop(data);
        };
        // Hanya fetch jika data belum ada untuk menghindari panggilan API yang tidak perlu
        if (globalTop === null) {
            fetchLeaderboard();
        }
    }, [globalTop, setGlobalTop, supabase]);

    const handleRefresh = async () => {
        setGlobalTop(null); // Mengatur ke null akan memicu pengambilan ulang data di useEffect
    };

    return (
        <div className="origin-center transition-all duration-500 w-full flex items-center justify-center p-4" style={{ transform: `scale(${uiScale})` }}>
            <div className="bg-slate-900/90 p-1 md:p-8 rounded-[2.5rem] border border-amber-500/30 w-full max-w-2xl shadow-[0_0_100px_rgba(245,158,11,0.1)] flex flex-col gap-6 max-h-[85vh] overflow-hidden backdrop-blur-2xl pointer-events-auto">
                <div className="flex justify-between items-center bg-gradient-to-r from-amber-500/10 to-transparent p-6 rounded-t-[2rem] shrink-0">
                    <div className="flex flex-col">
                        <h2 className="text-2xl md:text-4xl font-black text-amber-400 tracking-tighter uppercase flex items-center gap-3 italic">
                            <span className="text-3xl">🏆</span> Hall of Fame
                        </h2>
                        <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.3em] mt-1">Top 50 Legends Globally</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={handleRefresh} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2 rounded-full font-black text-xs uppercase transition-all active:scale-90 shadow-[0_0_20px_rgba(245,158,11,0.3)]">Refresh</button>
                        <button onClick={() => setUiState((p: any) => ({ ...p, showLeaderboard: false }))} className="text-slate-400 hover:text-white bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center border border-slate-700 transition-colors">✕</button>
                    </div>
                </div>

                <div className="px-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-8">
                    {globalTop === null ? (
                        <div className="text-center text-slate-500 py-16 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin"></div>
                            <span className="font-black uppercase tracking-[0.2em] text-xs animate-pulse text-amber-500/50">Fetching Legends...</span>
                        </div>
                    ) : globalTop.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {globalTop.map((lb: any, i: number) => (
                                <div key={i} className={`flex justify-between items-center p-4 rounded-3xl border transition-all group relative overflow-hidden ${i === 0 ? 'bg-amber-500/10 border-amber-500/30' : i === 1 ? 'bg-slate-300/5 border-slate-300/20' : i === 2 ? 'bg-amber-700/10 border-amber-700/20' : 'bg-slate-800/40 border-slate-800/60'}`}>
                                    {i < 3 && <div className={`absolute top-0 right-0 w-16 h-16 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4 font-black text-6xl italic ${i === 0 ? 'text-amber-400' : 'text-slate-400'}`}>{i + 1}</div>}

                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="relative">
                                            <div className={`w-14 h-14 rounded-2xl rotate-3 flex items-center justify-center font-black italic text-xl ${i === 0 ? 'bg-amber-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-amber-700 text-amber-50' : 'bg-slate-700 text-slate-400'}`}>
                                                {i + 1}
                                            </div>
                                            {i === 0 && <div className="absolute -top-2 -left-2 text-2xl animate-bounce">👑</div>}
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-800 overflow-hidden border border-slate-700 group-hover:border-amber-400/50 transition-all shadow-xl">
                                                {lb.avatar ? <img src={lb.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 font-black text-slate-500">👤</div>}
                                            </div>
                                            <div>
                                                <div className="text-white font-black text-xl tracking-tight group-hover:text-amber-400 transition-colors uppercase italic">{lb.username}</div>
                                                <div className="flex gap-2 items-center mt-1">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{lb.matches} Matches</span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{lb.total_kills} Kills</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right relative z-10">
                                        <div className="text-amber-400 font-black text-2xl font-mono tabular-nums drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">{Math.floor(lb.highscore).toLocaleString()}</div>
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Global Score</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-500 italic font-bold">No legends recorded yet. Time to make history?</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeaderboardModal;