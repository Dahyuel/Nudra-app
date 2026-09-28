import React from 'react';
import { LucideIcon, TrendingUp } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: string;
  isPrimary?: boolean;
  icon?: LucideIcon;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  isPrimary = false,
  icon: Icon,
}) => {
  if (isPrimary) {
    return (
      <div
        className="rounded-2xl p-6 bg-gradient-to-br from-[#2D6A4F] to-[#1E4D38] text-white shadow-sm flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-emerald-100/90">{title}</span>
          {Icon && (
            <div className="p-2 rounded-xl bg-white/10 text-emerald-200">
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>
        <div>
          <div className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            {value}
          </div>
          {badge && (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200 bg-white/10 px-2.5 py-1 rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{badge}</span>
            </div>
          )}
          {subtitle && !badge && (
            <p className="text-xs text-emerald-100/80">{subtitle}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 bg-white border border-gray-100/80 shadow-sm flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-[#6B7280]">{title}</span>
        {Icon && (
          <div className="p-2 rounded-xl bg-[#F8FAF9] text-[#2D6A4F]">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div>
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#1B1B1B] mb-2">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs font-medium text-[#6B7280] flex items-center gap-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
