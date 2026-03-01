import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteName = env.SITE_NAME || process.env.SITE_NAME || "PKI AIA/CDP";
  const nodeEnv = env.NODE_ENV || process.env.NODE_ENV || mode || "development";

  return {
    build: {
      outDir: path.resolve(__dirname, "public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ["vue", "vue-router"],
            state: ["pinia"],
          },
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "index") {
              return "js/main.js";
            }
            return "js/[name].js";
          },
          chunkFileNames: "js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "styles.css";
            }
            return "[name].[ext]";
          },
        },
      },
      target: "es2022",
      minify: "esbuild",
    },
    server: {
      port: 3000,
      proxy: {
        "/api": "http://localhost:8787",
        "/ca": "http://localhost:8787",
        "/crl": "http://localhost:8787",
        "/dcrl": "http://localhost:8787",
      },
    },
    root: "src/web",
    publicDir: path.resolve(__dirname, "src/web/public"),
    plugins: [
      vue(),
      {
        name: "inject-site-name",
        transformIndexHtml(html) {
          return html.replace(/%SITE_NAME%/g, siteName);
        },
      },
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/web"),
        "@contracts": path.resolve(__dirname, "src/contracts"),
      },
    },
    define: {
      __VITE_ENV__: JSON.stringify(nodeEnv),
      __SITE_NAME__: JSON.stringify(siteName),
    },
  };
});
