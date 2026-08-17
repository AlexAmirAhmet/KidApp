import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GH_PAGES is set only by the GitHub Pages deploy workflow, since that's the
// one build target that isn't served from the domain root (Netlify and the
// Capacitor Android app both need base "/").
export default defineConfig({
  base: process.env.GH_PAGES ? "/KidApp/" : "/",
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
