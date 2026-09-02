import React from 'react';
import { Music, Sparkles } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Cargando MusicKids...',
}) => {
  return (
    <div
      id="loading-screen"
      className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans"
    >
      <div className="absolute top-12 left-12 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-12 right-12 w-64 h-64 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-[#4F46E5] text-white flex items-center justify-center shadow-xl shadow-indigo-200 animate-bounce">
            <Music className="w-10 h-10" />
          </div>
          <div className="absolute -top-1 -right-1 animate-spin text-indigo-400">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          MusicKids
        </h2>
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
          {message}
        </p>
      </div>
    </div>
  );
};
