import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { vector3ToLatLng } from "@/lib/globe-utils";

interface DeepZoomTriggerProps {
  /** Globe minimum orbit distance; the map opens when zooming in past it. */
  minDistance: number;
  /** Kept updated with the lat/lng the camera currently looks at. */
  centerRef: MutableRefObject<{ lat: number; lng: number }>;
  onDeepZoom: (lat: number, lng: number) => void;
}

/**
 * Watches the orbit camera and, once the user is fully zoomed in and keeps
 * scrolling inward, hands off to the 2D deep-zoom map. Renders nothing.
 */
export function DeepZoomTrigger({
  minDistance,
  centerRef,
  onDeepZoom,
}: DeepZoomTriggerProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const firedRef = useRef(false);
  const frameRef = useRef(0);

  useFrame(() => {
    frameRef.current = (frameRef.current + 1) % 12;
    if (frameRef.current === 0) {
      centerRef.current = vector3ToLatLng(camera.position);
    }
  });

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) {
        firedRef.current = false; // zooming out re-arms the trigger
        return;
      }
      if (firedRef.current) return;
      if (camera.position.length() <= minDistance + 0.05) {
        firedRef.current = true;
        const { lat, lng } = vector3ToLatLng(camera.position);
        onDeepZoom(lat, lng);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [camera, gl, minDistance, onDeepZoom]);

  return null;
}
