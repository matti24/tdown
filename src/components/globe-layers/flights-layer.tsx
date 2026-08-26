import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { usePolling } from "@/hooks/use-live-data";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";
import { airplaneTexture } from "@/lib/point-textures";
import { fetchFlights, type Flight } from "@/lib/flights";

const REFRESH_MS = 30_000;
const CRUISE_KM = 11;
const EARTH_KM = 6371;
const PLANE_SIZE = 0.042;
const MAX_FLIGHTS = 20000;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);
// Zoom-adaptive icon scale: roughly constant on-screen size so zooming in
// pulls dense clusters apart into distinguishable aircraft.
const SCALE_REF = 6;
const SCALE_MIN = 0.4;
const SCALE_MAX = 2.6;
// Motion-streak ("contrail") length per knot of ground speed.
const STREAK_PER_KT = 0.00007;
const STREAK_MAX = 0.05;

interface FlightsLayerProps {
  onCount?: (count: number) => void;
  onSelect?: (flight: Flight | null) => void;
  selectedCallsign?: string | null;
  route?: RouteArc | null;
}

/** Airport coordinates for drawing a selected flight's path arcs. */
export interface RouteArc {
  originLat: number;
  originLng: number;
  destLat?: number;
  destLng?: number;
  planeLat: number;
  planeLng: number;
}

interface HoveredFlight {
  flight: Flight;
  position: THREE.Vector3;
}

/** Keep aircraft just above the surface, lifting a touch with altitude. */
function altitudeFactor(altKm: number): number {
  return 1.01 + Math.min(altKm / CRUISE_KM, 1) * 0.02;
}

/** Move a lat/lng along a bearing by a distance (dead reckoning on a sphere). */
function moveLatLng(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number,
) {
  const d = distKm / EARTH_KM;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lng * Math.PI) / 180;
  const sinP2 =
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(t) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * sinP2,
    );
  return {
    lat: (p2 * 180) / Math.PI,
    lng: (((l2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/** Sample an arched great-circle path between two lat/lng as Vector3 points. */
function greatCircleArc(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
  radius: number,
  segments = 64,
): THREE.Vector3[] {
  const a = latLngToVector3(latA, lngA, 1).normalize();
  const b = latLngToVector3(latB, lngB, 1).normalize();
  const omega = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  if (omega < 1e-4) {
    return [
      a.clone().multiplyScalar(radius * 1.012),
      b.clone().multiplyScalar(radius * 1.012),
    ];
  }
  const sinO = Math.sin(omega);
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s0 = Math.sin((1 - t) * omega) / sinO;
    const s1 = Math.sin(t * omega) / sinO;
    v.copy(a).multiplyScalar(s0).addScaledVector(b, s1).normalize();
    const lift = radius * (1.012 + 0.06 * Math.sin(Math.PI * t));
    pts.push(v.clone().multiplyScalar(lift));
  }
  return pts;
}

/**
 * Live aircraft as heading-oriented airplane icons lying flat on the globe
 * (InstancedMesh), with speed/direction contrails, zoom-adaptive sizing and
 * click-to-follow. One quad per flight, rotated to its true track.
 */
export function FlightsLayer({
  onCount,
  onSelect,
  selectedCallsign,
  route,
}: FlightsLayerProps) {
  const radius = useGlobeRadius();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
  } | null;
  const { data } = usePolling(fetchFlights, REFRESH_MS, true);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState<HoveredFlight | null>(null);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const scaleUniform = useRef({ value: 1 });
  const followed = useRef<{
    callsign: string;
    lat: number;
    lng: number;
    altFt: number;
    trackDeg: number;
    speedKt: number;
  } | null>(null);

  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    [],
  );

  const flights = useMemo(() => data ?? [], [data]);

  const originArc = useMemo(
    () =>
      route
        ? greatCircleArc(
            route.originLat,
            route.originLng,
            route.planeLat,
            route.planeLng,
            radius,
          )
        : null,
    [route, radius],
  );

  const destArc = useMemo(
    () =>
      route && route.destLat != null && route.destLng != null
        ? greatCircleArc(
            route.planeLat,
            route.planeLng,
            route.destLat,
            route.destLng,
            radius,
          )
        : null,
    [route, radius],
  );

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
    [],
  );

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      map: airplaneTexture(),
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

  const streakGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_FLIGHTS * 2 * 3), 3),
    );
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_FLIGHTS * 2 * 3), 3),
    );
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const streakMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      streakGeometry.dispose();
      streakMaterial.dispose();
    },
    [geometry, material, streakGeometry, streakMaterial],
  );

  // Rebuild instance transforms, colours and contrails whenever data changes.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const pos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    const nose = new THREE.Vector3();
    const xAxis = new THREE.Vector3();
    const tail = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const count = Math.min(flights.length, MAX_FLIGHTS);
    const sPos = streakGeometry.getAttribute("position").array as Float32Array;
    const sCol = streakGeometry.getAttribute("color").array as Float32Array;

    for (let i = 0; i < count; i++) {
      const f = flights[i];
      const altKm = f.altFt * 0.0003048;
      pos.copy(latLngToVector3(f.lat, f.lng, radius * altitudeFactor(altKm)));
      normal.copy(pos).normalize();
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

      // Contrail: a short line trailing behind, fading amber -> black (additive).
      const len = Math.min(STREAK_MAX, f.speedKt * STREAK_PER_KT);
      tail.copy(pos).addScaledVector(nose, -len);
      const j = i * 6;
      sPos[j] = pos.x;
      sPos[j + 1] = pos.y;
      sPos[j + 2] = pos.z;
      sPos[j + 3] = tail.x;
      sPos[j + 4] = tail.y;
      sPos[j + 5] = tail.z;
      sCol[j] = color.r;
      sCol[j + 1] = color.g;
      sCol[j + 2] = color.b;
      sCol[j + 3] = 0;
      sCol[j + 4] = 0;
      sCol[j + 5] = 0;
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    streakGeometry.setDrawRange(0, count * 2);
    streakGeometry.getAttribute("position").needsUpdate = true;
    streakGeometry.getAttribute("color").needsUpdate = true;
    streakGeometry.computeBoundingSphere();

    onCountRef.current?.(flights.length);
  }, [flights, radius, streakGeometry]);

  // Keep the followed aircraft synced to the latest snapshot (and refresh panel).
  useEffect(() => {
    if (!selectedCallsign) {
      followed.current = null;
      return;
    }
    const f = flights.find((x) => x.callsign === selectedCallsign);
    if (f) {
      followed.current = {
        callsign: f.callsign,
        lat: f.lat,
        lng: f.lng,
        altFt: f.altFt,
        trackDeg: f.trackDeg,
        speedKt: f.speedKt,
      };
      onSelectRef.current?.(f);
    } else {
      followed.current = null;
      onSelectRef.current?.(null);
    }
  }, [selectedCallsign, flights]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  useFrame((state, delta) => {
    // Zoom-adaptive icon size (near-constant on screen).
    const dist = camera.position.length();
    scaleUniform.current.value = Math.min(
      SCALE_MAX,
      Math.max(SCALE_MIN, dist / SCALE_REF),
    );

    const live = followed.current;
    const ring = ringRef.current;
    const mesh = meshRef.current;
    if (live && mesh) {
      const distKm = ((live.speedKt * 1.852) / 3600) * delta;
      if (distKm > 0) {
        const moved = moveLatLng(live.lat, live.lng, live.trackDeg, distKm);
        live.lat = moved.lat;
        live.lng = moved.lng;
      }
      const altKm = live.altFt * 0.0003048;
      const local = latLngToVector3(
        live.lat,
        live.lng,
        radius * altitudeFactor(altKm),
      );
      if (ring) {
        ring.visible = true;
        ring.position.copy(local);
        ring.lookAt(local.clone().multiplyScalar(2));
        ring.scale.setScalar(1 + 0.25 * Math.sin(state.clock.elapsedTime * 4));
      }
      if (controls?.target) {
        controls.target.lerp(mesh.localToWorld(local.clone()), 0.08);
      }
    } else {
      if (ring) ring.visible = false;
      // Restore the orbit centre to the globe after following ends, so panning
      // and zooming feel the same as before a flight was selected.
      const target = controls?.target;
      if (target && target.lengthSq() > 1e-5) {
        target.lerp(ORIGIN, 0.12);
        if (target.lengthSq() < 1e-5) target.set(0, 0, 0);
      }
    }
  });

  if (flights.length === 0) return null;

  // Reject hits on aircraft hidden behind the globe (ray passes through the
  // sphere before reaching the plane), so you only pick what you can see.
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
    const flight = flights[id];
    if (!flight) return;
    if (!visibleHit(event.point)) {
      setHovered(null);
      return;
    }
    event.stopPropagation();
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

  const selectFlight = (event: ThreeEvent<MouseEvent>) => {
    const id = event.instanceId;
    if (id == null) return;
    const flight = flights[id];
    if (!flight) return;
    if (!visibleHit(event.point)) return;
    event.stopPropagation();
    onSelectRef.current?.(flight);
  };

  const clearSelection = () => {
    setHovered(null);
    onSelectRef.current?.(null);
  };

  return (
    <group>
      <lineSegments
        geometry={streakGeometry}
        material={streakMaterial}
        frustumCulled={false}
      />
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, MAX_FLIGHTS]}
        frustumCulled={false}
        onPointerMove={isTouch ? undefined : showTooltip}
        onPointerOut={isTouch ? undefined : hideTooltip}
        onClick={selectFlight}
        onPointerMissed={clearSelection}
      />
      <mesh ref={ringRef} visible={false}>
        <ringGeometry args={[0.02, 0.03, 32]} />
        <meshBasicMaterial
          color="#ffd24d"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {originArc && (
        <Line
          points={originArc}
          color="#ffd24d"
          lineWidth={2.4}
          transparent
          opacity={0.9}
        />
      )}
      {destArc && (
        <Line
          points={destArc}
          color="#7dd3fc"
          lineWidth={1.8}
          dashed
          dashScale={40}
          transparent
          opacity={0.55}
        />
      )}

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

/** Compass letter for a heading in degrees. */
export function headingCompass(deg: number): string {
  return COMPASS[Math.round((deg % 360) / 45) % 8];
}

function FlightTooltip({ flight }: { flight: Flight }) {
  const speedKmh = Math.round(flight.speedKt * 1.852);
  const vr = flight.verticalRateMs;
  const trend =
    vr > 0.5 ? "↑ climbing" : vr < -0.5 ? "↓ descending" : "→ level";
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
        {Math.round(flight.trackDeg)}° {headingCompass(flight.trackDeg)} ·{" "}
        {trend}
      </div>
      {flight.country && (
        <div className="text-neutral-500">{flight.country}</div>
      )}
    </div>
  );
}
