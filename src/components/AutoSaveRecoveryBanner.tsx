import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useStore } from '../store/index';
import { AutosavePayload, clearAutosave, markCleanExit, projectFingerprint, readAutosave, restoreAutosaveLayers, writeAutosave } from '../services/autosave';

const AUTOSAVE_INTERVAL_MS = 15000;

/**
 * Periodic autosave (IndexedDB, includes image pixels) + crash-recovery prompt.
 * The prompt only appears when the previous session did NOT exit cleanly and the saved
 * project actually differs from a fresh document.
 */
export const AutoSaveRecoveryBanner: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [autoSaveData, setAutoSaveData] = useState<AutosavePayload | null>(null);
  const [autoSaveTimeStr, setAutoSaveTimeStr] = useState('');
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const lastFingerprint = useRef<string>('');
  const noticeTimer = useRef<number | null>(null);

  // Initial check for a recovery payload
  useEffect(() => {
    let cancelled = false;
    readAutosave().then((payload) => {
      if (cancelled || !payload || !Array.isArray(payload.layers) || payload.layers.length === 0) return;
      if (payload.cleanExit) return;
      setAutoSaveData(payload);
      setAutoSaveTimeStr(new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setShowPrompt(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Periodic autosave (only when something changed since the last write)
  useEffect(() => {
    const tick = async () => {
      const s = useStore.getState();
      const extra = { d: s.duration, f: s.fps, n: s.projectName, m: s.motionPaths, b: s.brushColor, c: s.colorSwatches, g: s.globalColorVariables };
      const fp = projectFingerprint(s.layers, extra);
      if (fp === lastFingerprint.current) return;
      try {
        await writeAutosave({
          projectName: s.projectName,
          duration: s.duration,
          fps: s.fps,
          layers: s.layers,
          motionPaths: s.motionPaths,
          brushColor: s.brushColor,
          colorSwatches: s.colorSwatches,
          globalColorVariables: s.globalColorVariables,
          cleanExit: false
        });
        lastFingerprint.current = fp;
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedNotice(`Auto-saved ${nowStr}`);
        if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setLastSavedNotice(null), 2500);
      } catch (err) {
        console.warn('Auto-save error:', err);
      }
    };
    const timer = window.setInterval(tick, AUTOSAVE_INTERVAL_MS);
    const onUnload = () => { void markCleanExit(); };
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const handleRestore = async () => {
    if (!autoSaveData) return;
    setRestoring(true);
    try {
      const layers = await restoreAutosaveLayers(autoSaveData);
      useStore.getState().loadProject({
        layers,
        motionPaths: autoSaveData.motionPaths || [],
        duration: autoSaveData.duration,
        fps: autoSaveData.fps,
        projectName: autoSaveData.projectName,
        colorSwatches: autoSaveData.colorSwatches,
        globalColorVariables: autoSaveData.globalColorVariables,
        brushColor: autoSaveData.brushColor
      });
      useStore.setState({ dirty: true });
      setShowPrompt(false);
      setLastSavedNotice('Project restored from auto-save');
      window.setTimeout(() => setLastSavedNotice(null), 4000);
    } catch (e) {
      console.error('Error restoring auto-saved session:', e);
      setLastSavedNotice('Could not restore auto-save');
    } finally {
      setRestoring(false);
    }
  };

  const handleDiscard = () => {
    void clearAutosave();
    setShowPrompt(false);
  };

  return (
    <>
      {showPrompt && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full px-4">
          <div className="bg-[#18181b] border-2 border-blue-500/80 rounded-xl p-4 text-white shadow-2xl flex items-center justify-between gap-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-lg flex-shrink-0">
                <AlertCircle size={22} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-gray-100 flex items-center gap-2">
                  Recover unsaved work?
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded border border-blue-500/40">
                    {autoSaveTimeStr}
                  </span>
                </h4>
                <p className="text-[11px] text-gray-400">
                  The last session ended without saving. Restore “{autoSaveData?.projectName || 'Untitled Project'}” ({autoSaveData?.layers?.length || 0} layers)?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleDiscard}
                disabled={restoring}
                className="px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-blue-500/30 transition-all flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw size={13} className={restoring ? 'animate-spin' : ''} />
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lastSavedNotice && !showPrompt && (
        <div className="fixed bottom-8 left-16 z-40 bg-[#18181b]/90 border border-green-500/50 text-green-400 px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5 shadow-lg backdrop-blur">
          <CheckCircle size={13} />
          <span>{lastSavedNotice}</span>
        </div>
      )}
    </>
  );
};
