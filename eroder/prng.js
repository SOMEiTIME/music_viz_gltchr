//
// Seeded pseudo-random number generator shared by all operations.
// Doesn't need to match Python's random (PLAN.md §4), just be small and deterministic,
// so it's mulberry32.
//

//
// Returns a function that gives a float in [0, 1) each call, deterministic for the given seed.
// With no seed, picks one at random
//
export function createRandom(seed) {
  let state = (seed ?? randomSeed()) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

//
// Returns a fresh seed: a random 32-bit unsigned integer. Callers that need to report
// or repeat a result pick the seed with this and pass it on, rather than leaving it out
//
export function randomSeed() {
  // crypto works in browsers, workers and Node, so core stays free of DOM APIs
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

//
// Returns an integer in [min, max], inclusive at both ends like Python's random.randint
//
export function randInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

//
// Returns an integer in [0, n), like Python's random.randrange(n)
//
export function randRange(random, n) {
  return Math.floor(random() * n);
}
