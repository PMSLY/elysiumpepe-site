const config = window.ELYSIUM_PEPE || {};

const ticker = config.ticker || '$EPEPE';
const chain = config.chain || 'Elysium';
const contractAddress = config.contractAddress || '';

document.querySelectorAll('[data-ticker]').forEach((node) => {
  node.textContent = ticker;
});

document.querySelectorAll('[data-chain]').forEach((node) => {
  node.textContent = chain;
});

document.querySelectorAll('[data-x-link]').forEach((link) => {
  if (config.xUrl) link.href = config.xUrl;
});

document.querySelectorAll('[data-telegram-link]').forEach((link) => {
  if (config.telegramUrl) link.href = config.telegramUrl;
});

document.querySelectorAll('[data-launchpad-link]').forEach((link) => {
  link.textContent = `${config.launchpadName || 'Boxa'} ↗`;
  if (config.launchpadUrl) link.href = config.launchpadUrl;
});

document.querySelectorAll('[data-buy-link]').forEach((link) => {
  if (config.buyUrl) {
    link.href = config.buyUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
  } else {
    link.href = '#token';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelector('#token')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
});

const toast = document.querySelector('[data-copy-toast]');
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

document.querySelectorAll('[data-contract]').forEach((button) => {
  if (!contractAddress) {
    button.textContent = 'Revealed at launch';
    button.disabled = true;
    return;
  }

  button.title = contractAddress;
  button.setAttribute('aria-label', `Copy contract address ${contractAddress}`);
  button.textContent = button.hasAttribute('data-full-address')
    ? contractAddress
    : `${contractAddress.slice(0, 8)}…${contractAddress.slice(-6)}`;

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(contractAddress);
      showToast('Contract copied to clipboard');
    } catch {
      showToast('Copy unavailable — address shown on screen');
    }
  });
});

const revealNodes = document.querySelectorAll('.reveal:not(.is-visible)');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

const header = document.querySelector('[data-header]');
const root = document.documentElement;
let scrollFrame;

function updateScrollEffects() {
  const y = window.scrollY;
  const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  root.style.setProperty('--scroll-progress', Math.min(1, y / available));
  root.style.setProperty('--hero-zoom', Math.min(0.045, y / 16000));
  header?.classList.toggle('is-scrolled', y > 38);
  scrollFrame = null;
}

window.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollEffects);
}, { passive: true });

updateScrollEffects();

if (window.matchMedia('(hover: hover)').matches) {
  document.body.classList.add('has-pointer');
  window.addEventListener('pointermove', (event) => {
    root.style.setProperty('--cursor-x', `${event.clientX}px`);
    root.style.setProperty('--cursor-y', `${event.clientY}px`);
  }, { passive: true });
}
