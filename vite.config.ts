import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Kopiert die CNAME-Datei (GitHub-Pages-Domain) in den Build-Output
function copyCname() {
  return {
    name: "copy-cname",
    closeBundle() {
      const src = resolve(import.meta.dirname, "CNAME");
      if (existsSync(src)) {
        copyFileSync(src, resolve(import.meta.dirname, "dist/CNAME"));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyCname()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      // Keep satellite.js's optional WASM/pthreads runtimes (loaded lazily and
      // never used here) out of the static build — they ship a worker with
      // top-level await that Vite can't bundle. See satellite-wasm-stub.ts.
      "#wasm-single-thread": resolve(
        import.meta.dirname,
        "./src/lib/satellite-wasm-stub.ts",
      ),
      "#wasm-multi-thread": resolve(
        import.meta.dirname,
        "./src/lib/satellite-wasm-stub.ts",
      ),
    },
  },
});
