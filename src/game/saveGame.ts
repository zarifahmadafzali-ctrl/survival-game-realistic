// Drop-in: save / continue using localStorage.
export type SaveData = { seed: number; x: number; y: number; z: number; yaw: number; health: number; mag: number; reserve: number; kills: number; day: number };
const KEY = "stillwater.save.v1";

export function saveGame(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, t: Date.now() }));
  } catch {
    /* storage blocked */
  }
}
export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return typeof d?.seed === "number" ? (d as SaveData) : null;
  } catch {
    return null;
  }
}
export const clearSave = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
