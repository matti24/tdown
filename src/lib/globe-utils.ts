import * as THREE from "three";
import { createContext, useContext } from "react";

/** Wandelt Breiten-/Längengrad in eine 3D-Position auf einer Kugel mit gegebenem Radius um. */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

export interface GlobeContextValue {
  radius: number;
}

/** Stellt den aktuellen Globus-Radius fuer Layer innerhalb des Canvas bereit. */
export const GlobeContext = createContext<GlobeContextValue>({ radius: 2 });

export function useGlobeRadius(): number {
  return useContext(GlobeContext).radius;
}
