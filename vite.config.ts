import path from 'path';
import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        // 3000 is what the README and the client setup guide tell people to
        // open. PORT overrides it so tooling can start the server on a free
        // port when 3000 is already taken.
        port: Number(process.env.PORT) || 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), sites()],
      build: {
        outDir: 'dist/client',
        rollupOptions: {
          output: {
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('react')) return 'vendor-react';
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('@heroicons')) return 'vendor-icons';
              if (id.includes('mp4-muxer') || id.includes('html-to-image') || id.includes('lucide-react')) {
                return 'vendor-media';
              }
              return 'vendor';
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(import.meta.dirname, '.'),
        }
      }
    };
});
