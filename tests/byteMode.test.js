import { describe, expect, it } from "vitest";
import { beatDetector, frameOperations, glitchFrame, jpegScanStart } from "../byteMode.js";

//a JPEG's outline: start of image, an APP0 and a start-of-scan segment, then fake picture
//data. segment lengths count their own two length bytes
function fakeJpeg(dataLength = 200000) {
  const head = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 1, 2, 3, 4,
    0xff, 0xda, 0x00, 0x04, 5, 6,
  ];
  const bytes = new Uint8Array(head.length + dataLength);
  bytes.set(head);
  for (let i = head.length; i < bytes.length; i++) bytes[i] = i % 251;
  return bytes;
}
const scanStart = 16;

describe("jpegScanStart", () => {
  it("finds the end of the start-of-scan segment", () => {
    expect(jpegScanStart(fakeJpeg())).toBe(scanStart);
  });

  it("is null without a start of scan or with broken markers", () => {
    expect(jpegScanStart(fakeJpeg().slice(0, 10))).toBe(null);
    const broken = fakeJpeg();
    broken[10] = 0x00;
    expect(jpegScanStart(broken)).toBe(null);
  });
});

describe("glitchFrame", () => {
  it("keeps the length and everything up to the picture data", () => {
    const bytes = fakeJpeg();
    const glitched = glitchFrame(bytes, 128, 1, 1);
    expect(glitched.length).toBe(bytes.length);
    expect(glitched.subarray(0, scanStart)).toEqual(bytes.subarray(0, scanStart));
    expect(glitched).not.toEqual(bytes);
  });

  it("repeats for a seed", () => {
    expect(glitchFrame(fakeJpeg(), 50, 1, 7)).toEqual(glitchFrame(fakeJpeg(), 50, 1, 7));
  });

  it("is null when there's no picture to corrupt", () => {
    expect(glitchFrame(fakeJpeg(0), 50, 1)).toBe(null);
    expect(glitchFrame(new Uint8Array(100), 50, 1)).toBe(null);
  });
});

describe("frameOperations", () => {
  it("corrupts more often the louder it is and the more damage", () => {
    const every = (level, damage) => frameOperations(level, damage)[0].every;
    expect(every(255, 1)).toBeLessThan(every(0, 1));
    expect(every(0, 5)).toBeLessThan(every(0, 1));
  });

  it("keeps every a whole number of at least 1", () => {
    for (const [level, damage] of [[255, 10], [0, 0.1], [100, 3.3]]) {
      for (const op of frameOperations(level, damage)) {
        expect(Number.isInteger(op.every)).toBe(true);
        expect(op.every).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("beatDetector", () => {
  const options = { ratio: 1.4, minLevel: 60, rest: 3 };

  it("fires on a jump above the average, then rests", () => {
    const isBeat = beatDetector();
    for (let i = 0; i < 20; i++) expect(isBeat(50, options)).toBe(false);
    expect(isBeat(200, options)).toBe(true);
    expect(isBeat(250, options)).toBe(false);
  });

  it("ignores steady sound and quiet jumps", () => {
    const isBeat = beatDetector();
    const results = Array.from({ length: 50 }, () => isBeat(180, options));
    expect(results.filter(Boolean).length).toBe(0);
    const quiet = beatDetector();
    for (let i = 0; i < 20; i++) quiet(5, options);
    expect(quiet(40, options)).toBe(false);
  });

  it("exposes the recent average", () => {
    const isBeat = beatDetector();
    expect(isBeat.average).toBe(null);
    for (let i = 0; i < 50; i++) isBeat(100, options);
    expect(isBeat.average).toBeCloseTo(100);
    isBeat(200, options);
    expect(isBeat.average).toBeGreaterThan(100);
  });

  it("uses the options it's given each frame", () => {
    const isBeat = beatDetector();
    for (let i = 0; i < 20; i++) isBeat(100, options);
    expect(isBeat(130, options)).toBe(false);
    expect(isBeat(130, { ...options, ratio: 1.2 })).toBe(true);
  });
});
