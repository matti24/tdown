import { useCallback } from "react";
import { usePolling } from "@/hooks/use-live-data";
import { fetchWeather } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { FacingHtml } from "./facing-html";

/** WMO-Wettercode -> Emoji. */
function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

interface WeatherLayerProps {
  points: { lat: number; lng: number; label?: string }[];
}

/** Aktuelles Wetter an vorgegebenen Standorten (Open-Meteo). */
export function WeatherLayer({ points }: WeatherLayerProps) {
  const radius = useGlobeRadius();
  const fetcher = useCallback(
    (signal: AbortSignal) => fetchWeather(points, signal),
    [points],
  );
  const { data } = usePolling(fetcher, 600_000, true);

  return (
    <group>
      {(data ?? []).map((w) => {
        const pos = latLngToVector3(w.lat, w.lng, radius * 1.04);
        return (
          <FacingHtml key={`${w.lat}-${w.lng}`} position={pos}>
            <div className="flex w-max items-center gap-1 rounded-full border border-white/10 bg-neutral-900/85 px-2 py-0.5 text-xs font-medium text-white shadow-md backdrop-blur">
              <span>{weatherEmoji(w.weatherCode)}</span>
              <span>{Math.round(w.temperature)}°</span>
            </div>
          </FacingHtml>
        );
      })}
    </group>
  );
}
