(function initShaderBanners() {
  const banners = document.querySelectorAll('.shader-banner');
  if (!banners.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

  const FS = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_scale;
uniform float u_density;
uniform vec3 u_yellow;
uniform vec3 u_black;
uniform vec3 u_accent;

float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

#define CYCLE 88.0
#define TRAIL 14.0

float wrapDist(float a, float b){
  float d = abs(a - b);
  return min(d, CYCLE - d);
}

float nearHead(float order, float head){
  return 1.0 - step(2.0, wrapDist(order, head));
}

float inTrail(float order, float head){
  float dist = mod(head - order + CYCLE, CYCLE);
  return step(dist, TRAIL);
}

bool isSprout(vec2 localId) {
  float x = localId.x;
  float y = localId.y;
  float lx;

  // S (columns 0–2)
  if (x >= -0.5 && x <= 2.5) {
    lx = x;
    return (y < 0.5 && lx > 0.5) ||
           (y > 3.5 && lx < 1.5) ||
           (y > 1.5 && y < 2.5) ||
           (lx < 0.5 && y < 2.0) ||
           (lx > 1.5 && y > 2.0);
  }
  // P (columns 4–6)
  if (x >= 3.5 && x <= 6.5) {
    lx = x - 4.0;
    return (lx < 0.5) ||
           (y < 0.5) ||
           (y > 1.5 && y < 2.5 && lx > 0.5) ||
           (lx > 1.5 && y < 2.5);
  }
  // R (columns 8–10)
  if (x >= 7.5 && x <= 10.5) {
    lx = x - 8.0;
    return (lx < 0.5) ||
           (y < 0.5) ||
           (y > 0.5 && y < 1.5 && lx > 1.5) ||
           (y > 1.5 && y < 2.5 && lx > 0.5 && lx < 1.5) ||
           (y > 2.5 && lx > 1.5);
  }
  // O (columns 12–14)
  if (x >= 11.5 && x <= 14.5) {
    lx = x - 12.0;
    return (lx < 0.5 || lx > 1.5 || y < 0.5 || y > 3.5);
  }
  // U (columns 16–18)
  if (x >= 15.5 && x <= 18.5) {
    lx = x - 16.0;
    return (lx < 0.5 || lx > 1.5 || y > 3.5);
  }
  // T (columns 20–22)
  if (x >= 19.5 && x <= 22.5) {
    lx = x - 20.0;
    return (y < 0.5) || (lx > 0.5 && lx < 1.5);
  }
  return false;
}

void main(){
  float mn = sqrt(u_res.x * u_res.y);
  // Align from the top-left of the canvas
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / mn;
  p *= mix(1.2, 2.6, u_scale) * 3.0;

  float freq = 5.0 + u_density * 7.0;
  
  float gutter = 0.05;
  // Shift slightly so the top-left edge starts inside the first cell rather than on the gutter
  vec2 gv = p * freq + vec2(gutter * 1.5);
  vec2 f = fract(gv);

  // Add integer seed offset to randomize patterns without shifting the grid boundaries
  vec2 seedOffset = floor(vec2(fract(u_seed * 0.193), fract(u_seed * 0.317)) * 20.0);
  vec2 id = floor(gv) + seedOffset;

  float inBox = step(gutter, f.x) * step(f.x, 1.0 - gutter)
              * step(gutter, f.y) * step(f.y, 1.0 - gutter);

  float chunkRoll = hash21(id);
  vec2 cluster2 = floor(id / 2.0);
  vec2 cluster3 = floor(id / 3.0);
  vec2 clusterCoord = mix(cluster2, cluster3, step(0.58, chunkRoll));

  // This is deliberately static: the clock is the only time-based element.
  // Grouped hash values give the field a technical, court-side scoreboard feel
  // without any flicker, sweep, or reactive animation.
  float clusterPattern = hash21(clusterCoord * 1.91 + vec2(u_seed * 0.13));
  float cellPattern = hash21(id + vec2(u_seed * 0.29));
  float highlighted = step(0.68, clusterPattern) * (0.6 + 0.4 * step(0.45, cellPattern));
  float timingSignal = step(0.992, cellPattern) * inBox;

  float fill = inBox * (1.0 - highlighted);
  vec3 col = mix(u_yellow, u_black, fill);
  col = mix(col, u_accent, timingSignal);
  gl_FragColor = vec4(col, 1.0);
}`;

  const PARAMS = {
    seed: 2251,
    yellow: '#174B32',
    black: '#FFFDF8',
    accent: '#F1C94B',
    scale: 0.5,
    density: 0.55,
  };

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

  banners.forEach((banner) => {
    const canvas = banner.querySelector('.shader-banner-canvas');
    const clock = banner.querySelector('[data-local-clock]');
    const soundButton = banner.querySelector('[data-clock-sound]');
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) {
      banner.classList.add('shader-banner--fallback');
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) {
      banner.classList.add('shader-banner--fallback');
      return;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      banner.classList.add('shader-banner--fallback');
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
      u_time: gl.getUniformLocation(prog, 'u_time'),
      u_seed: gl.getUniformLocation(prog, 'u_seed'),
      u_scale: gl.getUniformLocation(prog, 'u_scale'),
      u_density: gl.getUniformLocation(prog, 'u_density'),
      u_yellow: gl.getUniformLocation(prog, 'u_yellow'),
      u_black: gl.getUniformLocation(prog, 'u_black'),
      u_accent: gl.getUniformLocation(prog, 'u_accent'),
    };

    let width = 0;
    let height = 0;
    let rafId = 0;
    let visible = false;
    let lastSecond = null;
    let clockSoundEnabled = false;
    let audioContext = null;
    const t0 = performance.now();

    function playTick() {
      if (!audioContext || audioContext.state !== 'running') return;

      const start = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(1180, start);
      oscillator.frequency.exponentialRampToValueAtTime(760, start + 0.035);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.024, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.05);
    }

    async function toggleClockSound() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass || !soundButton) return;

      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      clockSoundEnabled = !clockSoundEnabled;
      soundButton.setAttribute('aria-pressed', String(clockSoundEnabled));
      soundButton.textContent = clockSoundEnabled ? 'Sound off' : 'Sound on';
      if (clockSoundEnabled) playTick();
    }

    if (soundButton) soundButton.addEventListener('click', toggleClockSound);

    function updateClock() {
      if (!clock) return;

      const now = new Date();
      const seconds = now.getSeconds();
      const minutes = now.getMinutes() + seconds / 60;
      const hours = (now.getHours() % 12) + minutes / 60;
      const hourHand = clock.querySelector('[data-clock-hour]');
      const minuteHand = clock.querySelector('[data-clock-minute]');
      const secondHand = clock.querySelector('[data-clock-second]');
      const time = clock.querySelector('[data-clock-time]');
      const zone = clock.querySelector('[data-clock-timezone]');

      if (hourHand) hourHand.style.transform = `rotate(${hours * 30}deg)`;
      if (minuteHand) minuteHand.style.transform = `rotate(${minutes * 6}deg)`;
      if (secondHand) secondHand.style.transform = `rotate(${seconds * 6}deg)`;
      if (time) {
        time.textContent = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
      if (zone) {
        zone.textContent = `LOCAL / ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'TIME'}`;
      }
      if (clockSoundEnabled && lastSecond !== null && seconds !== lastSecond) playTick();
      lastSecond = seconds;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = banner.getBoundingClientRect();
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

      const elapsed = prefersReducedMotion ? 0.0 : (now - t0) / 1000;
      updateClock();

      gl.uniform2f(U.u_res, width, height);
      gl.uniform1f(U.u_time, elapsed);
      gl.uniform1f(U.u_seed, (PARAMS.seed % 10000) * 0.6180339887 % 12.566);
      gl.uniform1f(U.u_scale, PARAMS.scale);
      gl.uniform1f(U.u_density, PARAMS.density);
      gl.uniform3fv(U.u_yellow, hex2rgb(PARAMS.yellow));
      gl.uniform3fv(U.u_black, hex2rgb(PARAMS.black));
      gl.uniform3fv(U.u_accent, hex2rgb(PARAMS.accent));

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (rafId) return;
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
      ro.observe(banner);
    } else {
      window.addEventListener('resize', resize);
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) start();
        else stop();
      }, { threshold: 0.01 });
      io.observe(banner);
    } else {
      visible = true;
      start();
    }
  });
})();
