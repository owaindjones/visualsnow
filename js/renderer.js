"use strict";

class ShaderPair {
  /**
   * Named vertex+fragment shader pair
   * @param name File basename of the .vert and .frag files to load
   */
  constructor(name) {
    this.name = name;
  }

  async load() {
    /**
     * Fetches the source code of the vertex and fragment shader.
     * Writes the text of the files to `this.vertex` and
     * `this.fragment`.
     */
    this.vertex = await fetch(`./js/${this.name}.vert`).then((response) =>
      response.text(),
    );
    this.fragment = await fetch(`./js/${this.name}.frag`).then((response) =>
      response.text(),
    );
  }
}

class Renderer {
  /**
   * A WebGL renderer which renders fragment shaders to a flat 2D plane.
   * Its output buffer is the `target` HTML element which will be a
   * <canvas>.
   *
   * It uses three textures internally:
   * - `textureS`: Copied from the source HTML element, which can be a static
   *   image <img/>, a video <video/>, or a live camera feed
   *   (<video srcObject=xxx/>).
   * - `textureA1`: A separate internal framebuffer for the accumulation buffer
   *   is copied to this texture.
   * - `textureA2`: A texture to store the previous frame rendered by the
   *   `accum` program.
   *
   * It uses two programs:
   * - `main`: Main program, using `main.vert` and `main.frag`.
   * - `accum`: Accumulation effect, using `accum.vert` and `accum.frag`.
   *
   * The intention is to:
   * 1. Allow `accum.frag` to sample from the source texture `textureS`,
   *    and sample from its previous frame copied to `textureA2`.
   *
   * 2. Allow `main.frag` to sample from both the source texture `textureS`
   *    and the accumulation buffer once it has been copied to the texture
   *    `textureA1`, allowing the main fragment shader to sample the accumulation
   *    effect as a texture.
   *
   * @param target Target HTML element (canvas) for render output
   * @param source Source HTML element (image, video or canvas) for texture input
   * @param options Additional configuration
   */
  constructor(target, source, options) {
    this.options = {
      debug: false,
      ...(options || {}),
    };
    this.source = source;
    this.fps = 1;
    this.params = {
      after: 0.5,
      blur: 0.5,
      contrast: 1.1,
      edges: 0.1,
      floaters: 0.25,
      motion: 0.2,
      noise: 0.4,
    };
    this.programs = {};
    this.inputs = {};
    this.renderLoopIds = [];
    this.videoLoopIds = [];
    this.lastRender = 0.0;
    this.demoContainer = document.getElementById("demo");
    this.fpsContainer = document.getElementById("fps");
    this.target = target;
    this.sWidth = 1;
    this.sHeight = 1;
    this.firstFrame = true;
    this.init = false;
    this.visible = false;
  }

  debug(...data) {
    if (!this.options.debug) {
      return;
    }
    console.debug(...data);
  }

  getSourceSize() {
    return {
      sWidth: this.source.videoWidth || this.source.width || 1,
      sHeight: this.source.videoHeight || this.source.height || 1,
    };
  }

  getTargetSize() {
    return {
      tWidth: this.target.width || 1,
      tHeight: this.target.height || 1,
    };
  }

  calcAspect() {
    if (this.programs.length === 0) {
      return;
    }
    let { tWidth, tHeight } = this.getTargetSize();
    let tAspect = tWidth / tHeight;
    let sAspect = this.sWidth / this.sHeight;

    let scaleY = 1;
    let scaleX = sAspect / tAspect;
    if (scaleX < 1) {
      scaleY = 1 / scaleX;
      scaleX = 1;
    }
    return {
      scaleX: parseFloat(scaleX),
      scaleY: parseFloat(scaleY),
    };
  }

  initGl() {
    const gl = this.target.getContext("webgl", {
      colorSpace: "srgb",
      powerPreference: "low-power",
      willReadFrequently: false,
      preserveDrawingBuffer: true,
    });
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return gl;
  }

  async initTarget() {
    await navigator.locks.request("initTarget", async (lock) => {
      this.gl = this.initGl();
      await this.initPrograms();
      this.initPositionBuffers();
      this.initFramebuffer();
      this.init = true;
    });
    setTimeout(() => {
      this.target.classList.add("loaded");
    }, 1000);
  }

  async updateView(reinitTextures = false, resume = true) {
    if (!this.init) {
      await this.initTarget();
    }
    await navigator.locks.request("updateView", async (lock) => {
      // 4096 is the maximum texture size allowed by LibreWolf's
      // "resist fingerprinting" and is just over 4K res
      this.target.width = Math.min(this.target.clientWidth, 4096);
      this.target.height = Math.min(this.target.clientHeight, 4096);
      let { sWidth, sHeight } = this.getSourceSize();
      this.sWidth = sWidth;
      this.sHeight = sHeight;
      if (reinitTextures) {
        this.initSrcTexture();
        this.initAccumTextures();
        this.firstFrame = true;
      }
      this.initParams();
      this.updateInputs(undefined, true);
    });
    if (resume) {
      await this.renderLoop();
    }
  }

  async initPrograms() {
    this.programs = {
      main: await this.createProgram("main"),
      accum: await this.createProgram("accum"),
    };

    // Set up all the program inputs
    for (let name of Object.keys(this.programs)) {
      let program = this.programs[name];
      this.inputs[name] = {
        // Internal parameters
        uSamplerS1: this.gl.getUniformLocation(program, "uSamplerS1"),
        uSamplerS2: this.gl.getUniformLocation(program, "uSamplerS2"),
        uSamplerA2: this.gl.getUniformLocation(program, "uSamplerA2"),
        iResolution: this.gl.getUniformLocation(program, "iResolution"),
        iScale: this.gl.getUniformLocation(program, "iScale"),
        iTime: this.gl.getUniformLocation(program, "iTime"),
        iDelta: this.gl.getUniformLocation(program, "iDelta"),

        // Adjustable parameters
        iAfter: this.gl.getUniformLocation(program, "iAfter"),
        iBlur: this.gl.getUniformLocation(program, "iBlur"),
        iContrast: this.gl.getUniformLocation(program, "iContrast"),
        iEdges: this.gl.getUniformLocation(program, "iEdges"),
        iFloaters: this.gl.getUniformLocation(program, "iFloaters"),
        iMotion: this.gl.getUniformLocation(program, "iMotion"),
        iNoise: this.gl.getUniformLocation(program, "iNoise"),
      };

      if (name === "main") {
        this.inputs[name].uSamplerA1 = this.gl.getUniformLocation(
          program,
          "uSamplerA1",
        );
      }
    }
  }

  initSrcTexture() {
    // Set up latest source texture
    const textureS1 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureS1);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR,
    );
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.textureS1 = textureS1;

    // Set up "previous frame" framebuffer
    const textureS2 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureS2);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR,
    );
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.textureS2 = textureS2;
  }

  initAccumTextures() {
    // Set up render texture
    const textureA1 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE2);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureA1);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.sWidth,
      this.sHeight,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array(this.sWidth * this.sHeight * 4),
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR,
    );
    this.textureA1 = textureA1;

    // Set up render texture - previous frame
    const textureA2 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE3);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureA2);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.sWidth,
      this.sHeight,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array(this.sWidth * this.sHeight * 4),
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR,
    );
    this.textureA2 = textureA2;
  }

  initParams() {
    let { scaleX, scaleY } = this.calcAspect();

    // Set input values which don't need to be done every frame
    for (let name of Object.keys(this.programs)) {
      this.gl.useProgram(this.programs[name]);
      this.gl.uniform2f(
        this.inputs[name].iResolution,
        parseFloat(this.target.width),
        parseFloat(this.target.height),
      );
      this.gl.uniform2f(this.inputs[name].iScale, scaleX, scaleY);
    }
  }

  initFramebuffer() {
    // Set up framebuffer
    this.accumFB = this.gl.createFramebuffer();
  }

  initPositionBuffers() {
    // Flat 2D plane to render to, takes up full viewport
    const vertices = new Float32Array([
      -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
    ]);
    // Position buffer re-used by both programs
    let positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    for (let program of Object.values(this.programs)) {
      this.gl.bindAttribLocation(program, 0, "position");
      let positionAttributesLocation = this.gl.getAttribLocation(
        program,
        "position",
      );
      this.gl.enableVertexAttribArray(positionAttributesLocation);
      this.gl.vertexAttribPointer(
        positionAttributesLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0,
      );
    }
  }

  async createProgram(name) {
    let program = this.gl.createProgram();
    let shaderPack = new ShaderPair(name);
    await shaderPack.load();
    let specs = [
      { source: shaderPack.vertex, type: this.gl.VERTEX_SHADER },
      { source: shaderPack.fragment, type: this.gl.FRAGMENT_SHADER },
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
    return program;
  }

  stopRender() {
    while (this.renderLoopIds.length > 0) {
      let loopId = this.renderLoopIds.pop();
      window.cancelAnimationFrame(loopId);
    }
  }

  stopVideo() {
    while (this.videoLoopIds.length > 0) {
      let loopId = this.videoLoopIds.pop();
      this.source.cancelVideoFrameCallback(loopId);
    }
  }

  videoLoop(time = undefined) {
    this.stopVideo();
    if (!this.source || !this.target) {
      return;
    }
    if (time) {
      this.updateSrcTexture();
    }
    if (!this.source.requestVideoFrameCallback || !this.visible) {
      return;
    }
    if (!time) {
      console.debug("Started video loop");
    }
    this.videoLoopIds.push(
      this.source.requestVideoFrameCallback((time) => {
        this.videoLoop(time);
      }),
    );
  }

  async renderLoop(time = undefined) {
    this.stopRender();
    if (!this.source || !this.target) {
      return;
    }
    if (!this.init) {
      await this.updateView(true);
    }
    if (time) {
      await this.render(time);
    }
    if (!this.visible) {
      return;
    }
    if (!time) {
      console.debug("Renderer started");
    }
    this.renderLoopIds.push(
      window.requestAnimationFrame(async (time) => {
        await this.renderLoop(time);
      }),
    );
  }

  updateParam(event) {
    if (!event || !event.target) {
      return;
    }
    if (!event.target.id.startsWith("p")) {
      return;
    }
    let name = event.target.name;
    if (!this.params[name]) {
      return;
    }
    let value = parseFloat(event.target.value);
    this.params[name] = value;
    let name_arr = name.split("");
    name_arr[0] = name_arr[0].toUpperCase();
    name_arr.unshift("i");
    let iName = name_arr.join("");
    for (let program_name of Object.keys(this.programs)) {
      let program = this.programs[program_name];
      let input = this.inputs[program_name][iName];
      if (!this.gl || !program || !input) {
        continue;
      }
      this.gl.useProgram(program);
      this.gl.uniform1f(input, value);
    }
  }

  calcFPS(time) {
    // Calculate FPS
    this.debug("calculate fps");
    let delta = (time - this.lastRender) * 0.001;
    if (delta < 0.001) {
      return;
    }
    let fps = 1.0 / delta;
    this.fps = fps * 0.01 + this.fps * 0.99;
    if (!this.fpsContainer.classList.contains("hide")) {
      this.fpsContainer.innerText = `FPS: ${Math.round(this.fps)}`;
    }
    this.lastRender = time;
    return fps;
  }

  updateInputs(time, setUserParams = false) {
    // Update all the inputs for the fragment shaders in both programs
    this.debug("update inputs for shaders");
    for (let name of Object.keys(this.programs)) {
      let program = this.programs[name];
      let inputs = this.inputs[name];
      this.gl.useProgram(program);

      if (time) {
        // Set internal parameters
        this.gl.uniform1f(inputs.iTime, time * 0.001);
        this.gl.uniform1f(inputs.iDelta, (time - this.lastRender) * 0.001);
        // Read textureS1 into uSamplerS1 for both programs, from texture slot 0
        this.gl.uniform1i(this.inputs[name].uSamplerS1, 0);
        this.gl.uniform1i(this.inputs[name].uSamplerS2, 1);
        // and A2 from texture slot 3
        this.gl.uniform1i(this.inputs[name].uSamplerA2, 3);
      }

      if (!setUserParams) {
        continue;
      }
      // Set user adjustable parameters
      this.gl.uniform1f(inputs.iAfter, this.params.after);
      this.gl.uniform1f(inputs.iBlur, this.params.blur);
      this.gl.uniform1f(inputs.iContrast, this.params.contrast);
      this.gl.uniform1f(inputs.iEdges, this.params.edges);
      this.gl.uniform1f(inputs.iFloaters, this.params.floaters);
      this.gl.uniform1f(inputs.iMotion, 1.0 - this.params.motion);
      this.gl.uniform1f(inputs.iNoise, this.params.noise);
    }
  }

  updateSrcTexture() {
    // Upload current source image to texture
    if (!this.init) {
      // This might be called by a media callback before renderer is
      // fully initialised
      return;
    }
    this.debug("upload current source image to texture");
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureS1);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );
  }

  renderAccum() {
    // Render accumulation buffer
    this.debug("render accumulation buffer");
    this.gl.useProgram(this.programs.accum);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.accumFB);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      this.textureA1,
      0,
    );
    this.gl.viewport(0, 0, this.sWidth, this.sHeight);
    //this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  updateAccumFrame() {
    // Now copy current framebuffer into textureA2 after rendering
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureA2);
    this.gl.copyTexImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      0,
      0,
      this.sWidth,
      this.sHeight,
      0,
    );
  }

  saveFrame() {
    // Update output framebuffer into textureS2 after rendering
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureS2);
    this.gl.copyTexImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      0,
      0,
      this.target.width,
      this.target.height,
      0,
    );
  }

  renderMain() {
    // Render main view
    this.debug("render main view");
    this.gl.useProgram(this.programs.main);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.target.width, this.target.height);
    // Read textureA1 into uSamplerA1 for main program, from texture slot 2
    this.gl.uniform1i(this.inputs.main.uSamplerA1, 2);
    //this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  async render(time) {
    await navigator.locks.request("render", (lock) => {
      this.updateInputs(time, false);
      if (!this.source.requestVideoFrameCallback) {
        this.updateSrcTexture();
      }
      this.renderAccum();
      this.updateAccumFrame();
      if (!this.firstFrame) {
        this.renderMain();
        this.saveFrame();
      }
      this.firstFrame = false;
      this.calcFPS(time);
    });
  }

  stop() {
    this.stopVideo();
    this.stopRender();
    if (this.source.pause) {
      this.source.pause();
    }
    console.debug("Renderer stopped");
  }
}

export { Renderer };
