import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteName = env.SITE_NAME || process.env.SITE_NAME || "PKI AIA/CDP";
  const nodeEnv = env.NODE_ENV || process.env.NODE_ENV || mode || "development";

  return {
    // Build configuration
    build: {
      outDir: path.resolve(__dirname, "public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Put built assets in js/ to match current structure
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "index") {
              return "js/main.js";
            }
            return "js/[name].js";
          },
          chunkFileNames: "js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "styles.css"; // Keep the same CSS filename
            }
            return "[name].[ext]";
          },
        },
      },
      // Ensure compatibility with ES modules
      target: "es2020",
      minify: "esbuild",
    },

    // Development server configuration
    server: {
      port: 3000,
      // Proxy API requests to the Wrangler dev server
      proxy: {
        "/api": "http://localhost:8787",
        "/ca": "http://localhost:8787",
        "/crl": "http://localhost:8787",
        "/dcrl": "http://localhost:8787",
      },
    },

    // Root directory for frontend source
    root: "src/web",

    // Public directory for static assets
    publicDir: path.resolve(__dirname, "src/web/public"),

    plugins: [
      vue(),
      {
        name: "inject-site-name",
        transformIndexHtml(html) {
          return html.replace(/%SITE_NAME%/g, siteName);
        },
      },
    ],

    // Resolve
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/web"),
        "@contracts": path.resolve(__dirname, "src/contracts"),
      },
    },

    // Environment variables
    define: {
      __VITE_ENV__: JSON.stringify(nodeEnv),
      __SITE_NAME__: JSON.stringify(siteName),
    },
  };
});
