import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  SphereGeometry,
} from "three";
import { hash2 } from "./noise";
import { LAKE, WATER, WORLD, type Terrain } from "./terrain";

export type Wolf = {
  root: Group;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  bite: number;
  pendingBite: number;
  flash: number;
  deadFor: number;
  phase: number;
  wander: number;
  legs: Object3D[];
  tail: Object3D;
  mats: MeshLambertMaterial[];
};

export type Crate = { root: Group; x: number; z: number; alive: boolean; wait: number };

export type Actors = {
  group: Group;
  wolves: Wolf[];
  crates: Crate[];
  update: (dt: number, px: number, pz: number, py: number, night: number) => void;
  dispose: () => void;
};

const legGeo = new BoxGeometry(0.12, 0.48, 0.12);
const bodyGeo = new BoxGeometry(0.42, 0.36, 1.2);
const headGeo = new BoxGeometry(0.28, 0.24, 0.4);
const earGeo = new ConeGeometry(0.06, 0.16, 4);
const tailGeo = new CylinderGeometry(0.04, 0.07, 0.55, 5);
const eyeGeo = new SphereGeometry(0.035, 6, 5);
const boxGeo = new BoxGeometry(0.7, 0.45, 0.5);
const flameGeo = new ConeGeometry(0.18, 0.55, 6);
const logGeo = new CylinderGeometry(0.08, 0.1, 0.7, 5);

function makeWolf(tint: number): Wolf {
  const root = new Group();
  const mats: MeshLambertMaterial[] = [];
  const mat = (color: number) => {
    const m = new MeshLambertMaterial({ color, emissive: 0xfff1e4, emissiveIntensity: 0 });
    mats.push(m);
    return m;
  };
  const body = new Mesh(bodyGeo, mat(tint));
  body.position.set(0, 0.72, 0);
  body.castShadow = false;
  const head = new Mesh(headGeo, mat(tint));
  head.position.set(0, 0.86, -0.62);
  head.userData.part = "head";
  const earL = new Mesh(earGeo, mat(0x2a2420));
  earL.position.set(-0.08, 1.05, -0.62);
  const earR = earL.clone();
  earR.position.x = 0.08;
  const eyeMat = new MeshBasicMaterial({ color: 0xf0d78a });
  const eyeL = new Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 0.9, -0.82);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;
  const legs: Object3D[] = [];
  const spots: [number, number][] = [
    [-0.14, -0.38],
    [0.14, -0.38],
    [-0.14, 0.38],
    [0.14, 0.38],
  ];
  for (const [x, z] of spots) {
    const pivot = new Group();
    pivot.position.set(x, 0.62, z);
    const leg = new Mesh(legGeo, mat(tint));
    leg.position.y = -0.22;
    pivot.add(leg);
    legs.push(pivot);
    root.add(pivot);
  }
  const tail = new Group();
  tail.position.set(0, 0.78, 0.62);
  const tailMesh = new Mesh(tailGeo, mat(tint));
  tailMesh.rotation.x = 0.8;
  tailMesh.position.z = 0.2;
  tail.add(tailMesh);
  root.add(body, head, earL, earR, eyeL, eyeR, tail);
  const wolf: Wolf = {
    root,
    x: 0,
    z: 0,
    yaw: 0,
    hp: 45,
    alive: true,
    bite: 0,
    pendingBite: 0,
    flash: 0,
    deadFor: 0,
    phase: Math.random() * 6,
    wander: Math.random() * 4,
    legs,
    tail,
    mats,
  };
  root.userData.wolf = wolf;
  root.traverse((o) => {
    o.userData.wolf = wolf;
  });
  return wolf;
}

function placeOnLand(terrain: Terrain, x: number, z: number): { x: number; z: number } | null {
  for (let k = 0; k < 8; k++) {
    const a = hash2(Math.floor(x + k * 13), Math.floor(z), k + 3) * Math.PI * 2;
    const xx = x + Math.cos(a) * k * 4;
    const zz = z + Math.sin(a) * k * 4;
    if (Math.abs(xx) > WORLD * 0.42 || Math.abs(zz) > WORLD * 0.42) continue;
    const h = terrain.sample(xx, zz);
    const slope = Math.hypot(terrain.sample(xx + 2, zz) - h, terrain.sample(xx, zz + 2) - h);
    if (h > WATER + 1.2 && h < 28 && slope < 0.8) return { x: xx, z: zz };
  }
  return null;
}

export function createActors(seed: number, terrain: Terrain): Actors {
  const group = new Group();
  const wolves: Wolf[] = [];
  const geos: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const tint = 0x3a332e + ((i * 0x070605) & 0x1a140e);
    const w = makeWolf(tint);
    const ang = (i / 9) * Math.PI * 2 + 0.4;
    const rad = 28 + (i % 4) * 16;
    const spot =
      placeOnLand(terrain, LAKE.x + Math.cos(ang) * (LAKE.r + rad), LAKE.z + Math.sin(ang) * (LAKE.r + rad * 0.8)) ??
      placeOnLand(terrain, 20 + i * 8, -30);
    if (!spot) continue;
    w.x = spot.x;
    w.z = spot.z;
    w.root.position.set(spot.x, terrain.sample(spot.x, spot.z), spot.z);
    wolves.push(w);
    group.add(w.root);
  }

  const crates: Crate[] = [];
  const wood = new MeshLambertMaterial({ color: 0x7a5a38 });
  const brass = new MeshLambertMaterial({ color: 0xc8923e, emissive: 0x6a4a16, emissiveIntensity: 0.4 });
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.2;
    const spot = placeOnLand(
      terrain,
      LAKE.x + Math.cos(ang) * (LAKE.r + 26 + (i % 3) * 10),
      LAKE.z + Math.sin(ang) * (LAKE.r + 22),
    );
    if (!spot) continue;
    const root = new Group();
    const base = new Mesh(boxGeo, wood);
    base.position.y = 0.28;
    const lid = new Mesh(boxGeo, brass);
    lid.scale.set(0.72, 0.28, 0.72);
    lid.position.y = 0.58;
    root.add(base, lid);
    const y = terrain.sample(spot.x, spot.z);
    root.position.set(spot.x, y, spot.z);
    root.rotation.y = ang;
    group.add(root);
    crates.push({ root, x: spot.x, z: spot.z, alive: true, wait: 0 });
  }

  const fire = new Group();
  const stone = new MeshLambertMaterial({ color: 0x646862 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new Mesh(new SphereGeometry(0.18, 6, 5), stone);
    s.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
    fire.add(s);
    geos.push(s.geometry);
  }
  const logM = new MeshLambertMaterial({ color: 0x4a3424 });
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(logGeo, logM);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = (i / 3) * Math.PI;
    m.position.y = 0.16;
    fire.add(m);
  }
  const flameMat = new MeshBasicMaterial({ color: 0xff8a32 });
  const flame = new Mesh(flameGeo, flameMat);
  flame.position.y = 0.5;
  const flame2 = new Mesh(flameGeo, new MeshBasicMaterial({ color: 0xffd27a }));
  flame2.position.y = 0.62;
  flame2.scale.setScalar(0.55);
  fire.add(flame, flame2);
  const light = new PointLight(0xff9440, 7, 16, 2);
  light.position.y = 0.8;
  fire.add(light);
  const sx = terrain.spawn.x + Math.cos(terrain.spawn.yaw) * 3.4;
  const sz = terrain.spawn.z - Math.sin(terrain.spawn.yaw) * 3.4;
  fire.position.set(sx, terrain.sample(sx, sz), sz);
  group.add(fire);

  const birds: { mesh: Mesh; ang: number; rad: number; y: number; speed: number }[] = [];
  const wing = new MeshBasicMaterial({ color: 0x1c2420, side: 2 });
  for (let i = 0; i < 7; i++) {
    const geo = new BufferGeometry();
    const verts = new Float32Array([
      0, 0, 0, 1.1, 0.05, 0, 0.15, 0, 0.15, 0, 0, 0, -1.1, 0.05, 0, -0.15, 0, 0.15,
    ]);
    geo.setAttribute("position", new BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, wing);
    birds.push({
      mesh,
      ang: (i / 7) * Math.PI * 2,
      rad: 40 + (i % 3) * 14,
      y: 26 + (i % 4) * 4,
      speed: 0.18 + (i % 3) * 0.05,
    });
    group.add(mesh);
    geos.push(geo);
  }

  const flyCount = 70;
  const flyPos = new Float32Array(flyCount * 3);
  for (let i = 0; i < flyCount; i++) {
    const a = hash2(i, seed, 4) * Math.PI * 2;
    const r = 8 + hash2(i, seed, 5) * 26;
    const fx = terrain.spawn.x + Math.cos(a) * r;
    const fz = terrain.spawn.z + Math.sin(a) * r;
    flyPos[i * 3] = fx;
    flyPos[i * 3 + 1] = terrain.sample(fx, fz) + 0.6 + hash2(i, 2, 6) * 1.6;
    flyPos[i * 3 + 2] = fz;
  }
  const flyGeo = new BufferGeometry();
  flyGeo.setAttribute("position", new BufferAttribute(flyPos, 3));
  const flyMat = new PointsMaterial({
    color: 0xd6e39a,
    size: 0.18,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const flies = new Points(flyGeo, flyMat);
  group.add(flies);

  const update = (dt: number, px: number, pz: number, py: number, night: number) => {
    const flicker = 5.5 + Math.sin(performance.now() * 0.018) * 1.6 + Math.sin(performance.now() * 0.041) * 0.8;
    light.intensity = flicker;
    flame.scale.y = 0.85 + Math.sin(performance.now() * 0.012) * 0.2;
    flyMat.opacity = night * 0.9;

    for (const b of birds) {
      b.ang += dt * b.speed;
      const x = LAKE.x + Math.cos(b.ang) * b.rad;
      const z = LAKE.z + Math.sin(b.ang) * b.rad * 0.75;
      b.mesh.position.set(x, b.y + Math.sin(b.ang * 3) * 1.5, z);
      b.mesh.lookAt(x - Math.sin(b.ang), b.mesh.position.y, z - Math.cos(b.ang));
      const flap = Math.sin(performance.now() * 0.01 + b.ang) * 0.4;
      b.mesh.rotation.z = flap;
    }

    for (const w of wolves) {
      w.bite = Math.max(0, w.bite - dt);
      w.flash = Math.max(0, w.flash - dt * 3);
      for (const m of w.mats) m.emissiveIntensity = w.flash;
      if (!w.alive) {
        w.deadFor += dt;
        w.root.rotation.z += (1.35 - w.root.rotation.z) * Math.min(1, dt * 4);
        w.root.position.y = terrain.sample(w.x, w.z) + 0.15;
        if (w.deadFor > 8) respawn(w, terrain, px, pz);
        continue;
      }
      w.root.rotation.z = 0;
      const dx = px - w.x;
      const dz = pz - w.z;
      const dist = Math.hypot(dx, dz);
      const aggro = (night > 0.45 ? 52 : 34) + night * 8;
      const chase = dist < aggro && Math.abs(terrain.sample(w.x, w.z) - py) < 10;
      let speed = 0;
      if (chase) {
        w.yaw = Math.atan2(-dx, -dz);
        speed = (night > 0.45 ? 5.4 : 4.1) * (dist < 8 ? 1.15 : 1);
      } else {
        w.wander -= dt;
        if (w.wander <= 0) {
          w.wander = 2 + hash2(Math.floor(w.x), Math.floor(performance.now()), 2) * 3;
          w.yaw += (hash2(Math.floor(w.z), seed, 9) - 0.5) * 2.2;
        }
        speed = 1.35;
      }
      const nx = w.x + -Math.sin(w.yaw) * speed * dt;
      const nz = w.z + -Math.cos(w.yaw) * speed * dt;
      const gh = terrain.sample(nx, nz);
      const slope = gh - terrain.sample(w.x, w.z);
      if (gh > WATER + 0.7 && gh < 32 && slope < 1.1 && Math.abs(nx) < WORLD * 0.46 && Math.abs(nz) < WORLD * 0.46) {
        w.x = nx;
        w.z = nz;
      } else w.yaw += 1.4 * dt;
      const gy = terrain.sample(w.x, w.z);
      w.root.position.set(w.x, gy, w.z);
      w.root.rotation.y = w.yaw;
      w.phase += dt * (3 + speed);
      w.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(w.phase + (i < 2 ? 0 : Math.PI)) * 0.55 * Math.min(1, speed);
      });
      w.tail.rotation.y = Math.sin(w.phase * 0.7) * 0.3;
      if (chase && dist < 2.05 && Math.abs(gy - py) < 2.2 && w.bite <= 0) {
        w.bite = 0.95;
        w.pendingBite += 1;
      }
    }

    for (const crate of crates) {
      if (!crate.alive) {
        crate.wait -= dt;
        if (crate.wait <= 0) {
          crate.alive = true;
          crate.root.visible = true;
        }
      } else {
        const pulse = 0.25 + Math.sin(performance.now() * 0.004) * 0.15;
        brass.emissiveIntensity = pulse;
      }
    }
  };

  return {
    group,
    wolves,
    crates,
    update,
    dispose: () => {
      group.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.material && !Array.isArray(mesh.material)) {
          const mat = mesh.material as MeshLambertMaterial;
          if (mat.dispose) mat.dispose();
        }
      });
      geos.forEach((g) => g.dispose());
      flyGeo.dispose();
      flyMat.dispose();
      wood.dispose();
      brass.dispose();
      flameMat.dispose();
      stone.dispose();
      logM.dispose();
      wing.dispose();
    },
  };
}

function respawn(w: Wolf, terrain: Terrain, px: number, pz: number) {
  for (let i = 0; i < 12; i++) {
    const ang = hash2(i, Math.floor(px), Math.floor(w.deadFor * 10)) * Math.PI * 2;
    const rad = 40 + i * 6;
    const spot = placeOnLand(terrain, px + Math.cos(ang) * rad, pz + Math.sin(ang) * rad);
    if (!spot) continue;
    if (Math.hypot(spot.x - px, spot.z - pz) < 30) continue;
    w.x = spot.x;
    w.z = spot.z;
    w.hp = 45;
    w.alive = true;
    w.deadFor = 0;
    w.root.visible = true;
    w.root.rotation.z = 0;
    return;
  }
}
