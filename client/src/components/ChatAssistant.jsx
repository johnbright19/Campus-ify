import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';

function ChatAssistant({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I am your Campus Booking Concierge. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    const currentInput = input;
    setInput('');
    
    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `I can help you book a space for "${currentInput}". Would you like me to find available seminar halls or labs?` 
      }]);
    }, 1000);
  };

  return (
    <div className="w-full h-full bg-[#1E293B] rounded-2xl border border-indigo-500/30 shadow-2xl shadow-indigo-900/20 flex flex-col overflow-hidden">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
          <Bot className="text-white" size={24} />
        </div>
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            Booking Concierge <Sparkles size={14} className="text-amber-300" />
          </h3>
          <p className="text-indigo-100 text-xs">AI-powered assistant</p>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'assistant' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'
            }`}>
              {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] text-sm ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-slate-700 bg-slate-800/50">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your request here..." 
            className="w-full bg-[#0F172A] border border-slate-600 text-white rounded-full pl-4 pr-12 py-3 focus:outline-none focus:border-indigo-500 shadow-inner"
          />
          <button 
            onClick={handleSend}
            className="absolute right-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-500 mt-2">
          AI can make mistakes. Verify booking details.
        </p>
      </div>
    </div>
  );
}

export default ChatAssistant;
