precision highp float;
precision highp int;
precision highp sampler2D;

uniform highp vec2 iResolution;
uniform highp float iTime;
varying highp vec2 vTextureCoord;
uniform highp sampler2D uSamplerS;

uniform float iAfter;
uniform float iContrast;
uniform float iEdges;
uniform float iFloaters;
uniform float iMotion;
uniform float iNoise;

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
  vec4 img = texture2D(uSamplerS, vTextureCoord);
  vec4 vec = img * vec4(iContrast, iContrast, iContrast, iMotion);
  if(iFloaters > 0.01) {
      vec4 floaters = floaters(gl_FragCoord.xy) * iFloaters;
      vec.xyz -= floaters.xyz;
      vec.w += floaters.w;
  }
  if(iAfter > 0.01) {
      float gray = ((0.2126 * vec.r) + (0.7152 * vec.g) + (0.0722 * vec.b)) * (1. + iAfter);
      float after = step(0.999, gray);
      vec /= 1.-after;
      vec *= gray;
  }
  if(iNoise > 0.01) {
      float n = sin(noise2(gl_FragCoord.xy));
      float a = noise2(gl_FragCoord.xy);
      gl_FragColor = mix(vec, vec4(n, n * .8, n * .9, a), iNoise);
  } else {
      gl_FragColor = vec;
  }
  if(iEdges > 0.01) {
      vec4 sobel = sobel(uSamplerS, vTextureCoord, 2.5) * iEdges;
      gl_FragColor += sobel;
  }
}
