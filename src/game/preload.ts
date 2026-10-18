// Drop-in: preloads .glb models with progress. Needs assets.ts from the upgrade pack.
// Add every model the game uses to MODEL_LIST, e.g. modelUrl("wolf.glb").
import { loadModel } from "./assets";

export type ProgressFn = (done: number, total: number, url: string) => void;

export const MODEL_LIST: string[] = [
  // modelUrl("wolf.glb"),
  // modelUrl("rifle.glb"),
  // modelUrl("pine.glb"),
];

/** Never rejects: a missing file just counts as done (loadModel returns null). */
export async function preloadModels(urls: string[], onProgress?: ProgressFn): Promise<void> {
  let done = 0;
  onProgress?.(0, urls.length, "");
  await Promise.all(
    urls.map(async (u) => {
      await loadModel(u);
      done += 1;
      onProgress?.(done, urls.length, u);
    }),
  );
}
