// Drop-in: small wrapper around AnimationMixer with cross-fading.
// const a = createAnimator(root, clips); a.play("run"); each frame: a.update(dt)
import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from "three";

export function createAnimator(root: Object3D, clips: AnimationClip[]) {
  const mixer = new AnimationMixer(root);
  const actions = new Map<string, AnimationAction>();
  for (const c of clips) actions.set(c.name.toLowerCase(), mixer.clipAction(c));
  let current: AnimationAction | null = null;

  const find = (name: string) => {
    const k = name.toLowerCase();
    return actions.get(k) ?? [...actions.entries()].find(([n]) => n.includes(k))?.[1] ?? null;
  };

  return {
    names: () => [...actions.keys()],
    play(name: string, fade = 0.2, once = false) {
      const next = find(name);
      if (!next || next === current) return;
      next.reset();
      next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      if (current) next.crossFadeFrom(current, fade, false);
      next.play();
      current = next;
    },
    update: (dt: number) => mixer.update(dt),
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
