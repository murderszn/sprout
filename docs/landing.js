const status = document.getElementById("copy-status");
const resetTimers = new WeakMap();
let toastTimer;
function showFeedback(message) {
	clearTimeout(toastTimer);
	status.textContent = message;
	status.classList.add("is-visible");
	toastTimer = setTimeout(() => status.classList.remove("is-visible"), 3200);
}

// Delegation keeps command copying available when the workflow picker changes its rows.
document.addEventListener("click", async (event) => {
	const button = event.target.closest("[data-copy]");
	if (!button) return;
	const label = button.querySelector("span");
	const originalLabel =
		button.dataset.copyLabel || button.getAttribute("aria-label");
	button.dataset.copyLabel = originalLabel;
	const command = button.dataset.copy;
	clearTimeout(resetTimers.get(button));
	try {
		await navigator.clipboard.writeText(command);
		label.textContent = "Copied";
		button.classList.add("copied");
		button.setAttribute("aria-label", "Command copied to clipboard");
		showFeedback(`Copied: ${command}`);
	} catch {
		label.textContent = "Select";
		const range = document.createRange();
		range.selectNodeContents(
			button
				.closest(".command-bar, .workspace-commands li")
				.querySelector("code"),
		);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		showFeedback("Command selected. Copy it with your keyboard.");
	}
	resetTimers.set(
		button,
		setTimeout(() => {
			label.textContent = "Copy";
			button.classList.remove("copied");
			button.setAttribute("aria-label", originalLabel);
		}, 2200),
	);
});

const toolLibrary = document.getElementById("supported-tools");
const libraryToggle = document.querySelector("[data-open-tools]");
const toolSearch = document.getElementById("tool-search");
const toolItems = [...toolLibrary.querySelectorAll(".tool-library li")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function setLibrary(open) {
	toolLibrary.hidden = !open;
	libraryToggle.setAttribute("aria-expanded", String(open));
	libraryToggle.querySelector("span").textContent = open ? "−" : "+";
}
libraryToggle.addEventListener("click", () => {
	setLibrary(toolLibrary.hidden);
});
if (location.hash === "#supported-tools") setLibrary(true);
window.addEventListener("hashchange", () => {
	if (location.hash === "#supported-tools") setLibrary(true);
});
toolSearch.addEventListener("input", () => {
	const terms = toolSearch.value
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	let count = 0;
	toolItems.forEach((item) => {
		item.hidden = !terms.every((term) => item.dataset.search.includes(term));
		if (!item.hidden) count++;
	});
	document.getElementById("library-count").textContent = terms.length
		? `${count} ${count === 1 ? "tool" : "tools"} found`
		: `${toolItems.length} tools in the curated library`;
	toolLibrary.querySelector(".library-empty").hidden = count !== 0;
});
const toolButtons = [...document.querySelectorAll("[data-tool]")];
function selectTool(button, scroll = true) {
	const command = `sprout install ${button.dataset.tool}`;
	const name = button.dataset.toolName;
	document.getElementById("selected-tool-name").textContent = name;
	document.getElementById("selected-tool-command").textContent = command;
	const copy = toolLibrary.querySelector("[data-copy]");
	clearTimeout(resetTimers.get(copy));
	copy.dataset.copy = command;
	copy.dataset.copyLabel = `Copy ${name} install command`;
	copy.setAttribute("aria-label", copy.dataset.copyLabel);
	copy.classList.remove("copied");
	copy.querySelector("span").textContent = "Copy";
	toolButtons.forEach((item) =>
		item.setAttribute(
			"aria-pressed",
			String(item.dataset.tool === button.dataset.tool),
		),
	);
	setLibrary(true);
	if (scroll)
		toolLibrary.querySelector(".tool-selection").scrollIntoView({
			behavior: reducedMotion.matches ? "auto" : "smooth",
			block: "center",
		});
}
toolButtons.forEach((button) => {
	button.setAttribute("aria-pressed", String(button.dataset.tool === "gh"));
	button.addEventListener("click", () => selectTool(button));
});
document.querySelectorAll("[data-open-question]").forEach((link) => {
	link.addEventListener("click", () => {
		document.querySelector(link.getAttribute("href")).open = true;
	});
});

const header = document.getElementById("site-header");
const menu = header.querySelector(".mobile-menu");
const menuButton = menu.querySelector("summary");
function closeMenu(restoreFocus = false) {
	menu.open = false;
	if (restoreFocus) menuButton.focus();
}
menu.addEventListener("toggle", () => {
	menuButton.setAttribute(
		"aria-label",
		menu.open ? "Close navigation menu" : "Open navigation menu",
	);
});
menu
	.querySelectorAll("a")
	.forEach((link) => link.addEventListener("click", () => closeMenu()));
document.addEventListener("click", (event) => {
	if (menu.open && !menu.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && menu.open) closeMenu(true);
});
const desktopWidth = matchMedia("(min-width: 761px)");
desktopWidth.addEventListener("change", (event) => {
	if (event.matches) closeMenu();
});
let scrollFrame = 0;
function updateReadingProgress() {
	scrollFrame = 0;
	const remaining = document.documentElement.scrollHeight - innerHeight;
	header.style.setProperty(
		"--page-progress",
		`${remaining > 0 ? Math.min(100, Math.max(0, (scrollY / remaining) * 100)) : 0}%`,
	);
	header.classList.toggle("is-scrolled", scrollY > 24);
}
window.addEventListener(
	"scroll",
	() => {
		if (!scrollFrame)
			scrollFrame = requestAnimationFrame(updateReadingProgress);
	},
	{ passive: true },
);
window.addEventListener("resize", updateReadingProgress);
new ResizeObserver(updateReadingProgress).observe(document.body);
updateReadingProgress();

const animationToggle = document.querySelector(".animation-toggle");
const plant = document.querySelector(".footer-plant-frame");
animationToggle.addEventListener("click", () => {
	const paused = plant.classList.toggle("is-paused");
	animationToggle.textContent = paused ? "Play plant" : "Pause plant";
	animationToggle.setAttribute("aria-pressed", String(paused));
	animationToggle.setAttribute(
		"aria-label",
		paused ? "Play plant animation" : "Pause plant animation",
	);
});

const workflows = {
	agents: {
		title: "A little help for your big idea.",
		description:
			"Set up a coding assistant, its runtime, and the GitHub tools around it.",
		tools: [
			["Claude Code", "A coding assistant in your terminal.", "claude"],
			["Node.js", "A runtime for your JavaScript tools.", "node"],
			["GitHub CLI", "Your repositories, one command away.", "gh"],
		],
	},
	shipping: {
		title: "From a local idea to something shared.",
		description:
			"Get the tools for version control, pull requests, and running your project in containers.",
		tools: [
			["Git", "Keep track of what you build.", "git"],
			["GitHub CLI", "Manage pull requests from your terminal.", "gh"],
			["Docker", "A consistent place to run your project.", "docker"],
		],
	},
	data: {
		title: "Make room for a little discovery.",
		description:
			"Prepare the CLIs and runtime for your database, notebooks, and data workflows.",
		tools: [
			["Supabase", "Work with your local database stack.", "supabase"],
			["Databricks", "Connect to your data workspace.", "databricks"],
			["Python", "A foundation for scripts and analysis.", "python"],
		],
	},
};
const workflowTabs = [...document.querySelectorAll("[data-workspace]")];
const workflowPanel = document.getElementById("workspace-panel");
function selectWorkflow(tab) {
	const workflow = workflows[tab.dataset.workspace];
	workflowTabs.forEach((button) => {
		const selected = button === tab;
		button.setAttribute("aria-selected", String(selected));
		button.tabIndex = selected ? 0 : -1;
	});
	workflowPanel.setAttribute("aria-labelledby", tab.id);
	workflowPanel.querySelector("h3").textContent = workflow.title;
	workflowPanel.querySelector(".workspace-intro>p").textContent =
		workflow.description;
	workflowPanel.querySelector(".workspace-commands").innerHTML = workflow.tools
		.map(
			([name, description, tool]) =>
				`<li><div><strong>${name}</strong><span>${description}</span></div><code>sprout install ${tool}</code><button class="copy-btn" type="button" data-copy="sprout install ${tool}" aria-label="Copy ${name} install command"><svg class="icon" aria-hidden="true"><use href="#copy"/></svg><span>Copy</span></button></li>`,
		)
		.join("");
}
workflowTabs.forEach((tab, index) => {
	tab.addEventListener("click", () => selectWorkflow(tab));
	tab.addEventListener("keydown", (event) => {
		const next = {
			ArrowRight: (index + 1) % workflowTabs.length,
			ArrowDown: (index + 1) % workflowTabs.length,
			ArrowLeft: (index - 1 + workflowTabs.length) % workflowTabs.length,
			ArrowUp: (index - 1 + workflowTabs.length) % workflowTabs.length,
			Home: 0,
			End: workflowTabs.length - 1,
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		workflowTabs[next].focus();
		selectWorkflow(workflowTabs[next]);
	});
});
