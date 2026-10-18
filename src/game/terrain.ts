import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { fbm, lerp, ridged, smoothstep } from "./noise";

export const WORLD = 500;
export const WATER = 7.4;
export const LAKE = { x: -52, z: 16, r: 76 };

const RES = 200;
const CELL = WORLD / RES;

export type Terrain = {
  group: Group;
  sample: (x: number, z: number) => number;
  spawn: { x: number; z: number; yaw: number };
  waterMesh: Mesh;
  dispose: () => void;
};

type River = { x: number; z: number }[];

function heightFn(x: number, z: number, seed: number, river: River): number {
  const warpX = fbm(x * 0.0028, z * 0.0028, seed + 2, 3);
  const warpZ = fbm(x * 0.0028 + 5.2, z * 0.0028, seed + 6, 3);
  const cont = fbm(x * 0.0034 + warpX * 0.6, z * 0.0034 + warpZ * 0.6, seed, 5);
  const detail = fbm(x * 0.014, z * 0.014, seed + 11, 3);
  const ridge = ridged(x * 0.0042 + warpX, z * 0.0042 + warpZ * 0.8, seed + 9);

  let h = 9.5 + cont * 12 + (detail - 0.5) * 3.2;
  const dist = Math.hypot(x - LAKE.x, z - LAKE.z);
  const ring = smoothstep(LAKE.r + 18, LAKE.r + 175, dist);
  h += Math.pow(ridge, 1.55) * (6 + ring * 46);

  const px = x - -168;
  const pz = z - -96;
  h += Math.exp(-(px * px + pz * pz) / (78 * 78)) * 36;
  const qx = x - 150;
  const qz = z - 120;
  h += Math.exp(-(qx * qx + qz * qz) / (64 * 64)) * 22;

  const bowl = 1 - smoothstep(LAKE.r * 0.22, LAKE.r, dist);
  const floor = WATER - 5.8 + fbm(x * 0.02, z * 0.02, seed + 4, 2) * 1.6;
  h = h * (1 - bowl) + floor * bowl;

  let bestD = 1e9;
  let bestT = 0;
  for (let i = 0; i < river.length - 1; i++) {
    const a = river[i]!;
    const b = river[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const ab2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / ab2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < bestD) {
      bestD = d;
      bestT = (i + t) / (river.length - 1);
    }
  }
  const width = lerp(7, 15, bestT);
  if (bestD < width) {
    const bed = lerp(24, WATER - 1.35, bestT);
    const k = smoothstep(width, width * 0.22, bestD);
    h = lerp(h, Math.min(h, bed), k);
  }

  const ex = Math.abs(x) / (WORLD * 0.5);
  const ez = Math.abs(z) / (WORLD * 0.5);
  const edge = Math.max(smoothstep(0.8, 1, ex), smoothstep(0.8, 1, ez));
  h = lerp(h, 62 + ridge * 18, edge);
  return h;
}

function albedo(h: number, steep: number, x: number, z: number, seed: number, out: Color): void {
  const n = fbm(x * 0.018, z * 0.018, seed + 21, 3);
  const micro = fbm(x * 0.07, z * 0.07, seed + 33, 2);
  const snowLine = 43 + n * 7;
  if (h < WATER - 2.4) {
    out.set(0x14383c).lerp(tmp.set(0x0e2c30), n);
    return;
  }
  if (h < WATER + 0.35) {
    out.set(0xcbb892).lerp(tmp.set(0xdfd2a6), micro);
    return;
  }
  if (h < WATER + 2.1 && steep < 0.55) {
    out.set(0xd8c59a).lerp(tmp.set(0x6d9444), smoothstep(WATER + 0.4, WATER + 2.1, h));
    return;
  }
  if (steep > 0.48 || h > snowLine - 6) {
    if (h > snowLine && steep < 0.85) {
      out.set(0xe7eef1).lerp(tmp.set(0xd5e0e8), micro);
      return;
    }
    out.set(0x6e726e).lerp(tmp.set(0x8a877f), n * 0.7);
    if (steep > 0.7) out.lerp(tmp.set(0x55585a), smoothstep(0.7, 1.05, steep));
    return;
  }
  const dry = smoothstep(16, 34, h);
  out.set(0x3f7d34).lerp(tmp.set(0x6d9444), n);
  out.lerp(tmp.set(0x8a8646), dry * 0.65);
  if (micro > 0.62) out.lerp(tmp.set(0x6b5340), (micro - 0.62) * 1.4);
}

const tmp = new Color();

const waterVert = /* glsl */ `
attribute float shore;
varying float vShore;
varying vec3 vWorld;
uniform float uTime;
#include <common>
#include <fog_pars_vertex>
void main() {
  vShore = shore;
  vec3 p = position;
  float swell = sin(p.x * 0.16 + uTime * 1.25) * 0.09 + cos(p.z * 0.13 + uTime * 1.05) * 0.07;
  swell += sin((p.x + p.z) * 0.07 + uTime * 0.7) * 0.05;
  p.y += swell * (0.45 + shore);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const waterFrag = /* glsl */ `
precision highp float;
varying float vShore;
varying vec3 vWorld;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uSunI;
uniform float uTime;
#include <common>
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
#include <fog_pars_fragment>
void main() {
  vec3 dx = dFdx(vWorld);
  vec3 dy = dFdy(vWorld);
  vec3 N = cross(dx, dy);
  if (dot(N, N) < 1e-8) N = vec3(0.0, 1.0, 0.0);
  else N = normalize(N);
  if (N.y < 0.0) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  vec3 deep = vec3(0.03, 0.16, 0.18);
  vec3 shallow = vec3(0.20, 0.42, 0.38);
  vec3 col = mix(shallow, deep, clamp(vShore, 0.0, 1.0));
  col = mix(col, vec3(0.62, 0.78, 0.76), fres * 0.5);
  float foamN = sin(vWorld.x * 0.85 + uTime * 2.1) * sin(vWorld.z * 0.72 - uTime * 1.5);
  float foam = smoothstep(0.25, 0.92, 1.0 - vShore) * smoothstep(0.15, 0.85, foamN * 0.5 + 0.5);
  col = mix(col, vec3(0.82, 0.88, 0.84), foam * 0.72);
  vec3 R = reflect(-normalize(uSun), N);
  float spec = pow(max(dot(R, V), 0.0), 70.0);
  col += uSunColor * spec * uSunI * 0.9;
  float alpha = 0.62 + vShore * 0.28 + fres * 0.08;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createTerrain(seed: number): Terrain {
  const river: River = [];
  const ox = ((seed * 17) % 40) - 20;
  const oz = ((seed * 29) % 30) - 15;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    river.push({
      x: lerp(168 + ox, LAKE.x + 18, t) + Math.sin(t * 6.1 + seed) * 24,
      z: lerp(-158 + oz, LAKE.z - 8, t) + Math.cos(t * 4.3) * 20,
    });
  }

  const half = WORLD / 2;
  const gridX1 = RES + 1;
  const H = new Float32Array(gridX1 * gridX1);
  const geo = new PlaneGeometry(WORLD, WORLD, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const z = pa.getZ(i);
    const h = heightFn(x, z, seed, river);
    pa.setY(i, h);
    const ix = Math.round((x + half) / CELL);
    const iz = Math.round((z + half) / CELL);
    if (ix >= 0 && iz >= 0 && ix <= RES && iz <= RES) H[ix + gridX1 * iz] = h;
  }
  geo.computeVertexNormals();
  const colors = new Float32Array(pa.count * 3);
  const na = geo.attributes.normal;
  const col = new Color();
  for (let i = 0; i < pa.count; i++) {
    const steep = Math.hypot(na.getX(i), na.getZ(i)) / Math.max(0.15, na.getY(i));
    albedo(pa.getY(i), steep, pa.getX(i), pa.getZ(i), seed, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));

  const mat = new MeshLambertMaterial({ vertexColors: true });
  const ground = new Mesh(geo, mat);
  ground.name = "ground";

  const positions: number[] = [];
  const shores: number[] = [];
  const indices: number[] = [];
  let vcount = 0;
  const pushV = (ix: number, iz: number) => {
    const x = ix * CELL - half;
    const z = iz * CELL - half;
    const h = H[ix + gridX1 * iz] ?? 0;
    const shore = Math.max(0, Math.min(1, (WATER - h) / 4.2));
    positions.push(x, WATER, z);
    shores.push(shore);
    return vcount++;
  };
  for (let iz = 0; iz < RES; iz++) {
    for (let ix = 0; ix < RES; ix++) {
      const h00 = H[ix + gridX1 * iz] ?? 99;
      const h10 = H[ix + 1 + gridX1 * iz] ?? 99;
      const h01 = H[ix + gridX1 * (iz + 1)] ?? 99;
      const h11 = H[ix + 1 + gridX1 * (iz + 1)] ?? 99;
      if (Math.min(h00, h10, h01, h11) > WATER + 0.05) continue;
      const a = pushV(ix, iz);
      const b = pushV(ix + 1, iz);
      const c = pushV(ix, iz + 1);
      const d = pushV(ix + 1, iz + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  const waterGeo = new BufferGeometry();
  waterGeo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  waterGeo.setAttribute("shore", new BufferAttribute(new Float32Array(shores), 1));
  waterGeo.setIndex(indices);
  waterGeo.computeBoundingSphere();
  const sunDir = new Vector3(0.45, 0.8, 0.25);
  const waterMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: sunDir },
      uSunColor: { value: new Color(1, 0.95, 0.85) },
      uSunI: { value: 1 },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const waterMesh = new Mesh(waterGeo, waterMat);
  waterMesh.renderOrder = 2;
  waterMesh.name = "water";

  const group = new Group();
  group.add(ground, waterMesh);

  const sample = (x: number, z: number) => {
    const gx = (x + half) / CELL;
    const gz = (z + half) / CELL;
    if (gx < 0 || gz < 0 || gx >= RES || gz >= RES) return 95;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const at = (a: number, b: number) => H[a + gridX1 * b] ?? 0;
    const h00 = at(ix, iz);
    const h10 = at(ix + 1, iz);
    const h01 = at(ix, iz + 1);
    const h11 = at(ix + 1, iz + 1);
    return (
      h00 * (1 - fx) * (1 - fz) +
      h10 * fx * (1 - fz) +
      h01 * (1 - fx) * fz +
      h11 * fx * fz
    );
  };

  let spawn = { x: LAKE.x + LAKE.r + 16, z: LAKE.z + 24, yaw: 0 };
  let best = 1e9;
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2;
    const rad = LAKE.r + 16 + (a % 3) * 4;
    const x = LAKE.x + Math.cos(ang) * rad;
    const z = LAKE.z + Math.sin(ang) * rad;
    const h = sample(x, z);
    const slope = Math.hypot(sample(x + 2, z) - h, sample(x, z + 2) - h);
    const prefer = ang > -0.4 && ang < 1.3 ? 0 : 8;
    const score = Math.abs(h - (WATER + 3.2)) + slope * 6 + prefer;
    if (h > WATER + 1.4 && h < WATER + 8 && slope < 0.7 && score < best) {
      best = score;
      const dx = LAKE.x - x;
      const dz = LAKE.z - z;
      spawn = { x, z, yaw: Math.atan2(-dx, -dz) };
    }
  }

  return {
    group,
    sample,
    spawn,
    waterMesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
    },
  };
}
