//
// Core entry point: applies a list of operations to a file's bytes, like
// Media-Glitcher's engine.glitch(). Pure function with no DOM access, so it can be
// tested in Node and copied into music_viz_gltchr or a Web Worker unchanged.
//

import { createRandom, randomSeed } from './prng.js';
import { lineOps, byteOps } from './ops.js';
import { checkOperations, checkSettings } from './check.js';

export const DEFAULT_HEADER_LENGTH = 15;  // lines line operations leave alone
export const DEFAULT_HEADER_BYTES = 1024; // bytes byte operations leave alone

//
// Returns new bytes with each operation applied in order. Operations are
// Media-Glitcher preset dicts, e.g. { type: 'byte-swap', size: 64, every: 5000 }.
// Consecutive line operations share one split into lines, as in engine.py
//
export function glitch(bytes, operations, {
  headerLength = DEFAULT_HEADER_LENGTH,
  headerBytes = DEFAULT_HEADER_BYTES,
  seed,
} = {}) {
  // checked first, so bad presets fail before any work
  checkSettings({ headerLength, headerBytes, seed });
  const groups = groupByMode(checkOperations(operations));
  const random = createRandom(seed);
  let data = bytes.slice();

  for (const group of groups) {
    if (group.lineMode) {
      data = linePass(data, group.operations, headerLength, random);
    } else {
      bytePass(data, group.operations, headerBytes, random);
    }
  }
  return data;
}

//
// Glitches with fresh random seeds until `decodes(bytes)` (sync or async) says the
// result opens, trying at most maxAttempts seeds. Returns the last attempt's bytes and
// seed, how many attempts it took, and whether it decoded, so a run that never decoded
// can still be kept. Errors from glitch() aren't retried: they'd fail every seed alike
//
export async function glitchUntilDecodes(bytes, operations, { headerLength, headerBytes } = {}, decodes, maxAttempts = 20) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer');
  }
  let result;
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const seed = randomSeed();
    const data = glitch(bytes, operations, { headerLength, headerBytes, seed });
    result = { bytes: data, seed, attempts, decoded: await decodes(data) };
    if (result.decoded) {
      break;
    }
  }
  return result;
}

//
// Splits checked operations into runs of line operations and byte operations, keeping order
//
function groupByMode(operations) {
  const groups = [];
  for (const op of operations) {
    const lineMode = Object.hasOwn(lineOps, op.type);
    const last = groups[groups.length - 1];
    if (last && last.lineMode === lineMode) {
      last.operations.push(op);
    } else {
      groups.push({ lineMode, operations: [op] });
    }
  }
  return groups;
}

//
// Runs line operations: split into lines (on \n, \r and \r\n), keep the first
// headerLength lines, glitch the rest, join back into bytes
//
function linePass(data, operations, headerLength, random) {
  const lines = splitLines(data);
  if (lines.length < headerLength) {
    throw new Error(`file has only ${lines.length} lines, fewer than the header length (${headerLength})`);
  }
  const body = lines.slice(headerLength);
  for (const op of operations) {
    lineOps[op.type](body, op, random);
  }
  return joinLines([...lines.slice(0, headerLength), ...body]);
}

//
// Splits bytes into lines that keep their endings, breaking after \n, \r and \r\n
// like Python's newline="". Lines are views into data, not copies
//
export function splitLines(data) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0d && data[i + 1] === 0x0a) {
      i++;
    } else if (data[i] !== 0x0a && data[i] !== 0x0d) {
      continue;
    }
    lines.push(data.subarray(start, i + 1));
    start = i + 1;
  }
  if (start < data.length) {
    lines.push(data.subarray(start));
  }
  return lines;
}

//
// Joins lines back into one Uint8Array
//
function joinLines(lines) {
  const data = new Uint8Array(lines.reduce((total, line) => total + line.length, 0));
  let pos = 0;
  for (const line of lines) {
    data.set(line, pos);
    pos += line.length;
  }
  return data;
}

//
// Runs byte operations on data in place, leaving the first headerBytes alone
//
function bytePass(data, operations, headerBytes, random) {
  if (data.length <= headerBytes) {
    throw new Error(`file has only ${data.length} bytes, not more than the byte header (${headerBytes})`);
  }
  for (const op of operations) {
    byteOps[op.type](data, headerBytes, op, random);
  }
}
