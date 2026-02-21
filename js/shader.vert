precision highp float;
precision highp int;
precision highp sampler2D;

attribute highp vec4 position;
uniform highp vec2 iScale;
varying highp vec2 vTextureCoord;

void main() {
  gl_Position = position;
  vTextureCoord = (position.xy / iScale) * .5 + .5;
}
