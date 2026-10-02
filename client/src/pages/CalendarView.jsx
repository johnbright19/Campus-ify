import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

function CalendarView() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 AM to 6 PM

  const mockEvents = [
    { id: 1, title: 'Techfest Planning', day: 'Mon', start: 10, duration: 2, color: 'bg-indigo-500', room: 'Seminar Hall A' },
    { id: 2, title: 'Faculty Meeting', day: 'Wed', start: 14, duration: 1.5, color: 'bg-emerald-500', room: 'Conference Rm' },
    { id: 3, title: 'Guest Lecture', day: 'Thu', start: 11, duration: 2, color: 'bg-amber-500', room: 'Auditorium' },
    { id: 4, title: 'Project Review', day: 'Fri', start: 15, duration: 1, color: 'bg-rose-500', room: 'Lab 3' },
  ];

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Calendar className="text-indigo-400" />
            Campus Calendar
          </h1>
          <p className="text-slate-400">View and manage resource schedules</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-[#1E293B] rounded-lg border border-slate-700 p-1">
            <button className="p-1 hover:bg-slate-700 rounded text-slate-300"><ChevronLeft size={20} /></button>
            <div className="px-4 py-1 font-medium text-white">This Week</div>
            <button className="p-1 hover:bg-slate-700 rounded text-slate-300"><ChevronRight size={20} /></button>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Plus size={18} /> New Booking
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-[#1E293B] rounded-2xl border border-slate-700 overflow-hidden flex flex-col shadow-xl">
        
        {/* Days Header */}
        <div className="flex border-b border-slate-700 bg-[#0F172A]/50">
          <div className="w-16 shrink-0 border-r border-slate-700"></div>
          {days.map(day => (
            <div key={day} className="flex-1 py-3 text-center border-r border-slate-700 last:border-0">
              <span className="text-sm font-medium text-slate-400">{day}</span>
            </div>
          ))}
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto relative bg-[#1E293B]">
          <div className="flex">
            {/* Time Labels */}
            <div className="w-16 shrink-0 bg-[#0F172A]/20">
              {hours.map(hour => (
                <div key={hour} className="h-16 relative border-b border-slate-700/50 border-r">
                  <span className="absolute -top-3 left-2 text-xs text-slate-500">
                    {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div className="flex-1 grid grid-cols-7 relative">
              {days.map((day, colIdx) => (
                <div key={day} className="relative border-r border-slate-700/50 last:border-0">
                  {hours.map(hour => (
                    <div key={hour} className="h-16 border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors cursor-pointer"></div>
                  ))}
                  
                  {/* Render Events */}
                  {mockEvents.filter(e => e.day === day).map(event => (
                    <div 
                      key={event.id}
                      className={`absolute left-1 right-1 rounded-lg p-2 ${event.color} border border-white/10 shadow-lg shadow-black/20 group hover:-translate-y-0.5 hover:shadow-indigo-500/20 transition-all cursor-pointer`}
                      style={{
                        top: `${(event.start - 8) * 4}rem`,
                        height: `${event.duration * 4}rem`
                      }}
                    >
                      <h4 className="text-white text-xs font-semibold leading-tight">{event.title}</h4>
                      <p className="text-white/80 text-[10px] mt-1 line-clamp-1">{event.room}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarView;
