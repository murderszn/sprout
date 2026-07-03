(function initHeroImageDithering() {
  const container = document.getElementById('overlay-bg');
  if (!container) return;

  // Ported from @paper-design/shaders image-dithering
  // https://shaders.paper.design/image-dithering
  const PARAMS = {
    image: 'public/hero-sprout.jpg',
    // Chromaverse — Matcha Latte palette (see :root in styles.css)
    colorFront: '#84CC16', // --accent-light / --yellow-hover
    colorBack: '#2D3220', // --black-raised
    colorHighlight: '#E8F5D8', // --white
    originalColors: false,
    inverted: false,
    type: 4, // 1 = random, 2 = 2x2 Bayer, 3 = 4x4 Bayer, 4 = 8x8 Bayer
    pxSize: 4,
    colorSteps: 5,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    originX: 0.5,
    originY: 0.5,
    fit: 2, // cover
    worldWidth: 0,
    worldHeight: 0,
  };

  const DECLARE_PI = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;

  const HASH21 = `
  float hash21(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
`;

  const VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

void main() {
  gl_Position = a_position;
}`;

  const FS = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;

uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_type;
uniform float u_pxSize;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_colorSteps;

out vec4 fragColor;

${HASH21}
${DECLARE_PI}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

vec2 getImageUV(vec2 uv) {
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  vec2 imageUV = uv;
  imageUV *= imageBoxScale;
  imageUV += boxOrigin * (imageBoxScale - 1.);
  imageUV += graphicOffset;
  imageUV /= u_scale;
  imageUV.x *= u_imageAspectRatio;
  imageUV = graphicRotation * imageUV;
  imageUV.x /= u_imageAspectRatio;

  imageUV += .5;
  imageUV.y = 1. - imageUV.y;

  return imageUV;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}

void main() {

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 imageUV = getImageUV(normalizedUV);
  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec4 image = texture(u_image, imageUV);
  float frame = getUvFrame(imageUV, pxSize / u_resolution);

  int type = int(floor(u_type));
  float dithering = 0.0;

  float lum = dot(vec3(.2126, .7152, .0722), image.rgb);
  lum = u_inverted ? (1. - lum) : lum;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), lum);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  float colorSteps = max(floor(u_colorSteps), 1.);
  vec3 color = vec3(0.0);
  float opacity = 1.;

  dithering -= .5;
  float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);
  brightness = mix(0.0, brightness, frame);
  brightness = mix(0.0, brightness, image.a);
  float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;
  quantLum = mix(0.0, quantLum, frame);

  if (u_originalColors == true) {
    vec3 normColor = image.rgb / max(lum, 0.001);
    color = normColor * quantLum;

    float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
    opacity = mix(quantLum, 1., quantAlpha);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float hlOpacity = u_colorHighlight.a;

    fgColor = mix(fgColor, hlColor, step(1.02 - .02 * u_colorSteps, brightness));
    fgOpacity = mix(fgOpacity, hlOpacity, step(1.02 - .02 * u_colorSteps, brightness));

    color = fgColor * quantLum;
    opacity = fgOpacity * quantLum;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
  }

  fragColor = vec4(color, opacity);
}`;

  function hex2rgba(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return [
      ((n >> 16) & 255) / 255,
      ((n >> 8) & 255) / 255,
      (n & 255) / 255,
      1,
    ];
  }

  function compile(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'overlay-bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return;

  const prog = createProgram(gl, VS, FS);
  if (!prog) return;

  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = {
    u_resolution: gl.getUniformLocation(prog, 'u_resolution'),
    u_pixelRatio: gl.getUniformLocation(prog, 'u_pixelRatio'),
    u_imageAspectRatio: gl.getUniformLocation(prog, 'u_imageAspectRatio'),
    u_originX: gl.getUniformLocation(prog, 'u_originX'),
    u_originY: gl.getUniformLocation(prog, 'u_originY'),
    u_worldWidth: gl.getUniformLocation(prog, 'u_worldWidth'),
    u_worldHeight: gl.getUniformLocation(prog, 'u_worldHeight'),
    u_fit: gl.getUniformLocation(prog, 'u_fit'),
    u_scale: gl.getUniformLocation(prog, 'u_scale'),
    u_rotation: gl.getUniformLocation(prog, 'u_rotation'),
    u_offsetX: gl.getUniformLocation(prog, 'u_offsetX'),
    u_offsetY: gl.getUniformLocation(prog, 'u_offsetY'),
    u_image: gl.getUniformLocation(prog, 'u_image'),
    u_colorFront: gl.getUniformLocation(prog, 'u_colorFront'),
    u_colorBack: gl.getUniformLocation(prog, 'u_colorBack'),
    u_colorHighlight: gl.getUniformLocation(prog, 'u_colorHighlight'),
    u_type: gl.getUniformLocation(prog, 'u_type'),
    u_pxSize: gl.getUniformLocation(prog, 'u_pxSize'),
    u_originalColors: gl.getUniformLocation(prog, 'u_originalColors'),
    u_inverted: gl.getUniformLocation(prog, 'u_inverted'),
    u_colorSteps: gl.getUniformLocation(prog, 'u_colorSteps'),
  };

  let width = 0;
  let height = 0;
  let renderScale = 1;
  let imageAspectRatio = 1;
  let textureReady = false;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    const maxPixels = 1920 * 1080;
    const scaleDown = Math.min(1, Math.sqrt(maxPixels / (targetW * targetH)));
    const nextW = Math.max(1, Math.round(targetW * scaleDown));
    const nextH = Math.max(1, Math.round(targetH * scaleDown));

    if (nextW === width && nextH === height) return false;

    width = nextW;
    height = nextH;
    renderScale = width / Math.max(1, rect.width);
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    return true;
  }

  function setStaticUniforms() {
    gl.uniform1i(U.u_image, 0);
    gl.uniform4fv(U.u_colorFront, hex2rgba(PARAMS.colorFront));
    gl.uniform4fv(U.u_colorBack, hex2rgba(PARAMS.colorBack));
    gl.uniform4fv(U.u_colorHighlight, hex2rgba(PARAMS.colorHighlight));
    gl.uniform1f(U.u_type, PARAMS.type);
    gl.uniform1f(U.u_pxSize, PARAMS.pxSize);
    gl.uniform1i(U.u_originalColors, PARAMS.originalColors ? 1 : 0);
    gl.uniform1i(U.u_inverted, PARAMS.inverted ? 1 : 0);
    gl.uniform1f(U.u_colorSteps, PARAMS.colorSteps);
    gl.uniform1f(U.u_originX, PARAMS.originX);
    gl.uniform1f(U.u_originY, PARAMS.originY);
    gl.uniform1f(U.u_worldWidth, PARAMS.worldWidth);
    gl.uniform1f(U.u_worldHeight, PARAMS.worldHeight);
    gl.uniform1f(U.u_fit, PARAMS.fit);
    gl.uniform1f(U.u_scale, PARAMS.scale);
    gl.uniform1f(U.u_rotation, PARAMS.rotation);
    gl.uniform1f(U.u_offsetX, PARAMS.offsetX);
    gl.uniform1f(U.u_offsetY, PARAMS.offsetY);
  }

  function draw() {
    if (!textureReady) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(U.u_resolution, width, height);
    gl.uniform1f(U.u_pixelRatio, renderScale);
    gl.uniform1f(U.u_imageAspectRatio, imageAspectRatio);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    imageAspectRatio = img.naturalWidth / img.naturalHeight;
    textureReady = true;
    container.classList.add('is-shader-active');
    draw();
  };
  img.onerror = () => {
    console.error('hero-shader: failed to load', PARAMS.image);
  };
  img.src = PARAMS.image;

  resize();
  setStaticUniforms();

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      if (resize()) draw();
    });
    ro.observe(container);
  } else {
    window.addEventListener('resize', () => {
      if (resize()) draw();
    });
  }
})();
