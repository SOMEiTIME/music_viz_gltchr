const videoInput = document.getElementById("videoUpload");
const audioInput = document.querySelector("audioUpload");

let audio1 = new Audio();
//audio1.src = "Christophe Aline.mp3";
const video1 = document.getElementById("video");
//video1.src = "plane.mp4";
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

analyser.fftSize = 32; //32
analyser.smoothingTimeConstant = .8; //.8
analyser.maxDecibels = -30; //-30
analyser.minDecibels = -100; //-100
const bufferLength = analyser.frequencyBinCount;
const soundDataArray = new Uint8Array(bufferLength);
const barWidth = canvas.width / bufferLength;

const fps = 120; //120


let settings = {
  "frameDataIncrement": 2,
  "gapMultiplier": .09, //multiplied by barHeight //.1
  "frameDataGapMultiplier": 1, //multiplied by barHeight //1
  "frameDataOffsetMultiplier": .5, //multiplied by barHeight //.5
  "frameDataHighCutoff": 250, //250
  "frameDataLowCutoff": 50, //50
  "frameDataEmptyVal": 0, //0

  "adjustedGapMultiplier": .1, //.1
  "vizBarHeightMultiplier": 2, //2
}

/*
function updateSettings() {
  Object.keys(settings).map(name => settings[name] = document.getElementById(name));
}*/

function checkExtremes(val, maxVal = 100000000000000, minVal = 1) {
  if (val > maxVal) {
    null//return maxVal;
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
  offscreenContext.drawImage(video1, 0, 0, canvas.width, canvas.height)
  analyser.getByteFrequencyData(soundDataArray);

  /*
  //processes the entire image, shifting the colors
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  let frame = offscreenContext.getImageData(0, 0, canvas.width, canvas.height);
  const frameData = frame.data;

  analyser.getByteFrequencyData(soundDataArray);
  for (let i = 0; i < frameData.length; i += 1) {
    barHeight = soundDataArray[Math.round(bufferLength / i)];
    frameData[i] = frameData[i + barHeight] + barHeight * .5;
    i = i + 1;
  }
  canvasContext.putImageData(frame, 0, 0); 
  */

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
      let newVal = frameData[k + (barHeight * settings.frameDataGapMultiplier)] + barHeight * settings.frameDataOffsetMultiplier;
      if (newVal > settings.frameDataHighCutoff || newVal < settings.frameDataLowCutoff) {
        newVal = settings.frameDataEmptyVal;
      }
      frameData[k] = newVal;
    }

    canvasContext.putImageData(frame, x + (barHeight * settings.adjustedGapMultiplier), 0);
    canvasContext.putImageData(frame, x, canvas.height - (settings.vizBarHeightMultiplier * barHeight));
    //draw rectangles
    //canvasContext.fillRect(x, canvas.height - 2 * barHeight, barWidth - barWidth/3, barHeight);
    x += barWidth;
  }

  setTimeout(() => {
    requestAnimationFrame(animate);
  }, 1000 / fps);
}

function input(val, name) {
  settings[name] = val;
}

function updateVideoDisplay(files) {
  var objectURL = URL.createObjectURL(files[0]);
  video1.src = objectURL;
  video1.load();
  video1.play();
}

function updateAudioDisplay(files) {
  var objectURL = URL.createObjectURL(files[0]);
  audio1.src = objectURL;
  audio1.load();
  audio1.play();
}

document.onLoad = function() {
  updateSettings();
}

//updateSettings();
animate();
