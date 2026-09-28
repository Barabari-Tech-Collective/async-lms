import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Workaround for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Pre-bundle these with esbuild on cold start so the browser gets single
    // chunks instead of a waterfall of hundreds of individual ESM requests.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@reduxjs/toolkit',
      'react-redux',
      'react-router',
      'axios',
      'react-hot-toast',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      '@monaco-editor/react',
      'react-markdown',
      'remark-gfm',
      'xterm',
      'xterm-addon-fit',
      'socket.io-client',
    ],
    // @webcontainer/api ships its own pre-built bundle with service workers —
    // running esbuild over it breaks it.
    exclude: ['@webcontainer/api'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
    // Pre-transform the critical-path files before the first browser request
    // so the initial page load doesn't stall while Vite compiles them.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/routes/AppRoutes.tsx',
        './src/routes/PrivateRoute.tsx',
      ],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // Apply COOP/COEP only on /code-editor — these are required for
    // WebContainers (SharedArrayBuffer) but break YouTube embeds everywhere else.
    {
      name: 'coep-coop-code-editor-only',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/code-editor')) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          }
          next();
        });
      },
    },
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // React core — changes rarely, long cache lifetime
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) return 'vendor-react';
          // Routing
          if (id.includes('/react-router/') || id.includes('@remix-run'))
            return 'vendor-router';
          // State management
          if (
            id.includes('@reduxjs/toolkit') ||
            id.includes('/react-redux/') ||
            id.includes('/immer/')
          ) return 'vendor-redux';
          // UI primitives (Radix, CVA, clsx, tailwind-merge, lucide)
          if (
            id.includes('@radix-ui') ||
            id.includes('class-variance-authority') ||
            id.includes('/clsx/') ||
            id.includes('tailwind-merge') ||
            id.includes('lucide-react')
          ) return 'vendor-ui';
          // Markdown rendering (react-markdown + unified ecosystem)
          if (
            id.includes('react-markdown') ||
            id.includes('/remark') ||
            id.includes('/rehype') ||
            id.includes('/unified') ||
            id.includes('/micromark') ||
            id.includes('/mdast') ||
            id.includes('/unist') ||
            id.includes('/vfile')
          ) return 'vendor-markdown';
          // Terminal
          if (id.includes('/xterm')) return 'vendor-xterm';
          // Sockets
          if (
            id.includes('socket.io-client') ||
            id.includes('engine.io-client')
          ) return 'vendor-socket';
        },
      },
    },
  },
});
