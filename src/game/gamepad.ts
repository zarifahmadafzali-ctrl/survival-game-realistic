// Drop-in: Bluetooth / USB controller support. Call readGamepad() once per frame.
export type PadState = { f: number; s: number; lookX: number; lookY: number; fire: boolean; jump: boolean; reload: boolean; sprint: boolean };
const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);

export function readGamepad(): PadState | null {
  const list = navigator.getGamepads?.();
  const p = list ? [...list].find((x) => x && x.connected) : null;
  if (!p) return null;
  const b = (i: number) => !!p.buttons[i]?.pressed;
  return {
    s: dz(p.axes[0] ?? 0),
    f: -dz(p.axes[1] ?? 0),
    lookX: dz(p.axes[2] ?? 0),
    lookY: dz(p.axes[3] ?? 0),
    fire: (p.buttons[7]?.value ?? 0) > 0.3,
    jump: b(0),
    reload: b(2),
    sprint: b(10) || b(4),
  };
}
