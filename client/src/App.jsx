import React, { useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Calendar, LayoutDashboard, Search, MessageSquare, Menu, X, Bell } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// Mock Pages (we will create these separately)
import Dashboard from './pages/Dashboard';
import Resources from './pages/Resources';
import CalendarView from './pages/CalendarView';
import ChatAssistant from './components/ChatAssistant';

gsap.registerPlugin(useGSAP);

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const sidebarRef = useRef(null);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Resources', path: '/resources', icon: Search },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
  ];

  return (
    <Router>
      <div className="flex h-screen overflow-hidden bg-[#0F172A] text-slate-100 font-sans">
        
        {/* Sidebar */}
        <div 
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1E293B] border-r border-slate-700 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between p-6">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              Campusify
            </h1>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <nav className="mt-6 px-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`
                }
              >
                <item.icon size={20} />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* Header */}
          <header className="h-20 bg-[#1E293B]/80 backdrop-blur-md border-b border-slate-700 flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-400 hover:text-white">
                <Menu size={24} />
              </button>
              <h2 className="text-xl font-semibold hidden sm:block">Welcome back, Admin</h2>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#1E293B]"></span>
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
                <img src="https://i.pravatar.cc/150?img=11" alt="Profile" className="w-10 h-10 rounded-full border-2 border-indigo-500/50" />
                <div className="hidden md:block text-sm">
                  <p className="font-medium">John Doe</p>
                  <p className="text-slate-400 text-xs">Admin</p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Scrollable Area */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/calendar" element={<CalendarView />} />
            </Routes>
          </main>
          
          {/* Floating Chat Button */}
          <button 
            onClick={() => setIsAssistantOpen(!isAssistantOpen)}
            className="fixed bottom-8 right-8 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105 z-50"
          >
            {isAssistantOpen ? <X size={24} /> : <MessageSquare size={24} />}
          </button>
          
          {/* AI Assistant Chat Dock */}
          {isAssistantOpen && (
            <div className="fixed bottom-24 right-8 w-96 h-[500px] z-40">
              <ChatAssistant onClose={() => setIsAssistantOpen(false)} />
            </div>
          )}

        </div>
      </div>
    </Router>
  );
}

export default App;
