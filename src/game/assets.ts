// Drop-in: loads .glb models (trees, rocks, weapons, wolves) with a cache.
// Never throws: resolves null so the existing procedural geometry stays as fallback.
import type { AnimationClip, Group, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export type LoadedModel = { scene: Group; animations: AnimationClip[] };

const loader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedModel | null>>();

/** Put files in public/models/ and call modelUrl("wolf.glb"). */
export const modelUrl = (name: string) => `${import.meta.env.BASE_URL}models/${name}`;

export function loadModel(url: string): Promise<LoadedModel | null> {
  let p = cache.get(url);
  if (!p) {
    p = loader
      .loadAsync(url)
      .then((g) => ({ scene: g.scene, animations: g.animations }))
      .catch((e) => {
        console.warn("[assets] could not load", url, e);
        return null;
      });
    cache.set(url, p);
  }
  return p;
}

/** Independent copy of a model (safe for skinned/animated characters). */
export async function spawnModel(url: string): Promise<{ root: Object3D; animations: AnimationClip[] } | null> {
  const m = await loadModel(url);
  if (!m) return null;
  return { root: cloneSkinned(m.scene), animations: m.animations };
}
