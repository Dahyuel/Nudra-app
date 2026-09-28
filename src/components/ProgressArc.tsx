import React from 'react';
import { Link } from 'react-router-dom';

interface ProgressArcProps {
  title?: string;
  subtitle?: string;
  percentage?: number;
  reportLink?: string;
}

export const ProgressArc: React.FC<ProgressArcProps> = ({
  title = 'Weekly Goal Completion',
  subtitle = 'Computer Science & AI Track',
  percentage = 68,
  reportLink = '/progress',
}) => {
  // SVG semi-circle arc math
  const radius = 64;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Semi-circle circumference
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Curriculum Progress
          </span>
        </div>
        <h4 className="text-base font-bold text-[#1B1B1B]">{subtitle}</h4>
      </div>

      <div className="flex flex-col items-center justify-center my-3">
        <div className="relative w-44 h-26 flex items-center justify-center overflow-hidden">
          <svg className="w-44 h-44 -rotate-180 transform" viewBox="0 0 160 160">
            {/* Background semi-circle track */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset="0"
              strokeLinecap="round"
            />
            {/* Progress semi-circle filled */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#2D6A4F"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Centered Percentage Display */}
          <div className="absolute top-12 flex flex-col items-center">
            <span className="text-2xl font-black text-[#1B1B1B] tracking-tight">
              {percentage}%
            </span>
            <span className="text-[11px] font-semibold text-gray-500">
              Completed
            </span>
          </div>
        </div>
      </div>

      <div className="text-center pt-1">
        <Link
          to={reportLink}
          className="inline-flex items-center justify-center px-4 py-2 border border-[#2D6A4F] text-[#2D6A4F] hover:bg-[#2D6A4F] hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs"
        >
          View Full Report
        </Link>
      </div>
    </div>
  );
};
