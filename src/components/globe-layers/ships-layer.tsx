import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { shipTexture } from "@/lib/point-textures";
import { shipCategory, spreadShips, type Ship } from "@/lib/ships";

const SHIP_SIZE = 0.032;
const MAX_SHIPS = 20000;
const SEA_LIFT = 1.003;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SCALE_REF = 6;
const SCALE_MIN = 0.45;
const SCALE_MAX = 2.4;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
// A course line drawn through the selected ship: where it came from (behind)
// and where it's heading (ahead), dead-reckoned from its course over ground.
const LINE_LIFT = 1.0045;
const BACK_KM = 750;
const AHEAD_KM = 420;

/** Great-circle destination point from (lat,lng) along a bearing (deg). */
function destPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number,
) {
  const d = distKm / 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lng * Math.PI) / 180;
  const sinP2 =
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * sinP2,
    );
  return {
    lat: (p2 * 180) / Math.PI,
    lng: (((l2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/** Sample a great-circle arc from a ship outwards along a bearing. */
function courseArc(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number,
  radius: number,
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const p = destPoint(lat, lng, bearingDeg, (distKm * i) / 24);
    pts.push(latLngToVector3(p.lat, p.lng, radius * LINE_LIFT));
  }
  return pts;
}

interface ShipsLayerProps {
  ships: Ship[];
  onSelect?: (ship: Ship | null) => void;
  selectedMmsi?: number | null;
}

interface HoveredShip {
  ship: Ship;
  position: THREE.Vector3;
}

/**
 * Live vessels (AIS) as course-oriented boat icons lying flat on the sea
 * (InstancedMesh), coloured by ship category, with a hover/tap tooltip.
 */
export function ShipsLayer({ ships, onSelect, selectedMmsi }: ShipsLayerProps) {
  const radius = useGlobeRadius();
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState<HoveredShip | null>(null);
  const scaleUniform = useRef({ value: 1 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Even out density (busy coasts crowd out the rest of the world and lag the
  // render); the selected vessel is always kept so its ring/line stay put.
  const renderShips = useMemo(
    () => spreadShips(ships, selectedMmsi ?? null),
    [ships, selectedMmsi],
  );

  // Dead-reckoned course line for the selected, moving vessel.
  const courseLine = useMemo(() => {
    if (selectedMmsi == null) return null;
    const s = ships.find((x) => x.mmsi === selectedMmsi);
    if (!s || s.speedKn < 0.5) return null;
    return {
      back: courseArc(s.lat, s.lng, s.courseDeg + 180, BACK_KM, radius),
      ahead: courseArc(s.lat, s.lng, s.courseDeg, AHEAD_KM, radius),
    };
  }, [ships, selectedMmsi, radius]);

  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    [],
  );

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(SHIP_SIZE, SHIP_SIZE),
    [],
  );

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      map: shipTexture(),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uScale = scaleUniform.current;
      shader.vertexShader =
        "uniform float uScale;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "vec3 transformed = vec3( position ) * uScale;",
        );
    };
    return mat;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

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
    const count = Math.min(renderShips.length, MAX_SHIPS);

    for (let i = 0; i < count; i++) {
      const s = renderShips[i];
      pos.copy(latLngToVector3(s.lat, s.lng, radius * SEA_LIFT));
      normal.copy(pos).normalize();
      north.copy(WORLD_UP).addScaledVector(normal, -WORLD_UP.dot(normal));
      if (north.lengthSq() < 1e-8) north.set(0, 0, 1);
      north.normalize();
      east.crossVectors(north, normal).normalize();
      const theta = (s.courseDeg * Math.PI) / 180;
      nose
        .copy(north)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(east, Math.sin(theta));
      xAxis.crossVectors(nose, normal).normalize();
      matrix.makeBasis(xAxis, nose, normal);
      matrix.setPosition(pos);
      mesh.setMatrixAt(i, matrix);

      const c = shipCategory(s.type).color;
      color.setRGB(c[0], c[1], c[2]);
      mesh.setColorAt(i, color);
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    const ring = ringRef.current;
    if (ring) {
      const sel =
        selectedMmsi != null
          ? renderShips.find((s) => s.mmsi === selectedMmsi)
          : undefined;
      if (sel) {
        const p = latLngToVector3(sel.lat, sel.lng, radius * SEA_LIFT);
        ring.position.copy(p);
        ring.lookAt(p.clone().multiplyScalar(2));
        ring.visible = true;
      } else {
        ring.visible = false;
      }
    }
  }, [renderShips, radius, selectedMmsi]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  useFrame((state) => {
    const dist = camera.position.length();
    scaleUniform.current.value = Math.min(
      SCALE_MAX,
      Math.max(SCALE_MIN, dist / SCALE_REF),
    );
    const ring = ringRef.current;
    if (ring?.visible) {
      ring.scale.setScalar(1 + 0.25 * Math.sin(state.clock.elapsedTime * 4));
    }
  });

  if (renderShips.length === 0) return null;

  // Ignore hits on vessels hidden behind the globe.
  const visibleHit = (point: THREE.Vector3) => {
    const c = camera.position;
    const dx = point.x - c.x;
    const dy = point.y - c.y;
    const dz = point.z - c.z;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (c.x * dx + c.y * dy + c.z * dz);
    const cc = c.x * c.x + c.y * c.y + c.z * c.z - radius * radius;
    const disc = b * b - 4 * a * cc;
    if (disc <= 0) return true;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return !(t > 1e-3 && t < 1 - 1e-3);
  };

  const showTooltip = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const id = event.instanceId;
    if (id == null) return;
    const ship = renderShips[id];
    if (!ship) return;
    if (!visibleHit(event.point)) {
      setHovered(null);
      return;
    }
    event.stopPropagation();
    setHovered({
      ship,
      position: latLngToVector3(ship.lat, ship.lng, radius * SEA_LIFT),
    });
  };

  const hideTooltip = () => setHovered(null);

  const selectShip = (event: ThreeEvent<MouseEvent>) => {
    const id = event.instanceId;
    if (id == null) return;
    const ship = renderShips[id];
    if (!ship) return;
    if (!visibleHit(event.point)) return;
    event.stopPropagation();
    onSelectRef.current?.(ship);
  };

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, MAX_SHIPS]}
        frustumCulled={false}
        onPointerMove={isTouch ? undefined : showTooltip}
        onPointerOut={isTouch ? undefined : hideTooltip}
        onClick={selectShip}
        onPointerMissed={hideTooltip}
      />
      <mesh ref={ringRef} visible={false}>
        <ringGeometry args={[0.016, 0.024, 28]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {courseLine && (
        <>
          <Line
            points={courseLine.back}
            color="#f59e0b"
            lineWidth={2.4}
            transparent
            opacity={0.9}
          />
          <Line
            points={courseLine.ahead}
            color="#22d3ee"
            lineWidth={2}
            dashed
            dashScale={40}
            transparent
            opacity={0.85}
          />
        </>
      )}

      {hovered && (
        <Html
          position={hovered.position}
          center
          style={{ pointerEvents: "none" }}
        >
          <ShipTooltip ship={hovered.ship} />
        </Html>
      )}
    </group>
  );
}

function ShipTooltip({ ship }: { ship: Ship }) {
  const category = shipCategory(ship.type).name;
  const speed = Math.round(ship.speedKn * 1.852);
  const compass = COMPASS[Math.round((ship.courseDeg % 360) / 45) % 8];
  const status = ship.speedKn < 0.5 ? "vor Anker / im Hafen" : `${speed} km/h`;
  return (
    <div className="w-max max-w-[70vw] -translate-y-8 rounded-lg border border-cyan-400/40 bg-neutral-900/90 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur">
      <div className="flex items-center gap-1.5 font-semibold text-white">
        <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
        🚢 {ship.name || `MMSI ${ship.mmsi}`}
      </div>
      <div className="mt-0.5 text-neutral-300">
        {category} · {status}
      </div>
      {ship.speedKn >= 0.5 && (
        <div className="text-neutral-400">
          {Math.round(ship.courseDeg)}° {compass}
        </div>
      )}
      {ship.destination && (
        <div className="text-neutral-500">→ {ship.destination}</div>
      )}
    </div>
  );
}
