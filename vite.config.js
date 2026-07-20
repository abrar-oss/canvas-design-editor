import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The ported prototype modules are authored as plain .jsx with a few shared
// runtime singletons hung off `window` (the layout-engine instance and the
// text-measurement service — the README explicitly sanctions
// `window.measureText` as the canvas↔engine wiring). Everything else is wired
// through real ES imports/exports. esbuild's automatic JSX runtime transpiles
// the .jsx files at build time (replacing the prototype's in-browser Babel).
export default defineConfig({
  plugins: [react()],
  // Honour a PORT assigned by the launcher; fall back to Vite's default for
  // plain `npm run dev` runs.
  server: { port: Number(process.env.PORT) || 5173 },
});
