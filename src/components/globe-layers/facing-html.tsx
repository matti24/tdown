import { useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

interface FacingHtmlProps {
  position: THREE.Vector3;
  children: ReactNode;
}

/**
 * HTML-Label an einer Kugelposition, das automatisch ausgeblendet wird,
 * sobald es auf die von der Kamera abgewandte Seite des Globus rotiert.
 */
export function FacingHtml({ position, children }: FacingHtmlProps) {
  const ref = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(true);
  const { camera } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    const world = new THREE.Vector3();
    ref.current.getWorldPosition(world);
    const dot = world.normalize().dot(camera.position.clone().normalize());
    // setState mit gleichem Boolean loest dank React-Bailout kein Re-Render aus.
    setVisible(dot > 0.15);
  });

  return (
    <group ref={ref} position={position}>
      <Html
        center
        style={{
          pointerEvents: "none",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.2s ease-out",
          userSelect: "none",
        }}
      >
        {children}
      </Html>
    </group>
  );
}
