import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // AI Studio convention: GEMINI_API_KEY from the environment. The app also reads VITE_GEMINI_API_KEY.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Shared V12 media package (analysis math + WebGL visualizer) — same code the media worker runs.
        '@v12/media/analyze': path.resolve(__dirname, './v12-media/src/analyze/index.ts'),
        '@v12/media/visualize': path.resolve(__dirname, './v12-media/src/visualize/index.ts'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            genai: ['@google/genai'],
            ui: ['lucide-react', 'motion', 'react-hotkeys-hook', 'zustand'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      fs: { allow: ['.'] },
    },
  };
});
