precision highp float;
precision highp int;
precision highp sampler2D;

uniform highp vec2 iResolution;
uniform highp float iTime;
varying highp vec2 vTextureCoord;
uniform highp sampler2D uSamplerS1;
uniform highp sampler2D uSamplerA2;

uniform highp float iAfter;
uniform highp float iBlur;
uniform highp float iDelta;

// https://github.com/Experience-Monks/glsl-fast-gaussian-blur/blob/master/13.glsl
vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.411764705882353) * direction;
  vec2 off2 = vec2(3.2941176470588234) * direction;
  vec2 off3 = vec2(5.176470588235294) * direction;
  color += texture2D(image, uv) * 0.1964825501511404;
  color += texture2D(image, uv + (off1 / resolution)) * 0.2969069646728344;
  color += texture2D(image, uv - (off1 / resolution)) * 0.2969069646728344;
  color += texture2D(image, uv + (off2 / resolution)) * 0.09447039785044732;
  color += texture2D(image, uv - (off2 / resolution)) * 0.09447039785044732;
  color += texture2D(image, uv + (off3 / resolution)) * 0.010381362401148057;
  color += texture2D(image, uv - (off3 / resolution)) * 0.010381362401148057;
  return color;
}

void main() {
  /*
    Thresholding effect: Turn the image grayscale, and then thresiBlurhold it
    so only the brightest spots remain and the rest is black

    This is to create an "after-image" effect which slowly decays over
    time, so the alpha channel is multiplied by `iAfter` which will be in
    the range 0..1, controlling the decay rate.
  */
  if (iAfter < 0.01) {
    gl_FragColor = vec4(.0, .0, .0, .0);
    return;
  }
  vec4 prev = blur13(
    uSamplerA2, vTextureCoord.xy, iResolution.xy, vec2(10. * iDelta, 10. * iDelta)
  ) * vec4(.5, .7, .9, .05);
  //vec4 prev = texture2D(uSamplerA2, vTextureCoord) * vec4(.5, .7, .9, .05);
  vec4 img = texture2D(uSamplerS1, vTextureCoord);
  float gray = ((0.2126 * img.r) + (0.7152 * img.g) + (0.0722 * img.b));
  float after = min(smoothstep(0.75, 0.9, gray), 0.99);
  gl_FragColor = (prev + vec4(img.r, img.g, img.b, after)) * iAfter;
}
