import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GH_PAGES is set only by the GitHub Pages deploy workflow, since that's the
// one build target that isn't served from the domain root (Netlify and the
// Capacitor Android app both need base "/").
let buildSha = "dev";
try {
  buildSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
  // no git available (e.g. a source tarball) — keep the "dev" fallback
}

export default defineConfig({
  base: process.env.GH_PAGES ? "/KidApp/" : "/",
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
      },
    }),
  ],
});
