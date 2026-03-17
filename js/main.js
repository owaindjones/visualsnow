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
  const targetWrapper = document.getElementById("demo");
  const video = document.getElementById("video");
  const image = document.getElementById("image");
  const renderer = new Renderer(target, image, {
    vertex: await fetch("./js/main.vert").then((response) => response.text()),
    fragment: await fetch("./js/main.frag").then((response) => response.text()),
    accum: await fetch("./js/accum.frag").then((response) => response.text()),
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
    console.debug("Triggered video");
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
    await renderer.updateView(true, true);
    renderer.videoLoop();
    for (let eventType of eventTypes) {
      if (canvasListeners[eventType]) {
        window.removeEventListener(eventType, canvasListeners[eventType]);
      }
    }
  }
  video.addEventListener("loadedmetadata", async () => {
    renderer.source = video;
    await video.play();
    if (!renderer.visible) {
      await renderer.stop();
    }
  });
  video.addEventListener("playing", onPlay);
  image.addEventListener("load", async () => {
    await renderer.updateView(true, true);
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
  document.getElementById("go-to-demo").addEventListener("click", async (e) => {
    e.preventDefault();
    targetWrapper.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
  const demoObserver = new IntersectionObserver(
    async (events) => {
      let entry = events[0];
      if (entry.intersectionRatio > 0.1) {
        showMediaButtons();
        if (renderer.visible) {
          return;
        }
        renderer.visible = true;
        if (renderer.source === video) {
          if (renderer.source.srcObject) {
            await setupCamera(target, video, false, true);
          } else {
            await video.play();
          }
        } else {
          renderer.videoLoop();
          await renderer.renderLoop();
        }
        let url = new URL(window.location);
        url.hash = "demo";
        window.history.pushState({}, "", url);
      } else {
        hideMediaButtons();
        if (!renderer.init) {
          return;
        }
        renderer.stop();
        renderer.visible = false;
        await stopVideo(video);
      }
    },
    { threshold: 0.1, rootMargin: "-25%" },
  );
  demoObserver.observe(targetWrapper);
  const sectionObserver = new IntersectionObserver(
    async (events) => {
      let entry = events[0];
      if (!entry.isIntersecting) {
        return;
      }
      let title = entry.target.querySelector("h1 a[href]");
      if (!title?.href?.includes("#")) {
        return;
      }
      window.history.pushState({}, "", title.href);
    },
    {
      threshold: 0.6,
    },
  );
  for (let section of document.getElementsByTagName("section")) {
    sectionObserver.observe(section);
  }
  await renderer.renderLoop(0);
  selectRandomMedia("safe");
  if (window.location.search.includes("refresh")) {
    const refreshEvery = parseFloat(window.location.search.split("=")[1]);
    setTimeout(() => {
      window.location.reload();
    }, refreshEvery);
  }
}

await start();

// TODO: Combined sobel + gaussian blur for "halo" effect
// TODO: Optimise shaders
// TODO: Fix the camera orientation on Waterfox for Android? (Might be "resist fingerprinting")
// TODO: Refactor main.js to be less spaghetti, move more UI stuff into ui.js
// TODO: Show the error messages when things break
// TODO: All the written content!
