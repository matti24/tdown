import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { fetchEarthquakes, type Earthquake } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";

/** Farbe nach Magnitude: gruen -> gelb -> orange -> rot. */
export function magnitudeColor(mag: number): string {
  if (mag >= 6) return "#ef4444";
  if (mag >= 4.5) return "#f97316";
  if (mag >= 3) return "#eab308";
  return "#22c55e";
}

function EarthquakeMarker({
  quake,
  radius,
}: {
  quake: Earthquake;
  radius: number;
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const offset = useMemo(() => Math.random(), []);

  const position = useMemo(
    () => latLngToVector3(quake.lat, quake.lng, radius * 1.005),
    [quake.lat, quake.lng, radius],
  );

  const color = magnitudeColor(quake.magnitude);
  const size = 0.012 + Math.max(0, quake.magnitude) * 0.006;

  // Expandierender, ausblendender Halo
  useFrame((state) => {
    if (!pulseRef.current) return;
    const t = (state.clock.elapsedTime * 0.7 + offset) % 1;
    pulseRef.current.scale.setScalar(1 + t * 3);
    (pulseRef.current.material as THREE.MeshBasicMaterial).opacity =
      (1 - t) * 0.5;
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
  };

  return (
    <group position={position}>
      <mesh onPointerOver={handleOver} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      <mesh ref={pulseRef}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {hovered && (
        <Html center style={{ pointerEvents: "none" }}>
          <div className="w-max -translate-y-6 rounded-md border border-white/10 bg-neutral-900/90 px-2 py-1 text-xs text-white shadow-lg backdrop-blur">
            <span className="font-semibold" style={{ color }}>
              M {quake.magnitude.toFixed(1)}
            </span>{" "}
            · {quake.place}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Erdbeben der letzten 24 h (USGS). Rendert die 60 staerksten als pulsierende Marker. */
export function EarthquakeLayer() {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchEarthquakes, 60_000, true);

  const quakes = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.magnitude - a.magnitude).slice(0, 60);
  }, [data]);

  return (
    <group>
      {quakes.map((q) => (
        <EarthquakeMarker key={q.id} quake={q} radius={radius} />
      ))}
    </group>
  );
}
