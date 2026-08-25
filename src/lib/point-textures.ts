import * as THREE from "three";

let airplane: THREE.Texture | null = null;
let circle: THREE.Texture | null = null;

/** Top-down white airplane silhouette (tinted per-point via vertex colors). */
export function airplaneTexture(): THREE.Texture {
  if (airplane) return airplane;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -26); // nose
  ctx.lineTo(3.5, -10);
  ctx.lineTo(3.5, -4);
  ctx.lineTo(26, 6); // right wing
  ctx.lineTo(26, 11);
  ctx.lineTo(3.5, 5);
  ctx.lineTo(3.5, 16);
  ctx.lineTo(11, 23); // right tailplane
  ctx.lineTo(11, 26);
  ctx.lineTo(0, 22);
  ctx.lineTo(-11, 26); // left tailplane
  ctx.lineTo(-11, 23);
  ctx.lineTo(-3.5, 16);
  ctx.lineTo(-3.5, 5);
  ctx.lineTo(-26, 11); // left wing
  ctx.lineTo(-26, 6);
  ctx.lineTo(-3.5, -4);
  ctx.lineTo(-3.5, -10);
  ctx.closePath();
  ctx.fill();
  airplane = new THREE.CanvasTexture(canvas);
  airplane.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: averaged alpha would make alphaTest discard the icon when small.
  airplane.generateMipmaps = false;
  airplane.minFilter = THREE.LinearFilter;
  airplane.magFilter = THREE.LinearFilter;
  airplane.needsUpdate = true;
  return airplane;
}

/** Soft round dot (tinted per-point via vertex colors). */
export function circleTexture(): THREE.Texture {
  if (circle) return circle;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  circle = new THREE.CanvasTexture(canvas);
  circle.colorSpace = THREE.SRGBColorSpace;
  circle.needsUpdate = true;
  return circle;
}
