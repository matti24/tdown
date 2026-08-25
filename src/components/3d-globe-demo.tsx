import { useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";
import { GlobeControls, type LayerState } from "@/components/globe-controls";
import { EarthquakeLayer } from "@/components/globe-layers/earthquake-layer";
import { IssLayer } from "@/components/globe-layers/iss-layer";
import { NaturalEventsLayer } from "@/components/globe-layers/natural-events-layer";
import { WeatherLayer } from "@/components/globe-layers/weather-layer";
import { AuroraLayer } from "@/components/globe-layers/aurora-layer";
import { SunLayer } from "@/components/globe-layers/sun-layer";
import { cities } from "@/lib/cities";

export default function Globe3DDemo() {
  const [layers, setLayers] = useState<LayerState>({
    earthquakes: true,
    iss: true,
    aurora: true,
    sun: false,
    events: false,
    weather: false,
  });

  const toggle = (key: keyof LayerState) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <div className="relative h-full w-full">
      <GlobeControls layers={layers} onToggle={toggle} />
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
        {layers.aurora && <AuroraLayer />}
        {layers.sun && <SunLayer />}
        {layers.events && <NaturalEventsLayer />}
        {layers.weather && <WeatherLayer points={cities} />}
      </Globe3D>
    </div>
  );
}
