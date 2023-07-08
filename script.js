const videoInput = document.getElementById("videoUpload");
const audioInput = document.querySelector("audioUpload");

let audio1 = new Audio();
audio1.src = "02 Cool Blue.mp3";
const video1 = document.getElementById("video");
video1.src = "plane.mp4";
video1.type = "video/mp4";

//initialize canvas, container
const container = document.getElementById("container");
const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const canvasContext = canvas.getContext("2d");

const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
const offscreenContext = offscreenCanvas.getContext("2d");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioSource = null;
let analyser = null;

audio1.play();
video1.play();

//create analyizer
audioSource = audioContext.createMediaElementSource(audio1);
analyser = new AnalyserNode(audioContext);
audioSource.connect(analyser);
analyser.connect(audioContext.destination);

analyser.fftSize = 32;
analyser.smoothingTimeConstant = .8;
analyser.maxDecibels = -30;
analyser.minDecibels = -100;
const bufferLength = analyser.frequencyBinCount;
const soundDataArray = new Uint8Array(bufferLength);
const barWidth = canvas.width / bufferLength;

const fps = 120;

let settings = {
  "frameDataIncrement": 2,
  "gapMultiplier": .09, //multiplied by barHeight
  "frameDataGapMultiplier": 1, //multiplied by barHeight
  "frameDataOffsetMultiplier": .5, //multiplied by barHeight
  "frameDataHighCutoff": 250,
  "frameDataLowCutoff": 50,
  "frameDataEmptyVal": 0,
  "adjustedGapMultiplier": .1,
  "vizBarHeightMultiplier": 2,

  /*while these can't be directly re-used from storage like the previous settings, it's
    handy to keep them around for revoking URLs
  */
  "videoSrc": video1.src,
  "audioSrc": audio1.src,
}

function copySettings(newSettings) {
  Object.keys(settings).map(name => settings[name] = newSettings[name]);
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

//animate
let x = 0;

function animate() {
  x = 0;
  offscreenContext.drawImage(video1, 0, 0, canvas.width, canvas.height);
  analyser.getByteFrequencyData(soundDataArray);

  for (let i = 0; i < bufferLength; i++) {
    barHeight = soundDataArray[i];
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

function updateVideoDisplay(files) {
  var oldSrc = settings.videoSrc;
  var objectURL = URL.createObjectURL(files[0]);
  video1.src = objectURL;
  settings.videoSrc = objectURL;
  video1.load();
  video1.play();
  URL.revokeObjectURL(oldSrc);
  populateStorage();
}

function updateAudioDisplay(files) {
  var objectURL = settings.audioSrc;
  var oldSrc = settings.audioSrc;

  if (files != null) {
    objectURL = URL.createObjectURL(files[0]);
    URL.revokeObjectURL(oldSrc);
  }

  audio1.src = objectURL;
  settings.audioSrc = objectURL;

  audio1.load();
  audio1.play();
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
  copySettings(JSON.parse(localStorage.getItem("current")));
}

function addFavorite() {
  let inputText = document.getElementById("presetName")
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
  inputText.value = "";
  inputText.placeholder = message;
}

function setToFavorite(presetName) {
  let newSettings = localStorage.getItem(presetName);
  if (newSettings != null) {
    copySettings(JSON.parse(newSettings));
    populateStorage();

    //update all the sliders
    Object.keys(settings).forEach(name => {
      let input = document.getElementById(name);
      if (settings[name] != null && input != null) {
        input.value = settings[name];
      }
    });
  }
}

function loadSelections() {
  let presetSelect = document.getElementById("presetSelect");
  for (let index = 0; index < localStorage.length; index++) {

    //add the names of each stored settings to the options bar
    let presetName = localStorage.key(index);
    if (presetName != "current") {
      presetSelect.options[presetSelect.options.length] = new Option(localStorage.key(index), localStorage.key(index), index);
    }
  }
}


window.onload = (event) => {
  animate();
  loadSelections();
}