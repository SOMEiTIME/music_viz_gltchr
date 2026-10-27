//byte mode: DOM-free helpers for corrupting JPEG-encoded frames with Media-Eroder's core.
//eroder/ is a copy of Media-Eroder's src/core/ (see CLAUDE.md), so don't edit it here
import { glitch } from "./eroder/index.js";

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

//operations for one frame. louder sound (0 to 255) and more damage mean more corruption
export function frameOperations(level, damage = 1) {
  //the core needs whole numbers of at least 1
  const every = Math.max(1, Math.round(60000 / (damage * (1 + level / 16))));
  return [
    { type: "byte-corrupt", every },
    { type: "byte-swap", size: 16, every: every * 2 },
  ];
}

//glitches an encoded JPEG frame, leaving its tables alone. returns null for a file
//without a picture to corrupt
export function glitchFrame(bytes, level, damage, seed) {
  const headerBytes = jpegScanStart(bytes);
  if (headerBytes == null || headerBytes >= bytes.length) return null;
  return glitch(bytes, frameOperations(level, damage), { headerBytes, seed });
}

//returns a function that's given the bass level each frame and says whether it's a beat:
//a jump to `ratio` times the recent average and above `minLevel`, with `rest` frames
//between beats. the options are passed each frame so sliders take effect straight away
//the function's `average` property is the recent average, for showing while tuning
export function beatDetector(smoothing = 0.9) {
  let sinceBeat = Infinity;
  const isBeat = (level, { ratio, minLevel, rest }) => {
    //start from the first level, or steady sound would count as beats while the average warms up
    const average = isBeat.average ?? level;
    const beat = sinceBeat >= rest && level > minLevel && level > average * ratio;
    isBeat.average = average * smoothing + level * (1 - smoothing);
    sinceBeat = beat ? 0 : sinceBeat + 1;
    return beat;
  };
  isBeat.average = null;
  return isBeat;
}
