import { defineConfig } from 'vite';

export default defineConfig({
  // Build configuration
  build: {
    outDir: 'public',
    emptyOutDir: false, // Don't clear public/ since it has static assets
    rollupOptions: {
      input: 'src/frontend/main.js',
      output: {
        // Put built assets in js/ to match current structure
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'styles.css'; // Keep the same CSS filename
          }
          return '[name].[ext]';
        }
      }
    },
    // Ensure compatibility with ES modules
    target: 'es2020',
    minify: 'esbuild'
  },
  
  // Development server configuration
  server: {
    port: 3000,
    // Proxy API requests to the Wrangler dev server
    proxy: {
      '/api': 'http://localhost:8787',
      '/ca': 'http://localhost:8787',
      '/crl': 'http://localhost:8787',
      '/dcrl': 'http://localhost:8787'
    }
  },

  // Root directory for frontend source
  root: 'src/frontend',
  
  // Public directory for static assets
  publicDir: '../../public/static',
  
  // Environment variables
  define: {
    __VITE_ENV__: JSON.stringify(process.env.NODE_ENV || 'development')
  }
});