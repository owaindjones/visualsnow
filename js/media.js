"use strict";

const assets = {
  // Safe = not too much motion, fairly static scenery.
  // No flashing lights.
  safe: ["book", "clouds", "laptop", "wheat", "moon", "ness"],
  more: ["candlelight", "flames", "plums", "shore", "street", "water", "band"],
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

async function stopVideo(video) {
  if (!video.pause) {
    return;
  }
  video.pause();
  if (!video.srcObject) {
    return;
  }
  for (let track of video.srcObject.getTracks()) {
    await track.stop();
  }
}

async function setupCamera(
  target,
  video,
  toggleFacingMode = false,
  reset = false,
) {
  let stream = null;
  let maxSize = Math.max(target.clientWidth, target.clientHeight);
  if (!video.facingMode) {
    video.facingMode = "environment";
  } else if (toggleFacingMode) {
    if (video.facingMode === "environment") {
      video.facingMode = "user";
    } else {
      video.facingMode = "environment";
    }
  }
  video.pause();
  const constraints = {
    facingMode: video.facingMode,
    width: { ideal: maxSize },
    height: { ideal: maxSize },
    resizeMode: "crop-and-scale",
  };
  if (!reset && !toggleFacingMode && video.srcObject) {
    for (let track of video.srcObject.getVideoTracks()) {
      await track.applyConstraints(constraints);
    }
    video.play();
    return;
  }
  await stopVideo(video);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: constraints,
    });
  } catch (err) {
    return;
  }
  video.src = null;
  video.srcObject = stream;
  video.play();
}

export { resizeImage, setupCamera, stopVideo, selectRandomMedia, assets };
