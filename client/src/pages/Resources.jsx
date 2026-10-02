import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Search, MapPin, Users, Monitor, Filter } from 'lucide-react';

const mockResources = [
  { id: 1, name: 'Seminar Hall A', type: 'Hall', capacity: 120, location: 'Main Block, Ground Fl.', features: ['Projector', 'AC', 'PA System'], status: 'Available' },
  { id: 2, name: 'Computer Lab 3', type: 'Lab', capacity: 60, location: 'Tech Block, 2nd Fl.', features: ['60 PCs', 'AC', 'Whiteboard'], status: 'Booked' },
  { id: 3, name: 'Auditorium', type: 'Hall', capacity: 800, location: 'Central Wing', features: ['Stage', 'AC', 'Green Room', 'AV System'], status: 'Available' },
  { id: 4, name: 'Discussion Room 1', type: 'Room', capacity: 15, location: 'Library, 1st Fl.', features: ['Whiteboard', 'Display'], status: 'Available' },
  { id: 5, name: 'Open Ground', type: 'Ground', capacity: 2000, location: 'South Campus', features: ['Floodlights'], status: 'Maintenance' },
];

function Resources() {
  const containerRef = useRef(null);

  useGSAP(() => {
    gsap.from('.resource-card', {
      y: 40,
      opacity: 0,
      duration: 0.5,
      stagger: 0.1,
      ease: 'power2.out'
    });
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Resources</h1>
          <p className="text-slate-400">Find and book campus spaces and equipment</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search resources..." 
              className="bg-[#1E293B] border border-slate-700 text-white pl-10 pr-4 py-2 rounded-xl focus:outline-none focus:border-indigo-500 w-full md:w-64"
            />
          </div>
          <button className="bg-[#1E293B] border border-slate-700 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockResources.map((res) => (
          <div key={res.id} className="resource-card group bg-[#1E293B] rounded-2xl overflow-hidden border border-slate-700 hover:border-indigo-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
            <div className="h-32 bg-slate-800 relative">
              <img 
                src={`https://images.unsplash.com/photo-1576949318465-b1a7ab5080c5?auto=format&fit=crop&q=80&w=400&h=200`} 
                alt={res.name} 
                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
              />
              <div className="absolute top-3 right-3">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border backdrop-blur-sm ${
                  res.status === 'Available' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  res.status === 'Booked' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {res.status}
                </span>
              </div>
            </div>
            
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors">{res.name}</h3>
                  <div className="flex items-center text-slate-400 text-sm gap-1">
                    <MapPin size={14} />
                    <span>{res.location}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-slate-300 mb-5">
                <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-md">
                  <Users size={14} className="text-indigo-400" />
                  <span>{res.capacity}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-md">
                  <Monitor size={14} className="text-emerald-400" />
                  <span>{res.type}</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {res.features.map(f => (
                  <span key={f} className="text-xs text-slate-400 bg-[#0F172A] px-2 py-1 rounded border border-slate-700">
                    {f}
                  </span>
                ))}
              </div>
              
              <button className="w-full py-2.5 rounded-xl font-medium transition-all duration-200 bg-indigo-600 hover:bg-indigo-500 text-white">
                Book Now
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Resources;
