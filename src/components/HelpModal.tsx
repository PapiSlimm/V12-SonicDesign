import React from 'react';
import { X, Book, Play, HelpCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">V12SonicDesign Studio AI Manual</h2>
                  <p className="text-xs text-white/50 uppercase tracking-widest font-mono">Interactive Guide & Tutorials</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Tutorials Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-blue-400">
                  <Play className="w-4 h-4" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Quick Start Tutorials</h3>
                </div>
                
                <div className="space-y-4">
                  {[
                    { title: "Kinetic Typography Basics", duration: "2:30", desc: "Learn how to use presets and the 3D text engine." },
                    { title: "Advanced Graph Editing", duration: "4:15", desc: "Master easing curves for professional motion." },
                    { title: "Procedural Animation", duration: "3:45", desc: "Using noise and cloner systems for complex visuals." },
                    { title: "AI-Driven Workflows", duration: "2:00", desc: "Generate keyframes and assets with natural language." }
                  ].map((t, i) => (
                    <div key={i} className="p-4 bg-white/5 rounded-lg border border-white/5 hover:border-blue-500/50 transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-white group-hover:text-blue-400 transition-colors">{t.title}</h4>
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/50 font-mono">{t.duration}</span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* AI Manual Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-purple-400">
                  <Book className="w-4 h-4" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">AI Help Manual</h3>
                </div>

                <div className="space-y-4">
                  <div className="p-5 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-xl border border-white/10">
                    <h4 className="text-sm font-bold text-white mb-2">Ask the AI Assistant</h4>
                    <p className="text-xs text-white/60 mb-4">Need help with a specific tool? Just ask the AI in the chat to explain or perform the action for you.</p>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="e.g., How do I create a glitch effect?"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
                      />
                      <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                      <HelpCircle className="w-4 h-4 text-white/30 mb-2" />
                      <h5 className="text-xs font-bold text-white mb-1">Shortcuts</h5>
                      <p className="text-[10px] text-white/40">V: Move Tool<br/>T: Text Tool<br/>Space: Pan</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                      <Sparkles className="w-4 h-4 text-white/30 mb-2" />
                      <h5 className="text-xs font-bold text-white mb-1">AI Tips</h5>
                      <p className="text-[10px] text-white/40">Try "Animate this layer like a bouncing ball"</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-4 bg-black/40 border-t border-white/10 flex justify-center">
              <p className="text-[10px] text-white/20 uppercase tracking-[0.2em]">V12SonicDesign Studio &copy; 2026 • Powered by Gemini 3.1 Pro</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
