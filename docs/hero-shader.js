(function initHeroShader() {
  const canvas = document.getElementById('hero-shader-canvas');
  if (!canvas) return;

  const container = document.getElementById('overlay');
  if (!container) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Shader parameters matching the user request:
  const PARAMS = {
    seed: 6372,
    speed: 0.26,
    scale: 0.3,
    density: 0.67,
    distort: 0.0,
    warp: 0.49,
    detail: 1.0,
    grain: 0.0,
    loop: 16.0, // Loop cycle time in seconds (increased to slow down)
    colors: [
      '#FAFDF6', // u_c0 (light cream)
      '#C6E87B', // u_c1 (bright light green/yellow)
      '#9CD654', // u_c2 (vibrant avocado green)
      '#FFFFFF'  // u_c3 (pure white)
    ]
  };

  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

  const FS = `
    #extension GL_OES_standard_derivatives : enable
    precision highp float;

    uniform vec2  u_res;
    uniform float u_phase;
    uniform float u_seed;
    uniform float u_speed, u_scale, u_density, u_distort, u_detail, u_grain, u_warp;
    uniform vec3  u_c0, u_c1, u_c2, u_c3;

    #define TAU 6.28318530718

    vec2 paRot(vec2 v, float a){
        float c = cos(a), s = sin(a);
        return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
    }

    /* zozuar neuro web + seamless layer phase — https://x.com/zozuar/status/1625182758745128981 */
    float paNeuroShapeAnim(vec2 uv, float ph){
        vec2 sineAcc = vec2(0.0);
        vec2 res = vec2(0.0);
        float sc = 8.0;
        float drift = 0.42 + 0.28 * u_speed;
        for (int j = 0; j < 15; j++){
            float fj = float(j);
            uv = paRot(uv, 1.0);
            sineAcc = paRot(sineAcc, 1.0);
            vec2 tOff = vec2(sin(ph + fj * 0.62), cos(ph - fj * 0.48)) * drift;
            vec2 layer = uv * sc + fj + sineAcc - tOff;
            sineAcc += sin(layer);
            res += (0.5 + 0.5 * cos(layer)) / sc;
            sc *= 1.2;
        }
        return res.x + res.y;
    }

    vec2 loopOff(){
        return vec2(cos(u_phase), sin(u_phase)) * (0.10 + 0.55 * u_speed);
    }

    /* Seamless curl-like flow offset */
    vec2 paNeuroFlow(vec2 q, float ph){
        float s = 0.35 + 0.65 * u_speed;
        vec2 v = vec2(
            sin(q.y * 1.25 + ph) + sin(q.x * 0.85 + 2.0 * ph),
            cos(q.x * 1.25 - ph) + cos(q.y * 0.85 - 2.0 * ph)
        );
        v *= 0.032 * s * (0.6 + 0.8 * u_distort);
        v += loopOff() * (0.04 + 0.03 * s);
        return v;
    }

    vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }
    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float cnoise(vec2 P) {
        vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
        vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
        Pi = mod(Pi, 289.0);
        vec4 ix = Pi.xzxz; vec4 iy = Pi.yyww;
        vec4 fx = Pf.xzxz; vec4 fy = Pf.yyww;
        vec4 i = permute(permute(ix) + iy);
        vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
        vec4 gy = abs(gx) - 0.5;
        vec4 tx = floor(gx + 0.5);
        gx = gx - tx;
        vec2 g00 = vec2(gx.x,gy.x);
        vec2 g10 = vec2(gx.y,gy.y);
        vec2 g01 = vec2(gx.z,gy.z);
        vec2 g11 = vec2(gx.w,gy.w);
        vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
        g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
        float n00 = dot(g00, vec2(fx.x, fy.x));
        float n10 = dot(g10, vec2(fx.y, fy.y));
        float n01 = dot(g01, vec2(fx.z, fy.z));
        float n11 = dot(g11, vec2(fx.w, fy.w));
        vec2 fade_xy = fade(Pf.xy);
        vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
        return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
    }

    vec3 grad4(float t){
        t = clamp(t, 0.0, 1.0);
        vec3 c = mix(u_c0, u_c1, smoothstep(0.00, 0.35, t));
        c = mix(c, u_c2, smoothstep(0.35, 0.70, t));
        c = mix(c, u_c3, smoothstep(0.70, 1.00, t));
        return c;
    }

    float hash21(vec2 p){
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
    }

    void main(){
        vec2 uv = gl_FragCoord.xy / u_res;
        uv.y = 1.0 - uv.y;
        float ar = u_res.x / u_res.y;

        vec3 col = vec3(0.0);
        vec2 p = (uv - 0.5) * vec2(ar, 1.0);

        /* ─── 32 · neuro ─── */
        vec2 q = p * mix(1.4, 3.8, u_scale);
        vec2 flow = paNeuroFlow(q, u_phase);
        vec2 warp = vec2(
            cnoise(q * 0.5 + vec2(u_phase, 0.0)),
            cnoise(q * 0.5 + vec2(0.0, -u_phase))
        ) - 0.5;
        q += warp * (0.04 + 0.08 * u_warp) + flow;
        vec2 shapeUv = q * 0.13;
        float n1 = paNeuroShapeAnim(shapeUv, u_phase);
        float n2 = paNeuroShapeAnim(shapeUv + flow * 0.6, 2.0 * u_phase);
        float noise = mix(n1, n2, 0.5 + 0.28 * sin(u_phase));
        noise = (1.0 + mix(0.15, 0.95, u_density)) * noise * noise;
        noise = pow(noise, 0.7 + 6.0 * mix(0.35, 0.92, u_distort));
        noise = min(1.4, noise);
        float aa = max(fwidth(noise) * 1.5, 0.002);
        float blend = smoothstep(0.7 - aa, 1.4 + aa * 0.35, noise);
        vec3 line = mix(u_c1, u_c0, blend);
        float safe = max(noise, 0.0);
        col = line * safe;
        col += u_c3 * 0.38 * (1.0 - clamp(safe, 0.0, 1.0));
        col += u_c2 * blend * 0.04 * mix(0.5, 1.0, u_detail);

        /* film grain + vignette */
        col += (hash21(gl_FragCoord.xy + loopOff() * 91.3) - 0.5) * u_grain * 0.22;
        vec2 v = uv * 2.0 - 1.0;
        col *= 1.0 - dot(v, v) * 0.16;

        gl_FragColor = vec4(col, 1.0);
    }
  `;

  function hex2rgb(h) {
    return [
      parseInt(h.slice(1, 3), 16) / 255,
      parseInt(h.slice(3, 5), 16) / 255,
      parseInt(h.slice(5, 7), 16) / 255,
    ];
  }

  function compileShader(gl, type, src) {
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

  const gl = canvas.getContext('webgl', { alpha: false, antialias: false }) || canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
  if (!gl) return;

  gl.getExtension('OES_standard_derivatives');

  const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    u_res: gl.getUniformLocation(prog, 'u_res'),
    u_phase: gl.getUniformLocation(prog, 'u_phase'),
    u_seed: gl.getUniformLocation(prog, 'u_seed'),
    u_speed: gl.getUniformLocation(prog, 'u_speed'),
    u_scale: gl.getUniformLocation(prog, 'u_scale'),
    u_density: gl.getUniformLocation(prog, 'u_density'),
    u_distort: gl.getUniformLocation(prog, 'u_distort'),
    u_detail: gl.getUniformLocation(prog, 'u_detail'),
    u_grain: gl.getUniformLocation(prog, 'u_grain'),
    u_warp: gl.getUniformLocation(prog, 'u_warp'),
    u_c0: gl.getUniformLocation(prog, 'u_c0'),
    u_c1: gl.getUniformLocation(prog, 'u_c1'),
    u_c2: gl.getUniformLocation(prog, 'u_c2'),
    u_c3: gl.getUniformLocation(prog, 'u_c3'),
  };

  let width = 0;
  let height = 0;
  let rafId = 0;
  let visible = false;
  let phase = 0;
  let last = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (nextW === width && nextH === height) return;
    width = nextW;
    height = nextH;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  function draw(now) {
    rafId = 0;
    if (!visible) return;

    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!prefersReducedMotion) {
      phase = phase + (dt / PARAMS.loop) * Math.PI * 2;
    }

    gl.uniform2f(U.u_res, width, height);
    gl.uniform1f(U.u_phase, phase);
    gl.uniform1f(U.u_seed, (PARAMS.seed % 10000) * 0.6180339887 % 12.566);
    gl.uniform1f(U.u_speed, PARAMS.speed);
    gl.uniform1f(U.u_scale, PARAMS.scale);
    gl.uniform1f(U.u_density, PARAMS.density);
    gl.uniform1f(U.u_distort, PARAMS.distort);
    gl.uniform1f(U.u_detail, PARAMS.detail);
    gl.uniform1f(U.u_grain, PARAMS.grain);
    gl.uniform1f(U.u_warp, PARAMS.warp);
    gl.uniform3fv(U.u_c0, hex2rgb(PARAMS.colors[0]));
    gl.uniform3fv(U.u_c1, hex2rgb(PARAMS.colors[1]));
    gl.uniform3fv(U.u_c2, hex2rgb(PARAMS.colors[2]));
    gl.uniform3fv(U.u_c3, hex2rgb(PARAMS.colors[3]));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (rafId) return;
    last = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  resize();

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(resize);
    ro.observe(container);
  } else {
    window.addEventListener('resize', resize);
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) start();
      else stop();
    }, { threshold: 0.01 });
    io.observe(container);
  } else {
    visible = true;
    start();
  }
})();
