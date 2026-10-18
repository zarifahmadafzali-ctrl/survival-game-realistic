import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  ShaderMaterial,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";
import { createActors, type Actors } from "./actors";
import { createAtmosphere, type Atmosphere } from "./atmosphere";
import { createAudio } from "./audio";
import { createFoliage, type Collider, type Foliage } from "./foliage";
import { createTerrain, LAKE, WATER, type Terrain } from "./terrain";
import { buzz, settings, subscribeSettings } from "./settings";
import { createAdaptiveQuality } from "./adaptiveQuality";
import { readGamepad } from "./gamepad";
import { loadGame, saveGame } from "./saveGame";
import { MODEL_LIST, preloadModels } from "./preload";
import { createMinimap } from "./minimap";

type Mode = "menu" | "play" | "pause" | "dead";

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPos: () => { x: number; y: number; z: number };
  setKeys: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

const CENTER = { x: 0, y: 0 };

export function mountGame(host: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "sw-canvas";
  host.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.25 : 1.6));
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.setClearColor(0x101612, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(72, 1, 0.12, 800);
  camera.rotation.order = "YXZ";

  const weaponScene = new Scene();
  const weaponCam = new PerspectiveCamera(72, 1, 0.04, 8);
  weaponScene.add(new AmbientLight(0xffffff, 0.62));
  const weaponKey = new DirectionalLight(0xfff2dc, 1.15);
  weaponKey.position.set(2, 3, 2);
  weaponScene.add(weaponKey);
  const gun = new Group();
  gun.position.set(0.28, -0.28, -0.48);
  weaponScene.add(gun);
  const metal = new MeshStandardMaterial({ color: 0x2c312c, metalness: 0.72, roughness: 0.32 });
  const stockMat = new MeshStandardMaterial({ color: 0x6d4b30, metalness: 0.04, roughness: 0.72 });
  const rubber = new MeshStandardMaterial({ color: 0x161816, metalness: 0.2, roughness: 0.6 });
  const addBox = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    gun.add(mesh);
    return mesh;
  };
  addBox(0.07, 0.09, 0.42, metal, 0, 0, -0.05);
  addBox(0.055, 0.11, 0.16, stockMat, 0, -0.01, 0.22);
  addBox(0.045, 0.16, 0.05, stockMat, 0, -0.12, 0.02);
  addBox(0.04, 0.12, 0.045, rubber, 0, -0.1, -0.08);
  const barrel = new Mesh(new CylinderGeometry(0.016, 0.018, 0.58, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.42);
  gun.add(barrel);
  addBox(0.012, 0.035, 0.05, rubber, 0, 0.07, -0.02);
  const flashMat = new MeshBasicMaterial({ color: 0xffe2a8 });
  const muzzle = new Mesh(new BoxGeometry(0.05, 0.05, 0.08), flashMat);
  muzzle.position.set(0, 0.03, -0.74);
  muzzle.visible = false;
  gun.add(muzzle);

  const atmo = createAtmosphere(scene);
  const audio = createAudio();
  const ray = new Raycaster();
  ray.far = 220;
  const timer = new Timer();
  timer.connect(document);

  const keys = new Set<string>();
  let qaKeys: string[] | null = null;
  let mode: Mode = "menu";
  let seed = (Math.floor(Math.random() * 8000) + 1) >>> 0;
  let yaw = 0;
  let pitch = 0;
  let vy = 0;
  let vx = 0;
  let vz = 0;
  let onGround = false;
  let horiz = 0;
  let bob = 0;
  let health = 100;
  let hurt = 0;
  let mag = 30;
  let reserve = 90;
  let cooldown = 0;
  let reloading = 0;
  let spread = 0.002;
  let recoilP = 0;
  let recoilY = 0;
  let kick = 0;
  let scoped = false;
  let scopeT = 0; // 0..1 blend
  let flash = 0;
  let kills = 0;
  let day = 0.32;
  let firing = false;
  let firingTouch = false;
  let sprintTouch = false;
  let jumpLatch = false;
  let jumpPulse = false;
  let stickId: number | null = null;
  let lookId: number | null = null;
  let stickOrigin = { x: 0, y: 0 };
  let lookLast = { x: 0, y: 0 };
  let stickF = 0;
  let stickS = 0;
  let lookDx = 0;
  let lookDy = 0;
  let msgTimer = 0;
  const pos = new Vector3();
  const wish = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();

  let terrain: Terrain | null = null;
  let foliage: Foliage | null = null;
  let actors: Actors | null = null;
  let colliders: Collider[] = [];

  const puffs: { mesh: Mesh; life: number; vx: number; vy: number; vz: number }[] = [];
  const puffGeo = new BoxGeometry(0.08, 0.08, 0.08);
  const puffMat = new MeshBasicMaterial({ color: 0xd7c7a2 });
  for (let i = 0; i < 24; i++) {
    const mesh = new Mesh(puffGeo, puffMat);
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  const tracers: { mesh: Mesh; life: number }[] = [];
  const tracerGeo = new BoxGeometry(0.012, 0.012, 1);
  const tracerMat = new MeshBasicMaterial({ color: 0xf0d7a4, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 8; i++) {
    const mesh = new Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }

  const q = (id: string) => host.querySelector("#" + id);
  const menu = q("sw-menu") as HTMLElement;
  const hud = q("sw-hud") as HTMLElement;
  const pause = q("sw-pause") as HTMLElement;
  const dead = q("sw-dead") as HTMLElement;
  const touch = q("sw-touch") as HTMLElement;
  const clock = q("sw-clock") as HTMLElement;
  const bearing = q("sw-bearing") as HTMLElement;
  const place = q("sw-place") as HTMLElement;
  const phaseBtn = q("sw-phase") as HTMLButtonElement;
  const killsEl = q("sw-kills") as HTMLElement;
  const hpEl = q("sw-hp") as HTMLElement;
  const magEl = q("sw-mag") as HTMLElement;
  const resEl = q("sw-res") as HTMLElement;
  const msgEl = q("sw-msg") as HTMLElement;
  const cross = q("sw-cross") as HTMLElement;
  const mmCanvas = q("sw-minimap") as HTMLCanvasElement;
  const minimap = createMinimap(mmCanvas);
  const dmg = q("sw-dmg") as HTMLElement;
  const knob = q("sw-knob") as HTMLElement;
  const deadLine = q("sw-dead-line") as HTMLElement;
  const fpsEl = q("sw-fps") as HTMLElement;
  const scopeEl = q("sw-scope") as HTMLElement;
  const loadingEl = q("sw-loading") as HTMLElement;
  const loadText = q("sw-load-text") as HTMLElement;
  const loadFill = q("sw-load-fill") as HTMLElement;

  const down = (code: string) => (qaKeys ? qaKeys.includes(code) : keys.has(code));

  const say = (text: string) => {
    msgEl.textContent = text;
    msgEl.classList.add("on");
    msgTimer = 1.6;
  };

  /** p in 0..1 shows a real bar; omit p for the animated "working" bar. */
  const setLoading = (on: boolean, text = "Loading…", p?: number) => {
    if (loadingEl) loadingEl.hidden = !on;
    if (loadText) loadText.textContent = text;
    loadFill?.parentElement?.classList.toggle("indet", p === undefined);
    if (loadFill) loadFill.style.width = p === undefined ? "" : `${Math.round(p * 100)}%`;
  };
  const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const persist = () => saveGame({ seed, x: pos.x, y: pos.y, z: pos.z, yaw, health, mag, reserve, kills, day });

  const show = () => {
    if (mode === "pause") persist();
    if (mode !== "play" && scoped) setScoped(false);
    menu.hidden = mode !== "menu";
    hud.hidden = mode === "menu";
    pause.hidden = mode !== "pause";
    dead.hidden = mode !== "dead";
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
    touch.classList.toggle("is-on", mode === "play" && coarse);
  };

  const phases = [
    { t: 0.32, name: "Morning" },
    { t: 0.5, name: "Noon" },
    { t: 0.76, name: "Dusk" },
    { t: 0.02, name: "Night" },
  ];
  let phaseIdx = 0;

  const placeName = (x: number, z: number, h: number) => {
    const d = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (d < LAKE.r * 0.92 && h < WATER + 0.4) return "Stillwater Lake";
    if (h > 42) return "High Ridgeline";
    if (h > 26) return "Pine Shoulder";
    if (d < LAKE.r + 22) return "Lake Shore";
    return "Basin Meadow";
  };

  const clearWorld = () => {
    if (terrain) {
      scene.remove(terrain.group);
      terrain.dispose();
    }
    if (foliage) {
      scene.remove(foliage.group);
      foliage.dispose();
    }
    if (actors) {
      scene.remove(actors.group);
      actors.dispose();
    }
    terrain = null;
    foliage = null;
    actors = null;
    colliders = [];
  };

  const build = (next: number) => {
    clearWorld();
    seed = next;
    terrain = createTerrain(seed);
    foliage = createFoliage(seed, terrain);
    actors = createActors(seed, terrain);
    scene.add(terrain.group, foliage.group, actors.group);
    colliders = foliage.colliders;
    minimap.rebuild(terrain);
    const waterMat = terrain.waterMesh.material as ShaderMaterial;
    waterMat.uniforms.uSun!.value = atmo.sunDir;
    pos.set(terrain.spawn.x, terrain.sample(terrain.spawn.x, terrain.spawn.z), terrain.spawn.z);
    yaw = terrain.spawn.yaw;
    pitch = -0.08;
    vy = 0;
    vx = 0;
    vz = 0;
  };

  show();
  setLoading(true, "Loading…");
  void (async () => {
    await nextPaint();
    await preloadModels(MODEL_LIST, (d, t) => setLoading(true, "Loading models…", t ? d / t : 1));
    if (!alive) return;
    setLoading(true, "Generating valley…");
    await nextPaint();
    build(seed);
    show();
    setLoading(false);
  })();

  const resize = () => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    weaponCam.aspect = camera.aspect;
    weaponCam.updateProjectionMatrix();
  };
  resize();

  const applySettings = () => {
    const cap = settings.quality === "low" ? 0.75 : settings.quality === "medium" ? 1.15 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    camera.fov = settings.fov;
    weaponCam.fov = settings.fov;
    resize();
    audio.setVolume(settings.volume);
    fpsEl.hidden = !settings.showFps;
    if (mmCanvas) mmCanvas.hidden = !settings.minimap;
  };
  applySettings();
  const unsubSettings = subscribeSettings(applySettings);
  const aq = createAdaptiveQuality({
    renderer,
    getMax: () => (settings.quality === "low" ? 0.75 : settings.quality === "medium" ? 1.15 : 1.75),
  });

  const requestLock = () => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof (p as Promise<void>).catch === "function") {
      (p as Promise<void>).catch(() => canvas.requestPointerLock());
    }
  };

  const startPlay = () => {
    audio.unlock();
    mode = "play";
    show();
    requestLock();
    say("The lake holds the light. Wolves do not.");
  };

  const hurtPlayer = (amount: number) => {
    if (mode !== "play") return;
    health = Math.max(0, health - amount);
    hurt = 0.45;
    dmg.classList.add("on");
    audio.hurt();
    buzz(60);
    if (health <= 0) {
      mode = "dead";
      document.exitPointerLock?.();
      if (deadLine) deadLine.textContent = `${kills} wolf${kills === 1 ? "" : "s"} down before the basin took you back.`;
      show();
    }
  };

  const setScoped = (on: boolean) => {
    scoped = on;
    if (scopeEl) scopeEl.hidden = !on;
    document.body.classList.toggle("is-scoped", on);
  };
  const toggleScope = () => {
    if (mode !== "play") return;
    setScoped(!scoped);
  };

  const tryReload = () => {
    if (mode !== "play" || reloading > 0 || mag >= 30 || reserve <= 0) return;
    reloading = 1.45;
    audio.reload();
    say("Reloading");
  };

  const fire = () => {
    if (!terrain || !actors || mode !== "play" || reloading > 0 || cooldown > 0) return;
    if (mag <= 0) {
      audio.dry();
      tryReload();
      return;
    }
    mag -= 1;
    cooldown = scoped ? 0.55 : 0.11;
    if (scoped) {
      spread = Math.min(0.012, spread + 0.0015);
      recoilP += 0.055 + Math.random() * 0.02;
      recoilY += (Math.random() - 0.5) * 0.018;
      kick = 0.14;
    } else {
      spread = Math.min(0.045, spread + 0.008);
      recoilP += 0.012 + Math.random() * 0.004;
      recoilY += (Math.random() - 0.5) * 0.006;
      kick = 0.07;
    }
    flash = 0.045;
    muzzle.visible = true;
    audio.shot();
    buzz(6);

    camera.updateMatrixWorld();
    ray.setFromCamera(CENTER, camera);
    const dir = ray.ray.direction;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const roots = actors.wolves.map((w) => w.root);
    const targets: Object3DList = [terrain.group, terrain.waterMesh, ...roots];
    const hits = ray.intersectObjects(targets, true);
    const hit = hits.find((h) => h.object !== terrain.waterMesh || h.point.y >= WATER - 0.2) ?? hits[0];
    if (!hit) return;

    let wolf: (typeof actors.wolves)[number] | undefined;
    let obj: { parent: typeof hit.object.parent; userData: typeof hit.object.userData } | null = hit.object;
    while (obj) {
      if (obj.userData.wolf) {
        wolf = obj.userData.wolf as (typeof actors.wolves)[number];
        break;
      }
      obj = obj.parent;
    }
    if (wolf && wolf.alive) {
      const part = hit.object.userData.part;
      wolf.hp -= part === "head" ? 28 : 16;
      wolf.flash = 1;
      audio.hit();
      cross.classList.add("is-hit");
      window.setTimeout(() => cross.classList.remove("is-hit"), 80);
      if (wolf.hp <= 0) {
        wolf.alive = false;
        wolf.deadFor = 0;
        kills += 1;
        say("Wolf down");
      }
    }
    const puff = puffs.find((p) => p.life <= 0);
    if (puff) {
      puff.life = 0.35;
      puff.mesh.visible = true;
      puff.mesh.position.copy(hit.point);
      puff.vx = (Math.random() - 0.5) * 1.5;
      puff.vy = 1.2 + Math.random();
      puff.vz = (Math.random() - 0.5) * 1.5;
    }
    const tracer = tracers.find((t) => t.life <= 0);
    if (tracer) {
      const mid = camera.position.clone().add(hit.point).multiplyScalar(0.5);
      tracer.mesh.visible = true;
      tracer.mesh.position.copy(mid);
      tracer.mesh.lookAt(hit.point);
      tracer.mesh.scale.set(1, 1, camera.position.distanceTo(hit.point));
      tracer.life = 0.06;
      tracer.mesh.material.opacity = 0.85;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyR") tryReload();
    if (e.code === "KeyQ" || e.code === "KeyC") toggleScope();
    if (e.code === "Escape" && mode === "play") {
      mode = "pause";
      document.exitPointerLock?.();
      show();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => {
    keys.clear();
    firing = false;
  };

  const onMouseDown = (e: MouseEvent) => {
    if (mode !== "play") return;
    if (e.button === 2) {
      e.preventDefault();
      toggleScope();
      return;
    }
    if (e.button !== 0) return;
    if (document.pointerLockElement === canvas) firing = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) firing = false;
  };
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas || mode !== "play") return;
    const sens = 0.00215 * settings.sens * (scoped ? 0.28 : 1);
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens * (settings.invertY ? -1 : 1);
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
    lookDx += e.movementX;
    lookDy += e.movementY;
  };
  const onLockChange = () => {
    if (document.pointerLockElement !== canvas && mode === "play" && !window.matchMedia("(pointer: coarse)").matches) {
      mode = "pause";
      firing = false;
      show();
    }
  };

  const pad = q("sw-pad") as HTMLElement;
  const onPadDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stickId = e.pointerId;
    const rect = pad.getBoundingClientRect();
    stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    pad.setPointerCapture(e.pointerId);
    touch.classList.add("is-on");
  };
  const onPadMove = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - stickOrigin.x;
    let dy = e.clientY - stickOrigin.y;
    const m = Math.hypot(dx, dy);
    const r = 46;
    if (m > r) {
      dx = (dx / m) * r;
      dy = (dy / m) * r;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stickS = dx / r;
    stickF = -dy / r;
  };
  const onPadUp = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stickF = 0;
    stickS = 0;
    knob.style.transform = "";
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touch.classList.add("is-on");
      if (lookId === null && e.clientX >= window.innerWidth * 0.42) {
        lookId = e.pointerId;
        lookLast = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    } else if (mode === "play" && document.pointerLockElement !== canvas) {
      requestLock();
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === lookId && mode === "play") {
      const sens = 0.0045 * settings.sens * (scoped ? 0.32 : 1);
      yaw -= (e.clientX - lookLast.x) * sens;
      pitch -= (e.clientY - lookLast.y) * sens * (settings.invertY ? -1 : 1);
      pitch = Math.max(-1.35, Math.min(1.35, pitch));
      lookDx += e.clientX - lookLast.x;
      lookDy += e.clientY - lookLast.y;
      lookLast = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === lookId) lookId = null;
  };

  const bindTap = (id: string, fn: (e: PointerEvent) => void) => {
    const el = q(id);
    el?.addEventListener("pointerdown", (ev) => {
      (ev as PointerEvent).preventDefault();
      fn(ev as PointerEvent);
    });
  };

  bindTap("sw-start", () => startPlay());
  bindTap("sw-continue", async () => {
    const s = loadGame();
    if (!s) return;
    setLoading(true, "Generating valley…");
    await nextPaint();
    build(s.seed);
    pos.set(s.x, s.y, s.z);
    yaw = s.yaw;
    health = Math.max(25, s.health);
    mag = s.mag;
    reserve = s.reserve;
    kills = s.kills;
    day = s.day;
    setLoading(false);
    startPlay();
  });
  bindTap("sw-resume", () => {
    mode = "play";
    show();
    requestLock();
  });
  bindTap("sw-new", async () => {
    setLoading(true, "Generating valley…");
    await nextPaint();
    build((Math.floor(Math.random() * 8000) + 1) >>> 0);
    health = 100;
    mag = 30;
    reserve = 90;
    kills = 0;
    mode = "play";
    setLoading(false);
    show();
    say("A new valley. Same rifle.");
    requestLock();
  });
  bindTap("sw-again", () => {
    if (!terrain) return;
    health = 100;
    mag = Math.max(mag, 12);
    pos.set(terrain.spawn.x, terrain.sample(terrain.spawn.x, terrain.spawn.z), terrain.spawn.z);
    yaw = terrain.spawn.yaw;
    vy = 0;
    mode = "play";
    show();
    requestLock();
  });
  bindTap("sw-phase", () => {
    phaseIdx = (phaseIdx + 1) % phases.length;
    day = phases[phaseIdx]!.t;
  });
  bindTap("sw-pause-open", () => {
    if (mode !== "play") return;
    mode = "pause";
    document.exitPointerLock?.();
    show();
  });
  const fireBtn = q("sw-fire");
  fireBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    firingTouch = true;
  });
  fireBtn?.addEventListener("pointerup", () => {
    firingTouch = false;
  });
  fireBtn?.addEventListener("pointercancel", () => {
    firingTouch = false;
  });
  bindTap("sw-jump", () => {
    jumpPulse = true;
  });
  bindTap("sw-reload", () => tryReload());
  bindTap("sw-zoom", () => toggleScope());
  bindTap("sw-sprint", () => {
    sprintTouch = !sprintTouch;
  });

  const onVisibility = () => {
    if (document.hidden && mode === "play") {
      mode = "pause";
      firing = false;
      firingTouch = false;
      document.exitPointerLock?.();
      show();
    }
  };
  const onPageHide = () => {
    if (mode === "play") persist();
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onLockChange);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  pad.addEventListener("pointerdown", onPadDown);
  pad.addEventListener("pointermove", onPadMove);
  pad.addEventListener("pointerup", onPadUp);
  pad.addEventListener("pointercancel", onPadUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", resize);

  window.__controlsTest = {
    getYaw: () => yaw,
    getSpeed: () => horiz,
    getPos: () => ({ x: pos.x, y: pos.y, z: pos.z }),
    setKeys: (codes: string[]) => {
      qaKeys = codes.length ? codes.slice() : null;
      if (!codes.length) keys.clear();
    },
  };

  let elapsed = 0;
  let fpsAcc = 0;
  let padFire = false;
  let lastStep = 0;
  let mmT = 0;
  let padSprint = false;
  let padReload = false;
  let fpsN = 0;
  let raf = 0;
  let alive = true;

  const step = (dt: number) => {
    if (!terrain || !actors) return;
    const playing = mode === "play";
    day = (day + dt / 240) % 1;
    const elev = Math.sin((day - 0.25) * Math.PI * 2);
    const night = 1 - Math.max(0, Math.min(1, (elev + 0.05) / 0.3));

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    let f = 0;
    let s = 0;
    if (playing) {
      f = (down("KeyW") || down("ArrowUp") ? 1 : 0) - (down("KeyS") || down("ArrowDown") ? 1 : 0) + stickF;
      s = (down("KeyD") || down("ArrowRight") ? 1 : 0) - (down("KeyA") || down("ArrowLeft") ? 1 : 0) + stickS;
    }
    const gp = playing ? readGamepad() : null;
    if (gp) {
      f += gp.f;
      s += gp.s;
      yaw -= gp.lookX * dt * 2.6 * settings.sens;
      pitch = Math.max(-1.35, Math.min(1.35, pitch - gp.lookY * dt * 2.2 * settings.sens * (settings.invertY ? -1 : 1)));
      if (gp.jump) jumpPulse = true;
      if (gp.reload && !padReload) tryReload();
    }
    padFire = !!gp && gp.fire;
    padSprint = !!gp && gp.sprint;
    padReload = !!gp && gp.reload;
    const magIn = Math.hypot(f, s);
    if (magIn > 1) {
      f /= magIn;
      s /= magIn;
    }
    const feetH = terrain.sample(pos.x, pos.z);
    const inWater = pos.y + 0.3 < WATER && feetH < WATER - 0.35;
    const sprint = playing && (down("ShiftLeft") || down("ShiftRight") || sprintTouch || padSprint) && !inWater && magIn > 0.2;
    const sp = inWater ? 3.6 : sprint ? 11.4 : 7.3;
    wish.copy(forward).multiplyScalar(f).addScaledVector(right, s);
    const rate = onGround ? 9 : 2.4;
    vx += (wish.x * sp - vx) * Math.min(1, rate * dt);
    vz += (wish.z * sp - vz) * Math.min(1, rate * dt);
    if (magIn < 0.08 && onGround) {
      const fr = Math.max(0, 1 - 10 * dt);
      vx *= fr;
      vz *= fr;
    }

    const tryAxis = (nx: number, nz: number) => {
      const g = terrain!.sample(nx, nz);
      if (g <= pos.y + 0.9) {
        pos.x = nx;
        pos.z = nz;
        if (onGround && g > pos.y) pos.y = g;
        return true;
      }
      return false;
    };
    if (playing) {
      const dx = vx * dt;
      const dz = vz * dt;
      if (!tryAxis(pos.x + dx, pos.z + dz)) {
        if (!tryAxis(pos.x + dx, pos.z)) tryAxis(pos.x, pos.z + dz);
      }
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i]!;
        const cdx = pos.x - c.x;
        const cdz = pos.z - c.z;
        const dist = Math.hypot(cdx, cdz);
        if (dist < c.r && dist > 0.0001) {
          pos.x += (cdx / dist) * (c.r - dist);
          pos.z += (cdz / dist) * (c.r - dist);
        }
      }
    }

    const spaceHeld = playing && down("Space");
    const wantJump = playing && (jumpPulse || (spaceHeld && !jumpLatch));
    jumpLatch = spaceHeld;
    jumpPulse = false;
    if (inWater) {
      vy += (WATER - 1.15 - pos.y) * dt * 6;
      vy *= 1 - Math.min(1, dt * 2.5);
      if (wantJump) vy = 3.4;
    } else {
      vy -= 26 * dt;
      if (wantJump && onGround) vy = 8.3;
    }
    if (playing) pos.y += vy * dt;
    const ground = terrain.sample(pos.x, pos.z);
    if (pos.y <= ground) {
      pos.y = ground;
      if (vy < 0) vy = 0;
      onGround = true;
    } else onGround = false;
    const limit = 242;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));

    horiz = Math.hypot(vx, vz);
    if (playing && horiz > 0.6 && onGround) bob += dt * horiz * 1.35;
    const stepIdx = Math.floor(bob / Math.PI);
    if (playing && horiz > 0.6 && onGround && stepIdx !== lastStep) {
      lastStep = stepIdx;
      audio.footstep(inWater ? "water" : feetH > 42 ? "snow" : feetH > 26 ? "rock" : feetH < WATER + 1.4 ? "dirt" : "grass", sprint);
    }
    if (playing) audio.ambience(dt, { night, altitude: Math.max(0, Math.min(1, feetH / 50)), inWater });
    mmT += dt;
    if (playing && terrain && mmT > 0.1) {
      mmT = 0;
      minimap.draw(pos.x, pos.z, yaw, actors);
    }
    const bobY = playing && onGround ? Math.sin(bob) * 0.035 : 0;
    recoilP += (0 - recoilP) * Math.min(1, dt * 8);
    recoilY += (0 - recoilY) * Math.min(1, dt * 8);
    const eye = 1.68;
    camera.position.set(pos.x, pos.y + eye + bobY, pos.z);
    camera.rotation.set(pitch + recoilP, yaw + recoilY, 0);
    // sniper scope FOV blend
    scopeT += ((scoped ? 1 : 0) - scopeT) * Math.min(1, dt * 10);
    const baseFov = settings.fov;
    const zoomFov = 14;
    const fovNow = baseFov + (zoomFov - baseFov) * scopeT;
    if (Math.abs(camera.fov - fovNow) > 0.05) {
      camera.fov = fovNow;
      camera.updateProjectionMatrix();
      weaponCam.fov = fovNow;
      weaponCam.updateProjectionMatrix();
    }
    // hide viewmodel when deeply scoped
    gun.visible = scopeT < 0.65;

    lookDx *= Math.max(0, 1 - dt * 8);
    lookDy *= Math.max(0, 1 - dt * 8);
    kick += (0 - kick) * Math.min(1, dt * 10);
    gun.position.set(0.28 + lookDx * -0.00015, -0.28 + bobY * 0.8 + lookDy * -0.0001, -0.48 - kick);
    gun.rotation.set(lookDy * 0.0004, lookDx * -0.0004, 0);
    if (flash > 0) {
      flash -= dt;
      muzzle.visible = flash > 0;
    }

    cooldown = Math.max(0, cooldown - dt);
    spread = Math.max(0.002, spread - dt * 0.02);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) {
        const need = 30 - mag;
        const take = Math.min(need, reserve);
        mag += take;
        reserve -= take;
        say("Magazine seated");
      }
    }
    if (playing && (firing || firingTouch || padFire)) fire();

    actors.update(dt, pos.x, pos.z, pos.y, night);
    if (playing) {
      for (const w of actors.wolves) {
        if (w.pendingBite > 0) {
          hurtPlayer(9 * w.pendingBite);
          w.pendingBite = 0;
          say("Teeth");
        }
      }
      for (const crate of actors.crates) {
        if (!crate.alive) continue;
        if (Math.hypot(crate.x - pos.x, crate.z - pos.z) < 2.1 && Math.abs(terrain.sample(crate.x, crate.z) - pos.y) < 2) {
          crate.alive = false;
          crate.wait = 22;
          crate.root.visible = false;
          reserve = Math.min(180, reserve + 36);
          audio.pickup();
          say("Rifle rounds");
        }
      }
      if (hurt > 0) hurt = Math.max(0, hurt - dt);
      else if (health > 0 && health < 100) health = Math.min(100, health + dt * 3);
      if (hurt <= 0) dmg.classList.remove("on");
    }

    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= dt * 4;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const s = Math.max(0.2, p.life * 3);
      p.mesh.scale.setScalar(s);
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      tracerMat.opacity = Math.max(0, t.life * 12);
      if (t.life <= 0) t.mesh.visible = false;
    }

    atmo.update(day, camera.position, dt);
    const waterMat = terrain.waterMesh.material as ShaderMaterial;
    waterMat.uniforms.uTime!.value = elapsed;
    waterMat.uniforms.uSunI!.value = atmo.sunIntensity;
    (waterMat.uniforms.uSunColor!.value as { copy: (c: unknown) => void }).copy(atmo.sunColor);

    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) msgEl.classList.remove("on");
    }
    const mins = Math.floor((((day % 1) + 1) % 1) * 24 * 60);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    clock.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    let deg = ((-yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    bearing.textContent = names[Math.round(deg / 45) % 8] ?? "N";
    place.textContent = placeName(pos.x, pos.z, pos.y);
    const wrapped = ((day % 1) + 1) % 1;
    phaseBtn.textContent =
      wrapped < 0.18 || wrapped > 0.9 ? "Night" : wrapped < 0.4 ? "Morning" : wrapped < 0.62 ? "Noon" : "Dusk";
    killsEl.textContent = `${kills} down`;
    const hp = Math.max(0, health);
    hpEl.style.transform = `scaleX(${hp / 100})`;
    hpEl.classList.toggle("low", hp < 35);
    magEl.textContent = String(mag);
    resEl.textContent = reloading > 0 ? "Reloading" : `${reserve} held`;
  };

  const frame = (t: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    timer.update(t);
    const dt = Math.min(0.05, timer.getDelta());
    elapsed += dt;
    fpsAcc += dt;
    fpsN += 1;
    if (fpsAcc >= 0.5) {
      if (settings.showFps) fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps`;
      fpsAcc = 0;
      fpsN = 0;
    }
    if (mode === "play") aq.tick(dt);
    step(dt);
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCam);
    renderer.autoClear = true;
  };
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    unsubSettings();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    cancelAnimationFrame(raf);
    timer.disconnect();
    clearWorld();
    audio.stop();
    renderer.dispose();
    puffGeo.dispose();
    puffMat.dispose();
    tracerGeo.dispose();
    tracerMat.dispose();
    metal.dispose();
    stockMat.dispose();
    rubber.dispose();
    flashMat.dispose();
    gun.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", resize);
    document.removeEventListener("pointerlockchange", onLockChange);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("contextmenu", (e) => e.preventDefault());
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    pad.removeEventListener("pointerdown", onPadDown);
    pad.removeEventListener("pointermove", onPadMove);
    pad.removeEventListener("pointerup", onPadUp);
    pad.removeEventListener("pointercancel", onPadUp);
    canvas.remove();
    if (window.__controlsTest?.getYaw === window.__controlsTest?.getYaw) delete window.__controlsTest;
    atmo.dispose();
  };
}

type Object3DList = Parameters<Raycaster["intersectObjects"]>[0];
