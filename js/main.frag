precision highp float;
precision highp int;
precision highp sampler2D;

uniform highp vec2 iResolution;
uniform highp float iTime;
uniform highp float iDelta;
varying highp vec2 vTextureCoord;
uniform highp sampler2D uSamplerS1;
uniform highp sampler2D uSamplerS2;
uniform highp sampler2D uSamplerA1;
uniform highp sampler2D uSamplerA2;

uniform highp float iAfter;
uniform highp float iBlur;
uniform highp float iContrast;
uniform highp float iEdges;
uniform highp float iFloaters;
uniform highp float iMotion;
uniform highp float iNoise;

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

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord) {
    float aW = 1.0 / iResolution.x;
    float aH = 1.0 / iResolution.y;
	n[0] = texture2D(tex, coord + vec2( -aW, -aH));
	n[1] = texture2D(tex, coord + vec2(0.0, -aH));
	n[2] = texture2D(tex, coord + vec2(  aW, -aH));
	n[3] = texture2D(tex, coord + vec2( -aW, 0.0));
	n[4] = texture2D(tex, coord);
	n[5] = texture2D(tex, coord + vec2(  aW, 0.0));
	n[6] = texture2D(tex, coord + vec2( -aW, aH));
	n[7] = texture2D(tex, coord + vec2(0.0, aH));
	n[8] = texture2D(tex, coord + vec2(  aW, aH));
}

vec4 sobel(sampler2D tex, vec2 coord, float intensity) {
    vec4 n[9];
    make_kernel(n, tex, vTextureCoord);
    vec4 sobel_edge_h = n[2] + (intensity*n[5]) + n[8] - (n[0] + (intensity*n[3]) + n[6]);
    vec4 sobel_edge_v = n[0] + (intensity*n[1]) + n[2] - (n[6] + (intensity*n[7]) + n[8]);
    vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));
    return sobel;
}

float rand(float n) {
    return fract(sin(n * 12.9898) * iTime * 1000.0);
}

float rand2(vec2 n) {
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * iTime * 1000.0);
}

float noise2(vec2 p){
	vec2 ip = floor(p);
	vec2 u = fract(p);
	u = u*u*(3.0-2.0*u);

	float res = mix(
		mix(rand2(ip),rand2(ip+vec2(1.0,0.0)),u.x),
		mix(rand2(ip+vec2(0.0,1.0)),rand2(ip+vec2(1.0,1.0)),u.x),u.y);
	return res*res;
}

float noise(float p) {
    float ip = floor(p);
    float u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
        mix(
            rand(ip), rand(ip + 1.0), u
        ),
        mix(
            rand(ip + 1.0), rand(ip), u
        ),
        u
    );
    return res * res;
}

vec4 floaters(in vec2 fragCoord)
{
    float specs = 0.0;
        for(int i=0;i<3;i++){
            float cellSize = 1.5 + (float(i)*3.0);
            float horizSpeed = (.25+tan(iTime*0.4+float(i*20))+1.0)*0.00004;
			float vertSpeed = (.25+sin(iTime*0.4+float(i*20))+1.0)*0.00004;
            vec2 uv = (fragCoord.xy / iResolution.x)+vec2(horizSpeed*sin((iTime+6185.)*0.6+float(i))*(5.0/float(i)),vertSpeed*(iTime+1352.)*(1.0/float(i)));
            vec2 uvStep = (ceil((uv)*cellSize-vec2(0.5,0.5))/cellSize);
            float x = fract(sin(dot(uvStep.xy,vec2(12.9898*12.0,78.233*315.156)))* 43758.5453*12.0)-0.5;
            float y = fract(sin(dot(uvStep.xy,vec2(62.2364*23.0,94.674*95.0)))* 62159.8432*12.0)-0.5;

            float randomMagnitude1 = sin(iTime*2.5)*0.7/cellSize;
            float randomMagnitude2 = cos(iTime*2.5)*0.7/cellSize;

            float d = 5.0*distance((uvStep.xy + vec2(x*sin(y),y)*randomMagnitude1 + vec2(y,x)*randomMagnitude2),uv.xy);

            float omiVal = fract(sin(dot(uvStep.xy,vec2(32.4691,94.615)))* 31572.1684);
            if(omiVal<0.08?true:false){
                float newd = (x+1.0)*0.4*clamp(1.9-d*(15.0+(x*6.3))*(cellSize/1.4),0.0,1.0);
                specs += newd;
            }
        }
    return vec4(specs);
}

void main() {
  vec4 img = texture2D(uSamplerS1, vTextureCoord);
  img.rgb = ((img.rgb - 0.5) * max(iContrast, 0.0) + 0.5);
  img.w *= iMotion;
  if (iAfter > 0.01) {
      vec4 after = texture2D(uSamplerA1, vTextureCoord);
      img += (after * iAfter);
  }
  if(iFloaters > 0.01) {
      vec4 floaters = floaters(gl_FragCoord.xy) * iFloaters;
      img.xyz -= floaters.xyz;
      img.w += floaters.w;
  }
  if(iNoise > 0.01) {
      float n = sin(noise2(gl_FragCoord.xy));
      float a = noise2(gl_FragCoord.xy);
      gl_FragColor = mix(img, vec4(n, n * .8, n * .9, a), iNoise);
  } else {
      gl_FragColor = img;
  }
  if(iEdges > 0.01) {
      vec4 sobel1 = sobel(uSamplerS1, vTextureCoord, 15. * iEdges) * (.5 * iEdges);
      gl_FragColor += sobel1;
      vec4 sobel2 = sobel(uSamplerS1, vTextureCoord, 7. * iEdges) * (.5 * iEdges);
      gl_FragColor -= sobel2;
  }
}
