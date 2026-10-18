// Drop-in: lowers/raises render resolution automatically to hold ~45-60 fps on phones.
import { Vector2, type WebGLRenderer } from "three";

export function createAdaptiveQuality(opts: { renderer: WebGLRenderer; getMax: () => number; min?: number }) {
  const min = opts.min ?? 0.6;
  let acc = 0;
  let n = 0;
  const size = new Vector2();
  return {
    tick(dt: number) {
      acc += dt;
      n += 1;
      if (acc < 2) return;
      const fps = n / acc;
      acc = 0;
      n = 0;
      const cur = opts.renderer.getPixelRatio();
      const max = Math.min(window.devicePixelRatio || 1, opts.getMax());
      const next = fps < 40 ? Math.max(min, cur - 0.15) : fps > 57 ? Math.min(max, cur + 0.1) : Math.min(cur, max);
      if (Math.abs(next - cur) > 0.01) {
        opts.renderer.getSize(size);
        opts.renderer.setPixelRatio(next);
        opts.renderer.setSize(size.x, size.y, false);
      }
    },
  };
}
