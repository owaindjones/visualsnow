"use strict";

function resizeImage(file, maxWidth, maxHeight, callback) {
  // Create an Image object
  let img = new Image();

  // Set up the onload event handler
  img.onload = function() {
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

class Canvas {
  constructor(target, source, vertex, fragment) {
    this.source = source;
    this.vertex = vertex;
    this.fragment = fragment;
    this.setTarget(target);
    this.lastRender = 0.0;
    this.controlWrapper = document.getElementById("control-wrapper");
    this.fps = 1;
    this.params = {
      after: 0.01,
      contrast: 1.1,
      edges: 0.1,
      floaters: 0.1,
      motion: 0.95,
      noise: 0.45,
    }
    this.loopIds = [];
  }

  calcAspect() {
    if (!this.iScale) { return; }
    let tWidth = this.target.width || 1;
    let tHeight = this.target.height || 1;
    let tAspect = tWidth / tHeight;
    let sWidth = this.source.videoWidth || this.source.width || 1;
    let sHeight = this.source.videoHeight || this.source.height || 1;
    let sAspect = sWidth / sHeight;

    let scaleY = 1;
    let scaleX = sAspect / tAspect;
    if (scaleX < 1) {
      scaleY = 1 / scaleX;
      scaleX = 1;
    }
    this.gl.uniform2f(this.iScale, parseFloat(scaleX), parseFloat(scaleY));
  }

  setTarget(target) {
    this.target = target;
    this.target.width = Math.min(target.clientWidth, 4096);
    this.target.height = Math.min(target.clientHeight, 4096);
    this.gl = this.target.getContext("webgl", {
      colorSpace: "srgb",
      powerPreference: "low-power",
      willReadFrequently: false,
      preserveDrawingBuffer: true,
    });
    this.gl.viewport(0, 0, this.target.clientWidth, this.target.clientHeight);
    this.program = this.createProgram();
    this.gl.useProgram(this.program);
    this.initBuffer();
    this.calcAspect();
    setTimeout(() => {
      this.target.classList.add("loaded")
    }, 1000);
  }

  initBuffer() {
    // Flat 2D plane to render to, takes up full viewport
    const vertices = new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      -1.0, 1.0,
      1.0, -1.0,
      1.0, 1.0,
    ]);
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.bindAttribLocation(this.program, 0, "position");
    const positionAttributesLocation = this.gl.getAttribLocation(this.program, "position");
    this.gl.enableVertexAttribArray(positionAttributesLocation);
    this.gl.vertexAttribPointer(positionAttributesLocation, 2, this.gl.FLOAT, false, 0, 0);

    // Latest source texture
    const textureS = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureS);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.textureS = textureS;
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureS);

    // Internal parameters
    this.uSamplerS = this.gl.getUniformLocation(this.program, "uSamplerS");
    // this.uSamplerT = this.gl.getUniformLocation(this.program, "uSamplerT");
    this.gl.uniform1i(this.uSamplerS, 0);
    // this.gl.uniform1i(this.uSamplerT, 1);
    this.iResolution = this.gl.getUniformLocation(this.program, "iResolution");
    this.iScale = this.gl.getUniformLocation(this.program, "iScale");
    this.iTime = this.gl.getUniformLocation(this.program, "iTime");

    // Adjustable parameters
    this.iAfter = this.gl.getUniformLocation(this.program, "iAfter");
    this.iContrast = this.gl.getUniformLocation(this.program, "iContrast");
    this.iEdges = this.gl.getUniformLocation(this.program, "iEdges");
    this.iFloaters = this.gl.getUniformLocation(this.program, "iFloaters");
    this.iMotion = this.gl.getUniformLocation(this.program, "iMotion");
    this.iNoise = this.gl.getUniformLocation(this.program, "iNoise");
  }

  createProgram() {
    let program = this.gl.createProgram();
    let specs = [
      {source: this.vertex, type: this.gl.VERTEX_SHADER},
      {source: this.fragment, type: this.gl.FRAGMENT_SHADER},
    ];
    for (let spec of specs) {
      let shader = this.gl.createShader(spec.type);
      this.gl.shaderSource(shader, spec.source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw this.gl.getShaderInfoLog(shader);
      }
      this.gl.attachShader(program, shader);
      this.gl.deleteShader(shader);
    }
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw this.gl.getProgramInfoLog(program);
    }
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    return program;
  }

  stop() {
    while (this.loopIds.length > 0) {
      let loopId = this.loopIds.pop();
      window.cancelAnimationFrame(loopId);
    }
  }

  loop(time) {
    this.stop();
    if (!this.source || !this.target) {
      this.stop();
      return;
    }
    if (time) {
      this.render(time);
    }
    this.loopIds.push(
        window.requestAnimationFrame((time) => { this.loop(time); })
    )
  }

  render(time) {
    // Set internal parameters
    this.gl.uniform2f(this.iResolution, parseFloat(this.target.width), parseFloat(this.target.height));
    this.gl.uniform1f(this.iTime, time * 0.001);

    // Set user adjustable parameters
    this.gl.uniform1f(this.iAfter, this.params.after);
    this.gl.uniform1f(this.iContrast, this.params.contrast);
    this.gl.uniform1f(this.iEdges, this.params.edges);
    this.gl.uniform1f(this.iFloaters, this.params.floaters);
    this.gl.uniform1f(this.iMotion, 1.0 - this.params.motion);
    this.gl.uniform1f(this.iNoise, this.params.noise);

    // Upload current source image to texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureS);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );

    // Render
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    // // Render the previous source frame to other texture
    // this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureT);
    // this.gl.texImage2D(
    //   this.gl.TEXTURE_2D,
    //   0,
    //   this.gl.RGBA,
    //   this.gl.RGBA,
    //   this.gl.UNSIGNED_BYTE,
    //   this.source,
    // );

    // Calculate FPS
    if (!this.controlWrapper.classList.contains("show-fps")) { return; }
    let delta = (time - this.lastRender) * 0.001;
    if (delta < 0.001) { return; }
    let fps = 1.0 / delta;
    this.fps = (fps * 0.01) + (this.fps * 0.99);
    document.getElementById("fps").innerText = `FPS: ${Math.round(this.fps)}`;
    this.lastRender = time;
  }
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
    })
  } catch (err) {
    console.error(`Could not grab camera: ${err.name}: ${err.message}`);
    return null;
  }
  video.srcObject = stream;
}

function updateParam(el, canvas) {
  if (!el.id.startsWith("p")) { return; }
  if (!canvas.params[el.name]) { return; }
  canvas.params[el.name] = parseFloat(el.value);
}

async function start() {
  const vertex = await fetch("./js/shader.vert").then(response=>response.text());
  const fragment = await fetch("./js/shader.frag").then(response=>response.text());
  const target = document.getElementById("canvas");
  const video = document.getElementById("video");
  const image = document.getElementById("image");
  const canvas = new Canvas(target, image, vertex, fragment);
  video.addEventListener("loadedmetadata", () => {
    video.play();
  })
  let canvasListeners = {};
  function triggerVideo(eventType) {
    document.removeEventListener(eventType, canvasListeners[eventType]);
    if(video.started) { return; }
    canvas.source = video;
    video.play();
    canvas.setTarget(target);
    video.started = true;
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
    if (canvas?.source?.srcObject) {
      if (canvas.source.pause) {
        canvas.source.pause();
      }
      await setupCamera(target, video);
      canvas.source = video;
    }
    canvas.setTarget(target);
  });
  const mediaButtons = document.getElementById("media-buttons");
  function hideMediaButtons() {
    mediaButtons.classList.add("invisible");
    setTimeout(() => { mediaButtons.classList.add("hide"); }, 2000);
  }
  document.getElementById("start-webcam").addEventListener("click", async () => {
    if (canvas?.source?.pause) {
      canvas.source.pause();
    }
    await setupCamera(target, video);
    canvas.source = video;
    canvas.setTarget(target);
    hideMediaButtons();
  })
  document.getElementById("select-file").addEventListener("change", (e) => {
    let file = e.target.files[0];
    if (file.type.startsWith("image/")) {
      resizeImage(file, 2048, 2048, (url) => {
        if (canvas?.source?.pause) {
          canvas.source.pause();
        }
        image.src = url;
        canvas.source = image;
        canvas.setTarget(target);
        hideMediaButtons();
      });
    } else if(file.type.startsWith("video/")) {
      video.srcObject = null;
      video.src = URL.createObjectURL(file);
      if (canvas?.source?.pause) {
        canvas.source.pause();
      }
      canvas.source = video;
      canvas.setTarget(target);
      hideMediaButtons();
    }
  });
  document.getElementById("close-media-button").addEventListener("click", hideMediaButtons);
  for (let el of document.getElementById("controls").querySelectorAll("input")) {
    el.value = canvas.params[el.name];
    el.addEventListener("input", (e) => {
      updateParam(e.target, canvas);
    });
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
      canvas.stop();
      if (video?.pause) {
        video.pause();
      }
    } else {
      if (!banner.classList.contains("invisible")) { return; }
      banner.classList.remove("invisible");
      mediaButtons.classList.remove("hide");
      mediaButtons.classList.remove("invisible");
      canvas.loop();
      video.play();
    }
  });

  canvas.loop();
  if (video?.play) {
    video.play();
  }
}

start();

// TODO: Fix cropping
// TODO: Show the error messages when things break
// TODO: Fix dark mode
// TODO: Implement additional framebuffers for after-image shader
// TODO: All the written content!