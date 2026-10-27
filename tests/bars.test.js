import { describe, expect, it } from "vitest";
import { drawBars, shiftBytes } from "../bars.js";

const settings = {
  frameDataIncrement: 2,
  gapMultiplier: 0,
  frameDataGapMultiplier: 1,
  frameDataOffsetMultiplier: 0,
  frameDataHighCutoff: 255,
  frameDataLowCutoff: 0,
  frameDataEmptyVal: 0,
  adjustedGapMultiplier: 0,
  vizBarHeightMultiplier: 0,
};

describe("shiftBytes", () => {
  it("copies every step'th byte from gap bytes on, adding the offset", () => {
    const bar = new Uint8ClampedArray([10, 20, 30, 40, 50, 60]);
    shiftBytes(bar, 2, { ...settings, frameDataOffsetMultiplier: 0.5 });
    //gap 2, offset 1. the last read is past the end, which writes 0
    expect([...bar]).toEqual([31, 20, 51, 40, 0, 60]);
  });

  it("replaces values outside the cutoffs", () => {
    const bar = new Uint8ClampedArray([0, 100, 0, 200, 0, 150]);
    shiftBytes(bar, 1, { ...settings, frameDataHighCutoff: 180, frameDataLowCutoff: 120, frameDataEmptyVal: 7 });
    expect([...bar]).toEqual([7, 100, 7, 200, 150, 150]);
  });

  it("writes 0 when the gap isn't a whole number of bytes", () => {
    const bar = new Uint8ClampedArray([10, 20, 30, 40]);
    shiftBytes(bar, 1, { ...settings, frameDataGapMultiplier: 0.5 });
    expect([...bar]).toEqual([0, 20, 0, 40]);
  });
});

describe("drawBars", () => {
  it("leaves pixels no bar covers as they were", () => {
    const width = 4, height = 2;
    const frame = new Uint8ClampedArray(width * height * 4).fill(9);
    const output = new Uint8ClampedArray(width * height * 4).fill(5);
    //Gap makes each bar 1 pixel narrower than its 2 pixel slot
    drawBars(frame, output, width, height, [100, 100], { ...settings, gapMultiplier: 0.01, frameDataGapMultiplier: 0 });
    const pixel = (x, y) => [...output.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
    expect(pixel(1, 0)).toEqual([5, 5, 5, 5]);
    expect(pixel(3, 0)).toEqual([5, 5, 5, 5]);
    //the bars are read from 1 row down, so their last row comes from below the frame
    expect(pixel(0, 0)).toEqual([9, 9, 9, 9]);
    expect(pixel(2, 1)).toEqual([0, 0, 0, 0]);
  });
});
