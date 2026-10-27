import {
  copySettings, parseStoredSettings, lastPresetKey, validPresetName, presetNames, seedPresets,
} from "./presets.js";
import { videoDrawRect } from "./videoRect.js";
import { beatDetector, glitchFrame } from "./byteMode.js";

const audio1 = document.getElementById("audio");
audio1.src = "audio.mp3";
const video1 = document.getElementById("video");
video1.src = "video.mp4";

//iOS zooms in on focused text fields and doesn't zoom back out. maximum-scale stops that, and
//iOS Safari ignores it for pinch zoom. other browsers (Android Chrome) would block pinch zoom
//with it, so it's iOS only. iPads report a Mac user agent, so they're caught by touch points
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform == "MacIntel" && navigator.maxTouchPoints > 1);
if (isIOS) {
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport.content += ", maximum-scale=1";
}

//initialize canvas
const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const canvasContext = canvas.getContext("2d");

const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
//animate() reads this canvas back every frame, so keep it in CPU memory
const offscreenContext = offscreenCanvas.getContext("2d", { willReadFrequently: true });

//what the play/pause buttons say, kept apart from the elements' paused state
//since the browser can block autoplay
const playing = { audio: true, video: true };
const media = { audio: audio1, video: video1 };
//muted video is allowed to autoplay, so the first frame shows behind the start overlay.
//audio waits for the overlay click (see startFromOverlay)
video1.play().catch(() => {});

//create analyizer
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = new AnalyserNode(audioContext, {
  fftSize: 32,
  smoothingTimeConstant: .8,
  maxDecibels: -30,
  minDecibels: -100,
});
//byte mode's beats get their own analyser: the one above smooths away the jumps a beat is,
//its lowest bins reach well above the bass, and loud music pins them at 255. analysers pass
//the sound through unchanged, so the two are chained
const beatAnalyser = new AnalyserNode(audioContext, {
  fftSize: 1024,
  smoothingTimeConstant: 0,
  maxDecibels: -10,
  minDecibels: -90,
});
audioContext.createMediaElementSource(audio1).connect(beatAnalyser);
beatAnalyser.connect(analyser);
analyser.connect(audioContext.destination);

const bufferLength = analyser.frequencyBinCount;
const soundDataArray = new Uint8Array(bufferLength);
const beatDataArray = new Uint8Array(beatAnalyser.frequencyBinCount);
//bins up to about 150 Hz, where kick drums are. bin 0 (down to 0 Hz) is skipped
const bassBins = Math.max(1, Math.round(150 / (audioContext.sampleRate / beatAnalyser.fftSize)));

//the bass level, 0 to 255, for beat detection
function bassLevel() {
  beatAnalyser.getByteFrequencyData(beatDataArray);
  let total = 0;
  for (let i = 1; i <= bassBins; i++) total += beatDataArray[i];
  return total / bassBins;
}
let barWidth = canvas.width / bufferLength;

//keep the canvases matched to the window, including when a phone or tablet rotates
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  offscreenCanvas.width = canvas.width;
  offscreenCanvas.height = canvas.height;
  barWidth = canvas.width / bufferLength;
}
window.addEventListener("resize", resizeCanvas);

const fps = 120;

let settings = {
  "frameDataIncrement": 7, //2
  "gapMultiplier": 0.03, //.09, //multiplied by barHeight
  "frameDataGapMultiplier": 5, //1, //multiplied by barHeight
  "frameDataOffsetMultiplier": 0.3,//0.5, //multiplied by barHeight
  "frameDataHighCutoff": 250,
  "frameDataLowCutoff": 50,//50,
  "frameDataEmptyVal": 0,
  "adjustedGapMultiplier": 0.05,//.1,
  "vizBarHeightMultiplier": 0,//0.1,//2,

  //byte mode (see byteMode.js). the mode itself isn't a setting, so presets never turn it on
  "erodeEvery": 10, //frames between glitches in "every N frames"
  "erodeHold": 4, //frames a glitched frame stays on screen
  "erodeDamage": 1, //multiplies how much of each frame gets corrupted
  "erodeScale": 0.5, //size the frame is glitched at, as a share of the canvas
  "beatJump": 1.4, //how far above the recent average the bass must jump to count as a beat
  "beatFloor": 60, //bass level a beat must be louder than
  "beatRest": 8, //frames after a beat before the next can count

  //the sources are never restored from storage (see copySettings) but are kept for
  //revoking URLs. the names show what a preset was saved with
  "videoSrc": video1.src,
  "audioSrc": audio1.src,
  "videoName": "video.mp4",
  "audioName": "audio.mp3",
}

function checkExtremes(val, maxVal, minVal = 1) {
  if (val > maxVal) {
    return maxVal;
  }
  if (val < minVal) {
    return minVal;
  }

  return val;
}

//edges of the bundled video's text column, as fractions of its width (in pixels: 526 to
//1302 of 1966). Uploads set videoFocus to null, which crops around the center
const defaultVideoFocus = { left: 526 / 1966, right: 1302 / 1966 };
let videoFocus = defaultVideoFocus;

//fill the letterbox bars by reflecting the video's top and bottom edges into them
function paintMirroredBars(context, rect) {
  const [sx, sy, sw, sh, , dy, , dh] = rect;
  if (dy <= 0) return;
  const band = Math.min(sh, dy * sh / dh);
  context.save();
  context.translate(0, dy);
  context.scale(1, -1);
  context.drawImage(video1, sx, sy, sw, band, 0, 0, canvas.width, dy);
  context.restore();
  context.save();
  context.translate(0, canvas.height);
  context.scale(1, -1);
  context.drawImage(video1, sx, sy + sh - band, sw, band, 0, 0, canvas.width, dy);
  context.restore();
}

/*Byte mode: encode a frame as JPEG, corrupt its bytes with Media-Eroder's core, decode it
  and show it for a few frames in place of the video. Its timings show in the sidebar, since
  whether it's fast enough is still being tested
*/
let byteMode = "off"; //"off", "frames" (every erodeEvery frames) or "beats"
const isBeat = beatDetector();
let frameCount = 0;
let erodeBusy = false; //one frame is glitched at a time; triggers while busy are skipped
let erodedFrame = null; //the last glitched frame: { bitmap, framesLeft }
//the frame is shrunk onto this canvas (by erodeScale) before it's encoded
const erodeCanvas = new OffscreenCanvas(1, 1);
const erodeContext = erodeCanvas.getContext("2d");
//totals since byte mode last changed, so the readout averages over the whole run rather than
//one second. slowestFps is the worst full second's frame rate, slowestFrame the longest gap
//between two frames and slowestAnimate the longest animate() call, both in ms. loudestBass
//is the highest bass level in the last second
const emptyStats = () => ({
  frames: 0, eroded: 0, failed: 0, encode: 0, glitch: 0, decode: 0, draws: 0, draw: 0,
  beats: 0, loudestBass: 0,
  start: performance.now(), secondStart: performance.now(), secondFrames: 0, slowestFps: Infinity,
  lastFrame: null, slowestFrame: 0, slowestAnimate: 0,
});
let byteStats = emptyStats();

//glitches the offscreen canvas as it is now. convertToBlob takes its snapshot when called,
//so animate() can keep drawing while this runs
async function erodeFrame(level) {
  erodeBusy = true;
  try {
    let start = performance.now();
    erodeCanvas.width = Math.max(1, Math.round(canvas.width * settings.erodeScale));
    erodeCanvas.height = Math.max(1, Math.round(canvas.height * settings.erodeScale));
    erodeContext.drawImage(offscreenCanvas, 0, 0, erodeCanvas.width, erodeCanvas.height);
    const jpeg = await erodeCanvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    let now = performance.now();
    byteStats.encode += now - start;

    start = now;
    const glitched = glitchFrame(bytes, level, settings.erodeDamage);
    now = performance.now();
    byteStats.glitch += now - start;

    start = now;
    let bitmap = null;
    try {
      bitmap = glitched && await createImageBitmap(new Blob([glitched], { type: "image/jpeg" }));
    } catch (e) {
      //the browser refused the corrupted file
    }
    if (!bitmap) {
      //the clean frame stays
      byteStats.failed++;
    }
    byteStats.decode += performance.now() - start;
    byteStats.eroded++;

    if (bitmap) {
      erodedFrame?.bitmap.close();
      erodedFrame = { bitmap, framesLeft: settings.erodeHold };
    }
  } finally {
    erodeBusy = false;
  }
}

//starts a glitch when byte mode's trigger fires, then draws the held glitched frame if any
function drawByteMode() {
  frameCount++;
  byteStats.frames++;
  byteStats.secondFrames++;
  const level = Math.max(soundDataArray[0], soundDataArray[1]);
  const bass = bassLevel();
  const beat = isBeat(bass, { ratio: settings.beatJump, minLevel: settings.beatFloor, rest: settings.beatRest });
  if (beat) byteStats.beats++;
  byteStats.loudestBass = Math.max(byteStats.loudestBass, bass);
  const trigger = byteMode == "frames" ? frameCount % settings.erodeEvery == 0 : byteMode == "beats" && beat;
  if (trigger && !erodeBusy) {
    erodeFrame(level);
  }

  if (erodedFrame && erodedFrame.framesLeft > 0) {
    erodedFrame.framesLeft--;
    const start = performance.now();
    offscreenContext.drawImage(erodedFrame.bitmap, 0, 0, canvas.width, canvas.height);
    byteStats.draw += performance.now() - start;
    byteStats.draws++;
  }
}

//records how long a frame took, then shows the readout once a second
function timeFrame(animateStart) {
  const now = performance.now();
  byteStats.slowestAnimate = Math.max(byteStats.slowestAnimate, now - animateStart);
  if (byteStats.lastFrame != null) {
    byteStats.slowestFrame = Math.max(byteStats.slowestFrame, animateStart - byteStats.lastFrame);
  }
  byteStats.lastFrame = animateStart;

  if (now - byteStats.secondStart >= 1000) {
    const fps = byteStats.secondFrames * 1000 / (now - byteStats.secondStart);
    byteStats.slowestFps = Math.min(byteStats.slowestFps, fps);
    byteStats.secondStart = now;
    byteStats.secondFrames = 0;
    showByteStats(byteStats, now);
    byteStats.loudestBass = 0;
  }
}

function showByteStats(stats, now) {
  const elapsed = now - stats.start;
  const perSecond = n => (n * 1000 / elapsed).toFixed(0);
  const mean = (total, count = stats.eroded) => count ? (total / count).toFixed(1) : "-";
  const fps = `${perSecond(stats.frames)} fps (slowest second ${stats.slowestFps.toFixed(0)}) ` +
    `over ${(elapsed / 1000).toFixed(0)} s, slowest frame ${stats.slowestFrame.toFixed(0)} ms ` +
    `(animate ${stats.slowestAnimate.toFixed(0)} ms), ${canvas.width}×${canvas.height}`;
  //what a beat needs right now, for tuning Beat Jump and Beat Floor
  const average = isBeat.average ?? 0;
  const beats = byteMode != "beats" ? "" :
    ` ${(stats.beats * 1000 / elapsed).toFixed(1)} beats/s. Loudest bass this second ` +
    `${stats.loudestBass.toFixed(0)}, average ${average.toFixed(0)}: a beat needs above ` +
    `${Math.max(settings.beatFloor, average * settings.beatJump).toFixed(0)}.`;
  //with byte mode off, the frame rate alone is the baseline to compare against
  document.getElementById("byteStats").textContent = byteMode == "off" ? fps :
    `${fps}.${beats} ${perSecond(stats.eroded)} glitched/s, ` +
    `${stats.failed}/${stats.eroded} failed to decode. ` +
    `ms per glitch: encode ${mean(stats.encode)}, glitch ${mean(stats.glitch)}, ` +
    `decode ${mean(stats.decode)}, draw ${mean(stats.draw, stats.draws)} per frame`;
}

//animate
function animate() {
  const animateStart = performance.now();
  let x = 0;
  const rect = videoDrawRect(video1.videoWidth, video1.videoHeight, canvas.width, canvas.height, videoFocus);
  if (rect) {
    //drawImage leaves the letterbox bars untouched, so start from black and mirror into them
    offscreenContext.fillStyle = "#000";
    offscreenContext.fillRect(0, 0, canvas.width, canvas.height);
    offscreenContext.drawImage(video1, ...rect);
    paintMirroredBars(offscreenContext, rect);
  } else {
    offscreenContext.drawImage(video1, 0, 0, canvas.width, canvas.height);
  }
  analyser.getByteFrequencyData(soundDataArray);
  drawByteMode();

  for (let i = 0; i < bufferLength; i++) {
    let barHeight = soundDataArray[i];
    if (barHeight == 0) {
      barHeight = 1;
    }

    let imageY = checkExtremes(0 + barHeight * settings.gapMultiplier, canvas.height);
    let imageWidth = checkExtremes(barWidth - barHeight * settings.gapMultiplier, canvas.height);

    let frame = offscreenContext.getImageData(x, imageY, imageWidth, canvas.height);

    let frameData = frame.data;
    for (let k = 0; k < frameData.length; k += settings.frameDataIncrement) {
      let newVal = frameData[k + (barHeight * settings.frameDataGapMultiplier)]
      newVal = newVal + barHeight * settings.frameDataOffsetMultiplier;

      if (newVal > settings.frameDataHighCutoff || newVal < settings.frameDataLowCutoff) {
        newVal = settings.frameDataEmptyVal;
      }

      frameData[k] = newVal;
    }

    canvasContext.putImageData(frame, x + (barHeight * settings.adjustedGapMultiplier), 0);
    canvasContext.putImageData(frame, x, canvas.height - (settings.vizBarHeightMultiplier * barHeight));

    x += barWidth;
  }
  timeFrame(animateStart);

  setTimeout(() => {
    requestAnimationFrame(animate);
  }, 1000 / fps);
}

/*Inputs*/
function input(val, name) {
  settings[name] = val;
  populateStorage();
}

//plays or pauses an element to match its button
function applyPlaying(type) {
  if (playing[type]) {
    media[type].play();
  } else {
    media[type].pause();
  }
}

//plays whatever the buttons say should be playing
function resumePlaying() {
  audioContext.resume();
  if (playing.audio) audio1.play();
  if (playing.video) video1.play();
}

//swaps in an uploaded "video" or "audio" file
function updateDisplay(files, type) {
  //an empty list means the picker was cancelled. the accept attribute is only a hint,
  //so check the file's type here too
  if (files == null || files.length == 0 || !files[0].type.startsWith(type + "/")) {
    return;
  }

  const objectURL = URL.createObjectURL(files[0]);
  URL.revokeObjectURL(settings[type + "Src"]);
  media[type].src = objectURL;
  if (type == "video") {
    videoFocus = null;
  }
  settings[type + "Src"] = objectURL;
  settings[type + "Name"] = files[0].name;

  media[type].load();
  applyPlaying(type);
  populateStorage();
}

/* Local storage for presets*/
if (!localStorage.getItem("current")) {
  populateStorage();
} else {
  updateSettings();
}

function populateStorage() {
  localStorage.setItem("current", JSON.stringify(settings));
  updateSettings();
}

function updateSettings() {
  copySettings(settings, parseStoredSettings(localStorage, "current"));
}

/* Favorites Controls */
function selectPreset(presetName) {
  let presetSelect = document.getElementById("presetSelect");
  presetSelect.value = presetName;
  if (presetSelect.value == presetName) {
    localStorage.setItem(lastPresetKey, presetName);
  }
}

//runs action on the typed preset name, then clears the field and shows action's message
//(or a hint for an invalid name) as its placeholder
function withPresetName(action) {
  const inputText = document.getElementById("presetName");
  const presetName = inputText.value;
  inputText.value = "";
  inputText.placeholder = validPresetName(presetName) ? action(presetName) : "Letters and numbers only";
}

function addFavorite(presetName) {
  let message = "Preset: '" + presetName;
  //if the preset already exists, overwrite it
  if (localStorage.getItem(presetName) != null) {
    message = message + "' updated";
  } else {
    let presetSelect = document.getElementById("presetSelect");
    presetSelect.options[presetSelect.options.length] = new Option(presetName,presetName);
    message = message + "' saved";
  }
  localStorage.setItem(presetName, JSON.stringify(settings));
  selectPreset(presetName);
  return message;
}

function deleteFavorite(presetName) {
  let message = "Preset: '" + presetName;
  if (localStorage.getItem(presetName) != null) {
    localStorage.removeItem(presetName);
    if (localStorage.getItem(lastPresetKey) == presetName) {
      localStorage.removeItem(lastPresetKey);
    }

    let presetSelect = document.getElementById("presetSelect");
    for (let i = 0; i < presetSelect.length; i++) {
      if (presetSelect.options[i].value == presetName) {
        presetSelect.remove(i);
      }
    }

    message = message + "' deleted";
  } else {
    message = message + "' never existed";
  }
  return message;
}

function updateFavoriteLabels() {
  const audioInfo = settings.audioName ?? "";
  const videoInfo = settings.videoName ?? "";
  document.getElementById("audioName").textContent = audioInfo;
  document.getElementById("videoName").textContent = videoInfo;
  document.getElementById("presetInfoLabel").textContent =
    videoInfo != "" || audioInfo != "" ? "//preset saved with:" : "";
}

function setToFavorite(presetName) {
  let newSettings = localStorage.getItem(presetName);
  if (presetName != "current") {
    document.getElementById("presetName").value = presetName;
  }
  if (newSettings != null) {
    if (presetName != "current") {
      localStorage.setItem(lastPresetKey, presetName);
    }
    copySettings(settings, parseStoredSettings(localStorage, presetName));
    populateStorage();

    //update all the sliders
    Object.keys(settings).forEach(name => {
      let input = document.getElementById(name);
      if (settings[name] != null && input != null) {
        input.value = settings[name];
      }
    });

    updateFavoriteLabels();
  }
}

//adds the starter presets shipped in public/presets.json (see seedPresets)
async function seedStarterPresets() {
  try {
    const response = await fetch("presets.json");
    seedPresets(localStorage, await response.json());
  } catch (e) {
    //starter presets are optional
  }
}

function loadSelections() {
  let presetSelect = document.getElementById("presetSelect");
  presetSelect.options[0] = new Option("Choose preset", "");

  presetNames(localStorage).forEach(presetName => {
    presetSelect.options[presetSelect.options.length] = new Option(presetName, presetName);
  });

  //value stays on the placeholder if the remembered preset no longer exists
  presetSelect.value = localStorage.getItem(lastPresetKey) || "";
}

//play/pause buttons. the label shows the action a click takes: "| |" pauses, "| >" plays
function control(button) {
  const type = button.value.includes("AUDIO") ? "audio" : "video";
  playing[type] = !button.value.includes("| |");
  button.value = playing[type] ? button.value.replace("| >", "| |") : button.value.replace("| |", "| >");
  applyPlaying(type);
}

//wire up controls here rather than with inline handlers so a strict CSP can be used
function bindControls() {
  document.querySelectorAll('#sidebarMenu input[type="range"]').forEach(slider => {
    slider.addEventListener("input", () => input(slider.valueAsNumber, slider.id));
  });
  document.getElementById("videoUpload").addEventListener("input", e => updateDisplay(e.target.files, "video"));
  document.getElementById("audioUpload").addEventListener("input", e => updateDisplay(e.target.files, "audio"));
  document.querySelector('button[name="favoriteButton"]').addEventListener("click", () => withPresetName(addFavorite));
  document.querySelector('button[name="deleteButton"]').addEventListener("click", () => withPresetName(deleteFavorite));
  document.getElementById("presetSelect").addEventListener("input", e => {
    //the placeholder option has an empty value
    if (e.target.value != "") {
      setToFavorite(e.target.value);
    }
  });
  document.getElementById("byteMode").addEventListener("input", e => {
    byteMode = e.target.value;
    byteStats = emptyStats();
  });
  document.querySelectorAll(".controlButton").forEach(button => {
    button.addEventListener("click", () => control(button));
  });
}

//close the sidebar by tapping outside it or by swiping it left, and open it by dragging from the left edge
function bindSidebarClose() {
  const toggle = document.getElementById("openSidebarMenu");
  const menu = document.getElementById("sidebarMenu");
  const icon = document.querySelector(".sidebarIconToggle");
  const touchscreen = window.matchMedia("(pointer: coarse)");

  //the focused element when a tap begins, since by the time its click fires focus has moved
  let focusedAtTap = null;
  document.addEventListener("pointerdown", () => {
    focusedAtTap = document.activeElement;
  }, true);

  //on narrow phones the sidebar fills the screen, so swiping is the way out there
  document.addEventListener("click", e => {
    //on touchscreens a tap on the menu's empty space closes it too. taps on controls or their
    //labels don't count, nor does the tap that dismisses the keyboard from the preset name field
    const onEmptyMenu = menu.contains(e.target) && !e.target.closest("input, select, button, label")
      && !(focusedAtTap && focusedAtTap.matches("input[type=text]"));
    if (toggle.checked && onEmptyMenu && touchscreen.matches) {
      toggle.checked = false;
      return;
    }

    //tapping the icon label makes the browser re-fire the click on the checkbox itself, which
    //must not count as outside or the menu would close the moment it opened
    const outside = e.target != toggle && !menu.contains(e.target) && !icon.contains(e.target);
    if (toggle.checked && outside) {
      toggle.checked = false;
    } else if (!toggle.checked && outside && touchscreen.matches && !e.target.closest("#startOverlay")) {
      //the app has no canvas touch controls, so on touchscreens a tap in the middle of the screen
      //opens the menu. the start overlay is skipped so that starting the show doesn't also open it
      const inCenter = Math.abs(e.clientX / window.innerWidth - 0.5) < 0.25
        && Math.abs(e.clientY / window.innerHeight - 0.5) < 0.25;
      if (inCenter) toggle.checked = true;
    }
  });

  //drags move the menu with the finger, then hand back to the stylesheet's transition.
  //"close" swipes the open menu left; "open" pulls the closed menu out from the left edge
  const edgeSize = 48;
  let mode = null; //"close", "open", or null while no gesture is being tracked
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let offset = 0; //how far the menu has been dragged from its resting position

  document.addEventListener("touchstart", e => {
    mode = null;
    dragging = false;
    offset = 0;
    if (e.touches.length != 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    if (toggle.checked) {
      //leave sliders and the like alone so adjusting them never closes the menu
      if (menu.contains(e.target) && !e.target.closest('input, select, button')) mode = "close";
    } else if (startX < edgeSize) {
      mode = "open";
    }
  }, { passive: true });

  document.addEventListener("touchmove", e => {
    if (!mode) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      //wait to see which way the gesture goes so vertical scrolling still works
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        mode = null;
        return;
      }
      const rightway = mode == "close" ? dx < -10 : dx > 10;
      if (!rightway || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      menu.style.transition = "none";
    }
    //stop the browser from also treating the drag as a scroll or back gesture
    e.preventDefault();
    const width = menu.offsetWidth;
    offset = mode == "close" ? Math.min(0, dx) : Math.min(width, Math.max(0, dx));
    const position = mode == "close" ? offset : offset - width;
    menu.style.transform = `translateX(${position}px)`;
  }, { passive: false });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    menu.style.transition = "";
    menu.style.transform = "";
    if (mode == "close" && offset < -60) toggle.checked = false;
    if (mode == "open" && offset > 60) toggle.checked = true;
    mode = null;
  };
  document.addEventListener("touchend", endDrag);
  document.addEventListener("touchcancel", endDrag);
}

//on touchscreens, stop the media while the page is in the background and pick up again on return.
//`playing` holds what the user asked for, so it is left alone and decides what resumes
function bindBackgroundPause() {
  const touchscreen = window.matchMedia("(pointer: coarse)");
  document.addEventListener("visibilitychange", () => {
    if (!touchscreen.matches) return;
    if (document.hidden) {
      audio1.pause();
      video1.pause();
    } else if (document.getElementById("startOverlay").classList.contains("hidden")) {
      resumePlaying();
    }
  });
}

//the click is the user gesture browsers require before audio can run
function startFromOverlay() {
  resumePlaying();
  document.getElementById("startOverlay").classList.add("hidden");
}

window.onload = async () => {
  bindControls();
  bindSidebarClose();
  bindBackgroundPause();
  document.getElementById("startOverlay").addEventListener("click", startFromOverlay, { once: true });
  //start from the saved version of the last preset, so the dropdown and sliders agree and
  //unsaved slider edits don't carry over a reload. "current" only holds the edits of a
  //session that never picked a preset
  const lastPreset = localStorage.getItem(lastPresetKey);
  setToFavorite(lastPreset != null && localStorage.getItem(lastPreset) != null ? lastPreset : "current");
  animate();
  await seedStarterPresets();
  loadSelections();
}