import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: true,
    outDir: 'dist/server',
    ssr: 'sites-worker.ts',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
    target: 'es2022',
  },
});
