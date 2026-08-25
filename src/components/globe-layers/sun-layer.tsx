import { useEffect, useMemo, useState } from "react";
import { subsolarPoint } from "@/lib/sun";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { FacingHtml } from "./facing-html";

/** Live subsolar point: sun glow in space, warm sunlight and a "solar noon" marker. */
export function SunLayer() {
  const radius = useGlobeRadius();
  const [now, setNow] = useState(() => Date.now());

  // Recompute once a minute — the subsolar point drifts ~0.25°/min.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { sunPos, surfacePos } = useMemo(() => {
    const { lat, lng } = subsolarPoint(new Date(now));
    return {
      sunPos: latLngToVector3(lat, lng, radius * 3),
      surfacePos: latLngToVector3(lat, lng, radius * 1.02),
    };
  }, [now, radius]);

  return (
    <group>
      {/* Warm sunlight from the real Sun direction (creates a day/night terminator). */}
      <directionalLight position={sunPos} intensity={1.1} color="#fff1c9" />

      {/* The Sun itself, out in space. */}
      <group position={sunPos}>
        <mesh>
          <sphereGeometry args={[0.32, 24, 24]} />
          <meshBasicMaterial color="#ffd24a" toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.6, 24, 24]} />
          <meshBasicMaterial
            color="#ffe27a"
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Subsolar marker on the surface (hidden when it faces away). */}
      <FacingHtml position={surfacePos}>
        <div className="w-max -translate-y-6 rounded-full border border-amber-300/40 bg-neutral-900/85 px-2 py-0.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur">
          ☀️ Solar noon
        </div>
      </FacingHtml>
    </group>
  );
}
