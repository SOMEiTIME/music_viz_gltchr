//checks that the hand-maintained data in index.html and public/presets.json agrees with the code
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { numericRanges, validPresetName } from "../presets.js";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

describe("index.html sliders", () => {
  const sliders = {};
  for (const [, id, min, max] of read("../index.html")
    .matchAll(/<input type="range" id="(\w+)"[^>]*?min="([\d.]+)" max="([\d.]+)"/g)) {
    sliders[id] = [Number(min), Number(max)];
  }

  it("match numericRanges", () => {
    expect(sliders).toEqual(numericRanges);
  });
});

describe("public/presets.json", () => {
  const starters = JSON.parse(read("../public/presets.json"));

  it("has presets", () => {
    expect(Object.keys(starters).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(starters))("%s has a valid name and in-range values for every slider", (name, preset) => {
    expect(validPresetName(name)).toBe(true);
    expect(Object.keys(preset).sort()).toEqual(Object.keys(numericRanges).sort());
    for (const [key, [min, max]] of Object.entries(numericRanges)) {
      expect(preset[key]).toBeGreaterThanOrEqual(min);
      expect(preset[key]).toBeLessThanOrEqual(max);
    }
  });
});
