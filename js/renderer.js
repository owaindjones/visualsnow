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
    this.vertex = await fetch(
        `./js/${this.name}.vert`
    ).then(response=>response.text());
    this.fragment = await fetch(
        `./js/${this.name}.frag`
    ).then(response=>response.text());
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
        ...(options || {})
    }
    this.source = source;
    this.fps = 1;
    this.params = {
      after: 0.75,
      contrast: 1.1,
      edges: 0.1,
      floaters: 0.25,
      motion: 0.2,
      noise: 0.4,
    }
    this.programs = {};
    this.inputs = {};
    this.renderLoopIds = [];
    this.videoLoopIds = [];
    this.lastRender = 0.0;
    this.firstFrame = false;
    this.controlWrapper = document.getElementById("control-wrapper");
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
        sHeight: this.source.videoHeight || this.source.height || 1
    };
  }

  getTargetSize() {
    return {
      tWidth: this.target.width || 1,
      tHeight: this.target.height || 1
    }
  }

  calcAspect() {
    if (this.programs.length === 0) { return; }
    let { tWidth, tHeight } = this.getTargetSize();
    let tAspect = tWidth / tHeight;
    let { sWidth, sHeight } = this.getSourceSize();
    let sAspect = sWidth / sHeight;

    let scaleY = 1;
    let scaleX = sAspect / tAspect;
    if (scaleX < 1) {
      scaleY = 1 / scaleX;
      scaleX = 1;
    }
    return {
        scaleX: parseFloat(scaleX),
        scaleY: parseFloat(scaleY),
    }
  }

  initGl(target) {
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

  async setTarget(target) {
    this.target = target;
    // 4096 is the maximum texture size allowed by LibreWolf's
    // "resist fingerprinting" and is just over 4K res
    this.target.width = Math.min(target.clientWidth, 4096);
    this.target.height = Math.min(target.clientHeight, 4096);
    this.gl = this.initGl(this.target);
    await this.initPrograms();
    this.initPositionBuffers();
    this.initFramebuffer();
    this.initParams();
    this.initSrcTexture();
    this.initAccumTextures();
    setTimeout(() => {
      this.target.classList.add("loaded")
    }, 1000);
  }

  async initPrograms() {
    this.programs = {
        main: await this.createProgram('main'),
        accum: await this.createProgram('accum'),
    };

    // Set up all the program inputs
    for (let name of Object.keys(this.programs)) {
      let program = this.programs[name];
      this.inputs[name] = {
        // Internal parameters
        uSamplerS: this.gl.getUniformLocation(program, "uSamplerS"),
        uSamplerA2: this.gl.getUniformLocation(program, "uSamplerA2"),
        iResolution: this.gl.getUniformLocation(program, "iResolution"),
        iScale: this.gl.getUniformLocation(program, "iScale"),
        iTime: this.gl.getUniformLocation(program, "iTime"),

        // Adjustable parameters
        iAfter: this.gl.getUniformLocation(program, "iAfter"),
        iContrast: this.gl.getUniformLocation(program, "iContrast"),
        iEdges: this.gl.getUniformLocation(program, "iEdges"),
        iFloaters: this.gl.getUniformLocation(program, "iFloaters"),
        iMotion: this.gl.getUniformLocation(program, "iMotion"),
        iNoise: this.gl.getUniformLocation(program, "iNoise"),
      }

      if (name === "main") {
        this.inputs[name].uSamplerA1 = this.gl.getUniformLocation(
            program, "uSamplerA1"
        );
      }
    }
  }

  initSrcTexture() {
    // Set up latest source texture
    const textureS = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureS);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.source,
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR
    );
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.textureS = textureS;
  }

  initAccumTextures() {
    // Set up render texture
    const textureA1 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureA1);
    let { sWidth, sHeight } = this.getSourceSize();
    this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        sWidth,
        sHeight,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        new Uint8Array(sWidth * sHeight * 4),
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR
    );
    this.textureA1 = textureA1;

    // Set up render texture - previous frame
    const textureA2 = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE2);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureA2);
    this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        sWidth,
        sHeight,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        new Uint8Array(sWidth * sHeight * 4),
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
        this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR
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
          parseFloat(this.target.width), parseFloat(this.target.height)
      );
      this.gl.uniform2f(
          this.inputs[name].iScale,
          scaleX,
          scaleY,
      )
    }

    this.firstFrame = true;
  }

  initFramebuffer() {
    // Set up framebuffer
    this.accumFB = this.gl.createFramebuffer();
  }

  initPositionBuffers() {
    // Flat 2D plane to render to, takes up full viewport
    const vertices = new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      -1.0, 1.0,
      1.0, -1.0,
      1.0, 1.0,
    ]);
    // Position buffer re-used by both programs
    let positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    for (let program of Object.values(this.programs)) {
      this.gl.bindAttribLocation(program, 0, "position");
      let positionAttributesLocation = this.gl.getAttribLocation(
          program, "position"
      );
      this.gl.enableVertexAttribArray(positionAttributesLocation);
      this.gl.vertexAttribPointer(
          positionAttributesLocation, 2, this.gl.FLOAT,
          false, 0, 0
      );
    }
  }

  async createProgram(name) {
    let program = this.gl.createProgram();
    let shaderPack = new ShaderPair(name);
    await shaderPack.load();
    let specs = [
      {source: shaderPack.vertex, type: this.gl.VERTEX_SHADER},
      {source: shaderPack.fragment, type: this.gl.FRAGMENT_SHADER},
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
    // TODO: this function is a no-op for now as the callbacks aren't working
    //  most of the time, have fallen back to copying video frames to textures
    //  as part of the main renderLoop
    this.stopVideo();
    if (!this.source || this.target) {
      return;
    }
    // if (time) {
    //   this.updateSrcTexture();
    // }
    this.videoLoopIds.push(
        this.target.requestVideoFrameCallback(
            (time) => {
              this.videoLoop(time);
            }
        )
    )
  }

  renderLoop(time = undefined) {
    this.stopRender();
    if (!this.source || !this.target) {
      return;
    }
    if (time) {
      this.render(time);
    }
    this.renderLoopIds.push(
        window.requestAnimationFrame(
            (time) => {
              this.renderLoop(time);
            }
        )
    )
  }

  updateParam(event) {
    if (!event || !event.target) { return; }
    if (!event.target.id.startsWith("p")) { return; }
    if (!this.params[event.target.name]) { return; }
    this.params[event.target.name] = parseFloat(event.target.value);
  }

  calcFPS(time) {
    // Calculate FPS
    if (!this.controlWrapper.classList.contains("show-fps")) { return; }
    this.debug("calculate fps");
    let delta = (time - this.lastRender) * 0.001;
    if (delta < 0.001) { return; }
    let fps = 1.0 / delta;
    this.fps = (fps * 0.01) + (this.fps * 0.99);
    document.getElementById("fps").innerText = `FPS: ${Math.round(this.fps)}`;
    this.lastRender = time;
    return fps;
  }

  updateInputs(time) {
    // Update all the inputs for the fragment shaders in both programs
    this.debug("update inputs for shaders");
    for (let name of Object.keys(this.programs)) {
      let program = this.programs[name];
      let inputs = this.inputs[name];
      this.gl.useProgram(program);

      // Set internal parameters
      this.gl.uniform1f(inputs.iTime, time * 0.001);
      // Read textureS into uSamplerS for both programs, from texture slot 0
      this.gl.uniform1i(this.inputs[name].uSamplerS, 0);
      // and A2 from texture slot 2
      this.gl.uniform1i(this.inputs[name].uSamplerA2, 2);

      // Set user adjustable parameters
      this.gl.uniform1f(inputs.iAfter, this.params.after);
      this.gl.uniform1f(inputs.iContrast, this.params.contrast);
      this.gl.uniform1f(inputs.iEdges, this.params.edges);
      this.gl.uniform1f(inputs.iFloaters, this.params.floaters);
      this.gl.uniform1f(inputs.iMotion, 1.0 - this.params.motion);
      this.gl.uniform1f(inputs.iNoise, this.params.noise);
    }
  }

  updateSrcTexture() {
    // Upload current source image to texture
    if (!this.gl) {
      // This might be called by a media callback before renderer is
      // fully initialised
      return;
    }
    this.debug("upload current source image to texture");
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureS);
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
    let { sWidth, sHeight } = this.getSourceSize();
    this.gl.viewport(0, 0, sWidth, sHeight);
    //this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  updateAccumFrame() {
    // Now copy current framebuffer into textureA2 after rendering
    let { sWidth, sHeight } = this.getSourceSize();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureA2);
    this.gl.copyTexImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 0, 0, sWidth, sHeight, 0);
  }

  renderMain() {
    // Render main view
    this.debug("render main view");
    this.gl.useProgram(this.programs.main);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.target.width, this.target.height);
    // Read textureA into uSamplerA1 for main program, from texture slot 1
    this.gl.uniform1i(this.inputs.main.uSamplerA1, 1);
    //this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  render(time) {
    this.updateInputs(time);
    this.updateSrcTexture();
    this.renderAccum();
    this.updateAccumFrame();
    this.renderMain();
    this.calcFPS(time);
  }
}


export { Renderer };
