(function initHeroTerminal() {
  const root = document.getElementById('hero-terminal');
  const session = document.getElementById('hero-terminal-session');
  if (!root || !session) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SESSION_HTML = `
<div class="t-line t-cmd"><span class="t-prompt">$</span> sprout install gh</div>
<div class="t-box">
  <div class="t-box-line"><span class="t-brand">🌱 <strong>sprout</strong></span> <span class="t-dim">·</span> <strong>install gh</strong></div>
  <div class="t-box-line t-dim">model gpt-5.4-mini · gen.pollinations.ai</div>
</div>
<div class="t-line t-card"><span class="t-brand">⏺</span> <strong>environment</strong></div>
<div class="t-line t-elbow t-dim">⎿ macOS 14.6 (arm64) <span class="t-faint">·</span> zsh <span class="t-faint">·</span> rc ~/.zshrc</div>
<div class="t-line t-elbow t-dim">⎿ managers: brew, npm, pip3</div>
<div class="t-line t-elbow t-dim">⎿ knowledge base: curated entry for GitHub CLI</div>
<div class="t-line t-prose">I'll probe for <code>gh</code>, install via Homebrew if missing, then verify with <code>gh --version</code>.</div>
<div class="t-line t-card"><span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 1</span></div>
<div class="t-line t-indent"><span class="t-accent">$</span> <span class="t-accent t-bold">command -v gh</span></div>
<div class="t-line t-elbow"><span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span> <span class="t-dim">· 0.0s</span></div>
<div class="t-line t-card"><span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 2</span></div>
<div class="t-line t-indent"><span class="t-accent">$</span> <span class="t-accent t-bold">brew install gh</span></div>
<div class="t-line t-confirm">Run this command? <span class="t-brand">yes</span></div>
<div class="t-line t-elbow"><span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 11.8s</span></div>
<div class="t-line t-card"><span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 3</span></div>
<div class="t-line t-indent"><span class="t-accent">$</span> <span class="t-accent t-bold">gh --version</span></div>
<div class="t-line t-elbow t-dim">⎿ gh version 2.63.1 (2024-11-13)</div>
<div class="t-line t-elbow"><span class="t-dim">⎿</span> <span class="t-ok t-bold">✓ verified</span></div>
<div class="t-box">
  <div class="t-box-line t-brand t-bold">🌱 run summary</div>
  <div class="t-box-line"><span class="t-ok">✓</span> command -v gh</div>
  <div class="t-box-line"><span class="t-ok">✓</span> brew install gh</div>
  <div class="t-box-line"><span class="t-ok">✓</span> gh --version</div>
</div>`;

  const STEPS = [
    { kind: 'type-cmd', prompt: '$ ', text: 'sprout install gh', cps: 14 },
    { kind: 'pause', ms: 280 },
    { kind: 'html', html: `<div class="t-box">
  <div class="t-box-line"><span class="t-brand">🌱 <strong>sprout</strong></span> <span class="t-dim">·</span> <strong>install gh</strong></div>
  <div class="t-box-line t-dim">model gpt-5.4-mini · gen.pollinations.ai</div>
</div>` },
    { kind: 'pause', ms: 220 },
    { kind: 'line', className: 't-line t-card', html: '<span class="t-brand">⏺</span> <strong>environment</strong>' },
    { kind: 'line', className: 't-line t-elbow t-dim', html: '⎿ macOS 14.6 (arm64) <span class="t-faint">·</span> zsh <span class="t-faint">·</span> rc ~/.zshrc' },
    { kind: 'line', className: 't-line t-elbow t-dim', html: '⎿ managers: brew, npm, pip3', delay: 70 },
    { kind: 'line', className: 't-line t-elbow t-dim', html: '⎿ knowledge base: curated entry for GitHub CLI', delay: 70 },
    { kind: 'pause', ms: 180 },
    { kind: 'line', className: 't-line t-prose', html: 'I\'ll probe for <code>gh</code>, install via Homebrew if missing, then verify with <code>gh --version</code>.' },
    { kind: 'pause', ms: 320 },
    { kind: 'line', className: 't-line t-card', html: '<span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 1</span>' },
    { kind: 'type-shell', prompt: '$ ', text: 'command -v gh', cps: 16 },
    { kind: 'pause', ms: 120 },
    { kind: 'line', className: 't-line t-elbow', html: '<span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span> <span class="t-dim">· 0.0s</span>' },
    { kind: 'pause', ms: 360 },
    { kind: 'line', className: 't-line t-card', html: '<span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 2</span>' },
    { kind: 'type-shell', prompt: '$ ', text: 'brew install gh', cps: 15 },
    { kind: 'pause', ms: 200 },
    { kind: 'type-confirm', prefix: 'Run this command? ', text: 'yes', cps: 10 },
    { kind: 'pause', ms: 140 },
    { kind: 'line', className: 't-line t-elbow', html: '<span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 11.8s</span>', delay: 420 },
    { kind: 'pause', ms: 300 },
    { kind: 'line', className: 't-line t-card', html: '<span class="t-brand">⏺</span> <strong>run_shell</strong> <span class="t-dim">· step 3</span>' },
    { kind: 'type-shell', prompt: '$ ', text: 'gh --version', cps: 14 },
    { kind: 'pause', ms: 160 },
    { kind: 'line', className: 't-line t-elbow t-dim', html: '⎿ gh version 2.63.1 (2024-11-13)', delay: 280 },
    { kind: 'line', className: 't-line t-elbow', html: '<span class="t-dim">⎿</span> <span class="t-ok t-bold">✓ verified</span>', delay: 120 },
    { kind: 'pause', ms: 260 },
    { kind: 'html', html: `<div class="t-box">
  <div class="t-box-line t-brand t-bold">🌱 run summary</div>
  <div class="t-box-line"><span class="t-ok">✓</span> command -v gh</div>
  <div class="t-box-line"><span class="t-ok">✓</span> brew install gh</div>
  <div class="t-box-line"><span class="t-ok">✓</span> gh --version</div>
</div>` },
    { kind: 'pause', ms: 4200 },
  ];

  let runId = 0;
  let active = false;

  function wait(ms, id) {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (id === runId) resolve();
      }, ms);
    });
  }

  function jitter(base) {
    return base + Math.floor(Math.random() * 18);
  }

  function scrollToBottom() {
    session.scrollTop = session.scrollHeight;
  }

  function createCursor() {
    const cursor = document.createElement('span');
    cursor.className = 't-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    return cursor;
  }

  function appendLine(className, html) {
    const line = document.createElement('div');
    line.className = className;
    line.innerHTML = html;
    session.appendChild(line);
    scrollToBottom();
    return line;
  }

  function appendHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    session.appendChild(tpl.content);
    scrollToBottom();
  }

  async function typeInto(line, target, text, cps, id) {
    const cursor = createCursor();
    line.appendChild(cursor);

    for (const ch of text) {
      if (id !== runId) return;
      target.textContent += ch;
      scrollToBottom();
      await wait(jitter(1000 / cps), id);
    }

    cursor.remove();
  }

  async function typeCommand(step, id) {
    const line = document.createElement('div');
    line.className = 't-line t-cmd';

    const prompt = document.createElement('span');
    prompt.className = 't-prompt';
    prompt.textContent = step.prompt;

    const typed = document.createElement('span');
    typed.className = 't-typed';

    line.append(prompt, typed);
    session.appendChild(line);
    scrollToBottom();

    await typeInto(line, typed, step.text, step.cps, id);
  }

  async function typeShell(step, id) {
    const line = document.createElement('div');
    line.className = 't-line t-indent';

    const prompt = document.createElement('span');
    prompt.className = 't-accent';
    prompt.textContent = step.prompt;

    const typed = document.createElement('span');
    typed.className = 't-accent t-bold t-typed';

    line.append(prompt, document.createTextNode(' '), typed);
    session.appendChild(line);
    scrollToBottom();

    await typeInto(line, typed, step.text, step.cps, id);
  }

  async function typeConfirm(step, id) {
    const line = document.createElement('div');
    line.className = 't-line t-confirm';

    const prefix = document.createElement('span');
    prefix.textContent = step.prefix;

    const typed = document.createElement('span');
    typed.className = 't-brand t-typed';

    line.append(prefix, typed);
    session.appendChild(line);
    scrollToBottom();

    await typeInto(line, typed, step.text, step.cps, id);
  }

  async function runStep(step, id) {
    switch (step.kind) {
      case 'pause':
        await wait(step.ms, id);
        break;
      case 'line':
        if (step.delay) await wait(step.delay, id);
        appendLine(step.className, step.html);
        break;
      case 'html':
        appendHtml(step.html);
        break;
      case 'type-cmd':
        await typeCommand(step, id);
        break;
      case 'type-shell':
        await typeShell(step, id);
        break;
      case 'type-confirm':
        await typeConfirm(step, id);
        break;
      default:
        break;
    }
  }

  function renderStatic() {
    session.innerHTML = SESSION_HTML;
    scrollToBottom();
  }

  async function playLoop(id) {
    session.innerHTML = '';
    root.classList.add('is-typing');

    for (const step of STEPS) {
      if (id !== runId) return;
      await runStep(step, id);
    }

    if (id !== runId) return;
    root.classList.remove('is-typing');
    await playLoop(id);
  }

  function start() {
    if (prefersReducedMotion) {
      renderStatic();
      return;
    }

    runId += 1;
    const id = runId;
    active = true;
    playLoop(id);
  }

  function restart() {
    if (prefersReducedMotion) {
      renderStatic();
      return;
    }

    runId += 1;
    playLoop(runId);
  }

  window.heroTerminal = { restart };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || prefersReducedMotion) return;
    if (!active) start();
  });
})();