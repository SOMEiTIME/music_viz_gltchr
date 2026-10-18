import {
  copySettings, parseStoredSettings, lastPresetKey, validPresetName, presetNames, seedPresets,
} from "./presets.js";
import { videoDrawRect } from "./videoRect.js";

const audio1 = new Audio("audio.mp3");
const video1 = document.getElementById("video");
video1.src = "video.mp4";

//iOS zooms in on focused text fields and doesn't zoom back out. maximum-scale stops that, and
//since iOS 10 Safari ignores it for pinch zoom, so users can still zoom. it's only added on
//iOS because other browsers (Android Chrome) would block pinch zoom with it. iPads report a
//Mac user agent, so they're caught by having touch points
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
audioContext.createMediaElementSource(audio1).connect(analyser);
analyser.connect(audioContext.destination);

const bufferLength = analyser.frequencyBinCount;
const soundDataArray = new Uint8Array(bufferLength);
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

  /*while these can't be directly re-used from storage like the previous settings, it's
    handy to keep them around for revoking URLs
  */
  "videoSrc": video1.src,
  "audioSrc": audio1.src,
  "videoName": "video.mp4",
  "audioName": "audio.mp3",
}

function checkExtremes(val, maxVal = 100000000000000, minVal = 1) {
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

//animate
function animate() {
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

  setTimeout(() => {
    requestAnimationFrame(animate);
  }, 1000 / fps);
}

/*Inputs*/
function input(val, name) {
  settings[name] = val;
  populateStorage();
}

function sync(type) {
  if (type == "audio") {
    audio1.load();
    if (playing.audio) {
      audio1.play();
    } else {
      audio1.pause();
    }
  } else if (type == "video") {
    video1.load();
    if (playing.video) {
      video1.play();
    } else {
      video1.pause();
    }
  }
}

function updateDisplay(files, type) {
  //FileList has length, not size; an empty list means the picker was cancelled
  if (files == null || files.length == 0) {
    return null;
  }
  //the accept attribute is only a hint, so check the type here too
  if (type != "video" && type != "audio") {
    return null;
  }
  if (!files[0].type.startsWith(type + "/")) {
    return null;
  }
  let media = null;
  if (type == "video") {
    media = video1;
  } else if (type == "audio") {
    media = audio1;
  } else {
    return null;
  }

  let objectURL = settings[type + "Src"];
  let oldSrc = settings[type + "Src"];

  if (files != null) {
    objectURL = URL.createObjectURL(files[0]);
    URL.revokeObjectURL(oldSrc);
  }

  media.src = objectURL;
  if (type == "video") {
    videoFocus = null;
  }
  settings[type + "Src"] = objectURL;
  if (files != null) {
    settings[type + "Name"] = files[0].name;
  }

  sync(type);
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

function addFavorite() {
  let inputText = document.getElementById("presetName")
  if (!validPresetName(inputText.value)) {
    inputText.value = "";
    inputText.placeholder = "Letters and numbers only";
    return null;
  }

  let presetName = inputText.value;
  let message = "Preset: '" + presetName;
  //if the preset already exists, overwrite it
  if (localStorage.getItem(presetName) != null) {
    localStorage.removeItem(presetName);
    message = message + "' updated";
  } else {
    let presetSelect = document.getElementById("presetSelect");
    presetSelect.options[presetSelect.options.length] = new Option(presetName,presetName);
    message = message + "' saved";
  }
  localStorage.setItem(presetName, JSON.stringify(settings));
  selectPreset(presetName);
  inputText.value = "";
  inputText.placeholder = message;
}

function deleteFavorite() {
  let inputText = document.getElementById("presetName")
  if (!validPresetName(inputText.value)) {
    inputText.value = "";
    inputText.placeholder = "Letters and numbers only";
    return null;
  }

  let presetName = inputText.value;
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
  inputText.value = "";
  inputText.placeholder = message;
}

function updateFavoriteLabels() {
  let audioInfo = "";
  if (settings.audioName != undefined) {
    audioInfo = settings.audioName;
  }
  document.getElementById("audioName").textContent = audioInfo;

  let videoInfo = "";
  if (settings.videoName != undefined) {
    videoInfo = settings.videoName;
  }
  document.getElementById("videoName").textContent = videoInfo;

  let presetInfoLabel = "";
  if (videoInfo != "" || audioInfo != "") {
    presetInfoLabel = "//preset saved with:";
  }
  document.getElementById("presetInfoLabel").textContent = presetInfoLabel;
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

let onState = "| >"
//play/pause buttons
function control(button) {
  let buttonName = button.value;
  if (buttonName.includes("| |")) {
    buttonName = buttonName.replace("| |", onState);
    if (buttonName.includes("AUDIO")) {
      audio1.pause();
      playing.audio = false;
    } else {
      video1.pause();
      playing.video = false;
    }
  } else if (buttonName.includes(onState)) {
    buttonName = buttonName.replace(onState, "| |");
    if (buttonName.includes("AUDIO")) {
      audio1.play();
      playing.audio = true;
    } else {
      video1.play();
      playing.video = true;
    }
  }
  button.value = buttonName;
}

//wire up controls here rather than with inline handlers so a strict CSP can be used
function bindControls() {
  document.querySelectorAll('#sidebarMenu input[type="range"]').forEach(slider => {
    slider.addEventListener("input", () => input(slider.valueAsNumber, slider.id));
  });
  document.getElementById("videoUpload").addEventListener("input", e => updateDisplay(e.target.files, "video"));
  document.getElementById("audioUpload").addEventListener("input", e => updateDisplay(e.target.files, "audio"));
  document.querySelector('button[name="favoriteButton"]').addEventListener("click", addFavorite);
  document.querySelector('button[name="deleteButton"]').addEventListener("click", deleteFavorite);
  document.getElementById("presetSelect").addEventListener("input", e => {
    //the placeholder option has an empty value
    if (e.target.value != "") {
      setToFavorite(e.target.value);
    }
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
      audioContext.resume();
      if (playing.audio) audio1.play();
      if (playing.video) video1.play();
    }
  });
}

//the click is the user gesture browsers require before audio can run
function startFromOverlay() {
  const overlay = document.getElementById("startOverlay");
  audioContext.resume();
  if (playing.audio) {
    audio1.play();
  }
  if (playing.video) {
    video1.play();
  }
  overlay.classList.add("hidden");
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