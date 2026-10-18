import { describe, expect, it } from "vitest";
import { videoDrawRect } from "../videoRect.js";

//the bundled video's size and text column, as in script.js
const vw = 1966;
const vh = 1080;
const focus = { left: 526 / 1966, right: 1302 / 1966 };

describe("videoDrawRect", () => {
  it("returns null before the video has a size", () => {
    expect(videoDrawRect(0, 0, 800, 600, null)).toBeNull();
  });

  it("crops top and bottom on a wider canvas", () => {
    const [sx, sy, sw, sh, dx, dy, dw, dh] = videoDrawRect(1000, 1000, 2000, 1000, null);
    expect([sx, sw, sh]).toEqual([0, 1000, 500]);
    expect(sy).toBe(250);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 2000, 1000]);
  });

  it("crops the sides around the center on a narrower canvas", () => {
    const [sx, sy, sw, sh, , dy, , dh] = videoDrawRect(2000, 1000, 1000, 1000, null);
    expect([sx, sy, sw, sh]).toEqual([500, 0, 1000, 1000]);
    expect([dy, dh]).toEqual([0, 1000]);
  });

  it("centers the crop on the focus column", () => {
    const [sx, , sw] = videoDrawRect(vw, vh, 1200, 1000, focus);
    expect(sx + sw / 2).toBeCloseTo((526 + 1302) / 2);
  });

  it("keeps the crop inside the video when the focus is near an edge", () => {
    const [sx] = videoDrawRect(2000, 1000, 1000, 1000, { left: 0, right: 0.1 });
    expect(sx).toBe(0);
    const [sx2, , sw2] = videoDrawRect(2000, 1000, 1000, 1000, { left: 0.9, right: 1 });
    expect(sx2 + sw2).toBe(2000);
  });

  it("letterboxes a portrait screen to keep the whole focus column in view", () => {
    const cw = 390;
    const ch = 844;
    const [sx, sy, sw, sh, dx, dy, dw, dh] = videoDrawRect(vw, vh, cw, ch, focus);
    expect(sx).toBeLessThanOrEqual(526);
    expect(sx + sw).toBeGreaterThanOrEqual(1302);
    expect([sy, sh]).toEqual([0, vh]);
    expect([dx, dw]).toEqual([0, cw]);
    expect(dh).toBeLessThan(ch);
    expect(dy).toBeCloseTo((ch - dh) / 2);
    //not stretched
    expect(sw / sh).toBeCloseTo(dw / dh);
  });

  it("fills a landscape screen without letterboxing", () => {
    const [, , , , , dy, , dh] = videoDrawRect(vw, vh, 1440, 900, focus);
    expect([dy, dh]).toEqual([0, 900]);
  });
});
