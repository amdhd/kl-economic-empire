// Seeded, serialisable PRNG (sfc32). The full internal state lives in GameState.rng so that
// save/load resumes the exact random sequence.
import type { RngState } from '../types/game';

export function seedRng(seed: number): RngState {
  // splitmix32 to spread the seed over 4 words
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st = { a: next(), b: next(), c: next(), d: next() };
  for (let i = 0; i < 12; i++) rand(st);
  return st;
}

/** Uniform [0,1). Mutates state. */
export function rand(st: RngState): number {
  const t = (((st.a + st.b) >>> 0) + st.d) >>> 0;
  st.d = (st.d + 1) >>> 0;
  st.a = st.b ^ (st.b >>> 9);
  st.b = (st.c + (st.c << 3)) >>> 0;
  st.c = ((st.c << 21) | (st.c >>> 11)) >>> 0;
  st.c = (st.c + t) >>> 0;
  return t / 4294967296;
}

/** Standard normal via Box–Muller (consumes two uniforms, no cached spare). */
export function randn(st: RngState): number {
  let u = rand(st);
  if (u < 1e-12) u = 1e-12;
  const v = rand(st);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Normal clipped to ±limit standard deviations, to bound tail moves. */
export function randnClipped(st: RngState, limit = 3.5): number {
  const z = randn(st);
  return z > limit ? limit : z < -limit ? -limit : z;
}

export function randInt(st: RngState, lo: number, hi: number): number {
  return lo + Math.floor(rand(st) * (hi - lo + 1));
}
