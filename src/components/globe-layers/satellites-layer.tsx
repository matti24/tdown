import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { gstime } from "satellite.js";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import {
  CONSTELLATIONS,
  fetchSatellites,
  propagateSatellite,
} from "@/lib/satellites";

const EARTH_RADIUS_KM = 6371;
/** Seconds between full re-propagations of every satellite. */
const UPDATE_INTERVAL = 1.2;
/** Refresh TLE element sets every 6 hours. */
const TLE_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Caps keep propagation smooth; mobile gets a lighter swarm. */
const MAX_DESKTOP = 8000;
const MAX_MOBILE = 2500;

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

  const maxSats = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches
        ? MAX_MOBILE
        : MAX_DESKTOP,
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

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.02}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}
