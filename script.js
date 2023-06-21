let audio1 = new Audio();
audio1.src = "THE FEAR.mp3";
let video1 = document.getElementById("video");
video1.src = "pool.mp4";
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
analyser = audioContext.createAnalyser();
audioSource.connect(analyser);
analyser.connect(audioContext.destination);

analyser.fftSize = 32;
const bufferLength = analyser.frequencyBinCount;
const soundDataArray = new Uint8Array(bufferLength);
const barWidth = canvas.width / bufferLength;

const fps = 120;

let gapMultiplier = .05; //multiplied by barHeight
let frameDataIncrement = 4; //important, changes the colors - 4
let framDataGapMultiplier = 1; //multiplied by barHeight
let frameDataOffsetMultiplier = .5; //multiplied by barHeight
let framDataHighCutoff = 250;
let frameDataLowCutoff = 50;
let frameDataEmptyVal = 0;

let adjustedGapMultiplier = .1;
let vizBarHeightMultiplier = 2;

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

    let imageY = checkExtremes(0 + barHeight * gapMultiplier, canvas.height);
    let imageWidth = checkExtremes(barWidth - barHeight * gapMultiplier, canvas.height);

    let frame = offscreenContext.getImageData(x, imageY, imageWidth, canvas.height);

    let frameData = frame.data;
    for (let k = 0; k < frameData.length; k += frameDataIncrement) {
      let newVal = frameData[k + (barHeight * framDataGapMultiplier)] + barHeight * frameDataOffsetMultiplier;
      if (newVal > framDataHighCutoff || newVal < frameDataLowCutoff) {
        newVal = frameDataEmptyVal;
      }
      frameData[k] = newVal
    }

    canvasContext.putImageData(frame, x + (barHeight * adjustedGapMultiplier), 0);
    canvasContext.putImageData(frame, x, canvas.height - (vizBarHeightMultiplier * barHeight));
    //draw rectangles
    //canvasContext.fillRect(x, canvas.height - 2 * barHeight, barWidth - barWidth/3, barHeight);
    x += barWidth;
  }

  setTimeout(() => {
    requestAnimationFrame(animate);
  }, 1000 / fps);
}

animate();