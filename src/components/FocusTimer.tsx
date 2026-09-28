import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export const FocusTimer: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = () => {
    setIsActive(false);
    setSeconds(0);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 text-white shadow-sm flex flex-col justify-between min-h-[190px] border border-emerald-950/20"
      style={{
        backgroundImage: `linear-gradient(rgba(10, 25, 18, 0.82), rgba(10, 25, 18, 0.88)), url('https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800&auto=format&fit=crop&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="flex items-center justify-between z-10">
        <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider">
          Study Focus Tracker
        </span>
        <span className="text-[11px] font-medium bg-white/10 px-2 py-0.5 rounded-full text-emerald-100">
          {isActive ? 'Active Session' : 'Paused'}
        </span>
      </div>

      <div className="text-center my-3 z-10">
        <div className="text-4xl sm:text-5xl font-black tracking-wider font-mono">
          {formatTime(seconds)}
        </div>
        <p className="text-xs text-emerald-200/80 mt-1">Deep Learning Mode</p>
      </div>

      <div className="flex items-center justify-center gap-3 z-10">
        <button
          onClick={() => setIsActive(!isActive)}
          className="px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/40 bg-white/15 hover:bg-white/30 backdrop-blur-xs text-white"
        >
          {isActive ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </>
          )}
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/20 bg-black/25 hover:bg-black/40 text-emerald-200"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
