precision highp float;
precision highp int;
precision highp sampler2D;

uniform highp vec2 iResolution;
uniform highp float iTime;
varying highp vec2 vTextureCoord;
uniform highp sampler2D uSamplerS;
uniform highp sampler2D uSamplerA2;

uniform float iAfter;

void main() {
  /*
    Thresholding effect: Turn the image grayscale, and then threshold it
    so only the brightest spots remain and the rest is black

    This is to create an "after-image" effect which slowly decays over
    time, so the alpha channel is multiplied by `iAfter` which will be in
    the range 0..1, controlling the decay rate.
  */
  if (iAfter < 0.01) {
    gl_FragColor = vec4(.0, .0, .0, .0);
    return;
  }
  vec4 prev = texture2D(uSamplerA2, vTextureCoord) * vec4(.5, .7, .9, .05);
  vec4 img = texture2D(uSamplerS, vTextureCoord);
  float gray = ((0.2126 * img.r) + (0.7152 * img.g) + (0.0722 * img.b));
  float after = min(smoothstep(0.75, 0.9, gray), 0.99);
  gl_FragColor = (prev + vec4(after, after, after, after)) * iAfter;
}
