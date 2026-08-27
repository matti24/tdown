import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
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
  onSelect?: (sat: SatSelection | null) => void;
  selectedSatId?: string | null;
}

export interface SatSelection {
  id: string;
  name: string;
  constellation: string;
  purpose: string;
  color: string;
  wikiTopic: string;
  altKm: number;
  speedKmh: number;
  periodMin: number;
  lat: number;
  lng: number;
}

// Real-hardware satellite photos (each verified to exist on Wikipedia), pooled
// per constellation and picked by NORAD id for variety. Starlink deliberately
// avoids its own article, whose lead image is just the round company logo.
const SAT_WIKI_POOL: Record<string, string[]> = {
  starlink: ["Communications satellite", "Satellite", "Small satellite", "CubeSat"],
  oneweb: ["OneWeb", "Communications satellite", "Small satellite"],
  gps: ["Global Positioning System", "GPS Block IIF"],
};
const SAT_WIKI_FALLBACK = ["Satellite", "Communications satellite"];

function satWikiTopic(constellation: string, satnum: number | string): string {
  const pool = SAT_WIKI_POOL[constellation] ?? SAT_WIKI_FALLBACK;
  const n = Number(satnum) || 0;
  return pool[n % pool.length];
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
export function SatellitesLayer({
  onStats,
  onSelect,
  selectedSatId,
}: SatellitesLayerProps) {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchSatellites, TLE_REFRESH_MS, true);
  const accumulator = useRef(UPDATE_INTERVAL);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const raycaster = useThree((s) => s.raycaster);
  const ringRef = useRef<THREE.Mesh>(null);
  const selectedIndexRef = useRef(-1);
  const [hovered, setHovered] = useState<HoveredSatellite | null>(null);
  const [track, setTrack] = useState<{
    points: THREE.Vector3[];
    color: string;
  } | null>(null);

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

  // Recompute the selected satellite's last-90-minutes ground track.
  useEffect(() => {
    if (!selectedSatId) {
      selectedIndexRef.current = -1;
      setTrack(null);
      return;
    }
    const idx = working.findIndex(
      (r) => String(r.satrec.satnum) === selectedSatId,
    );
    selectedIndexRef.current = idx;
    if (idx < 0) {
      setTrack(null);
      return;
    }
    const rec = working[idx];
    const color = META_BY_KEY.get(rec.constellation)?.color ?? "#ffffff";
    const compute = () => {
      const pts: THREE.Vector3[] = [];
      const now = Date.now();
      for (let s = 90 * 60; s >= 0; s -= 90) {
        const d = new Date(now - s * 1000);
        const st = propagateSatellite(rec.satrec, d, gstime(d));
        if (st) {
          pts.push(
            latLngToVector3(st.lat, st.lng, radius * altitudeFactor(st.altKm)),
          );
        }
      }
      setTrack(pts.length >= 2 ? { points: pts, color } : null);
    };
    compute();
    const id = window.setInterval(compute, 5000);
    return () => clearInterval(id);
  }, [selectedSatId, working, radius]);

  useFrame((state, delta) => {
    if (working.length === 0) return;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attr.array as Float32Array;

    // Highlight ring follows the selected satellite every frame.
    const ring = ringRef.current;
    const idx = selectedIndexRef.current;
    if (ring) {
      if (idx >= 0 && idx * 3 + 2 < array.length) {
        ring.visible = true;
        ring.position.set(
          array[idx * 3],
          array[idx * 3 + 1],
          array[idx * 3 + 2],
        );
        ring.lookAt(ring.position.clone().multiplyScalar(2));
        ring.scale.setScalar(1 + 0.3 * Math.sin(state.clock.elapsedTime * 4));
      } else {
        ring.visible = false;
      }
    }

    accumulator.current += delta;
    if (accumulator.current < UPDATE_INTERVAL) return;
    accumulator.current = 0;

    const now = new Date();
    const gmst = gstime(now);
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

  const selectSat = (event: ThreeEvent<MouseEvent>) => {
    const index = event.index;
    if (index == null) return;
    event.stopPropagation();
    const rec = working[index];
    if (!rec) return;
    const now = new Date();
    const st = propagateSatellite(rec.satrec, now, gstime(now));
    if (!st) return;
    const meta = META_BY_KEY.get(rec.constellation);
    onSelectRef.current?.({
      id: String(rec.satrec.satnum),
      name: rec.name,
      constellation: rec.constellation,
      purpose: meta?.purpose ?? "",
      color: meta?.color ?? "#ffffff",
      wikiTopic: satWikiTopic(rec.constellation, rec.satrec.satnum),
      altKm: st.altKm,
      speedKmh: st.speedKmh,
      periodMin: (2 * Math.PI) / rec.satrec.no,
      lat: st.lat,
      lng: st.lng,
    });
  };

  return (
    <group>
      <points
        geometry={geometry}
        frustumCulled={false}
        onPointerMove={isTouch ? undefined : showTooltip}
        onPointerOut={isTouch ? undefined : hideTooltip}
        onClick={selectSat}
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

      {track && (
        <Line
          points={track.points}
          color={track.color}
          lineWidth={2.6}
          transparent
          opacity={0.85}
        />
      )}
      <mesh ref={ringRef} visible={false}>
        <ringGeometry args={[0.02, 0.03, 28]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

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
