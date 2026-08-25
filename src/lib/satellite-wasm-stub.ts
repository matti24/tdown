// Build-time stub for satellite.js's optional WASM SGP4 runtimes.
//
// satellite.js v7 lazily `import()`s "#wasm-single-thread" / "#wasm-multi-thread"
// inside runtime helpers we never call. Those bundles ship an Emscripten
// pthreads worker with top-level `await`, which Vite's worker bundler cannot
// emit for a static site. We only use the pure-JS SGP4 API (twoline2satrec,
// propagate, gstime, …), so both specifiers are aliased to this stub in
// vite.config.ts to keep the WASM/worker code out of the bundle entirely.
export default function satelliteWasmRuntimeDisabled(): never {
  throw new Error("satellite.js WASM runtime is disabled in this build");
}
