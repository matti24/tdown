import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";
import { GlobeControls, type LayerState } from "@/components/globe-controls";
import { IssLayer } from "@/components/globe-layers/iss-layer";
import { FlightsLayer } from "@/components/globe-layers/flights-layer";
import {
  SatellitesLayer,
  type SatelliteStats,
} from "@/components/globe-layers/satellites-layer";
import type { Flight } from "@/lib/flights";
import { fetchFlightInfo, type FlightInfo } from "@/lib/flight-info";

export default function Globe3DDemo() {
  const [layers, setLayers] = useState<LayerState>({
    flights: true,
    iss: true,
    satellites: true,
  });
  const [satStats, setSatStats] = useState<SatelliteStats | null>(null);
  const [flightCount, setFlightCount] = useState(0);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [flightInfo, setFlightInfo] = useState<FlightInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

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

  const handleSelectFlight = useCallback(
    (flight: Flight | null) => setSelectedFlight(flight),
    [],
  );

  // Fetch route + aircraft metadata when a different flight is selected.
  useEffect(() => {
    const callsign = selectedFlight?.callsign;
    if (!callsign || callsign === "\u2014") {
      setFlightInfo(null);
      setInfoLoading(false);
      return;
    }
    let cancelled = false;
    setInfoLoading(true);
    setFlightInfo(null);
    fetchFlightInfo(callsign, selectedFlight?.icao24)
      .then((info) => {
        if (!cancelled) {
          setFlightInfo(info);
          setInfoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFlight?.callsign, selectedFlight?.icao24]);

  const route = useMemo(() => {
    if (
      !selectedFlight ||
      !flightInfo ||
      flightInfo.originLat == null ||
      flightInfo.originLng == null
    ) {
      return null;
    }
    return {
      originLat: flightInfo.originLat,
      originLng: flightInfo.originLng,
      destLat: flightInfo.destLat,
      destLng: flightInfo.destLng,
      planeLat: selectedFlight.lat,
      planeLng: selectedFlight.lng,
    };
  }, [selectedFlight, flightInfo]);

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
        {layers.flights && (
          <FlightsLayer
            onCount={handleFlightCount}
            onSelect={handleSelectFlight}
            selectedCallsign={selectedFlight?.callsign ?? null}
            route={route}
          />
        )}
        {layers.satellites && <SatellitesLayer onStats={handleSatStats} />}
      </Globe3D>

      {layers.flights && selectedFlight && (
        <FlightDetailPanel
          flight={selectedFlight}
          info={flightInfo}
          loading={infoLoading}
          onClose={() => setSelectedFlight(null)}
        />
      )}
    </div>
  );
}

function FlightDetailPanel({
  flight,
  info,
  loading,
  onClose,
}: {
  flight: Flight;
  info: FlightInfo | null;
  loading: boolean;
  onClose: () => void;
}) {
  const speedKmh = Math.round(flight.speedKt * 1.852);
  const vr = flight.verticalRateMs;
  const trend =
    vr > 0.5
      ? `↑ steigend (${Math.round(vr * 196.85)} ft/min)`
      : vr < -0.5
        ? `↓ sinkend (${Math.round(Math.abs(vr) * 196.85)} ft/min)`
        : "→ Reiseflug";
  const fallback = loading ? "…" : "unbekannt";
  const airline = info?.airline || fallback;
  const model =
    [info?.manufacturer, info?.model].filter(Boolean).join(" ") || fallback;
  return (
    <div className="absolute bottom-3 left-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-amber-400/30 bg-neutral-900/80 p-3.5 shadow-2xl backdrop-blur-md sm:bottom-4 sm:left-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
            ✈️
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">
              {flight.callsign || "Unbekannt"}
            </div>
            <div className="text-[11px] leading-tight text-neutral-400">
              {airline}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-lg px-1.5 py-0.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Verfolgung beenden"
        >
          ✕
        </button>
      </div>

      {info?.photo && (
        <img
          src={info.photo}
          alt={model}
          loading="lazy"
          className="mt-3 h-24 w-full rounded-lg object-cover"
        />
      )}

      <div className="mt-3 flex items-center gap-2 text-xs">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-white">
            {info?.originIata || "—"}
          </span>
          <span className="truncate text-[10px] text-neutral-500">
            {info?.originCity || (loading ? "…" : "Herkunft")}
          </span>
        </div>
        <div className="flex flex-1 items-center gap-1 text-amber-300/70">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/50" />
          <span>✈</span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/50 to-transparent" />
        </div>
        <div className="flex min-w-0 flex-col items-end">
          <span className="text-sm font-semibold text-white">
            {info?.destIata || "—"}
          </span>
          <span className="truncate text-[10px] text-neutral-500">
            {info?.destCity || (loading ? "…" : "Ziel")}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2">
          <dt className="text-neutral-500">Modell</dt>
          <dd className="font-medium text-neutral-200">{model}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Geschwindigkeit</dt>
          <dd className="font-medium text-neutral-200">
            {speedKmh.toLocaleString("de-DE")} km/h
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Höhe</dt>
          <dd className="font-medium text-neutral-200">
            {flight.altFt > 0
              ? `${flight.altFt.toLocaleString("de-DE")} ft`
              : "am Boden"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-neutral-500">Vertikal</dt>
          <dd className="font-medium text-neutral-200">{trend}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300/80">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        Frei drehbar – dem Flugweg folgen
      </div>
    </div>
  );
}
