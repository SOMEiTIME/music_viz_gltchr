//the frequency bars, on pixel arrays (RGBA bytes, width * height * 4) so animate() reads the
//frame back once and puts the result once, instead of a getImageData and two putImageData
//calls per bar. it matches what those calls did: rects are cut to whole pixels and clipped
//to the canvas, and pixels read from outside it are transparent black

function checkExtremes(val, maxVal, minVal = 1) {
  return Math.min(maxVal, Math.max(minVal, val));
}

let scratch = new Uint8ClampedArray(0); //one bar's pixels, reused between bars and frames
const shifted = new Uint8ClampedArray(256); //what shiftBytes turns each byte value into

//draws one bar per level (0 to 255) from frame into output. pixels no bar covers keep what
//output had, the way the canvas kept the last frame there
export function drawBars(frame, output, width, height, levels, settings) {
  const barWidth = width / levels.length;
  let x = 0;
  for (let i = 0; i < levels.length; i++) {
    const barHeight = levels[i] || 1;
    const sy = Math.trunc(checkExtremes(barHeight * settings.gapMultiplier, height));
    const sw = Math.trunc(checkExtremes(barWidth - barHeight * settings.gapMultiplier, height));
    if (scratch.length < sw * height * 4) scratch = new Uint8ClampedArray(sw * height * 4);
    const bar = scratch.subarray(0, sw * height * 4);

    copyRect(frame, width, height, Math.trunc(x), sy, bar, sw, height, 0, 0, sw, height);
    shiftBytes(bar, barHeight, settings);
    copyRect(bar, sw, height, 0, 0, output, width, height,
      Math.trunc(x + barHeight * settings.adjustedGapMultiplier), 0, sw, height);
    copyRect(bar, sw, height, 0, 0, output, width, height,
      Math.trunc(x), Math.trunc(height - settings.vizBarHeightMultiplier * barHeight), sw, height);

    x += barWidth;
  }
}

//the glitch itself: every frameDataIncrement'th byte takes the value of the byte further on
//by barHeight * frameDataGapMultiplier, plus an offset, and values outside the cutoffs are
//replaced. reads always land ahead of the writes, so it works in place
export function shiftBytes(bar, barHeight, settings) {
  const step = settings.frameDataIncrement;
  const gap = barHeight * settings.frameDataGapMultiplier;
  const offset = barHeight * settings.frameDataOffsetMultiplier;
  //the new value depends only on the byte read, so work out all 256 once per bar
  for (let byte = 0; byte < 256; byte++) {
    const value = byte + offset;
    shifted[byte] = value > settings.frameDataHighCutoff || value < settings.frameDataLowCutoff
      ? settings.frameDataEmptyVal : value;
  }
  //a read past the end, or at a fractional index, was undefined and wrote NaN, which is 0
  const end = Number.isInteger(gap) ? bar.length - gap : 0;
  let k = 0;
  for (; k < end; k += step) {
    bar[k] = shifted[bar[k + gap]];
  }
  for (; k < bar.length; k += step) {
    bar[k] = 0;
  }
}

//copies a w x h rect from (sx, sy) in src to (dx, dy) in dest, each array being an image
//of the given width and height. parts outside dest are dropped, parts outside src read as 0
function copyRect(src, srcWidth, srcHeight, sx, sy, dest, destWidth, destHeight, dx, dy, w, h) {
  //only rows and columns that land inside dest matter
  const left = Math.max(0, -dx);
  const right = Math.min(w, destWidth - dx);
  const top = Math.max(0, -dy);
  const bottom = Math.min(h, destHeight - dy);
  if (left >= right) return;
  //of those, the columns src has
  const srcLeft = Math.min(right, Math.max(left, -sx));
  const srcRight = Math.max(srcLeft, Math.min(right, srcWidth - sx));
  for (let row = top; row < bottom; row++) {
    const destRow = ((dy + row) * destWidth + dx) * 4;
    const srcY = sy + row;
    if (srcY < 0 || srcY >= srcHeight) {
      dest.fill(0, destRow + left * 4, destRow + right * 4);
      continue;
    }
    const srcRow = (srcY * srcWidth + sx) * 4;
    if (left < srcLeft) dest.fill(0, destRow + left * 4, destRow + srcLeft * 4);
    dest.set(src.subarray(srcRow + srcLeft * 4, srcRow + srcRight * 4), destRow + srcLeft * 4);
    if (srcRight < right) dest.fill(0, destRow + srcRight * 4, destRow + right * 4);
  }
}
