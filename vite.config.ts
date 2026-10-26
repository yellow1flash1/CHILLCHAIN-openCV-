// Plain Vite config for TanStack Start (React 19), Tailwind CSS 4 and a Cloudflare build via Nitro.
import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

// Offline mode: writes /sw.js (from scripts/sw.js) with this build's file list, so the phone saves the
// whole app at install. Language dictionaries are left out (only the chosen one is saved, when it
// loads), and so are source maps. A new build gives a new sw.js, which is how phones pick up updates.
function serviceWorker(): Plugin {
  return {
    name: "chillchain-sw",
    apply: "build",
    applyToEnvironment: (env) => env.name === "client",
    generateBundle(_, bundle) {
      const files = Object.values(bundle)
        .filter((f) => !f.fileName.endsWith(".map"))
        .filter(
          (f) => !(f.type === "chunk" && /[\\/]i18n[\\/]\w+\.json$/.test(f.facadeModuleId ?? "")),
        )
        .map((f) => `/${f.fileName}`);
      const precache = [
        ...files,
        "/manifest.webmanifest",
        "/icon.svg",
        "/icon-192.png",
        "/icon-512.png",
      ];
      const source = readFileSync(path.resolve(__dirname, "scripts/sw.js"), "utf8")
        .replace('"__VERSION__"', JSON.stringify(Date.now().toString(36)))
        .replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    serviceWorker(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Server-only code must never be bundled into the browser.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Use src/server.ts (our SSR error wrapper) as the server entry; Nitro builds from it.
      server: { entry: "server" },
    }),
    // Production build targets Cloudflare Workers; set NITRO_PRESET (e.g. "node-server") to build for another host.
    ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
    viteReact(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: { host: "::", port: 8080 },
}));
