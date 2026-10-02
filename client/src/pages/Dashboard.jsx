import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Users, CalendarCheck, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const data = [
  { name: 'Mon', usage: 85 },
  { name: 'Tue', usage: 72 },
  { name: 'Wed', usage: 93 },
  { name: 'Thu', usage: 65 },
  { name: 'Fri', usage: 88 },
  { name: 'Sat', usage: 45 },
  { name: 'Sun', usage: 30 },
];

function Dashboard() {
  const containerRef = useRef(null);

  useGSAP(() => {
    gsap.from('.stat-card', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out'
    });
    gsap.from('.chart-container', {
      scale: 0.95,
      opacity: 0,
      duration: 0.8,
      delay: 0.3,
      ease: 'power2.out'
    });
  }, { scope: containerRef });

  const stats = [
    { title: 'Total Bookings', value: '1,248', icon: CalendarCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { title: 'Active Users', value: '456', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { title: 'No-shows', value: '24', icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    { title: 'Utilization', value: '78%', icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div ref={containerRef} className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Overview</h1>
        <p className="text-slate-400">Campus resource utilization and insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="stat-card bg-[#1E293B] rounded-2xl p-6 border border-slate-700 hover:border-slate-600 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={stat.color} size={24} />
              </div>
            </div>
            <div>
              <h3 className="text-slate-400 text-sm font-medium">{stat.title}</h3>
              <div className="text-3xl font-bold text-white mt-1">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="chart-container lg:col-span-2 bg-[#1E293B] rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Weekly Utilization</h2>
            <select className="bg-slate-800 border border-slate-600 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
              <option>All Resources</option>
              <option>Seminar Halls</option>
              <option>Labs</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px' }}
                />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.usage > 80 ? '#4F46E5' : entry.usage > 50 ? '#818CF8' : '#C7D2FE'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Digest */}
        <div className="chart-container bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl p-6 border border-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <Clock size={120} />
          </div>
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 relative z-10">
            <span className="bg-indigo-500 p-1.5 rounded-lg"><TrendingUp size={18} className="text-white" /></span>
            AI Insights
          </h2>
          <div className="space-y-4 relative z-10">
            <div className="bg-[#1E293B]/60 backdrop-blur rounded-xl p-4 border border-indigo-500/10">
              <p className="text-sm leading-relaxed">
                <span className="font-semibold text-indigo-300">Seminar Hall A</span> is 94% booked on weekdays 10am-4pm. Consider shifting club meetings to Lab 3.
              </p>
            </div>
            <div className="bg-[#1E293B]/60 backdrop-blur rounded-xl p-4 border border-indigo-500/10">
              <p className="text-sm leading-relaxed">
                Waitlist promotions have a <span className="font-semibold text-emerald-300">85% success rate</span> when offers are sent before 6pm.
              </p>
            </div>
            <div className="bg-[#1E293B]/60 backdrop-blur rounded-xl p-4 border border-indigo-500/10">
              <p className="text-sm leading-relaxed text-slate-300">
                Action required: 3 requests have been pending HOD approval for &gt;24 hours.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
