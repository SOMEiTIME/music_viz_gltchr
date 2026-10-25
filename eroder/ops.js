//
// Glitch operations, ported from Media-Glitcher (media.py and byte_ops.py).
// No DOM or browser APIs in here. See PLAN.md §3 for the list and §4 for what must match.
//

import { randInt, randRange } from './prng.js';

//
// Line operations: take the body as an array of lines (each a Uint8Array, line ending
// included) and change it in place
//

//
// Port of media.glitch_random_swap(interval, flavour), quirks included
//
export function swap(lines, { interval, flavour }, random) {
  // Python's flavour % 10, which is never negative
  const spread = ((flavour % 10) + 10) % 10;
  let counter = 0;
  for (let num = 0; num < lines.length; num++) {
    if (counter === interval) {
      swapAt(lines, num, num - (1 + randInt(random, 0, 2 + spread)));
      counter = flavour;
    } else {
      counter++;
    }
  }
}

//
// Port of media.glitch_corrupt(interval, flavour), quirks included.
// flavour is unused there too
//
export function corrupt(lines, { interval }, random) {
  let corruption = 1;
  let counter = 0;
  for (let num = 0; num < lines.length; num++) {
    if (counter === interval) {
      for (let i = 0; i < corruption; i++) {
        swapAt(lines, num - i, num - (i + 1 + randInt(random, 0, 5 + corruption)));
      }
      counter = 0;
      corruption++;
    } else {
      counter++;
    }
  }
}

//
// Port of media.__swap_at: overwrites the start of line place1 with line place2,
// keeping place1's length. Only takes effect when place2 is no longer than place1;
// otherwise place1 is left as it was
//
function swapAt(lines, place1, place2) {
  place1 = wrapIndex(lines, place1);
  place2 = wrapIndex(lines, place2);
  const original = lines[place1];
  const other = lines[place2];
  const joined = original.length < other.length ? fittingLine(original, other) : fittingLine(other, original);
  // Python's joined[:len - 4]: a negative end counts from the back
  let end = joined.length - 4;
  if (end < 0) {
    end = Math.max(0, joined.length + end);
  }
  if (end === original.length) {
    lines[place1] = joined.subarray(0, end);
  }
}

//
// Port of media.__generate_fitting_line: line a, then line b from 4 bytes before a's length on
//
function fittingLine(a, b) {
  const tail = b.subarray(Math.max(0, a.length - 4));
  const line = new Uint8Array(a.length + tail.length);
  line.set(a);
  line.set(tail, a.length);
  return line;
}

//
// Python list indexing: negative indices count from the end. Below -length Python
// raises IndexError, so this throws instead of wrapping twice (PLAN.md §4)
//
function wrapIndex(lines, index) {
  if (index < -lines.length || index >= lines.length) {
    throw new RangeError(`line index ${index} is out of range for ${lines.length} lines`);
  }
  return index < 0 ? index + lines.length : index;
}

//
// Byte operations: change the whole file's bytes in place, never touch the
// first `start` bytes, and keep the length the same
//

//
// Once every `every` bytes, swaps a `size`-byte chunk with one 1 to 4 chunks before it
//
export function byteSwap(data, start, { size, every }, random) {
  const last = data.length - size;
  for (let window = start + size; window <= last; window += every) {
    const a = Math.min(window + randRange(random, every), last);
    const b = a - size * randInt(random, 1, 4);
    if (b >= start) {
      const chunk = data.slice(a, a + size);
      data.copyWithin(a, b, b + size);
      data.set(chunk, b);
    }
  }
}

//
// Once every `every` bytes, replaces one byte with a random value
//
export function byteCorrupt(data, start, { every }, random) {
  for (let window = start; window < data.length; window += every) {
    const place = Math.min(window + randRange(random, every), data.length - 1);
    data[place] = randRange(random, 256);
  }
}

//
// Flips a random `rate` fraction of the bits after the header
//
export function bitflip(data, start, { rate }, random) {
  const bits = (data.length - start) * 8;
  // Python's round() rounds halves to even, so this can differ by one flip (PLAN.md §4)
  const flips = Math.round(bits * rate);
  for (let i = 0; i < flips; i++) {
    const bit = randRange(random, bits);
    data[start + Math.floor(bit / 8)] ^= 1 << (bit % 8);
  }
}

//
// Once every `every` bytes, copies a `size`-byte chunk over the one right after it
//
export function repeat(data, start, { size, every }, random) {
  const last = data.length - 2 * size;
  for (let window = start; window <= last; window += every) {
    const a = Math.min(window + randRange(random, every), last);
    data.copyWithin(a + size, a, a + size);
  }
}

// Operation type (as in Media-Glitcher presets) → implementation. New operations get registered here.
export const lineOps = {
  swap,
  corrupt,
};

export const byteOps = {
  'byte-swap': byteSwap,
  'byte-corrupt': byteCorrupt,
  bitflip,
  repeat,
};
