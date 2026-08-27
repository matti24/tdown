import { useState } from "react";
import { cn } from "@/lib/utils";

export interface LayerState {
  flights: boolean;
  ships: boolean;
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
  { key: "ships", label: "Ships", icon: "🚢", desc: "Live AIS" },
  { key: "iss", label: "ISS", icon: "🛰️", desc: "Live position" },
  {
    key: "satellites",
    label: "Satellites",
    icon: "📡",
    desc: "Starlink · live SGP4",
  },
];

// Per-layer accent so an enabled layer reads at a glance and echoes its detail
// panel (amber flights, cyan ships, sky ISS, violet satellites).
const ACCENTS: Record<
  keyof LayerState,
  { row: string; tile: string; dot: string }
> = {
  flights: {
    row: "border-amber-400/30 bg-amber-400/10",
    tile: "bg-amber-400/20 ring-amber-400/40",
    dot: "bg-amber-400",
  },
  ships: {
    row: "border-cyan-400/30 bg-cyan-400/10",
    tile: "bg-cyan-400/20 ring-cyan-400/40",
    dot: "bg-cyan-400",
  },
  iss: {
    row: "border-sky-400/30 bg-sky-400/10",
    tile: "bg-sky-400/20 ring-sky-400/40",
    dot: "bg-sky-400",
  },
  satellites: {
    row: "border-violet-400/30 bg-violet-400/10",
    tile: "bg-violet-400/20 ring-violet-400/40",
    dot: "bg-violet-400",
  },
};

interface GlobeControlsProps {
  layers: LayerState;
  onToggle: (key: keyof LayerState) => void;
  hidden?: Partial<Record<keyof LayerState, boolean>>;
}

export function GlobeControls({ layers, onToggle, hidden }: GlobeControlsProps) {
  // Start collapsed on phones so the panel doesn't eat the small viewport.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );
  const visible = LAYER_META.filter((m) => !hidden?.[m.key]);
  const activeCount = visible.filter((m) => layers[m.key]).length;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={cn(
          "pointer-events-auto absolute left-3 top-3 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/70 shadow-2xl ring-1 ring-inset ring-white/5 backdrop-blur-md sm:left-4 sm:top-4",
          open ? "w-52 p-2 sm:w-56 sm:p-2.5" : "w-auto p-1.5",
        )}
      >
        <div className="flex items-center gap-2 pl-1 pr-0.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Live Layers
          </h2>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-neutral-500">
            {activeCount}/{visible.length}
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse layers" : "Expand layers"}
            aria-expanded={open}
            className="flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg
              viewBox="0 0 10 10"
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                open ? "" : "-rotate-90",
              )}
            >
              <path
                d="M2 3.5 5 6.5 8 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {open && (
          <div className="mt-1.5 flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto">
            {visible.map((m) => {
              const active = layers[m.key];
              const a = ACCENTS[m.key];
              return (
                <button
                  key={m.key}
                  onClick={() => onToggle(m.key)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-2 py-1.5 text-left transition-colors",
                    active
                      ? cn(a.row, "text-white")
                      : "border-white/5 bg-white/[0.02] text-neutral-400 hover:border-white/10 hover:bg-white/5",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ring-1 transition-all",
                      active ? a.tile : "bg-white/5 ring-white/10 grayscale",
                    )}
                  >
                    {m.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold leading-tight">
                      {m.label}
                    </span>
                    <span className="truncate text-[10px] leading-tight text-neutral-500">
                      {m.desc}
                    </span>
                  </span>
                  <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    {active ? (
                      <>
                        <span
                          className={cn(
                            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                            a.dot,
                          )}
                        />
                        <span
                          className={cn(
                            "relative inline-flex h-2.5 w-2.5 rounded-full",
                            a.dot,
                          )}
                        />
                      </>
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full border border-neutral-600" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Data source (bottom-right, hidden on small screens) */}
      <div className="absolute bottom-3 right-3 hidden max-w-[45%] text-right text-[10px] leading-tight text-neutral-500 sm:bottom-4 sm:right-4 sm:block">
        Data: OpenSky · AISstream · wheretheiss.at · Celestrak
      </div>
    </div>
  );
}
