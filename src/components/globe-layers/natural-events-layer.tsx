import { useMemo } from "react";
import { usePolling } from "@/hooks/use-live-data";
import { fetchNaturalEvents } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { FacingHtml } from "./facing-html";

const CATEGORY_EMOJI: Record<string, string> = {
  wildfires: "🔥",
  severeStorms: "🌀",
  volcanoes: "🌋",
  seaLakeIce: "🧊",
  earthquakes: "⚠️",
  floods: "🌊",
  drought: "🏜️",
  dustHaze: "🌫️",
  snow: "❄️",
  landslides: "⛰️",
  manmade: "🏭",
  waterColor: "💧",
  tempExtremes: "🌡️",
};

/** Offene Naturereignisse (NASA EONET): Braende, Stuerme, Vulkane u. a. */
export function NaturalEventsLayer() {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchNaturalEvents, 300_000, true);

  const events = useMemo(() => (data ?? []).slice(0, 60), [data]);

  return (
    <group>
      {events.map((ev) => {
        const pos = latLngToVector3(ev.lat, ev.lng, radius * 1.02);
        const emoji = CATEGORY_EMOJI[ev.category] ?? "📍";
        return (
          <FacingHtml key={ev.id} position={pos}>
            <div
              title={ev.title}
              className="text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            >
              {emoji}
            </div>
          </FacingHtml>
        );
      })}
    </group>
  );
}
