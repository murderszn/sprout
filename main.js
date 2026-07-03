const overlay = document.getElementById('overlay');
const overlayBg = document.getElementById('hero-terminal-bg');
const nav = document.getElementById('nav');
const scrollProgress = document.getElementById('scroll-progress');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollTicking = false;
let lastScrollY = 0;

function getNavOffset() {
  const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 72;
  return navHeight + 16;
}

function scrollToTarget(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const targetTop = el.getBoundingClientRect().top + window.scrollY - getNavOffset();
  window.scrollTo({ top: targetTop, behavior: 'smooth' });
}

function handleScroll() {
  const scrollY = window.scrollY;
  lastScrollY = scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0;

  if (scrollProgress) {
    scrollProgress.style.transform = `scaleX(${progress})`;
  }
}

function onScroll() {
  if (!scrollTicking) {
    scrollTicking = true;
    requestAnimationFrame(() => {
      handleScroll();
      scrollTicking = false;
    });
  }
}

const navSections = [
  { id: 'top', el: document.getElementById('top') },
  { id: 'install', el: document.getElementById('install') },
  { id: 'commands', el: document.getElementById('commands') },
  { id: 'features', el: document.getElementById('features') },
  { id: 'faq', el: document.getElementById('faq') },
].filter((s) => s.el);

function updateNavTheme() {
  const scrollY = window.scrollY;
  const heroHeight = window.innerHeight;
  const features = document.getElementById('features');
  if (!features) return;

  const featuresTop = features.getBoundingClientRect().top;
  const install = document.getElementById('install');
  const installTop = install?.getBoundingClientRect().top ?? Infinity;
  const offset = getNavOffset() + 8;

  if (featuresTop <= offset) {
    nav.classList.remove('nav--light', 'nav--dark', 'nav--yellow');
    nav.classList.add('nav--cream');
  } else if (installTop <= offset || scrollY >= heroHeight - offset) {
    nav.classList.remove('nav--light', 'nav--yellow', 'nav--cream');
    nav.classList.add('nav--dark');
  } else {
    nav.classList.remove('nav--dark', 'nav--yellow', 'nav--cream');
    nav.classList.add('nav--light');
  }

  updateNavActive(offset);
}

function updateNavActive(offset) {
  const links = document.querySelectorAll('.nav-links a[data-scroll-target]');
  const heroHeight = window.innerHeight;
  if (lastScrollY < heroHeight - offset - 10) {
    links.forEach((link) => link.classList.remove('is-active'));
    return;
  }

  const marker = lastScrollY + offset + 1;
  let activeId = 'install';

  for (const section of navSections.slice(1).reverse()) {
    if (marker >= section.el.offsetTop) {
      activeId = section.id;
      break;
    }
  }

  links.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.scrollTarget === activeId);
  });
}

function init() {
  document.documentElement.classList.add('js');
  nav.classList.add('nav--light');
  handleScroll();
  updateNavTheme();

  if (location.hash) {
    const id = location.hash.slice(1);
    requestAnimationFrame(() => {
      if (id === 'demo') focusHeroDemo();
      else scrollToTarget(id);
    });
  }
}

init();

window.addEventListener('scroll', () => {
  onScroll();
  updateNavTheme();
}, { passive: true });

window.addEventListener('resize', () => {
  handleScroll();
  updateNavTheme();
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#demo') focusHeroDemo();
  else if (location.hash) scrollToTarget(location.hash.slice(1));
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    handleScroll();
    updateNavTheme();
  }
});

document.querySelectorAll('[data-scroll-target]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const target = el.dataset.scrollTarget;
    if (target === 'demo') {
      history.replaceState(null, '', '#demo');
      focusHeroDemo();
      return;
    }
    scrollToTarget(target);
  });
});

function focusHeroDemo() {
  const terminal = document.getElementById('demo');
  if (!terminal) return;

  terminal.classList.remove('is-highlighted');
  void terminal.offsetWidth;
  terminal.classList.add('is-highlighted');
  window.setTimeout(() => terminal.classList.remove('is-highlighted'), 1400);
  window.heroTerminal?.restart();
}

const installStepperItems = document.querySelectorAll('.install-stepper-item');
const installSteps = document.querySelectorAll('.install-step');

if (installStepperItems.length && installSteps.length) {
  const stepObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = [...installSteps].indexOf(entry.target);
        installStepperItems.forEach((item, i) => {
          const isCurrent = i === index;
          item.classList.toggle('is-current', isCurrent);
          item.toggleAttribute('aria-current', isCurrent ? 'step' : false);
        });
      });
    },
    { threshold: 0.35, rootMargin: '-20% 0px -55% 0px' }
  );

  installSteps.forEach((step) => stepObserver.observe(step));
}

document.querySelector('.nav-logo')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function selectPlatform(platform) {
  document.querySelectorAll('.platform-card').forEach((card) => {
    const isActive = card.dataset.platform === platform;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    const btn = card.querySelector('.platform-select');
    if (btn) {
      btn.textContent = isActive ? 'Selected' : 'Select';
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  });

  document.querySelectorAll('#install-step-1 .command-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `cmd-${platform}`);
  });
}

document.querySelectorAll('.platform-card').forEach((card) => {
  card.addEventListener('click', () => {
    selectPlatform(card.dataset.platform);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectPlatform(card.dataset.platform);
    }
  });
});

document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = btn.dataset.copy;
    const label = btn.querySelector('.copy-text');
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      label.textContent = 'Copied';
      btn.setAttribute('aria-label', 'Copied to clipboard');
      setTimeout(() => {
        btn.classList.remove('copied');
        label.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy command');
      }, 2000);
    } catch {
      label.textContent = 'Failed';
      btn.setAttribute('aria-label', 'Copy failed');
      setTimeout(() => {
        label.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy command');
      }, 2000);
    }
  });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
);

document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
  revealObserver.observe(el);
});