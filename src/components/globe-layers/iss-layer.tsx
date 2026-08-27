import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { fetchIss, type IssPosition } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";

const ISS_ALTITUDE_FACTOR = 1.22;
const TRAIL_LENGTH = 150;

interface IssLayerProps {
  onSelect?: (data: IssPosition | null) => void;
  selected?: boolean;
}

/** Live-Position der ISS (wheretheiss.at) mit weich interpolierter Bewegung und Flugbahn. */
export function IssLayer({ onSelect, selected }: IssLayerProps) {
  const radius = useGlobeRadius();
  const camera = useThree((s) => s.camera);
  const { data } = usePolling(fetchIss, 5000, true);
  const markerRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const [trail, setTrail] = useState<THREE.Vector3[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Keep the detail panel's ISS data live while it is selected.
  useEffect(() => {
    if (selected && data) onSelectRef.current?.(data);
  }, [selected, data]);

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

  // True when a point is hidden behind the globe from the camera's viewpoint.
  const occluded = (p: THREE.Vector3) => {
    const c = camera.position;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (c.x * dx + c.y * dy + c.z * dz);
    const cc = c.x * c.x + c.y * c.y + c.z * c.z - radius * radius;
    const disc = b * b - 4 * a * cc;
    if (disc <= 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t > 1e-3 && t < 1 - 1e-3;
  };

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
        <mesh
          onClick={(e) => {
            if (occluded(e.point)) return;
            e.stopPropagation();
            if (data) onSelectRef.current?.(data);
          }}
          onPointerOver={(e) => {
            if (occluded(e.point)) return;
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshBasicMaterial color="#4da6ff" toneMapped={false} />
        </mesh>
        {selected && (
          <mesh>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshBasicMaterial
              color="#4da6ff"
              transparent
              opacity={0.22}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        )}
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
