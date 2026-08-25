import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { fetchAurora } from "@/lib/live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";

/** NOAA OVATION aurora nowcast rendered as a glowing point cloud over the poles. */
export function AuroraLayer() {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchAurora, 300_000, true);

  const geometry = useMemo(() => {
    const points = data ?? [];
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      const v = latLngToVector3(p.lat, p.lng, radius * 1.015);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      // Green-dominant aurora that intensifies toward teal with activity.
      const t = Math.min(1, p.value / 12);
      colors[i * 3] = 0.05 + 0.1 * t;
      colors[i * 3 + 1] = 0.45 + 0.35 * t;
      colors[i * 3 + 2] = 0.2 + 0.25 * t;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [data, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!data || data.length === 0) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
