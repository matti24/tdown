import { useEffect, useMemo, useRef, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { airplaneTexture } from "@/lib/point-textures";
import { fetchFlights, type Flight } from "@/lib/flights";

const REFRESH_MS = 30_000;
const CRUISE_KM = 11;
const PLANE_SIZE = 0.042;
const MAX_FLIGHTS = 20000;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface FlightsLayerProps {
  onCount?: (count: number) => void;
}

interface HoveredFlight {
  flight: Flight;
  position: THREE.Vector3;
}

/** Keep aircraft just above the surface, lifting a touch with altitude. */
function altitudeFactor(altKm: number): number {
  return 1.01 + Math.min(altKm / CRUISE_KM, 1) * 0.02;
}

/**
 * Live aircraft rendered as heading-oriented airplane icons lying flat on the
 * globe (InstancedMesh, one quad per flight rotated to its true track).
 */
export function FlightsLayer({ onCount }: FlightsLayerProps) {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchFlights, REFRESH_MS, true);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<HoveredFlight | null>(null);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    [],
  );

  const flights = useMemo(() => data ?? [], [data]);

  // Rebuild instance transforms + colours whenever the snapshot changes.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const pos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    const nose = new THREE.Vector3();
    const xAxis = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const count = Math.min(flights.length, MAX_FLIGHTS);

    for (let i = 0; i < count; i++) {
      const f = flights[i];
      const altKm = f.altFt * 0.0003048;
      pos.copy(latLngToVector3(f.lat, f.lng, radius * altitudeFactor(altKm)));
      normal.copy(pos).normalize();
      // North-pointing tangent, then east; nose = track rotated from north.
      north.copy(WORLD_UP).addScaledVector(normal, -WORLD_UP.dot(normal));
      if (north.lengthSq() < 1e-8) north.set(0, 0, 1);
      north.normalize();
      east.crossVectors(north, normal).normalize();
      const theta = (f.trackDeg * Math.PI) / 180;
      nose
        .copy(north)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(east, Math.sin(theta));
      xAxis.crossVectors(nose, normal).normalize();
      matrix.makeBasis(xAxis, nose, normal);
      matrix.setPosition(pos);
      mesh.setMatrixAt(i, matrix);

      const t = Math.min(altKm / CRUISE_KM, 1);
      color.setRGB(1, 0.55 + 0.4 * t, 0.15 + 0.6 * t);
      mesh.setColorAt(i, color);
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    onCountRef.current?.(flights.length);
  }, [flights, radius]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  if (flights.length === 0) return null;

  const showTooltip = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const id = event.instanceId;
    if (id == null) return;
    event.stopPropagation();
    const flight = flights[id];
    if (!flight) return;
    const altKm = flight.altFt * 0.0003048;
    setHovered({
      flight,
      position: latLngToVector3(
        flight.lat,
        flight.lng,
        radius * altitudeFactor(altKm),
      ),
    });
  };

  const hideTooltip = () => setHovered(null);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, MAX_FLIGHTS]}
        frustumCulled={false}
        onPointerMove={isTouch ? undefined : showTooltip}
        onPointerOut={isTouch ? undefined : hideTooltip}
        onClick={showTooltip}
        onPointerMissed={hideTooltip}
      >
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshBasicMaterial
          map={airplaneTexture()}
          alphaTest={0.4}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>

      {hovered && (
        <Html
          position={hovered.position}
          center
          style={{ pointerEvents: "none" }}
        >
          <FlightTooltip flight={hovered.flight} />
        </Html>
      )}
    </group>
  );
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function FlightTooltip({ flight }: { flight: Flight }) {
  const speedKmh = Math.round(flight.speedKt * 1.852);
  const vr = flight.verticalRateMs;
  const trend = vr > 0.5 ? "↑ climbing" : vr < -0.5 ? "↓ descending" : "→ level";
  const compass = COMPASS[Math.round((flight.trackDeg % 360) / 45) % 8];
  return (
    <div className="w-max max-w-[70vw] -translate-y-9 rounded-lg border border-amber-400/40 bg-neutral-900/90 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur">
      <div className="flex items-center gap-1.5 font-semibold text-white">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        ✈️ {flight.callsign}
      </div>
      <div className="mt-0.5 text-neutral-300">
        {speedKmh.toLocaleString("en-US")} km/h ·{" "}
        {flight.altFt > 0
          ? `${flight.altFt.toLocaleString("en-US")} ft`
          : "on ground"}
      </div>
      <div className="text-neutral-400">
        {Math.round(flight.trackDeg)}° {compass} · {trend}
      </div>
      {flight.country && (
        <div className="text-neutral-500">{flight.country}</div>
      )}
    </div>
  );
}
