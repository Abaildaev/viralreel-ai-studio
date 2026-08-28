import { defineConfig } from 'vite';

export default defineConfig({
  // Static assets belong to dist/client. Copying public/ into the SSR output
  // makes Cloudflare treat ~25 MiB of images and PDFs as Worker code and the
  // production upload exceeds its 10 MiB Worker limit.
  publicDir: false,
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
