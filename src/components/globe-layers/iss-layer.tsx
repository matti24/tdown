import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { fetchIss } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";

const ISS_ALTITUDE_FACTOR = 1.22;
const TRAIL_LENGTH = 150;

/** Live-Position der ISS (wheretheiss.at) mit weich interpolierter Bewegung und Flugbahn. */
export function IssLayer() {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchIss, 5000, true);
  const markerRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const [trail, setTrail] = useState<THREE.Vector3[]>([]);

  useEffect(() => {
    if (!data) return;
    const pos = latLngToVector3(
      data.lat,
      data.lng,
      radius * ISS_ALTITUDE_FACTOR,
    );
    setTrail((prev) => [...prev, pos].slice(-TRAIL_LENGTH));
  }, [data, radius]);

  // Marker sanft zur neuesten Position ziehen (Updates kommen nur alle 5 s).
  useFrame(() => {
    if (!markerRef.current || trail.length === 0) return;
    const target = trail[trail.length - 1];
    if (!initialized.current) {
      markerRef.current.position.copy(target);
      initialized.current = true;
    } else {
      markerRef.current.position.lerp(target, 0.08);
    }
  });

  return (
    <group>
      {trail.length >= 2 && (
        <Line
          points={trail}
          color="#4da6ff"
          lineWidth={1.5}
          transparent
          opacity={0.5}
          dashed={false}
        />
      )}

      <group ref={markerRef}>
        <mesh>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshBasicMaterial color="#4da6ff" toneMapped={false} />
        </mesh>
        <pointLight color="#4da6ff" intensity={2} distance={0.6} />
        <Html center style={{ pointerEvents: "none" }}>
          <div className="w-max -translate-y-7 rounded-full border border-sky-400/40 bg-neutral-900/90 px-2 py-0.5 text-xs font-medium text-sky-300 shadow-lg backdrop-blur">
            🛰️ ISS
            {data && (
              <span className="ml-1 text-sky-200/70">
                {Math.round(data.velocity).toLocaleString("en-US")} km/h
              </span>
            )}
          </div>
        </Html>
      </group>
    </group>
  );
}
