// Drop-in: round, heading-up minimap. Terrain is baked once per world; wolves and crates are drawn live.
// Needs: Terrain.sample(x, z) and the exported WORLD / WATER constants from terrain.ts.
import type { Actors } from "./actors";
import { WATER, WORLD, type Terrain } from "./terrain";

const SIZE = 112; // css px
const TEX = 160; // baked texture resolution
const VIEW = 110; // metres from centre to rim

export type Minimap = {
  rebuild: (t: Terrain) => void;
  draw: (x: number, z: number, yaw: number, actors: Actors | null) => void;
};

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

export function createMinimap(canvas: HTMLCanvasElement): Minimap {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  const c = canvas.getContext("2d")!;
  const off = document.createElement("canvas");
  off.width = TEX;
  off.height = TEX;
  const R = SIZE / 2;

  const colorAt = (h: number): number[] => {
    if (h < WATER - 0.2) return [28, 92, 112];
    if (h < WATER + 1.2) return [196, 178, 128];
    if (h < 26) return mix([70, 118, 66], [96, 130, 78], Math.min(1, (h - WATER) / 20));
    if (h < 42) return mix([96, 130, 78], [128, 128, 120], (h - 26) / 16);
    return mix([128, 128, 120], [235, 238, 240], Math.min(1, (h - 42) / 14));
  };

  return {
    rebuild(t) {
      const o = off.getContext("2d")!;
      const img = o.createImageData(TEX, TEX);
      for (let j = 0; j < TEX; j++) {
        for (let i = 0; i < TEX; i++) {
          const x = ((i + 0.5) / TEX) * WORLD - WORLD / 2;
          const z = ((j + 0.5) / TEX) * WORLD - WORLD / 2;
          const h = t.sample(x, z);
          const lit = Math.max(-0.3, Math.min(0.3, (t.sample(x - 3, z - 3) - t.sample(x + 3, z + 3)) * 0.05));
          const col = colorAt(h);
          const k = (j * TEX + i) * 4;
          img.data[k] = Math.max(0, Math.min(255, col[0]! * (1 + lit)));
          img.data[k + 1] = Math.max(0, Math.min(255, col[1]! * (1 + lit)));
          img.data[k + 2] = Math.max(0, Math.min(255, col[2]! * (1 + lit)));
          img.data[k + 3] = 255;
        }
      }
      o.putImageData(img, 0, 0);
    },
    draw(px, pz, yaw, actors) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, SIZE, SIZE);
      c.save();
      c.beginPath();
      c.arc(R, R, R - 1, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = "#0c1412";
      c.fillRect(0, 0, SIZE, SIZE);
      c.save();
      c.translate(R, R);
      c.rotate(yaw); // facing direction points up
      const k = R / VIEW;
      c.scale(k, k);
      c.translate(-px, -pz);
      c.drawImage(off, -WORLD / 2, -WORLD / 2, WORLD, WORLD);
      if (actors) {
        c.fillStyle = "#e0603c";
        for (const w of actors.wolves) {
          if (!w.alive || Math.hypot(w.x - px, w.z - pz) > VIEW * 0.9) continue;
          c.beginPath();
          c.arc(w.x, w.z, 3.2, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "#e0a45a";
        for (const cr of actors.crates) if (cr.alive) c.fillRect(cr.x - 2.5, cr.z - 2.5, 5, 5);
      }
      c.restore();
      c.fillStyle = "#e4ecdf";
      c.font = "600 11px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("N", R + Math.sin(yaw) * (R - 9), R - Math.cos(yaw) * (R - 9));
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(R, R - 7);
      c.lineTo(R + 5, R + 6);
      c.lineTo(R, R + 3);
      c.lineTo(R - 5, R + 6);
      c.closePath();
      c.fill();
      c.restore();
      c.strokeStyle = "rgba(228,236,223,.5)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(R, R, R - 1, 0, Math.PI * 2);
      c.stroke();
    },
  };
}
