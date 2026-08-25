import { cn } from "@/lib/utils";
import { magnitudeColor } from "./globe-layers/earthquake-layer";

export interface LayerState {
  earthquakes: boolean;
  iss: boolean;
  aurora: boolean;
  sun: boolean;
  events: boolean;
  weather: boolean;
}

interface LayerMeta {
  key: keyof LayerState;
  label: string;
  icon: string;
  desc: string;
}

const LAYER_META: LayerMeta[] = [
  {
    key: "earthquakes",
    label: "Earthquakes",
    icon: "🌍",
    desc: "USGS · last 24 h",
  },
  { key: "iss", label: "ISS", icon: "🛰️", desc: "Live position" },
  { key: "aurora", label: "Aurora", icon: "🌌", desc: "NOAA forecast" },
  { key: "sun", label: "Sun", icon: "☀️", desc: "Day / night" },
  { key: "events", label: "Natural events", icon: "🔥", desc: "NASA EONET" },
  { key: "weather", label: "Weather", icon: "🌡️", desc: "Open-Meteo" },
];

interface GlobeControlsProps {
  layers: LayerState;
  onToggle: (key: keyof LayerState) => void;
}

export function GlobeControls({ layers, onToggle }: GlobeControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Layer toggles (top-left) */}
      <div className="pointer-events-auto absolute left-3 top-3 flex max-h-[calc(100vh-1.5rem)] w-52 flex-col gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/70 p-2.5 shadow-2xl backdrop-blur-md sm:left-4 sm:top-4 sm:w-56 sm:gap-1.5 sm:p-3">
        <div className="mb-1 flex items-center gap-2 px-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-sm font-semibold text-white">Live Layers</h2>
        </div>

        {LAYER_META.map((m) => {
          const active = layers[m.key];
          return (
            <button
              key={m.key}
              onClick={() => onToggle(m.key)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-sky-400/40 bg-sky-500/15 text-white"
                  : "border-transparent bg-white/5 text-neutral-400 hover:bg-white/10",
              )}
            >
              <span className="text-lg leading-none">{m.icon}</span>
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium leading-tight">
                  {m.label}
                </span>
                <span className="text-[11px] leading-tight text-neutral-400">
                  {m.desc}
                </span>
              </span>
              <span
                className={cn(
                  "h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors",
                  active ? "bg-sky-400" : "bg-neutral-600",
                )}
              >
                <span
                  className={cn(
                    "block h-3 w-3 rounded-full bg-white transition-transform",
                    active && "translate-x-3",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Earthquake legend (bottom-left) */}
      {layers.earthquakes && (
        <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-neutral-900/70 px-3 py-2 text-[11px] text-neutral-300 shadow-xl backdrop-blur-md sm:bottom-4 sm:left-4 sm:text-xs">
          <span className="font-medium text-white">Magnitude</span>
          {[
            { label: "<3", mag: 2 },
            { label: "3–4.5", mag: 3.5 },
            { label: "4.5–6", mag: 5 },
            { label: "6+", mag: 6.5 },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: magnitudeColor(s.mag) }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Data sources (bottom-right, hidden on small screens) */}
      <div className="absolute bottom-3 right-3 hidden max-w-[45%] text-right text-[10px] leading-tight text-neutral-500 sm:bottom-4 sm:right-4 sm:block">
        Data: USGS · wheretheiss.at · NOAA · NASA EONET · Open-Meteo
      </div>
    </div>
  );
}
