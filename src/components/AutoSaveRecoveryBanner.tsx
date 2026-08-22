import React, { useEffect, useState } from 'react';
import { Save, RefreshCw, X, AlertCircle, CheckCircle } from 'lucide-react';
import { useStore } from '../store/index';

const AUTOSAVE_STORAGE_KEY = 'motion_studio_autosave_v1';

export const AutoSaveRecoveryBanner: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [autoSaveData, setAutoSaveData] = useState<any>(null);
  const [autoSaveTimeStr, setAutoSaveTimeStr] = useState<string>('');
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);

  const layers = useStore((state) => state.layers);
  const duration = useStore((state) => state.duration);
  const motionPaths = useStore((state) => state.motionPaths);
  const brushColor = useStore((state) => state.brushColor);
  const colorSwatches = useStore((state) => state.colorSwatches);
  const globalColorVariables = useStore((state) => state.globalColorVariables);

  // Initial check for recovery payload on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          setAutoSaveData(parsed);
          const date = new Date(parsed.timestamp || Date.now());
          setAutoSaveTimeStr(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setShowPrompt(true);
        }
      }
    } catch (e) {
      console.error('Failed to parse auto-save state:', e);
    }
  }, []);

  // Periodic Auto-Save trigger
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        // Sanitize layers to ensure JSON stringifiable
        const sanitizedLayers = layers.map((l) => ({
          ...l,
          bitmap: null, // Omit raw ImageBitmap
        }));

        const payload = {
          timestamp: Date.now(),
          layers: sanitizedLayers,
          duration,
          motionPaths,
          brushColor,
          colorSwatches,
          globalColorVariables,
        };

        localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(payload));
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedNotice(`Auto-saved at ${nowStr}`);
        setTimeout(() => setLastSavedNotice(null), 3000);
      } catch (err) {
        console.warn('Auto-save error:', err);
      }
    }, 12000); // Auto-save every 12 seconds

    return () => clearInterval(timer);
  }, [layers, duration, motionPaths, brushColor, colorSwatches, globalColorVariables]);

  const handleRestore = () => {
    if (!autoSaveData) return;
    try {
      if (Array.isArray(autoSaveData.layers)) {
        useStore.setState({
          layers: autoSaveData.layers,
          selectedLayerId: autoSaveData.layers[0]?.id || null,
          selectedLayerIds: autoSaveData.layers[0]?.id ? [autoSaveData.layers[0].id] : [],
          duration: autoSaveData.duration || 10,
          motionPaths: autoSaveData.motionPaths || [],
          brushColor: autoSaveData.brushColor || '#3b82f6',
          colorSwatches: autoSaveData.colorSwatches || [],
          globalColorVariables: autoSaveData.globalColorVariables || [],
        });
      }
      setShowPrompt(false);
      setLastSavedNotice('Project successfully restored!');
      setTimeout(() => setLastSavedNotice(null), 4000);
    } catch (e) {
      console.error('Error restoring auto-saved session:', e);
    }
  };

  const handleDiscard = () => {
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    setShowPrompt(false);
  };

  return (
    <>
      {/* Recovery Prompt Modal / Banner */}
      {showPrompt && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-[#18181b] border-2 border-blue-500/80 rounded-xl p-4 text-white shadow-2xl flex items-center justify-between gap-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-lg flex-shrink-0">
                <AlertCircle size={22} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-gray-100 flex items-center gap-2">
                  Auto-Saved Project Found
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded border border-blue-500/40">
                    {autoSaveTimeStr}
                  </span>
                </h4>
                <p className="text-[11px] text-gray-400">
                  An unexpected close was detected. Would you like to restore your last session ({autoSaveData?.layers?.length || 0} layers)?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleDiscard}
                className="px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleRestore}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-blue-500/30 transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Auto-Save Toast Feedback */}
      {lastSavedNotice && !showPrompt && (
        <div className="fixed bottom-4 left-4 z-40 bg-[#18181b]/90 border border-green-500/50 text-green-400 px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle size={13} />
          <span>{lastSavedNotice}</span>
        </div>
      )}
    </>
  );
};
