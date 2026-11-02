//byte mode's encode, glitch and decode (see erodeFrame() in script.js), kept off the main
//thread. Chrome encodes a canvas in idle time, which a busy render loop leaves none of
import { glitchFrame } from "./byteMode.js";

const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext("bitmaprenderer");

//takes a frame bitmap, replies with the glitched bitmap (null if it didn't decode) at
//width x height, so drawing it each frame needs no scaling, and the timings in ms.
//it always replies, since the main thread waits for it before glitching another frame
onmessage = async ({ data }) => {
  const result = { bitmap: null, encode: 0, glitch: 0, decode: 0 };
  try {
    await erode(data, result);
  } finally {
    postMessage(result, result.bitmap ? [result.bitmap] : []);
  }
};

async function erode({ frame, level, damage, width, height }, result) {
  let start = performance.now();
  canvas.width = frame.width;
  canvas.height = frame.height;
  context.transferFromImageBitmap(frame);
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let now = performance.now();
  result.encode = now - start;

  start = now;
  const glitched = glitchFrame(bytes, level, damage);
  now = performance.now();
  result.glitch = now - start;

  start = now;
  try {
    result.bitmap = glitched && await createImageBitmap(new Blob([glitched], { type: "image/jpeg" }),
      { resizeWidth: width, resizeHeight: height });
  } catch (e) {
    //the browser refused the corrupted file
  }
  result.decode = performance.now() - start;
}
