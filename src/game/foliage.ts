import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash2 } from "./noise";
import { LAKE, WATER, WORLD, type Terrain } from "./terrain";

export type Collider = { x: number; z: number; r: number };

export type Foliage = {
  group: Group;
  colliders: Collider[];
  dispose: () => void;
};

const c = new Color();

function painted(src: BufferGeometry, color: number, m: Matrix4): BufferGeometry {
  // mergeGeometries needs identical attributes: make every part non-indexed and drop uv
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute("uv");
  g.applyMatrix4(m);
  const n = g.attributes.position?.count ?? 0;
  const cols = new Float32Array(n * 3);
  c.set(color);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function mat4(
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, 0, 0)),
    new Vector3(sx, sy, sz),
  );
}

function kind(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("foliage merge failed");
  return merged;
}

export function createFoliage(seed: number, terrain: Terrain): Foliage {
  const cy = new CylinderGeometry(1, 1, 1, 7);
  const co = new ConeGeometry(1, 1, 8);
  const ico = new IcosahedronGeometry(1, 1);
  const ico0 = new IcosahedronGeometry(1, 0);
  const dod = new DodecahedronGeometry(1, 0);
  const ball = new SphereGeometry(1, 6, 5);

  const pine = kind([
    painted(cy, 0x5a3b28, mat4(0, 1.2, 0, 0.22, 2.4, 0.26)),
    painted(co, 0x1d5a34, mat4(0, 2.7, 0, 1.55, 2.5, 1.55)),
    painted(co, 0x246b3c, mat4(0, 3.85, 0, 1.15, 2.05, 1.15)),
    painted(co, 0x2c7a46, mat4(0, 4.9, 0, 0.72, 1.55, 0.72)),
  ]);
  const oak = kind([
    painted(cy, 0x5c4030, mat4(0, 1.15, 0, 0.28, 2.3, 0.32)),
    painted(ico, 0x3d7a32, mat4(0, 3.15, 0, 1.35, 1.05, 1.25)),
    painted(ico, 0x4c8f3b, mat4(1.05, 2.85, 0.3, 0.95, 0.8, 0.9)),
    painted(ico, 0x356b2c, mat4(-0.95, 2.95, -0.35, 0.9, 0.78, 0.85)),
    painted(ico, 0x5aa244, mat4(0.1, 4.05, 0.1, 0.8, 0.65, 0.75)),
  ]);
  const bush = kind([
    painted(ico0, 0x3c7630, mat4(0, 0.55, 0, 0.85, 0.62, 0.8)),
    painted(ico0, 0x4d8a38, mat4(0.55, 0.4, 0.2, 0.55, 0.45, 0.5)),
    painted(ico0, 0x2f6328, mat4(-0.45, 0.38, -0.15, 0.48, 0.4, 0.48)),
  ]);
  const rock = kind([
    painted(dod, 0x8b908a, mat4(0, 0.45, 0, 1.1, 0.72, 0.95)),
    painted(ico0, 0x6d726e, mat4(0.7, 0.28, 0.25, 0.55, 0.4, 0.5)),
  ]);
  const tuft = kind([
    painted(co, 0x6aaa44, mat4(0, 0.38, 0, 0.12, 0.76, 0.12)),
    painted(co, 0x7cbc52, mat4(0.16, 0.3, 0.06, 0.09, 0.62, 0.09)),
    painted(co, 0x588e38, mat4(-0.14, 0.28, -0.05, 0.08, 0.58, 0.08)),
  ]);
  const reed = kind([
    painted(cy, 0x2f6a3a, mat4(0, 0.7, 0, 0.035, 1.4, 0.035)),
    painted(co, 0x8f6a32, mat4(0, 1.45, 0, 0.08, 0.28, 0.08)),
  ]);
  const flower = kind([
    painted(ball, 0xe7d27a, mat4(0, 0.35, 0, 0.12, 0.1, 0.12)),
    painted(cy, 0x3e7a34, mat4(0, 0.16, 0, 0.02, 0.32, 0.02)),
  ]);
  const log = kind([painted(cy, 0x6a4a32, mat4(0, 0.22, 0, 0.22, 1.8, 0.22, Math.PI / 2))]);

  cy.dispose();
  co.dispose();
  ico.dispose();
  ico0.dispose();
  dod.dispose();
  ball.dispose();

  const mat = new MeshLambertMaterial({ vertexColors: true });
  const limits = { pine: 520, oak: 380, bush: 640, rock: 420, tuft: 2600, reed: 480, flower: 280, log: 40 };
  const meshes: Record<keyof typeof limits, InstancedMesh> = {
    pine: new InstancedMesh(pine, mat, limits.pine),
    oak: new InstancedMesh(oak, mat, limits.oak),
    bush: new InstancedMesh(bush, mat, limits.bush),
    rock: new InstancedMesh(rock, mat, limits.rock),
    tuft: new InstancedMesh(tuft, mat, limits.tuft),
    reed: new InstancedMesh(reed, mat, limits.reed),
    flower: new InstancedMesh(flower, mat, limits.flower),
    log: new InstancedMesh(log, mat, limits.log),
  };
  (Object.keys(meshes) as (keyof typeof limits)[]).forEach((k) => {
    meshes[k].count = 0;
    meshes[k].frustumCulled = false;
  });

  const dummy = new Object3D();
  const tint = new Color();
  const counts = { pine: 0, oak: 0, bush: 0, rock: 0, tuft: 0, reed: 0, flower: 0, log: 0 };
  const colliders: Collider[] = [];

  const put = (key: keyof typeof limits, x: number, y: number, z: number, s: number, rot: number, sy = 1) => {
    const mesh = meshes[key];
    const i = counts[key];
    if (i >= limits[key]) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(key === "log" ? 0 : (hash2(Math.floor(x), Math.floor(z), seed + 4) - 0.5) * 0.08, rot, 0);
    dummy.scale.set(s, s * sy, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const shade = 0.84 + hash2(Math.floor(x * 3), Math.floor(z * 3), seed + 8) * 0.28;
    tint.setRGB(shade, shade, shade);
    if (key === "flower") {
      const pick = hash2(Math.floor(x), Math.floor(z), 99);
      tint.set(pick > 0.66 ? 0xf0f2ea : pick > 0.33 ? 0xe7d27a : 0xd7b0c4);
    }
    mesh.setColorAt(i, tint);
    counts[key] = i + 1;
  };

  const half = WORLD / 2 - 8;
  for (let gx = -half; gx < half; gx += 4.6) {
    for (let gz = -half; gz < half; gz += 4.6) {
      const jx = (hash2(gx, gz, seed + 1) - 0.5) * 4;
      const jz = (hash2(gx, gz, seed + 2) - 0.5) * 4;
      const x = gx + jx;
      const z = gz + jz;
      const h = terrain.sample(x, z);
      const above = h - WATER;
      if (above < 0.8) continue;
      const slope = Math.hypot(terrain.sample(x + 1.5, z) - h, terrain.sample(x, z + 1.5) - h);
      const r = hash2(Math.floor(gx), Math.floor(gz), seed + 40);
      const forest = fbmLite(x, z, seed);
      const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);

      if (slope > 1.05 || above > 34) {
        if (r < 0.55) put("rock", x, h - 0.15, z, 0.7 + r * 2.4, r * 6.2, 0.7 + r);
        continue;
      }
      if (above < 1.5 && lakeD < LAKE.r + 18 && r < 0.45) {
        put("reed", x, h, z, 0.8 + r, r * 6);
        continue;
      }
      const treeChance = forest > 0.48 ? 0.55 : forest > 0.36 ? 0.16 : 0.03;
      if (slope < 0.72 && above < 30 && r < treeChance) {
        const piney = above > 14 || forest > 0.62;
        const s = 0.75 + hash2(Math.floor(x), Math.floor(z), seed + 6) * 0.7;
        put(piney ? "pine" : "oak", x, h - 0.05, z, s, r * 6.28, 0.85 + hash2(x, z, 12) * 0.35);
        colliders.push({ x, z, r: 0.55 * s });
      } else if (r < treeChance + 0.14 && slope < 0.8) {
        put("bush", x, h, z, 0.7 + r * 1.3, r * 6);
        colliders.push({ x, z, r: 0.45 });
      } else if (r > 0.92 && slope < 0.6) {
        put("rock", x, h - 0.1, z, 0.45 + r, r * 4);
        colliders.push({ x, z, r: 0.6 });
      } else if (r > 0.86 && above < 18 && slope < 0.4) {
        put("flower", x, h, z, 0.8 + r, r * 3);
      }
      if (hash2(gx, gz, seed + 70) < 0.04 && slope < 0.45 && above > 2 && above < 20) {
        put("log", x, h, z, 0.8 + r * 0.6, r * 6.2);
        colliders.push({ x, z, r: 0.7 });
      }
    }
  }

  for (let gx = -half; gx < half; gx += 2.15) {
    for (let gz = -half; gz < half; gz += 2.15) {
      const r = hash2(gx, gz, seed + 60);
      if (r > 0.55) continue;
      const x = gx + r * 1.6;
      const z = gz + hash2(gx, gz, seed + 61) * 1.6;
      const h = terrain.sample(x, z);
      const above = h - WATER;
      const slope = Math.hypot(terrain.sample(x + 1, z) - h, terrain.sample(x, z + 1) - h);
      if (above > 1.1 && above < 28 && slope < 0.65) {
        put("tuft", x, h, z, 0.7 + r * 1.4, r * 6, 0.8 + r);
      }
    }
  }

  const group = new Group();
  (Object.keys(meshes) as (keyof typeof limits)[]).forEach((k) => {
    const mesh = meshes[k];
    mesh.count = counts[k];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  });

  return {
    group,
    colliders,
    dispose: () => {
      mat.dispose();
      pine.dispose();
      oak.dispose();
      bush.dispose();
      rock.dispose();
      tuft.dispose();
      reed.dispose();
      flower.dispose();
      log.dispose();
    },
  };
}

function fbmLite(x: number, z: number, seed: number): number {
  return (
    hash2(Math.floor(x * 0.04), Math.floor(z * 0.04), seed + 5) * 0.55 +
    hash2(Math.floor(x * 0.01), Math.floor(z * 0.01), seed + 8) * 0.45
  );
}
