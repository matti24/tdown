import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { gstime } from "satellite.js";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import {
  CONSTELLATIONS,
  fetchSatellites,
  propagateSatellite,
} from "@/lib/satellites";
import { circleTexture } from "@/lib/point-textures";

const EARTH_RADIUS_KM = 6371;
/** Seconds between full re-propagations of every satellite. */
const UPDATE_INTERVAL = 1.2;
/** Refresh TLE element sets every 6 hours. */
const TLE_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Caps keep propagation smooth; mobile gets a lighter swarm. */
const MAX_DESKTOP = 8000;
const MAX_MOBILE = 2500;
/** Ray proximity (world units) for picking a satellite on hover. */
const HOVER_THRESHOLD = 0.035;

/** Constellation metadata keyed for quick hover lookups. */
const META_BY_KEY = new Map(CONSTELLATIONS.map((c) => [c.key, c]));

export interface ConstellationCount {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface SatelliteStats {
  total: number;
  avgSpeedKmh: number;
  counts: ConstellationCount[];
}

interface SatellitesLayerProps {
  onStats?: (stats: SatelliteStats | null) => void;
}

interface HoveredSatellite {
  name: string;
  purpose: string;
  color: string;
  speedKmh: number;
  altKm: number;
  position: THREE.Vector3;
}

/** Compress real altitude into a radius factor so LEO/MEO shells stay visible. */
function altitudeFactor(altKm: number): number {
  return 1.08 + Math.min(altKm / EARTH_RADIUS_KM, 3.5) * 0.14;
}

/**
 * Live cloud of Starlink / OneWeb / GPS satellites. Element sets come from
 * Celestrak and are propagated with SGP4 on every animation tick, so each
 * point shows a real, current position and the swarm drifts as it orbits.
 */
export function SatellitesLayer({ onStats }: SatellitesLayerProps) {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchSatellites, TLE_REFRESH_MS, true);
  const accumulator = useRef(UPDATE_INTERVAL);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const raycaster = useThree((s) => s.raycaster);
  const [hovered, setHovered] = useState<HoveredSatellite | null>(null);

  const maxSats = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches
        ? MAX_MOBILE
        : MAX_DESKTOP,
    [],
  );

  // Touch devices can't hover, so we drive the tooltip by tap instead.
  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    [],
  );

  // Slice to the render budget (keep the small high-orbit groups whole, fill
  // the remainder with Starlink) and prebuild a colour-per-constellation cloud.
  const { working, geometry, counts } = useMemo(() => {
    const all = data ?? [];
    const primary = all.filter((r) => r.constellation !== "starlink");
    const starlink = all.filter((r) => r.constellation === "starlink");
    const room = Math.max(0, maxSats - primary.length);
    const working = primary.concat(starlink.slice(0, room));

    const positions = new Float32Array(working.length * 3);
    const colors = new Float32Array(working.length * 3);
    const palette = new Map(
      CONSTELLATIONS.map((c) => [c.key, new THREE.Color(c.color)]),
    );
    working.forEach((r, i) => {
      const col = palette.get(r.constellation) ?? new THREE.Color("#ffffff");
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const counts: ConstellationCount[] = CONSTELLATIONS.map((c) => ({
      key: c.key,
      label: c.label,
      color: c.color,
      count: working.filter((r) => r.constellation === c.key).length,
    })).filter((c) => c.count > 0);

    return { working, geometry: geo, counts };
  }, [data, maxSats]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Re-propagate immediately whenever a fresh working set arrives.
  useEffect(() => {
    accumulator.current = UPDATE_INTERVAL;
    if (working.length === 0) onStatsRef.current?.(null);
  }, [working]);

  // The default Points pick radius (1 unit) is far too wide for our globe.
  useEffect(() => {
    const points = raycaster.params.Points ?? { threshold: 0 };
    raycaster.params.Points = points;
    const previous = points.threshold;
    points.threshold = HOVER_THRESHOLD;
    return () => {
      points.threshold = previous;
    };
  }, [raycaster]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  useFrame((_, delta) => {
    if (working.length === 0) return;
    accumulator.current += delta;
    if (accumulator.current < UPDATE_INTERVAL) return;
    accumulator.current = 0;

    const now = new Date();
    const gmst = gstime(now);
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attr.array as Float32Array;
    let speedSum = 0;
    let visible = 0;

    for (let i = 0; i < working.length; i++) {
      const s = propagateSatellite(working[i].satrec, now, gmst);
      const j = i * 3;
      if (!s) {
        // Collapse unresolved sats to the centre, hidden inside the globe.
        array[j] = array[j + 1] = array[j + 2] = 0;
        continue;
      }
      const v = latLngToVector3(s.lat, s.lng, radius * altitudeFactor(s.altKm));
      array[j] = v.x;
      array[j + 1] = v.y;
      array[j + 2] = v.z;
      speedSum += s.speedKmh;
      visible++;
    }
    attr.needsUpdate = true;

    onStatsRef.current?.({
      total: working.length,
      avgSpeedKmh: visible ? speedSum / visible : 0,
      counts,
    });
  });

  if (working.length === 0) return null;

  const showTooltip = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const index = event.index;
    if (index == null) return;
    event.stopPropagation();
    const record = working[index];
    if (!record) return;
    const now = new Date();
    const state = propagateSatellite(record.satrec, now, gstime(now));
    if (!state) return;
    const meta = META_BY_KEY.get(record.constellation);
    const array = geometry.getAttribute("position").array as Float32Array;
    setHovered({
      name: record.name,
      purpose: meta?.purpose ?? "",
      color: meta?.color ?? "#ffffff",
      speedKmh: state.speedKmh,
      altKm: state.altKm,
      position: new THREE.Vector3(
        array[index * 3],
        array[index * 3 + 1],
        array[index * 3 + 2],
      ),
    });
  };

  const hideTooltip = () => setHovered(null);

  return (
    <group>
      <points
        geometry={geometry}
        frustumCulled={false}
        onPointerMove={isTouch ? undefined : showTooltip}
        onPointerOut={isTouch ? undefined : hideTooltip}
        onClick={showTooltip}
        onPointerMissed={hideTooltip}
      >
        <pointsMaterial
          map={circleTexture()}
          size={0.022}
          vertexColors
          sizeAttenuation
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </points>

      {hovered && (
        <Html
          position={hovered.position}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            className="w-max max-w-[70vw] -translate-y-8 rounded-lg border bg-neutral-900/90 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur"
            style={{ borderColor: `${hovered.color}66` }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: hovered.color }}
              />
              {hovered.name}
            </div>
            <div className="mt-0.5 text-neutral-300">{hovered.purpose}</div>
            <div className="text-neutral-400">
              {Math.round(hovered.speedKmh).toLocaleString("en-US")} km/h ·{" "}
              {Math.round(hovered.altKm).toLocaleString("en-US")} km alt
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
