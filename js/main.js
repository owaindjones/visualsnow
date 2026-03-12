import { Renderer } from "./renderer.js";
import { resizeImage, setupCamera, selectRandomMedia } from "./media.js";
import { hideMediaButtons, showMediaButtons } from "./ui.js";

("use strict");

async function start() {
  selectRandomMedia("safe");
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
    await renderer.setTarget(target);
    renderer.videoLoop();
    for (let eventType of eventTypes) {
      if (canvasListeners[eventType]) {
        window.removeEventListener(eventType, canvasListeners[eventType]);
      }
    }
  }
  video.addEventListener("playing", onPlay);
  image.addEventListener("load", async () => {
    await renderer.setTarget(target);
    renderer.updateSrcTexture();
  });
  async function displayChange(resetCamera) {
    if (resetCamera && renderer?.source?.srcObject) {
      renderer.stop();
      await setupCamera(target, video);
      video.play();
    }
  }
  window.addEventListener("resize", async () => {
    await displayChange(true);
  });
  window
    .matchMedia("(orientation: portrait)")
    .addEventListener("change", displayChange);
  document
    .getElementById("random-video")
    .addEventListener("click", async () => {
      renderer.stop();
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
          image.src = url;
          renderer.source = image;
          hideMediaButtons();
        });
      } else if (file.type.startsWith("video/")) {
        video.srcObject = null;
        video.src = URL.createObjectURL(file);
        renderer.stop();
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
      if (video?.pause) {
        video.pause();
      }
      renderer.stop();
    } else {
      if (!banner.classList.contains("invisible")) {
        return;
      }
      banner.classList.remove("invisible");
      showMediaButtons();
      if (video?.play) {
        await video.play();
      }
    }
  });
  await renderer.setTarget(target);
  renderer.videoLoop();
  if (video?.play) {
    await video.play();
  }
}

start();

// TODO: Fix the camera orientation on Waterfox for Android? (Might be "resist fingerprinting")
// TODO: Refactor main.js to be less spaghetti, move more UI stuff into ui.js
// TODO: Optimise render pipeline + shaders
// TODO: Show the error messages when things break
// TODO: Implement additional render textures to allow gaussian blurring in shader for edge "halo" effect
// TODO: All the written content!
