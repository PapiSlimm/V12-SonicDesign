import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => Promise<void>;
}

export const AIModal: React.FC<AIModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerate(prompt);
      onClose();
    } catch (error) {
      console.error('AI Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#2a2a2a] border border-[#3a3a3a] w-full max-w-md rounded-xl shadow-2xl overflow-hidden relative z-10"
          >
            <div className="p-4 border-b border-[#3a3a3a] flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400">
                <Sparkles size={18} />
                <h2 className="font-bold text-sm">Generative Fill</h2>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs text-gray-400">Describe what you want to add or change in the selected area.</p>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., 'A majestic snow-capped mountain range under a purple sunset'"
                className="w-full h-32 bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
              />
              <button 
                onClick={handleGenerate}
                disabled={!prompt || isGenerating}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
