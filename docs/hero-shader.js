(function initHeroSwirl() {
  const container = document.getElementById('overlay-bg');
  if (!container) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PARAMS = {
    colorBack: '#0F110B',
    colors: ['#D9F99D', '#A3E635', '#84CC16', '#65A30D'],
    bandCount: 4,
    twist: 0.1,
    center: 0.2,
    proportion: 0.5,
    softness: 0,
    noise: 0.2,
    noiseFrequency: 0.4,
    speed: prefersReducedMotion ? 0 : 0.32,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    originX: 0.5,
    originY: 0.5,
    fit: 1,
    worldWidth: 0,
    worldHeight: 0,
  };

  const DECLARE_PI = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;

  const ROTATION2 = `
vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;

  const SIMPLEX_NOISE = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

  const COLOR_BANDING_FIX = `
  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;

  const VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) {
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) {
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
    (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
    (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  vec2 objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;
}`;

  const FS = `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec4 u_colorBack;
uniform vec4 u_colors[10];
uniform float u_colorsCount;
uniform float u_bandCount;
uniform float u_twist;
uniform float u_center;
uniform float u_proportion;
uniform float u_softness;
uniform float u_noise;
uniform float u_noiseFrequency;

in vec2 v_objectUV;
out vec4 fragColor;

${DECLARE_PI}
${SIMPLEX_NOISE}
${ROTATION2}

void main() {
  vec2 shape_uv = v_objectUV;

  float l = length(shape_uv);
  l = max(1e-4, l);

  float t = u_time;

  float angle = ceil(u_bandCount) * atan(shape_uv.y, shape_uv.x) + t;
  float angle_norm = angle / TWO_PI;

  float twist = 3. * clamp(u_twist, 0., 1.);
  float offset = pow(l, -twist) + angle_norm;

  float shape = fract(offset);
  shape = 1. - abs(2. * shape - 1.);
  shape += u_noise * snoise(15. * pow(u_noiseFrequency, 2.) * shape_uv);

  float mid = smoothstep(.2, .2 + .8 * u_center, pow(l, twist));
  shape = mix(0., shape, mid);

  float proportion = clamp(u_proportion, 0., 1.);
  float exponent = mix(.25, 1., proportion * 2.);
  exponent = mix(exponent, 10., max(0., proportion * 2. - 1.));
  shape = pow(shape, exponent);

  float mixer = shape * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float outerShape = 0.;
  for (int i = 1; i < 11; i++) {
    if (i > int(u_colorsCount)) break;

    float m = clamp(mixer - float(i - 1), 0., 1.);
    float aa = fwidth(m);
    m = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, m);

    if (i == 1) {
      outerShape = m;
    }

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  float midAA = .1 * fwidth(pow(l, -twist));
  float outerMid = smoothstep(.2, .2 + midAA, pow(l, twist));
  outerShape = mix(0., outerShape, outerMid);

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  ${COLOR_BANDING_FIX}

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
    u_time: gl.getUniformLocation(prog, 'u_time'),
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
    u_colorBack: gl.getUniformLocation(prog, 'u_colorBack'),
    u_colors: gl.getUniformLocation(prog, 'u_colors'),
    u_colorsCount: gl.getUniformLocation(prog, 'u_colorsCount'),
    u_bandCount: gl.getUniformLocation(prog, 'u_bandCount'),
    u_twist: gl.getUniformLocation(prog, 'u_twist'),
    u_center: gl.getUniformLocation(prog, 'u_center'),
    u_proportion: gl.getUniformLocation(prog, 'u_proportion'),
    u_softness: gl.getUniformLocation(prog, 'u_softness'),
    u_noise: gl.getUniformLocation(prog, 'u_noise'),
    u_noiseFrequency: gl.getUniformLocation(prog, 'u_noiseFrequency'),
  };

  const colorData = new Float32Array(40);
  PARAMS.colors.forEach((hex, i) => {
    const rgba = hex2rgba(hex);
    colorData.set(rgba, i * 4);
  });
  for (let i = PARAMS.colors.length; i < 10; i++) {
    colorData.set([0, 0, 0, 1], i * 4);
  }

  container.classList.add('is-shader-active');

  let width = 0;
  let height = 0;
  let renderScale = 1;
  let rafId = 0;
  let currentFrame = 0;
  let lastTime = 0;
  let animating = PARAMS.speed !== 0;
  let docVisible = !document.hidden;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    const maxPixels = 1920 * 1080;
    const scaleDown = Math.min(1, Math.sqrt(maxPixels / (targetW * targetH)));
    const nextW = Math.max(1, Math.round(targetW * scaleDown));
    const nextH = Math.max(1, Math.round(targetH * scaleDown));

    if (nextW === width && nextH === height) return;

    width = nextW;
    height = nextH;
    renderScale = width / Math.max(1, rect.width);
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  function setStaticUniforms() {
    gl.uniform4fv(U.u_colorBack, hex2rgba(PARAMS.colorBack));
    gl.uniform4fv(U.u_colors, colorData);
    gl.uniform1f(U.u_colorsCount, PARAMS.colors.length);
    gl.uniform1f(U.u_bandCount, PARAMS.bandCount);
    gl.uniform1f(U.u_twist, PARAMS.twist);
    gl.uniform1f(U.u_center, PARAMS.center);
    gl.uniform1f(U.u_proportion, PARAMS.proportion);
    gl.uniform1f(U.u_softness, PARAMS.softness);
    gl.uniform1f(U.u_noise, PARAMS.noise);
    gl.uniform1f(U.u_noiseFrequency, PARAMS.noiseFrequency);
    gl.uniform1f(U.u_originX, PARAMS.originX);
    gl.uniform1f(U.u_originY, PARAMS.originY);
    gl.uniform1f(U.u_worldWidth, PARAMS.worldWidth);
    gl.uniform1f(U.u_worldHeight, PARAMS.worldHeight);
    gl.uniform1f(U.u_fit, PARAMS.fit);
    gl.uniform1f(U.u_scale, PARAMS.scale);
    gl.uniform1f(U.u_rotation, PARAMS.rotation);
    gl.uniform1f(U.u_offsetX, PARAMS.offsetX);
    gl.uniform1f(U.u_offsetY, PARAMS.offsetY);
    gl.uniform1f(U.u_imageAspectRatio, 1);
  }

  function draw(now) {
    rafId = 0;

    if (animating && docVisible) {
      const dt = lastTime ? now - lastTime : 0;
      lastTime = now;
      currentFrame += dt * PARAMS.speed;
    } else {
      lastTime = now;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(U.u_resolution, width, height);
    gl.uniform1f(U.u_pixelRatio, renderScale);
    gl.uniform1f(U.u_time, currentFrame * 0.001);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (animating && docVisible) {
      rafId = requestAnimationFrame(draw);
    }
  }

  function start() {
    if (rafId) return;
    lastTime = 0;
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  resize();
  setStaticUniforms();
  draw(performance.now());

  if (animating) {
    start();
  }

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(resize);
    ro.observe(container);
  } else {
    window.addEventListener('resize', resize);
  }

  document.addEventListener('visibilitychange', () => {
    docVisible = !document.hidden;
    if (animating) {
      if (docVisible) start();
      else stop();
    }
  });
})();