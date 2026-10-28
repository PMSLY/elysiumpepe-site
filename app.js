const config = window.ELYSIUM_PEPE || {};

document.querySelectorAll('[data-ticker]').forEach((node) => {
  node.textContent = config.ticker || '$EPEPE';
});

document.querySelectorAll('[data-chain]').forEach((node) => {
  node.textContent = config.chain || 'Elysium';
});

document.querySelectorAll('[data-x-link]').forEach((link) => {
  if (config.xUrl) link.href = config.xUrl;
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
    link.classList.add('is-pending');
    link.addEventListener('click', () => {
      document.querySelector('#token')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
});

const contractButton = document.querySelector('[data-contract]');

if (contractButton && config.contractAddress) {
  const address = config.contractAddress;
  contractButton.textContent = `${address.slice(0, 7)}…${address.slice(-5)}`;
  contractButton.title = address;
  contractButton.classList.add('has-contract');
  contractButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(address);
    const previous = contractButton.textContent;
    contractButton.textContent = 'Copied ✓';
    window.setTimeout(() => { contractButton.textContent = previous; }, 1400);
  });
} else if (contractButton) {
  contractButton.disabled = true;
}
