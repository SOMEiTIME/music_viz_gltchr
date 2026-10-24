//byte mode: DOM-free helpers for corrupting JPEG-encoded frames with Media-Eroder's core.
//eroder/ is a copy of Media-Eroder's src/core/ (see CLAUDE.md), so don't edit it here
import { glitch } from "./eroder/index.js";

//frames a glitched frame stays on screen before the clean video comes back
export const holdFrames = 4;

//offset of the first byte after a JPEG's start-of-scan header (FF DA and its segment),
//where the compressed picture starts. everything before it is tables the decoder needs,
//so it's left alone. returns null if there's no start of scan
export function jpegScanStart(bytes) {
  let i = 2; //skip the FF D8 start-of-image marker
  while (i + 3 < bytes.length) {
    if (bytes[i] != 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3]; //counts its own two bytes
    if (marker == 0xda) return i + 2 + length;
    i += 2 + length;
  }
  return null;
}

//operations for one frame. louder sound (0 to 255) means more corruption
export function frameOperations(level) {
  const every = Math.round(60000 / (1 + level / 16));
  return [
    { type: "byte-corrupt", every },
    { type: "byte-swap", size: 16, every: every * 2 },
  ];
}

//glitches an encoded JPEG frame, leaving its tables alone. returns null for a file
//without a picture to corrupt
export function glitchFrame(bytes, level, seed) {
  const headerBytes = jpegScanStart(bytes);
  if (headerBytes == null || headerBytes >= bytes.length) return null;
  return glitch(bytes, frameOperations(level), { headerBytes, seed });
}

//returns a function that's given the bass level each frame and says whether it's a beat:
//a jump well above the recent average, with a few frames' rest after each one
export function beatDetector({ ratio = 1.4, minLevel = 60, rest = 8, smoothing = 0.9 } = {}) {
  let average = null;
  let sinceBeat = rest;
  return level => {
    //start from the first level, or steady sound would count as beats while the average warms up
    average ??= level;
    const beat = sinceBeat >= rest && level > minLevel && level > average * ratio;
    average = average * smoothing + level * (1 - smoothing);
    sinceBeat = beat ? 0 : sinceBeat + 1;
    return beat;
  };
}
