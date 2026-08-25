import { useCallback, useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";
import { GlobeControls, type LayerState } from "@/components/globe-controls";
import { IssLayer } from "@/components/globe-layers/iss-layer";
import { FlightsLayer } from "@/components/globe-layers/flights-layer";
import {
  SatellitesLayer,
  type SatelliteStats,
} from "@/components/globe-layers/satellites-layer";

export default function Globe3DDemo() {
  const [layers, setLayers] = useState<LayerState>({
    flights: true,
    iss: true,
    satellites: true,
  });
  const [satStats, setSatStats] = useState<SatelliteStats | null>(null);
  const [flightCount, setFlightCount] = useState(0);

  const toggle = (key: keyof LayerState) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const handleSatStats = useCallback(
    (stats: SatelliteStats | null) => setSatStats(stats),
    [],
  );

  const handleFlightCount = useCallback(
    (count: number) => setFlightCount(count),
    [],
  );

  return (
    <div className="relative h-full w-full">
      <GlobeControls layers={layers} onToggle={toggle} />

      {layers.flights && flightCount > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-1.5 shadow-2xl backdrop-blur-md sm:right-4 sm:top-4">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="text-sm font-semibold text-white">
            ✈️ {flightCount.toLocaleString("en-US")}
          </span>
          <span className="hidden text-[11px] text-neutral-400 sm:inline">
            flights live
          </span>
        </div>
      )}

      {layers.satellites && satStats && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-1.5 text-center shadow-2xl backdrop-blur-md sm:bottom-4 sm:px-3.5 sm:py-2">
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-sm font-semibold text-white">
              📡 {satStats.total.toLocaleString("en-US")} satellites live
            </span>
            <span className="text-xs text-sky-300/80">
              ~{Math.round(satStats.avgSpeedKmh).toLocaleString("en-US")} km/h
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-300">
            {satStats.counts.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
                <span className="text-neutral-500">
                  {c.count.toLocaleString("en-US")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Globe3D
        className="h-full"
        config={{
          atmosphereColor: "#4da6ff",
          atmosphereIntensity: 20,
          bumpScale: 5,
          autoRotateSpeed: 0,
          enableZoom: true,
          minDistance: 2.2,
          maxDistance: 14,
        }}
      >
        {layers.iss && <IssLayer />}
        {layers.flights && <FlightsLayer onCount={handleFlightCount} />}
        {layers.satellites && <SatellitesLayer onStats={handleSatStats} />}
      </Globe3D>
    </div>
  );
}
