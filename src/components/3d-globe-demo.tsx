import { useCallback, useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";
import { GlobeControls, type LayerState } from "@/components/globe-controls";
import { EarthquakeLayer } from "@/components/globe-layers/earthquake-layer";
import { IssLayer } from "@/components/globe-layers/iss-layer";
import {
  SatellitesLayer,
  type SatelliteStats,
} from "@/components/globe-layers/satellites-layer";
import { NaturalEventsLayer } from "@/components/globe-layers/natural-events-layer";
import { WeatherLayer } from "@/components/globe-layers/weather-layer";
import { AuroraLayer } from "@/components/globe-layers/aurora-layer";
import { SunLayer } from "@/components/globe-layers/sun-layer";
import { cities } from "@/lib/cities";

export default function Globe3DDemo() {
  const [layers, setLayers] = useState<LayerState>({
    earthquakes: true,
    iss: true,
    satellites: true,
    aurora: true,
    sun: false,
    events: false,
    weather: false,
  });
  const [satStats, setSatStats] = useState<SatelliteStats | null>(null);

  const toggle = (key: keyof LayerState) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const handleSatStats = useCallback(
    (stats: SatelliteStats | null) => setSatStats(stats),
    [],
  );

  return (
    <div className="relative h-full w-full">
      <GlobeControls layers={layers} onToggle={toggle} />

      {layers.satellites && satStats && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/70 px-3.5 py-2 text-center shadow-2xl backdrop-blur-md sm:bottom-4">
          <div className="flex items-baseline gap-2">
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
        }}
      >
        {layers.earthquakes && <EarthquakeLayer />}
        {layers.iss && <IssLayer />}
        {layers.satellites && <SatellitesLayer onStats={handleSatStats} />}
        {layers.aurora && <AuroraLayer />}
        {layers.sun && <SunLayer />}
        {layers.events && <NaturalEventsLayer />}
        {layers.weather && <WeatherLayer points={cities} />}
      </Globe3D>
    </div>
  );
}
