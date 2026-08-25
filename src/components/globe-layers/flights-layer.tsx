import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { fetchFlights, type Flight } from "@/lib/flights";

const REFRESH_MS = 30_000;
const EARTH_RADIUS_KM = 6371;
const CRUISE_KM = 11;
const HOVER_THRESHOLD = 0.02;

interface FlightsLayerProps {
  onCount?: (count: number) => void;
}

interface HoveredFlight {
  callsign: string;
  altFt: number;
  speedKmh: number;
  position: THREE.Vector3;
}

/** Keep aircraft just above the surface, lifting a touch with altitude. */
function altitudeFactor(altKm: number): number {
  return 1.01 + Math.min(altKm / CRUISE_KM, 1) * 0.02;
}

/** Live aircraft (ADS-B via proxy) rendered as an amber point cloud. */
export function FlightsLayer({ onCount }: FlightsLayerProps) {
  const radius = useGlobeRadius();
  const { data } = usePolling(fetchFlights, REFRESH_MS, true);
  const raycaster = useThree((s) => s.raycaster);
  const [hovered, setHovered] = useState<HoveredFlight | null>(null);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    [],
  );

  const { flights, geometry } = useMemo(() => {
    const flights = data ?? [];
    const positions = new Float32Array(flights.length * 3);
    const colors = new Float32Array(flights.length * 3);
    flights.forEach((f, i) => {
      const altKm = f.altFt * 0.0003048;
      const v = latLngToVector3(f.lat, f.lng, radius * altitudeFactor(altKm));
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      // Warm amber near the ground, fading to pale gold at cruise altitude.
      const t = Math.min(altKm / CRUISE_KM, 1);
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.55 + 0.4 * t;
      colors[i * 3 + 2] = 0.15 + 0.6 * t;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { flights, geometry: geo };
  }, [data, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    onCountRef.current?.(flights.length);
  }, [flights]);

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

  if (flights.length === 0) return null;

  const showTooltip = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const index = event.index;
    if (index == null) return;
    event.stopPropagation();
    const flight: Flight | undefined = flights[index];
    if (!flight) return;
    const array = geometry.getAttribute("position").array as Float32Array;
    setHovered({
      callsign: flight.callsign,
      altFt: flight.altFt,
      speedKmh: flight.speedKt * 1.852,
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
          size={0.026}
          vertexColors
          sizeAttenuation
          transparent
          opacity={1}
          depthWrite={false}
        />
      </points>

      {hovered && (
        <Html position={hovered.position} center style={{ pointerEvents: "none" }}>
          <div className="w-max max-w-[70vw] -translate-y-8 rounded-lg border border-amber-400/40 bg-neutral-900/90 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              ✈️ {hovered.callsign}
            </div>
            <div className="mt-0.5 text-neutral-300">
              {Math.round(hovered.speedKmh).toLocaleString("en-US")} km/h ·{" "}
              {hovered.altFt > 0
                ? `${hovered.altFt.toLocaleString("en-US")} ft`
                : "on ground"}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
