(function initByopCallback() {
  const ISSUER = "https://enter.pollinations.ai";
  const CLIENT_ID = "pk_AixR2lSZdrdT17l7";
  const STORAGE_KEY = "sprout_byop_oauth";
  const SCOPE = "profile usage";

  const root = document.getElementById("byop-callback-root");
  if (!root) return;

  const redirectUri = `${window.location.origin}${window.location.pathname.replace(/\/$/, "") || "/"}`;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function maskKey(key) {
    if (!key || key.length < 12) return "sk_…";
    return `${key.slice(0, 6)}…${key.slice(-4)}`;
  }

  function render(html) {
    root.innerHTML = html;
  }

  function renderLoading(message) {
    render(`
      <div class="byop-card byop-card--loading">
        <div class="byop-spinner" aria-hidden="true"></div>
        <p>${escapeHtml(message)}</p>
      </div>
    `);
  }

  function renderError(title, detail, actions = "") {
    render(`
      <div class="byop-card byop-card--error">
        <h1>${escapeHtml(title)}</h1>
        <p>${detail}</p>
        ${actions}
      </div>
    `);
  }

  function renderSuccess(apiKey, username) {
    const who = username ? `Signed in as <strong>${escapeHtml(username)}</strong>.` : "Authorization complete.";
    render(`
      <div class="byop-card byop-card--success">
        <div class="byop-icon" aria-hidden="true">✓</div>
        <h1>Pollen connected</h1>
        <p>${who} Your scoped key is ready for Sprout.</p>
        <div class="byop-key-box">
          <code id="byop-key-value">${escapeHtml(maskKey(apiKey))}</code>
          <button type="button" class="byop-btn byop-btn--ghost" id="byop-reveal-btn">Reveal</button>
          <button type="button" class="byop-btn" id="byop-copy-btn">Copy key</button>
        </div>
        <p class="byop-hint">In your terminal, paste the key with <code>sprout config --set-key</code>, or run <code>sprout login</code> next time (device flow — no browser callback needed).</p>
        <div class="byop-actions">
          <a class="byop-btn" href="../index.html#install">Back to install guide</a>
          <a class="byop-btn byop-btn--ghost" href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer">Pollinations dashboard</a>
        </div>
      </div>
    `);

    const revealBtn = document.getElementById("byop-reveal-btn");
    const copyBtn = document.getElementById("byop-copy-btn");
    const keyEl = document.getElementById("byop-key-value");
    let revealed = false;

    revealBtn?.addEventListener("click", () => {
      revealed = !revealed;
      if (keyEl) keyEl.textContent = revealed ? apiKey : maskKey(apiKey);
      if (revealBtn) revealBtn.textContent = revealed ? "Hide" : "Reveal";
    });

    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(apiKey);
        copyBtn.textContent = "Copied!";
        window.setTimeout(() => {
          copyBtn.textContent = "Copy key";
        }, 2000);
      } catch {
        copyBtn.textContent = "Copy failed";
      }
    });
  }

  function renderStartLogin() {
    render(`
      <div class="byop-card">
        <div class="byop-brand">🌱 Sprout</div>
        <h1>Sign in with Pollinations</h1>
        <p>Authorize Sprout to use your Pollen balance. You stay in control — Sprout never stores keys on this website.</p>
        <button type="button" class="byop-btn" id="byop-start-btn">Continue to Pollinations</button>
        <p class="byop-hint">CLI users: run <code>sprout login</code> in your terminal instead (recommended).</p>
        <div class="byop-actions">
          <a class="byop-btn byop-btn--ghost" href="../index.html">Back to site</a>
        </div>
      </div>
    `);

    document.getElementById("byop-start-btn")?.addEventListener("click", () => {
      startOAuthRedirect().catch((err) => {
        renderError("Could not start sign-in", escapeHtml(err.message || String(err)));
      });
    });
  }

  async function discover() {
    const res = await fetch(`${ISSUER}/.well-known/oauth-authorization-server`);
    if (!res.ok) throw new Error(`OAuth discovery failed (${res.status})`);
    return res.json();
  }

  function randomBase64Url(bytes) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    let binary = "";
    buffer.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function sha256Base64Url(input) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function startOAuthRedirect() {
    const meta = await discover();
    const verifier = randomBase64Url(32);
    const challenge = await sha256Base64Url(verifier);
    const state = randomBase64Url(24);

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ verifier, state, redirectUri, createdAt: Date.now() })
    );

    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    window.location.href = url.toString();
  }

  async function exchangeCode(code, verifier) {
    const res = await fetch(`${ISSUER}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        code_verifier: verifier,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      const detail = body.error ? `${body.error}` : `HTTP ${res.status}`;
      throw new Error(`Token exchange failed: ${detail}`);
    }
    return body.access_token;
  }

  async function fetchUserInfo(accessToken) {
    try {
      const res = await fetch(`${ISSUER}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async function handleOAuthCode() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      renderError(
        "Authorization denied",
        `Pollinations returned <code>${escapeHtml(error)}</code>.`,
        `<div class="byop-actions"><a class="byop-btn" href="${escapeHtml(window.location.pathname)}">Try again</a></div>`
      );
      return;
    }

    const code = params.get("code");
    const state = params.get("state");
    if (!code) return false;

    renderLoading("Finishing Pollinations sign-in…");

    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) {
      renderError(
        "Sign-in session expired",
        "Start again from this page so PKCE state can be verified.",
        `<div class="byop-actions"><a class="byop-btn" href="${escapeHtml(window.location.pathname)}">Try again</a></div>`
      );
      return true;
    }

    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      renderError("Sign-in state invalid", "Clear site data for this page and try again.");
      return true;
    }

    if (!saved.verifier || saved.state !== state) {
      renderError(
        "Sign-in state mismatch",
        "This can happen if the callback opened in a different browser profile. Try again.",
        `<div class="byop-actions"><a class="byop-btn" href="${escapeHtml(window.location.pathname)}">Try again</a></div>`
      );
      return true;
    }

    try {
      const accessToken = await exchangeCode(code, saved.verifier);
      const profile = await fetchUserInfo(accessToken);
      const username =
        profile?.preferred_username || profile?.name || profile?.email || null;
      history.replaceState(null, "", window.location.pathname);
      renderSuccess(accessToken, username);
    } catch (err) {
      renderError("Could not complete sign-in", escapeHtml(err.message || String(err)));
    }
    return true;
  }

  function handleLegacyFragment() {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const apiKey = hash.get("api_key");
    const error = hash.get("error");

    if (error) {
      renderError(
        "Authorization denied",
        `Pollinations returned <code>${escapeHtml(error)}</code>.`,
        `<div class="byop-actions"><a class="byop-btn" href="${escapeHtml(window.location.pathname)}">Try again</a></div>`
      );
      return true;
    }

    if (!apiKey) return false;

    history.replaceState(null, "", window.location.pathname);
    renderSuccess(apiKey, null);
    return true;
  }

  async function run() {
    if (handleLegacyFragment()) return;
    if (await handleOAuthCode()) return;
    renderStartLogin();
  }

  run();
})();