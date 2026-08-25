import { cn } from "@/lib/utils";

export interface LayerState {
  flights: boolean;
  iss: boolean;
  satellites: boolean;
}

interface LayerMeta {
  key: keyof LayerState;
  label: string;
  icon: string;
  desc: string;
}

const LAYER_META: LayerMeta[] = [
  { key: "flights", label: "Flights", icon: "✈️", desc: "Live ADS-B" },
  { key: "iss", label: "ISS", icon: "🛰️", desc: "Live position" },
  {
    key: "satellites",
    label: "Satellites",
    icon: "📡",
    desc: "Starlink · live SGP4",
  },
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

      {/* Data source (bottom-right, hidden on small screens) */}
      <div className="absolute bottom-3 right-3 hidden max-w-[45%] text-right text-[10px] leading-tight text-neutral-500 sm:bottom-4 sm:right-4 sm:block">
        Data: OpenSky · wheretheiss.at · Celestrak
      </div>
    </div>
  );
}
