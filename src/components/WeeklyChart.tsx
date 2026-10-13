import React from 'react';

type WeeklyChartItem = {
  day: string;
  hours: number;
  active?: boolean;
  label?: string;
};

interface WeeklyChartProps {
  data?: WeeklyChartItem[];
}

export const WeeklyChart: React.FC<WeeklyChartProps> = ({ data = [] }) => {
  const maxHours = data.length > 0 ? Math.max(...data.map((d) => d.hours), 2) : 2;
  const totalHours = data.reduce((acc, d) => acc + d.hours, 0);

  return (
    <div className="flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-[2px] font-bold text-[#63815c] dark:text-emerald-400">Learning cadence</span>
            <span className="text-[#a6ba49] dark:text-[#e0f36b] text-[9px]">✦</span>
          </div>
          <h3 className="font-bold text-[15px] tracking-tight text-[#063e33] dark:text-white mt-0.5">Weekly study rhythm</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#063e33] bg-[#e0f36b] px-3 py-1 rounded-full border border-[#063e33]/10 dark:border-transparent shadow-xs">
            {totalHours.toFixed(1)} hrs
          </span>
        </div>
      </div>

      {totalHours === 0 ? (
        <div className="h-44 flex flex-col items-center justify-center gap-2.5 text-xs text-[#66736b] dark:text-slate-400 bg-white/60 dark:bg-white/5 rounded-2xl border border-dashed border-[#063e33]/15 dark:border-white/10 p-6 text-center">
          <span className="w-8 h-8 rounded-full bg-[#e8edda] dark:bg-white/10 text-[#063e33] dark:text-white flex items-center justify-center text-sm font-serif">✦</span>
          <div>
            <p className="font-semibold text-[#063e33] dark:text-white text-[13px]">Your week is just beginning</p>
            <p className="text-[11px] text-[#66736b] dark:text-slate-400 mt-0.5">Start a lesson today to record your first study session.</p>
          </div>
        </div>
      ) : (
        <div className="pt-2 pb-1">
          {/* Subtle horizontal guideline */}
          <div className="relative">
            <div className="h-40 flex items-end justify-between gap-2 sm:gap-3 px-1">
              {data.map((item) => {
                const heightPercent = maxHours > 0 ? Math.min(100, Math.max(14, Math.round((item.hours / maxHours) * 88) + 12)) : 14;
                return (
                  <div
                    key={item.day}
                    role="img"
                    aria-label={`${item.day}: ${item.hours.toFixed(1)} hours of study`}
                    className="group relative flex-1 flex flex-col items-center gap-2 cursor-pointer"
                  >
                    {/* Floating pill badge on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-[#063e33] dark:bg-[#e0f36b] text-white dark:text-[#063e33] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                      {item.hours.toFixed(1)} hrs
                    </div>

                    <span aria-hidden="true" className="text-[10px] font-semibold tabular-nums text-[#66736b] dark:text-slate-400 group-hover:text-[#063e33] dark:group-hover:text-white transition-colors">
                      {item.label ?? (item.hours > 0 ? `${item.hours.toFixed(1)}h` : '—')}
                    </span>

                    <div className="w-full max-w-[32px] bg-[#063e33]/[0.05] dark:bg-white/5 rounded-full h-28 flex items-end justify-center p-1 relative overflow-hidden transition-all duration-300 group-hover:bg-[#063e33]/[0.08] dark:group-hover:bg-white/10">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-full transition-all duration-500 ${
                          item.active
                            ? 'bg-[#063e33] dark:bg-[#e0f36b] ring-2 ring-[#e0f36b] dark:ring-white/50 shadow-xs'
                            : item.hours > 0
                            ? 'bg-[#63815c] dark:bg-emerald-500 group-hover:bg-[#063e33] dark:group-hover:bg-emerald-400'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>

                    <span
                      className={`text-[11px] font-bold tracking-wider transition-colors ${
                        item.active
                          ? 'text-[#063e33] dark:text-[#e0f36b]'
                          : 'text-[#66736b] dark:text-slate-400 group-hover:text-[#063e33] dark:group-hover:text-white'
                      }`}
                    >
                      {item.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#063e33]/8 dark:border-white/10 flex items-center justify-between text-[11px] text-[#66736b] dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#063e33] dark:bg-[#e0f36b] ring-2 ring-[#e0f36b] dark:ring-white/40" />
              <span>Today's active session</span>
            </span>
            <span className="font-medium text-[#49644f] dark:text-emerald-400">Goal: 1.5h / day</span>
          </div>
        </div>
      )}
    </div>
  );
};
