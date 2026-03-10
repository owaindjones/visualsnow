import { Renderer } from "./renderer.js";
import { resizeImage, setupCamera } from "./media.js";
import { hideMediaButtons, showMediaButtons } from "./ui.js";

"use strict";

async function start() {
  const target = document.getElementById("canvas");
  const video = document.getElementById("video");
  const image = document.getElementById("image");
  const renderer = new Renderer(
      target, image,
      {
        vertex: await fetch("./js/main.vert").then(response=>response.text()),
        fragment: await fetch("./js/main.frag").then(response=>response.text()),
        accum: await fetch("./js/accum.frag").then(response=>response.text()),
      }
  );
  video.addEventListener("loadedmetadata", () => {
    video.play();
    renderer.videoLoop();
  })
  let canvasListeners = {};
  async function triggerVideo(eventType) {
    document.removeEventListener(eventType, canvasListeners[eventType]);
    if(video.started) { return; }
    renderer.source = video;
    video.play();
    await renderer.setTarget(target);
    video.started = true;
    renderer.videoLoop();
  }
  for(let eventType of [
      "mousemove",
      "mousedown",
      "mouseover",
      "keydown",
      "touchstart",
      "touchmove",
      "scroll",
      "DOMContentLoaded",
      "ready",
  ]) {
    canvasListeners[eventType] = () => {
      triggerVideo(eventType);
    }
    document.addEventListener(
      eventType,
      canvasListeners[eventType],
    );
  }

  window.addEventListener("resize", async () => {
    // TODO: Make resizing window more efficient:
    //       - Don't need to re-init the whole renderer every time
    if (renderer?.source?.srcObject) {
      if (renderer.source.pause) {
        renderer.source.pause();
        renderer.stopVideo();
      }
      await setupCamera(target, video);
    }
    await renderer.setTarget(target);
    renderer.videoLoop();
  });
  const mediaButtons = document.getElementById("media-buttons");
  document.getElementById("start-webcam").addEventListener("click", async () => {
    if (renderer?.source?.pause) {
      renderer.source.pause();
      renderer.stopVideo();
    }
    await setupCamera(target, video);
    await renderer.setTarget(target);
    renderer.videoLoop();
    hideMediaButtons();
  })
  document.getElementById("select-file").addEventListener("change", async (e) => {
    let file = e.target.files[0];
    if (file.type.startsWith("image/")) {
      resizeImage(file, 2048, 2048, async (url) => {
        if (renderer?.source?.pause) {
          renderer.source.pause();
          renderer.stopVideo();
        }
        image.src = url;
        renderer.source = image;
        await renderer.setTarget(target);
        hideMediaButtons();
      });
    } else if(file.type.startsWith("video/")) {
      video.srcObject = null;
      video.src = URL.createObjectURL(file);
      if (renderer?.source?.pause) {
        renderer.source.pause();
        renderer.stopVideo();
      }
      renderer.source = video;
      await renderer.setTarget(target);
      renderer.videoLoop();
      hideMediaButtons();
    }
  });
  document.getElementById("close-media-button").addEventListener("click", hideMediaButtons);
  for (let el of document.getElementById("controls").querySelectorAll("input")) {
    el.value = renderer.params[el.name];
    el.addEventListener("input", (event) => { renderer.updateParam(event) });
    // Try and stop mobile browsers from scrolling the screen when a user
    // drags up or down on one of the sliders
    el.addEventListener("mousedown", () => {
      document.ontouchstart = (e) => {
        e.preventDefault();
      }
    });
    el.addEventListener("mouseup", () => {
      document.ontouchstart = (e) => {
        return true;
      }
    })
  }
  document.getElementById("info-link").addEventListener("click", (e) => {
    e.preventDefault();
    const intro = document.getElementById("section-introduction");
    intro.scrollIntoView({
      behavior: "smooth",
    })
    let url = new URL(window.location);
    url.hash = "section-introduction"
    window.history.pushState(
        {}, "", url,
    );
  })
  const banner = document.getElementById("banner");

  window.addEventListener("scroll", () => {
    if (window.scrollY >= (window.innerHeight * 0.66)) {
      if (banner.classList.contains("invisible")) { return; }
      banner.classList.add("invisible");
      hideMediaButtons();
      renderer.stopRender();
      if (video?.pause) {
        video.pause();
        renderer.stopVideo();
      }
    } else {
      if (!banner.classList.contains("invisible")) { return; }
      banner.classList.remove("invisible");
      showMediaButtons();
      renderer.renderLoop();
      if (video?.play) {
        renderer.videoLoop();
        video.play();
      }
    }
  });

  await renderer.setTarget(target);
  renderer.renderLoop();
  if (video?.play) {
    renderer.videoLoop();
    video.play();
  }
}

start();

// TODO: Refactor main.js to be less spaghetti, move more UI stuff into ui.js
// TODO: Fix the requestVideoFrame texture upload
// TODO: Optimise render pipeline + shaders
// TODO: Show the error messages when things break
// TODO: Fix dark mode
// TODO: Implement additional render textures to allow gaussian blurring in shader
// TODO: All the written content!
