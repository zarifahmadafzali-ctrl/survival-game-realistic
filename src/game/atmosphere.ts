import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from "three";
import { lerp, smoothstep } from "./noise";

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const skyFrag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uElev;
uniform float uTime;
#include <common>
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float stars(vec3 dir) {
  vec3 q = floor(normalize(dir) * 210.0);
  float h = hash(q);
  float s = step(0.986, h);
  return s * pow(fract(h * 23.1), 6.0);
}
void main() {
  vec3 dir = normalize(vDir);
  float k = pow(clamp(dir.y, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, k);
  col = mix(col * vec3(0.35, 0.42, 0.48), col, smoothstep(-0.08, 0.05, dir.y));
  float sd = max(dot(dir, normalize(uSun)), 0.0);
  float day = smoothstep(-0.04, 0.18, uElev);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9992, 0.99986, sd) * day;
  col += vec3(1.0, 0.78, 0.42) * pow(sd, 90.0) * 0.65 * day;
  col += vec3(1.0, 0.5, 0.22) * pow(sd, 7.0) * 0.28 * day * (1.0 - smoothstep(0.05, 0.45, uElev));
  float md = max(dot(dir, normalize(uMoon)), 0.0);
  float night = 1.0 - smoothstep(-0.02, 0.28, uElev);
  float disc = smoothstep(0.99945, 0.99986, md);
  float crater = hash(floor(dir * 90.0));
  vec3 moonCol = vec3(0.78, 0.84, 0.9) * (0.72 + 0.4 * crater);
  col += moonCol * disc * (0.55 + night * 0.8);
  col += vec3(0.55, 0.66, 0.85) * pow(md, 26.0) * night * 0.45;
  col += vec3(0.92, 0.95, 1.0) * stars(dir) * night * smoothstep(0.0, 0.22, dir.y);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function glowTex(inner: string, mid: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return new CanvasTexture(c);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, mid);
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export type Atmosphere = {
  sunDir: Vector3;
  elev: number;
  sunIntensity: number;
  sunColor: Color;
  update: (day: number, cam: Vector3, dt: number) => void;
  dispose: () => void;
};

export function createAtmosphere(scene: Scene): Atmosphere {
  const sunDir = new Vector3(0.3, 0.7, 0.2);
  const moonDir = new Vector3();
  const zenith = new Color();
  const horizon = new Color();
  const sunColor = new Color();
  const skyMat = new ShaderMaterial({
    uniforms: {
      uZenith: { value: new Color(0.18, 0.38, 0.62) },
      uHorizon: { value: new Color(0.62, 0.74, 0.8) },
      uSun: { value: sunDir },
      uMoon: { value: moonDir },
      uElev: { value: 0.4 },
      uTime: { value: 0 },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new Mesh(new SphereGeometry(420, 24, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const fog = new FogExp2(0xc5d4cc, 0.0065);
  scene.fog = fog;

  const hemi = new HemisphereLight(0xc5d7ee, 0x3d4a32, 0.55);
  const sun = new DirectionalLight(0xfff1d6, 1.2);
  const moon = new DirectionalLight(0x9bb4d8, 0.15);
  const target = new Object3D();
  sun.target = target;
  moon.target = target;
  scene.add(hemi, sun, moon, target);

  const sunSprite = new Sprite(
    new SpriteMaterial({
      map: glowTex("rgba(255,248,230,0.95)", "rgba(255,186,90,0.35)"),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sunSprite.scale.set(70, 70, 1);
  const moonSprite = new Sprite(
    new SpriteMaterial({
      map: glowTex("rgba(230,238,255,0.85)", "rgba(140,160,200,0.25)"),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  moonSprite.scale.set(28, 28, 1);
  scene.add(sunSprite, moonSprite);

  const clouds = new Group();
  const cloudGeo = new IcosahedronGeometry(1, 1);
  const cloudMat = new MeshLambertMaterial({
    color: 0xf4f7f4,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const puffGeo: BufferGeometry = cloudGeo;
  for (let i = 0; i < 9; i++) {
    const g = new Group();
    const n = 3 + (i % 3);
    for (let k = 0; k < n; k++) {
      const m = new Mesh(puffGeo, cloudMat);
      m.position.set((k - n / 2) * 7, (k % 2) * 1.5, (k - 1) * 2);
      m.scale.set(8 + (k % 3) * 3, 3.2, 6 + (k % 2) * 2);
      g.add(m);
    }
    const a = (i / 9) * Math.PI * 2;
    g.position.set(Math.cos(a) * (90 + (i % 4) * 28), 78 + (i % 3) * 12, Math.sin(a) * (80 + (i % 5) * 24));
    clouds.add(g);
  }
  scene.add(clouds);

  const nightZ = new Color(0x070b14);
  const dayZ = new Color(0x2f6eb8);
  const setZ = new Color(0x3a2a55);
  const nightH = new Color(0x1a2433);
  const dayH = new Color(0xc5d7e4);
  const setH = new Color(0xe07a3a);
  const warm = new Color(0xffb15a);
  const noon = new Color(0xfff4dc);
  let elev = 0.4;
  let sunIntensity = 1;
  let spin = 0;

  const update = (day: number, cam: Vector3, dt: number) => {
    const t = day;
    elev = Math.sin((t - 0.25) * Math.PI * 2);
    const az = (t - 0.25) * Math.PI * 2;
    const ch = Math.cos(elev);
    sunDir.set(Math.cos(az) * ch, Math.sin(elev), Math.sin(az) * ch);
    if (sunDir.lengthSq() < 1e-4) sunDir.set(0, elev >= 0 ? 1 : -1, 0);
    else sunDir.normalize();
    moonDir.copy(sunDir).multiplyScalar(-1);

    const dayF = smoothstep(-0.08, 0.25, elev);
    const setF = smoothstep(0.35, 0.02, Math.abs(elev)) * smoothstep(-0.15, 0.08, elev);
    zenith.copy(nightZ).lerp(dayZ, dayF).lerp(setZ, setF * 0.85);
    horizon.copy(nightH).lerp(dayH, dayF).lerp(setH, setF);
    sunColor.copy(warm).lerp(noon, smoothstep(0.05, 0.55, elev));

    (skyMat.uniforms.uZenith!.value as Color).copy(zenith);
    (skyMat.uniforms.uHorizon!.value as Color).copy(horizon);
    skyMat.uniforms.uElev!.value = elev;
    skyMat.uniforms.uTime!.value += dt;
    sky.position.copy(cam);

    fog.color.copy(horizon);
    const dawn = smoothstep(0.22, 0.0, Math.abs(elev - 0.02));
    fog.density = lerp(0.0115, 0.0048, dayF) + dawn * 0.004;

    sunIntensity = Math.max(0, elev) * 1.65;
    sun.color.copy(sunColor);
    sun.intensity = sunIntensity;
    moon.intensity = (1 - dayF) * 0.42;
    hemi.color.copy(zenith);
    hemi.groundColor.set(dayF > 0.4 ? 0x3e4a30 : 0x1a221c);
    hemi.intensity = 0.18 + dayF * 0.48;

    target.position.copy(cam);
    sun.position.copy(cam).addScaledVector(sunDir, 90);
    moon.position.copy(cam).addScaledVector(moonDir, 90);
    sunSprite.position.copy(cam).addScaledVector(sunDir, 300);
    moonSprite.position.copy(cam).addScaledVector(moonDir, 300);
    (sunSprite.material as SpriteMaterial).opacity = smoothstep(-0.05, 0.12, elev);
    (moonSprite.material as SpriteMaterial).opacity = 0.25 + (1 - dayF) * 0.75;

    spin += dt * 0.012;
    clouds.rotation.y = spin;
    cloudMat.opacity = 0.35 + dayF * 0.5;
  };

  return {
    sunDir,
    get elev() {
      return elev;
    },
    get sunIntensity() {
      return sunIntensity;
    },
    sunColor,
    update,
    dispose: () => {
      scene.remove(sky, hemi, sun, moon, target, sunSprite, moonSprite, clouds);
      sky.geometry.dispose();
      skyMat.dispose();
      (sunSprite.material as SpriteMaterial).map?.dispose();
      (sunSprite.material as SpriteMaterial).dispose();
      (moonSprite.material as SpriteMaterial).map?.dispose();
      (moonSprite.material as SpriteMaterial).dispose();
      puffGeo.dispose();
      cloudMat.dispose();
    },
  };
}
