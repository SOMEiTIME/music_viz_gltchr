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
    const glitched = glitchFrame(bytes, 128, 1);
    expect(glitched.length).toBe(bytes.length);
    expect(glitched.subarray(0, scanStart)).toEqual(bytes.subarray(0, scanStart));
    expect(glitched).not.toEqual(bytes);
  });

  it("repeats for a seed", () => {
    expect(glitchFrame(fakeJpeg(), 50, 7)).toEqual(glitchFrame(fakeJpeg(), 50, 7));
  });

  it("is null when there's no picture to corrupt", () => {
    expect(glitchFrame(fakeJpeg(0), 50)).toBe(null);
    expect(glitchFrame(new Uint8Array(100), 50)).toBe(null);
  });
});

describe("frameOperations", () => {
  it("corrupts more often the louder it is", () => {
    const quiet = frameOperations(0)[0].every;
    const loud = frameOperations(255)[0].every;
    expect(loud).toBeLessThan(quiet);
    expect(loud).toBeGreaterThanOrEqual(1);
  });
});

describe("beatDetector", () => {
  it("fires on a jump above the average, then rests", () => {
    const isBeat = beatDetector({ rest: 3 });
    for (let i = 0; i < 20; i++) expect(isBeat(50)).toBe(false);
    expect(isBeat(200)).toBe(true);
    expect(isBeat(250)).toBe(false);
  });

  it("ignores steady sound and quiet jumps", () => {
    const isBeat = beatDetector();
    const results = Array.from({ length: 50 }, () => isBeat(180));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
    const quiet = beatDetector();
    for (let i = 0; i < 20; i++) quiet(5);
    expect(quiet(40)).toBe(false);
  });
});
