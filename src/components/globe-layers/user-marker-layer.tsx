import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { latLngToVector3, useGlobeRadius } from "@/lib/globe-utils";

const LIFT = 1.004;
const FLY_SECONDS = 1.1;

interface UserMarkerLayerProps {
  lat: number;
  lng: number;
  /** Bumping this re-centres the camera on the location. */
  flyNonce: number;
}

/** "You are here" marker plus a one-shot camera glide to the location. */
export function UserMarkerLayer({ lat, lng, flyNonce }: UserMarkerLayerProps) {
  const radius = useGlobeRadius();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { enabled: boolean; update?: () => void }
    | null;
  const haloRef = useRef<THREE.Mesh>(null);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(
    null,
  );

  const pos = latLngToVector3(lat, lng, radius * LIFT);

  useEffect(() => {
    const dist = camera.position.length();
    const dir = latLngToVector3(lat, lng, 1).normalize();
    anim.current = { from: camera.position.clone(), to: dir.multiplyScalar(dist), t: 0 };
    if (controls) controls.enabled = false; // don't fight the glide
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyNonce]);

  useFrame((state, delta) => {
    if (haloRef.current) {
      haloRef.current.scale.setScalar(
        1 + 0.35 * Math.sin(state.clock.elapsedTime * 3),
      );
    }
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + delta / FLY_SECONDS);
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // easeInOutCubic
    const from = a.from.clone().normalize();
    const to = a.to.clone().normalize();
    const omega = Math.acos(Math.min(1, Math.max(-1, from.dot(to))));
    let dir: THREE.Vector3;
    if (omega < 1e-4) {
      dir = to;
    } else {
      const so = Math.sin(omega);
      dir = from
        .multiplyScalar(Math.sin((1 - e) * omega) / so)
        .add(to.multiplyScalar(Math.sin(e * omega) / so));
    }
    const dist = a.from.length() * (1 - e) + a.to.length() * e;
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    if (a.t >= 1) {
      anim.current = null;
      if (controls) {
        controls.enabled = true;
        controls.update?.();
      }
    }
  });

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.017, 16, 16]} />
        <meshBasicMaterial color="#34d399" toneMapped={false} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0.22}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#34d399" intensity={1.5} distance={0.5} />
      <Html center style={{ pointerEvents: "none" }}>
        <div className="-translate-y-6 whitespace-nowrap rounded-full border border-emerald-400/50 bg-neutral-900/90 px-2 py-0.5 text-[11px] font-medium text-emerald-300 shadow-lg backdrop-blur">
          📍 You
        </div>
      </Html>
    </group>
  );
}
