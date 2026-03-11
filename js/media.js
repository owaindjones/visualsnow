"use strict";

const assets = {
  // Safe = not too much motion, fairly static scenery.
  // No flashing lights.
  safe: ["book", "clouds", "laptop", "wheat"],
  more: ["candlelight", "flames", "plums", "shore", "street", "water"],
};

function selectRandomMedia(category = undefined) {
  const image = document.getElementById("image");
  const video = document.getElementById("video");
  let selectedAssets = [...assets.safe, ...assets.more];
  if (category) {
    selectedAssets = assets[category];
  }
  const asset =
    selectedAssets[Math.floor(Math.random() * selectedAssets.length)];
  image.src = `./assets/${asset}.jpg`;
  video.src = `./assets/${asset}.webm`;
  video.srcObject = null;
}

function resizeImage(file, maxWidth, maxHeight, callback) {
  // Create an Image object
  let img = new Image();

  // Set up the onload event handler
  img.onload = function () {
    // Create a canvas
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");

    // Calculate the new image dimensions
    let ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    let newWidth = img.width * ratio;
    let newHeight = img.height * ratio;

    // Set canvas dimensions
    canvas.width = newWidth;
    canvas.height = newHeight;

    // Draw the image on the canvas
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // Convert the canvas to a data URL
    let dataUrl = canvas.toDataURL("image/jpeg");

    // Execute the callback with the resized image
    callback(dataUrl);
  };

  // Load the image file
  img.src = URL.createObjectURL(file);
}

async function setupCamera(target, video) {
  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "environment",
        width: target.clientWidth,
        height: target.clientHeight,
        resizeMode: "crop-and-scale",
      },
    });
  } catch (err) {
    console.error(`Could not grab camera: ${err.name}: ${err.message}`);
    return null;
  }
  video.srcObject = stream;
}

export { resizeImage, setupCamera, selectRandomMedia, assets };
