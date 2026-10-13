(() => {
	const root = document.getElementById("hero-terminal");
	const session = document.getElementById("hero-terminal-session");
	if (!root || !session) return;

	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	const tabs = [...root.querySelectorAll("[data-demo]")];
	const pauseButton = root.querySelector(".demo-pause");
	const pauseLabel = root.querySelector(".demo-pause-label");
	const state = root.querySelector(".demo-state");
	const followButton = root.querySelector(".demo-follow");
	const dialog = document.querySelector(".terminal-dialog");
	const expandButton = root.querySelector(".demo-expand");
	const home = root.parentElement;
	const escape = (text) =>
		text.replace(
			/[&<>"']/g,
			(char) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[char],
		);
	const line = (at, html, stage) => ({ at, html, stage });
	const command = (at, text, stage, duration = 800) => ({
		at,
		text,
		stage,
		duration,
	});
	const block = (title, text) =>
		`<div class="demo-block"><div class="demo-block-title"><span class="t-brand">●</span> ${title}</div>${text}</div>`;
	const summary = (title, text) =>
		`<div class="demo-summary"><span class="t-ok">✓</span><div><strong>${title}</strong><p>${text}</p></div></div>`;
	const examples = {
		preview: [
			command(0, "sprout --dry-run install gh", "detect", 1200),
			line(
				1500,
				'<div class="demo-banner"><svg aria-hidden="true"><use href="#sprout-mark"/></svg><strong>sprout</strong><span>plan-only mode</span><small>Preview proposed commands · no execution</small></div>',
			),
			line(
				2300,
				block(
					"environment",
					'<p class="t-dim">macOS · arm64 · zsh · Homebrew</p>',
				),
				"detect",
			),
			line(
				3500,
				block(
					"the plan",
					"<p>Check for GitHub CLI, install if missing, and verify the result. These commands are proposed for review.</p>",
				),
				"plan",
			),
			line(
				4800,
				'<div class="demo-change"><span class="t-dim">Planned check</span><p><code>command -v gh</code></p></div>',
			),
			line(
				5700,
				'<div class="demo-change"><span class="t-dim">Planned install · if missing</span><p><code>brew install gh</code></p></div>',
			),
			line(
				6600,
				'<div class="demo-change"><span class="t-dim">Planned verification</span><p><code>gh --version</code></p></div>',
			),
			line(
				8000,
				summary(
					"Plan ready. Nothing changed.",
					"Review the commands, then run without --dry-run when you’re ready.",
				),
				"complete",
			),
		],
		install: [
			command(0, "sprout install gh", "detect", 1100),
			line(
				1400,
				'<div class="demo-banner"><svg aria-hidden="true"><use href="#sprout-mark"/></svg><strong>sprout</strong><span>install gh</span><small>gpt-5.4-mini · Pollinations</small></div>',
			),
			line(
				2000,
				block(
					"environment",
					'<p class="t-dim">macOS · arm64 · zsh</p><p class="t-dim">managers: Homebrew, npm, pip3</p>',
				),
				"detect",
			),
			line(
				2800,
				block(
					"the plan",
					"<p>Check for GitHub CLI. If it’s missing, install with Homebrew, then verify with <code>gh --version</code>.</p>",
				),
				"plan",
			),
			command(4300, "command -v gh", "plan"),
			line(
				5400,
				'<p class="demo-output"><span class="t-fail">↳ not found</span><span class="t-dim">exit 1</span></p>',
			),
			command(5900, "brew install gh", "confirm"),
			line(
				6900,
				'<p class="demo-approval"><span class="t-dim">Run this command? [y/N]</span> <span class="t-ok">y</span></p>',
			),
			line(
				8000,
				'<p class="demo-output"><span class="t-dim">↳ Installing GitHub CLI…</span></p>',
			),
			line(
				9100,
				'<p class="demo-output"><span class="t-ok">↳ installation complete</span><span class="t-dim">exit 0</span></p>',
			),
			command(9700, "gh --version", "verify"),
			line(10800, '<p class="demo-output t-dim">↳ gh version 2.63.1</p>'),
			line(
				11500,
				summary(
					"GitHub CLI verified",
					"Installed with Homebrew. Checked with a real command.",
				),
				"complete",
			),
		],
		repair: [
			command(0, "sprout diagnose --tool gh", "detect", 1300),
			line(
				1600,
				'<div class="demo-banner"><svg aria-hidden="true"><use href="#sprout-mark"/></svg><strong>sprout</strong><span>diagnose gh</span><small>gpt-5.4-mini · Pollinations</small></div>',
			),
			line(
				2100,
				'<div class="demo-log"><span class="t-dim">Pasted install log</span><p>$ gh --version</p><p class="t-fail">zsh: command not found: gh</p></div>',
			),
			line(
				3300,
				block(
					"environment",
					'<p class="t-dim">macOS · zsh · Homebrew</p><p>GitHub CLI is installed at <code>/opt/homebrew/bin/gh</code>.</p>',
				),
				"detect",
			),
			line(
				4800,
				block(
					"the plan",
					"<p>Your shell’s PATH is missing Homebrew. Review the shell configuration change, back up the file, then verify GitHub CLI.</p>",
				),
				"plan",
			),
			line(
				6400,
				'<div class="demo-change"><span class="t-dim">Proposed addition · ~/.zshrc</span><p class="t-ok">+ export PATH="/opt/homebrew/bin:$PATH"</p></div>',
				"confirm",
			),
			line(
				7900,
				'<p class="demo-approval"><span class="t-dim">Approve this change? [y/N]</span> <span class="t-ok">y</span></p>',
			),
			line(
				9000,
				'<p class="demo-output t-dim">↳ Previous configuration backed up.</p>',
			),
			command(9700, "zsh -lc 'gh --version'", "verify", 1000),
			line(11000, '<p class="demo-output t-dim">↳ gh version 2.63.1</p>'),
			line(
				11700,
				summary(
					"Back on your PATH",
					"Shell configuration repaired. GitHub CLI verified.",
				),
				"complete",
			),
		],
	};

	let selected = "install";
	let events = examples.install;
	let index = 0;
	let elapsed = 0;
	let lastTick = null;
	let frame = 0;
	let typing = null;
	let paused = false;
	let complete = false;
	let visible = true;
	let following = true;
	let placeholder = null;

	function updateStage(stage) {
		root.dataset.stage = stage;
		state.querySelector("span").textContent = {
			detect: "Reading your machine",
			plan: "Making a plan",
			confirm: "Approval before changes",
			verify: "Verifying the result",
			complete:
				selected === "preview"
					? "Preview ready. No commands executed."
					: "Verified. Ready to build.",
		}[stage];
		const order = ["detect", "plan", "confirm", "verify"];
		root.querySelectorAll("[data-stage]").forEach((segment, i) => {
			segment.classList.toggle(
				"is-reached",
				selected === "preview"
					? i <= (stage === "complete" ? 1 : order.indexOf(stage))
					: stage === "complete" || i <= order.indexOf(stage),
			);
		});
		root.querySelector('[data-stage="confirm"]').textContent =
			selected === "preview" ? "No changes" : "Approve";
		root.querySelector('[data-stage="verify"]').textContent =
			selected === "preview" ? "Plan only" : "Verify";
	}

	function follow() {
		if (following) session.scrollTop = session.scrollHeight;
	}

	function append(event, full = false) {
		if (event.stage) updateStage(event.stage);
		const row = document.createElement("div");
		row.className = "demo-row";
		if (event.text) {
			row.classList.add("demo-shell");
			row.innerHTML = `<span class="t-prompt">❯</span> <span class="demo-typed">${full ? escape(event.text) : ""}</span><span class="demo-cursor" aria-hidden="true"></span>`;
			if (full) row.querySelector(".demo-cursor").remove();
			else typing = { event, row, target: row.querySelector(".demo-typed") };
		} else row.innerHTML = event.html;
		session.append(row);
		follow();
	}

	function finishTyping() {
		if (!typing) return;
		typing.target.textContent = typing.event.text;
		typing.row.querySelector(".demo-cursor")?.remove();
		typing = null;
	}

	function syncPause() {
		pauseButton.setAttribute("aria-pressed", String(paused));
		pauseButton.setAttribute(
			"aria-label",
			paused ? "Resume terminal demo" : "Pause terminal demo",
		);
		pauseLabel.textContent = paused ? "Resume" : "Pause";
		pauseButton.querySelector("span").textContent = paused ? "▷" : "Ⅱ";
		pauseButton.disabled = complete;
		root.classList.toggle("is-paused", paused);
		pauseButton.hidden = motion.matches;
	}

	function tick(now) {
		frame = 0;
		if (paused || complete || document.hidden || (!visible && !dialog.open)) {
			lastTick = null;
			return;
		}
		if (lastTick !== null) elapsed += Math.min(now - lastTick, 80);
		lastTick = now;
		while (index < events.length && events[index].at <= elapsed) {
			finishTyping();
			append(events[index++]);
		}
		if (typing) {
			const count = Math.floor(
				(Math.max(0, elapsed - typing.event.at) / typing.event.duration) *
					typing.event.text.length,
			);
			typing.target.textContent = typing.event.text.slice(0, count);
			follow();
			if (count >= typing.event.text.length) finishTyping();
		}
		if (index === events.length && !typing) {
			complete = true;
			root.classList.remove("is-playing");
			syncPause();
			return;
		}
		frame = requestAnimationFrame(tick);
	}

	function schedule() {
		if (!frame && !complete && !paused && !motion.matches) {
			lastTick = null;
			frame = requestAnimationFrame(tick);
		}
	}

	function restart() {
		cancelAnimationFrame(frame);
		frame = 0;
		index = 0;
		elapsed = 0;
		lastTick = null;
		typing = null;
		paused = false;
		complete = false;
		following = true;
		followButton.hidden = true;
		session.replaceChildren();
		events = examples[selected];
		root.classList.add("is-playing");
		updateStage("detect");
		if (motion.matches) {
			events.forEach((event) => append(event, true));
			complete = true;
			index = events.length;
			root.classList.remove("is-playing");
			follow();
		} else {
			append(events[index++]);
			schedule();
		}
		syncPause();
	}

	function select(tab) {
		selected = tab.dataset.demo;
		tabs.forEach((button) => {
			const active = button === tab;
			button.setAttribute("aria-selected", String(active));
			button.tabIndex = active ? 0 : -1;
		});
		session.setAttribute("aria-labelledby", tab.id);
		restart();
	}
	tabs.forEach((tab, i) => {
		tab.addEventListener("click", () => select(tab));
		tab.addEventListener("keydown", (event) => {
			const next = {
				ArrowRight: (i + 1) % tabs.length,
				ArrowLeft: (i - 1 + tabs.length) % tabs.length,
				Home: 0,
				End: tabs.length - 1,
			}[event.key];
			if (next === undefined) return;
			event.preventDefault();
			tabs[next].focus();
			select(tabs[next]);
		});
	});
	document.querySelectorAll("[data-show-demo]").forEach((link) => {
		link.addEventListener("click", (event) => {
			event.preventDefault();
			const tab = tabs.find(
				(button) => button.dataset.demo === link.dataset.showDemo,
			);
			if (!tab) return;
			select(tab);
			root.scrollIntoView({
				behavior: motion.matches ? "auto" : "smooth",
				block: "center",
			});
			tab.focus({ preventScroll: true });
		});
	});
	root.querySelector(".demo-replay").addEventListener("click", restart);
	pauseButton.addEventListener("click", () => {
		paused = !paused;
		syncPause();
		if (!paused) schedule();
	});
	session.addEventListener(
		"scroll",
		() => {
			following =
				session.scrollHeight - session.scrollTop - session.clientHeight < 28;
			followButton.hidden = following;
		},
		{ passive: true },
	);
	new ResizeObserver(() => {
		if (following) follow();
	}).observe(session);
	document.fonts.ready.then(() => {
		if (following) follow();
	});
	followButton.addEventListener("click", () => {
		following = true;
		follow();
		followButton.hidden = true;
	});

	expandButton.addEventListener("click", () => {
		if (dialog.open) {
			dialog.close();
			return;
		}
		placeholder = document.createElement("div");
		placeholder.style.height = `${root.offsetHeight}px`;
		placeholder.className = "terminal-placeholder";
		root.before(placeholder);
		dialog.append(root);
		dialog.showModal();
		document.body.classList.add("terminal-open");
		expandButton.setAttribute("aria-label", "Close expanded session");
		expandButton.title = "Close expanded session";
		expandButton.innerHTML =
			'<span>Close session</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
		expandButton.focus();
		schedule();
	});
	dialog.addEventListener("close", () => {
		home.insertBefore(root, placeholder);
		placeholder?.remove();
		placeholder = null;
		document.body.classList.remove("terminal-open");
		expandButton.setAttribute("aria-label", "Read the full session");
		expandButton.title = "Read the full session";
		expandButton.innerHTML =
			'<span>Read session</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
		expandButton.focus();
		follow();
	});
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});
	new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			if (visible) schedule();
		},
		{ threshold: 0.05 },
	).observe(root);
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) schedule();
	});
	motion.addEventListener("change", restart);
	window.heroTerminal = { restart };
	restart();
})();
