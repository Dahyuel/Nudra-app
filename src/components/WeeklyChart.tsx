import React, { useState } from 'react';

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
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const maxHours = data.length > 0 ? Math.max(...data.map((d) => d.hours)) : 0;
  const totalHours = data.reduce((acc, d) => acc + d.hours, 0);

  return (
    <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-base text-[#1B1B1B]">Learning Analytics</h3>
          <p className="text-xs text-[#6B7280]">Daily hours committed this week</p>
        </div>
        <span className="text-xs font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-2.5 py-1 rounded-full">
          {totalHours.toFixed(1)} hrs total
        </span>
      </div>

      {data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-gray-400 italic">
          No study activity recorded this week
        </div>
      ) : (
        <div className="pt-4 pb-2">
          <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 px-2">
            {data.map((item) => {
              const heightPercent = maxHours > 0 ? Math.round((item.hours / maxHours) * 85) + 15 : 15;
              return (
                <div
                  key={item.day}
                  onMouseEnter={() => setHoveredDay(item.day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex-1 flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <div
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded transition-opacity ${
                      hoveredDay === item.day ? 'opacity-100 bg-gray-800 text-white' : 'opacity-0'
                    }`}
                  >
                    {item.label ?? `${item.hours}h`}
                  </div>

                  <div className="w-full max-w-[34px] bg-gray-100/60 rounded-full h-36 flex items-end justify-center p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-full transition-all duration-300 ${
                        item.active
                          ? 'bg-[#2D6A4F] shadow-xs'
                          : 'bg-[#52B788]/50 hover:bg-[#52B788]'
                      }`}
                    />
                  </div>

                  <span
                    className={`text-[11px] font-bold tracking-wider ${
                      item.active
                        ? 'text-[#2D6A4F]'
                        : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  >
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
