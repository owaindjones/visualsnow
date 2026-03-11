"use strict";

const mediaButtons = document.getElementById("media-buttons");
const banner = document.getElementById("banner");

function hideMediaButtons() {
  mediaButtons.classList.add("invisible");
  banner.classList.add("invisible");
  setTimeout(() => {
    mediaButtons.classList.add("hide");
    banner.classList.add("hide");
  }, 2000);
}

function showMediaButtons() {
  mediaButtons.classList.remove("hide");
  mediaButtons.classList.remove("invisible");
  banner.classList.remove("hide");
  banner.classList.remove("invisible");
}

export { mediaButtons, hideMediaButtons, showMediaButtons };
