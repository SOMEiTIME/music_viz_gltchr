import { describe, expect, it } from "vitest";
import {
  copySettings, parseStoredSettings, presetNames, seedPresets, seededKey, validPresetName,
} from "../presets.js";
import { memoryStorage } from "./memoryStorage.js";

function defaults() {
  return {
    frameDataIncrement: 7,
    gapMultiplier: 0.03,
    videoSrc: "video.mp4",
    audioSrc: "audio.mp3",
    videoName: "video.mp4",
    audioName: "audio.mp3",
  };
}

describe("copySettings", () => {
  it("copies stored values over the settings", () => {
    const settings = defaults();
    copySettings(settings, { frameDataIncrement: 3, gapMultiplier: 0.5, videoName: "clip.mov" });
    expect(settings).toMatchObject({ frameDataIncrement: 3, gapMultiplier: 0.5, videoName: "clip.mov" });
  });

  it("clamps numbers to the slider ranges", () => {
    const settings = defaults();
    copySettings(settings, { frameDataIncrement: 0, gapMultiplier: 40 });
    expect(settings.frameDataIncrement).toBe(2);
    expect(settings.gapMultiplier).toBe(1);
  });

  it("keeps the current value when a stored number is missing or not a finite number", () => {
    for (const bad of [undefined, "5", NaN, Infinity, null]) {
      const settings = defaults();
      copySettings(settings, { frameDataIncrement: bad });
      expect(settings.frameDataIncrement).toBe(7);
    }
  });

  it("never restores media sources", () => {
    const settings = defaults();
    copySettings(settings, { videoSrc: "blob:stale", audioSrc: "blob:stale" });
    expect(settings.videoSrc).toBe("video.mp4");
    expect(settings.audioSrc).toBe("audio.mp3");
  });

  it("clears non-string names", () => {
    const settings = defaults();
    copySettings(settings, { videoName: 5 });
    expect(settings.videoName).toBeUndefined();
    expect(settings.audioName).toBeUndefined();
  });

  it("ignores keys settings doesn't have", () => {
    const settings = defaults();
    copySettings(settings, { somethingElse: 1 });
    expect(settings).not.toHaveProperty("somethingElse");
  });

  it("does nothing without an object", () => {
    for (const bad of [null, undefined, 3, "text"]) {
      const settings = defaults();
      copySettings(settings, bad);
      expect(settings).toEqual(defaults());
    }
  });
});

describe("parseStoredSettings", () => {
  it("parses stored JSON", () => {
    const storage = memoryStorage({ a: '{"gapMultiplier":0.2}' });
    expect(parseStoredSettings(storage, "a")).toEqual({ gapMultiplier: 0.2 });
  });

  it("returns null for missing keys and broken JSON", () => {
    const storage = memoryStorage({ broken: "{not json" });
    expect(parseStoredSettings(storage, "missing")).toBeNull();
    expect(parseStoredSettings(storage, "broken")).toBeNull();
  });
});

describe("validPresetName", () => {
  it("accepts letters, numbers, underscores and spaces", () => {
    expect(validPresetName("my preset_2")).toBe(true);
  });

  it("rejects empty names, other characters and reserved keys", () => {
    for (const name of ["", "a-b", "<b>", "x.y", "current", "lastPreset", "seededPresets"]) {
      expect(validPresetName(name)).toBe(false);
    }
  });
});

describe("presetNames", () => {
  it("lists stored presets in order, without app state keys", () => {
    const storage = memoryStorage({
      zeta: "{}", current: "{}", alpha: "{}", lastPreset: "zeta", seededPresets: "[]",
    });
    expect(presetNames(storage)).toEqual(["alpha", "zeta"]);
  });
});

describe("seedPresets", () => {
  it("adds starter presets and records them as seeded", () => {
    const storage = memoryStorage();
    seedPresets(storage, { thin: { gapMultiplier: 0.69 } });
    expect(JSON.parse(storage.getItem("thin"))).toEqual({ gapMultiplier: 0.69 });
    expect(JSON.parse(storage.getItem(seededKey))).toEqual(["thin"]);
  });

  it("doesn't overwrite a preset the user already has", () => {
    const storage = memoryStorage({ thin: '{"gapMultiplier":0.1}' });
    seedPresets(storage, { thin: { gapMultiplier: 0.69 } });
    expect(storage.getItem("thin")).toBe('{"gapMultiplier":0.1}');
  });

  it("doesn't bring back a seeded preset the user deleted", () => {
    const storage = memoryStorage({ [seededKey]: '["thin"]' });
    seedPresets(storage, { thin: {}, colorful: {} });
    expect(storage.getItem("thin")).toBeNull();
    expect(storage.getItem("colorful")).toBe("{}");
    expect(JSON.parse(storage.getItem(seededKey))).toEqual(["thin", "colorful"]);
  });

  it("skips invalid names", () => {
    const storage = memoryStorage();
    seedPresets(storage, { current: {}, "bad-name": {} });
    expect(storage.getItem("current")).toBeNull();
    expect(storage.getItem("bad-name")).toBeNull();
  });

  it("recovers from a corrupt seeded list", () => {
    const storage = memoryStorage({ [seededKey]: '"oops"' });
    seedPresets(storage, { thin: {} });
    expect(JSON.parse(storage.getItem(seededKey))).toEqual(["thin"]);
  });

  it("does nothing without an object", () => {
    const storage = memoryStorage();
    seedPresets(storage, null);
    expect(storage.length).toBe(0);
  });
});
