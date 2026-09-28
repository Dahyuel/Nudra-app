import React from 'react';
import { DollarSign, TrendingUp, Users, BookOpen } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useInstructorEarnings } from '../../hooks/useInstructorEarnings';

export const InstructorEarningsPage: React.FC = () => {
  const { earnings, summary, courseEarnings, isLoading } = useInstructorEarnings();

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          Earnings
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Revenue breakdown across your masterclasses
        </p>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-base text-[#1B1B1B]">Earnings Trend (Last 6 Months)</h3>
            <p className="text-xs text-[#6B7280]">Monthly net income payout in Egyptian Pounds (EGP)</p>
          </div>
          <span className="text-xs font-black text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-lg">
            EGP Currency
          </span>
        </div>

        <div className="h-72 w-full pt-4">
          {isLoading ? (
            <div className="h-full flex items-end justify-around gap-3 px-4 pb-6">
              {[40, 65, 85, 55, 95, 35].map((h, i) => (
                <div key={i} className="w-10 bg-gray-200/70 rounded-t-lg animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnings} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${val / 1000}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} EGP`, 'Revenue']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                  {earnings.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === earnings.length - 1 ? '#2D6A4F' : '#52B788'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="rounded-2xl p-6 bg-[#2D6A4F] text-white shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Total Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-200" />
          </div>
          <p className="text-2xl font-black">{isLoading ? '—' : `${summary.totalRevenue.toLocaleString()} EGP`}</p>
        </div>
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Month</span>
            <TrendingUp className="w-4 h-4 text-[#2D6A4F]" />
          </div>
          <p className="text-2xl font-black text-gray-900">{isLoading ? '—' : `${summary.thisMonthRevenue.toLocaleString()} EGP`}</p>
        </div>
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Students</span>
            <Users className="w-4 h-4 text-[#2D6A4F]" />
          </div>
          <p className="text-2xl font-black text-gray-900">{isLoading ? '—' : summary.totalStudents.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Per Course</span>
            <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
          </div>
          <p className="text-2xl font-black text-gray-900">
            {isLoading
              ? '—'
              : `${(summary.courseCount > 0 ? Math.round(summary.totalRevenue / summary.courseCount) : 0).toLocaleString()} EGP`}
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-[#1B1B1B] pb-2 border-b border-gray-100">Per-Course Earnings</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-2">Course Title</th>
                <th className="pb-3 px-3">Students</th>
                <th className="pb-3 px-3">Price</th>
                <th className="pb-3 px-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-2"><div className="h-4 w-48 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              {!isLoading && courseEarnings.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400 italic">
                    No earnings data yet.
                  </td>
                </tr>
              )}
              {!isLoading &&
                courseEarnings.map((c) => (
                  <tr key={c.courseId} className="hover:bg-[#F8FAF9] transition-colors">
                    <td className="py-4 px-2 font-bold text-gray-900 max-w-xs truncate">{c.title}</td>
                    <td className="py-4 px-3 font-semibold text-gray-700">{c.students.toLocaleString()}</td>
                    <td className="py-4 px-3 text-gray-700">{c.price.toLocaleString()} EGP</td>
                    <td className="py-4 px-3 font-black text-gray-900">{c.revenue.toLocaleString()} EGP</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
