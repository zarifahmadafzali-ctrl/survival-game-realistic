export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hash2(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x: number, z: number, seed: number, octaves = 5): number {
  let n = 0;
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    n += vnoise(x * freq, z * freq, seed + i * 101) * amp;
    sum += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return n / sum;
}

export function ridged(x: number, z: number, seed: number): number {
  let n = 0;
  let amp = 0.55;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const v = 1 - Math.abs(vnoise(x * freq, z * freq, seed + i * 17) * 2 - 1);
    n += v * v * amp;
    sum += amp;
    amp *= 0.5;
    freq *= 2.12;
  }
  return n / sum;
}
