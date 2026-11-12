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
  desc: string;
}

const LAYER_META: LayerMeta[] = [
  { key: "flights", label: "Flights", desc: "Live ADS-B" },
  { key: "ships", label: "Ships", desc: "Live AIS" },
  { key: "iss", label: "ISS", desc: "Live position" },
  { key: "satellites", label: "Satellites", desc: "Starlink · live SGP4" },
];

// Swatch colours match each layer's markers on the globe.
const SWATCH: Record<keyof LayerState, string> = {
  flights: "bg-amber-400",
  ships: "bg-cyan-400",
  iss: "bg-sky-400",
  satellites: "bg-violet-400",
};

interface GlobeControlsProps {
  layers: LayerState;
  onToggle: (key: keyof LayerState) => void;
  hidden?: Partial<Record<keyof LayerState, boolean>>;
}

export function GlobeControls({
  layers,
  onToggle,
  hidden,
}: GlobeControlsProps) {
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
          "panel pointer-events-auto absolute inset-safe-l inset-safe-t max-w-[46vw] flex flex-col overflow-hidden sm:max-w-none",
          open ? "w-52 sm:w-56" : "w-auto",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5",
            open && "panel-head",
          )}
        >
          <h2 className="min-w-0 truncate text-xs font-semibold text-neutral-200">
            Live Layers
          </h2>
          <span className="ml-auto text-[10px] tabular-nums text-neutral-500">
            {activeCount}/{visible.length}
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse layers" : "Expand layers"}
            aria-expanded={open}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
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
          <div className="flex max-h-[calc(100dvh-7rem)] flex-col divide-y divide-neutral-800 overflow-y-auto">
            {visible.map((m) => {
              const active = layers[m.key];
              return (
                <button
                  key={m.key}
                  onClick={() => onToggle(m.key)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-white/[0.04]",
                    active ? "text-neutral-100" : "text-neutral-500",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-[1px]",
                      active ? SWATCH[m.key] : "bg-neutral-700",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium leading-tight">
                      {m.label}
                    </span>
                    <span className="truncate text-[10px] leading-tight text-neutral-500">
                      {m.desc}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border",
                      active
                        ? "border-neutral-200 bg-neutral-200 text-neutral-900"
                        : "border-neutral-600",
                    )}
                  >
                    {active && (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.2 5 8.5l4.5-5" />
                      </svg>
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
        Data: adsb.fi · AISstream · wheretheiss.at · Celestrak
      </div>
    </div>
  );
}
