"use strict";

const mediaButtons = document.getElementById("media-buttons");
const controlWrapper = document.getElementById("control-wrapper");
const fps = document.getElementById("fps");
const demo = document.getElementById("demo");

function hideMediaButtons() {
  mediaButtons.classList.add("invisible");
  controlWrapper.classList.add("invisible");
  fps.classList.add("invisible");
  setTimeout(() => {
    mediaButtons.classList.add("hide");
    controlWrapper.classList.add("hide");
    fps.classList.add("hide");
  }, 2000);
}

function showMediaButtons() {
  mediaButtons.classList.remove("hide");
  mediaButtons.classList.remove("invisible");
  controlWrapper.classList.remove("hide");
  controlWrapper.classList.remove("invisible");
  fps.classList.remove("hide");
  fps.classList.remove("invisible");
}

export { mediaButtons, hideMediaButtons, showMediaButtons };
