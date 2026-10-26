//preset and settings logic kept free of the DOM so it can be unit tested

//numeric settings and the slider ranges in index.html they must stay within
export const numericRanges = {
  frameDataIncrement: [2, 10],
  gapMultiplier: [0, 1],
  frameDataGapMultiplier: [0, 5],
  frameDataOffsetMultiplier: [0, 2],
  frameDataHighCutoff: [0, 255],
  frameDataLowCutoff: [0, 255],
  frameDataEmptyVal: [0, 255],
  adjustedGapMultiplier: [0, 1],
  vizBarHeightMultiplier: [0, 6],
  erodeEvery: [2, 60],
  beatJump: [1.05, 3],
  beatFloor: [0, 255],
  beatRest: [0, 60],
  erodeHold: [1, 30],
  erodeDamage: [0.1, 10],
  erodeScale: [0.1, 1],
};

//copies stored values into settings, only for keys settings already has
export function copySettings(settings, newSettings) {
  if (newSettings == null || typeof newSettings !== "object") {
    return;
  }

  Object.keys(settings).forEach(name => {
    const value = newSettings[name];
    const range = numericRanges[name];
    if (range) {
      //stored values are untrusted: a non-numeric or out of range increment can hang animate()
      if (typeof value === "number" && Number.isFinite(value)) {
        settings[name] = Math.min(range[1], Math.max(range[0], value));
      }
      return;
    }
    //media sources are never restored: uploads are object URLs that don't outlive the page
    if (name === "videoSrc" || name === "audioSrc") {
      return;
    }
    settings[name] = typeof value === "string" ? value : undefined;
  });
}

export function parseStoredSettings(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch (e) {
    return null;
  }
}

const favoriteRegex = /^[\s\w]*$/;

//localStorage keys that hold app state rather than presets
export const lastPresetKey = "lastPreset";
export const seededKey = "seededPresets";
export const reservedKeys = ["current", lastPresetKey, seededKey];

export function validPresetName(name) {
  return name != "" && favoriteRegex.test(name) && !reservedKeys.includes(name);
}

//the preset names in storage, sorted for the dropdown
export function presetNames(storage) {
  const names = [];
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (!reservedKeys.includes(name)) {
      names.push(name);
    }
  }
  return names.sort();
}

//starter presets are copied into storage once each, so presets the user has since
//edited or deleted aren't brought back
export function seedPresets(storage, starters) {
  if (starters == null || typeof starters !== "object") {
    return;
  }

  let seeded = parseStoredSettings(storage, seededKey);
  if (!Array.isArray(seeded)) {
    seeded = [];
  }
  Object.keys(starters).forEach(name => {
    if (!validPresetName(name) || seeded.includes(name) || storage.getItem(name) != null) {
      return;
    }
    storage.setItem(name, JSON.stringify(starters[name]));
    seeded.push(name);
  });
  storage.setItem(seededKey, JSON.stringify(seeded));
}
