export type Quality = "low" | "medium" | "high";
export type Settings = { sens: number; invertY: boolean; quality: Quality; volume: number; fov: number; showFps: boolean; haptics: boolean; minimap: boolean };

const KEY = "stillwater.settings.v1";
const DEFAULTS: Settings = { sens: 1, invertY: false, quality: "medium", volume: 0.8, fov: 72, showFps: false, haptics: true, minimap: true };

export const settings: Settings = { ...DEFAULTS };
try {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  if (raw) Object.assign(settings, JSON.parse(raw));
} catch {
  /* storage blocked: keep defaults */
}

const subs = new Set<() => void>();
export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}
export function subscribeSettings(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
export const resetSettings = () => updateSettings({ ...DEFAULTS });
export const buzz = (ms: number) => {
  if (!settings.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};
