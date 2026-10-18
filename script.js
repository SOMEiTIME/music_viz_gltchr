const audio1 = new Audio("audio.mp3");
const video1 = document.getElementById("video");
video1.src = "video.mp4";

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

//numeric settings and the slider ranges in index.html they must stay within
const numericRanges = {
  frameDataIncrement: [2, 10],
  gapMultiplier: [0, 1],
  frameDataGapMultiplier: [0, 5],
  frameDataOffsetMultiplier: [0, 2],
  frameDataHighCutoff: [0, 255],
  frameDataLowCutoff: [0, 255],
  frameDataEmptyVal: [0, 255],
  adjustedGapMultiplier: [0, 1],
  vizBarHeightMultiplier: [0, 6],
};

function copySettings(newSettings) {
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
    //media sources are never restored from storage (see comment on settings)
    if (name === "videoSrc" || name === "audioSrc") {
      return;
    }
    settings[name] = typeof value === "string" ? value : undefined;
  });
}

function parseStoredSettings(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
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
const focusMargin = 0.04;

//returns drawImage's source and destination rects: the video cropped to fill the canvas at
//its real shape, centered on videoFocus. If the screen is too narrow for the whole focus
//column (a portrait phone), it shows all of the column and letterboxes instead
function videoDrawRect() {
  const vw = video1.videoWidth;
  const vh = video1.videoHeight;
  if (!vw || !vh) {
    return null;
  }

  const canvasAspect = canvas.width / canvas.height;
  let sw = vw;
  let sh = vw / canvasAspect;
  if (canvasAspect < vw / vh) {
    sh = vh;
    sw = vh * canvasAspect;
  }

  let centerX = vw / 2;
  let dh = canvas.height;
  if (videoFocus) {
    const columnWidth = (videoFocus.right - videoFocus.left + focusMargin * 2) * vw;
    centerX = (videoFocus.left + videoFocus.right) / 2 * vw;
    if (sw < columnWidth) {
      sw = Math.min(vw, columnWidth);
      sh = vh;
      dh = canvas.width * sh / sw;
    }
  }

  const sx = Math.min(vw - sw, Math.max(0, centerX - sw / 2));
  const sy = (vh - sh) / 2;
  return [sx, sy, sw, sh, 0, (canvas.height - dh) / 2, canvas.width, dh];
}

//animate
function animate() {
  let x = 0;
  const rect = videoDrawRect();
  if (rect) {
    //paint the letterbox bars, which drawImage leaves untouched
    offscreenContext.fillStyle = "#000";
    offscreenContext.fillRect(0, 0, canvas.width, canvas.height);
    offscreenContext.drawImage(video1, ...rect);
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
  copySettings(parseStoredSettings("current"));
}

/* Favorites Controls */
const favoriteRegex = /^[\s\w]*$/;

//localStorage keys that hold app state rather than presets
const lastPresetKey = "lastPreset";
const seededKey = "seededPresets";
const reservedKeys = ["current", lastPresetKey, seededKey];

function validPresetName(name) {
  return name != "" && favoriteRegex.test(name) && !reservedKeys.includes(name);
}

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
    copySettings(parseStoredSettings(presetName));
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

//presets shipped in public/presets.json are copied into localStorage once each, so
//presets the user has since edited or deleted aren't brought back
async function seedStarterPresets() {
  let starters = null;
  try {
    const response = await fetch("presets.json");
    starters = await response.json();
  } catch (e) {
    return;
  }
  if (starters == null || typeof starters !== "object") {
    return;
  }

  let seeded = parseStoredSettings(seededKey);
  if (!Array.isArray(seeded)) {
    seeded = [];
  }
  Object.keys(starters).forEach(name => {
    if (!validPresetName(name) || seeded.includes(name) || localStorage.getItem(name) != null) {
      return;
    }
    localStorage.setItem(name, JSON.stringify(starters[name]));
    seeded.push(name);
  });
  localStorage.setItem(seededKey, JSON.stringify(seeded));
}

function loadSelections() {
  let presetSelect = document.getElementById("presetSelect");
  presetSelect.options[0] = new Option("Choose preset", "");

  let sortable = [];
  for (let index = 0; index < localStorage.length; index++) {
    //add the names of each stored settings to the options bar
    let presetName = localStorage.key(index);
    if (!reservedKeys.includes(presetName)) {
      sortable.push(presetName);
    }
  }
  sortable.sort();

  sortable.forEach(presetName => {
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

//close the sidebar by tapping outside it or by swiping it left
function bindSidebarClose() {
  const toggle = document.getElementById("openSidebarMenu");
  const menu = document.getElementById("sidebarMenu");
  const icon = document.querySelector(".sidebarIconToggle");

  //on narrow phones the sidebar fills the screen, so swiping is the way out there
  document.addEventListener("click", e => {
    //tapping the icon label makes the browser re-fire the click on the checkbox itself, which
    //must not count as outside or the menu would close the moment it opened
    if (toggle.checked && e.target != toggle && !menu.contains(e.target) && !icon.contains(e.target)) {
      toggle.checked = false;
    }
  });

  let startX = 0;
  let startY = 0;
  let dragX = 0;
  let dragging = false;
  let tracking = false;
  menu.addEventListener("touchstart", e => {
    //leave sliders and the like alone so adjusting them never closes the menu
    tracking = e.touches.length == 1 && !e.target.closest('input, select, button');
    dragging = false;
    dragX = 0;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  menu.addEventListener("touchmove", e => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      //wait to see which way the gesture goes so vertical scrolling still works
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) tracking = false;
      if (dx < -10 && Math.abs(dx) > Math.abs(dy)) dragging = true;
      else return;
    }
    dragX = Math.min(0, dx);
    menu.style.transition = "none";
    menu.style.transform = `translateX(${dragX}px)`;
  }, { passive: true });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    tracking = false;
    //hand control back to the stylesheet, which animates to the open or closed position
    menu.style.transition = "";
    menu.style.transform = "";
    if (dragX < -60) toggle.checked = false;
  };
  menu.addEventListener("touchend", endDrag);
  menu.addEventListener("touchcancel", endDrag);
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