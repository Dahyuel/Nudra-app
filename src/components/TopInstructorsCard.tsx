import React from 'react';

export const TopInstructorsCard: React.FC = () => {
  return (
    <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-base text-[#1B1B1B]">Top Instructors</h3>
      </div>

      <div className="py-6 text-center text-xs text-gray-400 italic">
        لا توجد بيانات متاحة حالياً
      </div>
    </div>
  );
};
