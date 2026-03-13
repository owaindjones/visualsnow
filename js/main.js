import { Renderer } from "./renderer.js";
import {
  resizeImage,
  setupCamera,
  stopVideo,
  selectRandomMedia,
} from "./media.js";
import { hideMediaButtons, showMediaButtons } from "./ui.js";

("use strict");

async function start() {
  const target = document.getElementById("canvas");
  const video = document.getElementById("video");
  const image = document.getElementById("image");
  const renderer = new Renderer(target, image, {
    vertex: await fetch("./js/main.vert").then((response) => response.text()),
    fragment: await fetch("./js/main.frag").then((response) => response.text()),
    accum: await fetch("./js/accum.frag").then((response) => response.text()),
  });
  video.addEventListener("loadedmetadata", async () => {
    renderer.source = video;
    await video.play();
  });
  const eventTypes = [
    "mousemove",
    "mousedown",
    "mouseup",
    "focus",
    "mouseover",
    "mouseout",
    "keydown",
    "keyup",
    "touchstart",
    "touchmove",
    "scroll",
    "DOMContentLoaded",
    "ready",
  ];
  let canvasListeners = {};
  async function triggerVideo(eventType, event) {
    await video.play();
    return true;
  }
  for (let eventType of eventTypes) {
    canvasListeners[eventType] = async (event) => {
      await triggerVideo(eventType, event);
    };
    window.addEventListener(eventType, canvasListeners[eventType]);
  }
  async function onPlay() {
    renderer.source = video;
    await renderer.updateView(true);
    renderer.videoLoop();
    for (let eventType of eventTypes) {
      if (canvasListeners[eventType]) {
        window.removeEventListener(eventType, canvasListeners[eventType]);
      }
    }
  }
  video.addEventListener("playing", onPlay);
  image.addEventListener("load", async () => {
    await renderer.updateView(true);
  });
  async function displayChange(resetCamera, resume = false) {
    if (resetCamera && renderer?.source?.srcObject) {
      renderer.stop();
      await setupCamera(target, video, false, false);
    } else {
      await renderer.updateView(false, resume);
    }
  }
  window.addEventListener("resize", async () => {
    const threshold = 100;
    let lastWidth = window.lastWidth || 0;
    let lastHeight = window.lastHeight || 0;
    let resetCamera = false;
    if (
      Math.abs(window.innerWidth - lastWidth) > threshold &&
      Math.abs(window.innerHeight - lastHeight) > threshold
    ) {
      resetCamera = true;
    }
    window.lastWidth = window.innerWidth;
    window.lastHeight = window.innerHeight;
    await displayChange(resetCamera);
  });
  window
    .matchMedia("(orientation: portrait)")
    .addEventListener("change", displayChange);
  document
    .getElementById("random-video")
    .addEventListener("click", async () => {
      renderer.stop();
      await stopVideo(video);
      selectRandomMedia();
      renderer.source = image;
    });
  document
    .getElementById("start-webcam")
    .addEventListener("click", async () => {
      renderer.stop();
      await setupCamera(target, video, true);
      hideMediaButtons();
    });
  document
    .getElementById("select-file")
    .addEventListener("change", async (e) => {
      let file = e.target.files[0];
      if (file.type.startsWith("image/")) {
        resizeImage(file, 2048, 2048, async (url) => {
          renderer.stop();
          await stopVideo(video);
          image.src = url;
          renderer.source = image;
          hideMediaButtons();
        });
      } else if (file.type.startsWith("video/")) {
        video.srcObject = null;
        video.src = URL.createObjectURL(file);
        renderer.stop();
        await stopVideo(video);
        renderer.source = video;
        hideMediaButtons();
      }
    });
  document.getElementById("canvas").addEventListener("click", showMediaButtons);
  document
    .getElementById("close-media-button")
    .addEventListener("click", hideMediaButtons);
  for (let el of document
    .getElementById("controls")
    .querySelectorAll("input")) {
    el.value = renderer.params[el.name];
    el.addEventListener("input", (event) => {
      renderer.updateParam(event);
    });
    // Try and stop mobile browsers from scrolling the screen when a user
    // drags up or down on one of the sliders
    el.addEventListener("mousedown", () => {
      document.ontouchstart = (e) => {
        e.preventDefault();
      };
    });
    el.addEventListener("mouseup", () => {
      document.ontouchstart = (e) => {
        return true;
      };
    });
  }
  document.getElementById("info-link").addEventListener("click", (e) => {
    e.preventDefault();
    const intro = document.getElementById("section-introduction");
    intro.scrollIntoView({
      behavior: "smooth",
    });
    let url = new URL(window.location);
    url.hash = "section-introduction";
    window.history.pushState({}, "", url);
  });
  const banner = document.getElementById("banner");
  window.addEventListener("scroll", async () => {
    if (window.scrollY >= window.innerHeight * 0.66) {
      if (banner.classList.contains("invisible")) {
        return;
      }
      banner.classList.add("invisible");
      hideMediaButtons();
      renderer.stop();
      await stopVideo(video);
    } else {
      if (!banner.classList.contains("invisible")) {
        return;
      }
      banner.classList.remove("invisible");
      showMediaButtons();
      if (renderer.source === video) {
        if (renderer.source.srcObject) {
          await setupCamera(target, video, false, true);
        } else if (video?.play) {
          await video.play();
        }
      } else {
        renderer.renderLoop();
      }
    }
  });
  await renderer.initTarget();
  selectRandomMedia("safe");
}

start();

// TODO: Combined sobel + gaussian blur for "halo" effect
// TODO: Optimise shaders
// TODO: Fix the camera orientation on Waterfox for Android? (Might be "resist fingerprinting")
// TODO: Refactor main.js to be less spaghetti, move more UI stuff into ui.js
// TODO: Show the error messages when things break
// TODO: All the written content!
