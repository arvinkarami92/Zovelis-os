import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two builds from one codebase:
//   npm run build        -> dist/       talks to the Zemvii server over HTTP
//   npm run build:demo   -> dist-demo/  runs the real API in the browser with
//                                       an in-memory store and the demo world
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    plugins: [react()],
    define: { __DEMO__: JSON.stringify(demo) },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: demo
        ? { output: { inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } }
        : {},
    },
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:8787', '/media': 'http://127.0.0.1:8787' },
    },
  };
});
