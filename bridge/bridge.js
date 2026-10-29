const CHAINS = {
  hyperevm: {
    id: 999,
    hexId: '0x3e7',
    name: 'HyperEVM',
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://hyperevmscan.io',
    icon: '../assets/hyperevm.png',
  },
  elysium: {
    id: 99901,
    hexId: '0x1863d',
    name: 'Elysium',
    rpc: 'https://rpc-live.elysp.com',
    explorer: null,
    icon: '../assets/elysium-chain.png',
  },
};

const BRIDGE_CONTRACT = '0xce59f8B65ad41C9DAE4c07A0571a39824bD92cff';
const WITHDRAW_PRECOMPILE = '0x0000000000000000000000000000000000000064';
const DEPOSIT_ETH_SELECTOR = '0x439370b1';
const WITHDRAW_ETH_SELECTOR = '0x25e16063';
const STORAGE_KEY = 'epepe:bridge:deposits';
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const dom = {
  connectButtons: [...document.querySelectorAll('[data-connect]')],
  directionButtons: [...document.querySelectorAll('[data-direction]')],
  amount: document.querySelector('#bridge-amount'),
  quickButtons: [...document.querySelectorAll('[data-amount]')],
  switchButton: document.querySelector('[data-switch]'),
  sourceChain: document.querySelector('[data-source-chain]'),
  destinationChain: document.querySelector('[data-destination-chain]'),
  sourceBalance: document.querySelector('[data-source-balance]'),
  destinationBalance: document.querySelector('[data-destination-balance]'),
  receive: document.querySelector('[data-receive]'),
  arrival: document.querySelector('[data-arrival]'),
  summaryAmount: document.querySelector('[data-summary-amount]'),
  summaryChain: document.querySelector('[data-summary-chain]'),
  timingLabel: document.querySelector('[data-timing-label]'),
  timing: document.querySelector('[data-timing]'),
  withdrawNote: document.querySelector('[data-withdraw-note]'),
  primary: document.querySelector('[data-primary]'),
  phase: document.querySelector('[data-phase]'),
  routeLabel: document.querySelector('[data-route-label]'),
  routeCard: document.querySelector('.route-card'),
  routeMotion: document.querySelector('[data-route-motion]'),
  depositList: document.querySelector('[data-deposit-list]'),
  trackForm: document.querySelector('[data-track-form]'),
  trackInput: document.querySelector('#track-hash'),
  trackButton: document.querySelector('[data-track]'),
  trackError: document.querySelector('[data-track-error]'),
  refresh: document.querySelector('[data-refresh]'),
  toast: document.querySelector('[data-toast]'),
};

const state = {
  account: null,
  direction: 'deposit',
  busy: false,
  stage: null,
  balances: { hyperevm: null, elysium: null },
  deposits: loadDeposits(),
};

function loadDeposits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => HASH_PATTERN.test(item.hash || '')) : [];
  } catch {
    return [];
  }
}

function saveDeposits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.deposits.slice(0, 20)));
}

function short(value, start = 6, end = 4) {
  if (!value) return '';
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function sanitizeAmount(value) {
  let clean = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) clean = `${parts[0]}.${parts.slice(1).join('')}`;
  if (clean.startsWith('.')) clean = `0${clean}`;
  const [whole = '', fraction = ''] = clean.split('.');
  return clean.includes('.') ? `${whole.slice(0, 6)}.${fraction.slice(0, 18)}` : whole.slice(0, 6);
}

function parseHype(value) {
  if (!/^\d+(\.\d{0,18})?$/.test(value) || Number(value) <= 0) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}

function formatHype(wei, precision = 4) {
  if (wei === null || wei === undefined) return '—';
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, precision).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function sourceKey() {
  return state.direction === 'deposit' ? 'hyperevm' : 'elysium';
}

function destinationKey() {
  return state.direction === 'deposit' ? 'elysium' : 'hyperevm';
}

function chainChip(chainKey) {
  const chain = CHAINS[chainKey];
  return `<img src="${chain.icon}" alt="" /> ${chain.name}`;
}

async function rpc(chainKey, method, params = []) {
  const response = await fetch(CHAINS[chainKey].rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`${CHAINS[chainKey].name} RPC returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'RPC request failed');
  return payload.result;
}

function provider() {
  return window.ethereum || null;
}

function errorMessage(error) {
  const code = error?.code ?? error?.cause?.code;
  if (code === 4001) return 'You cancelled the request in your wallet.';
  if (code === -32002) return 'A wallet request is already open. Check your wallet.';
  return error?.shortMessage || error?.message || 'Something went wrong.';
}

let toastTimer;
function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 1900);
}

function setPhase(message, tone = 'info', link = null) {
  dom.phase.hidden = !message;
  dom.phase.className = `transaction-state${tone === 'error' ? ' is-error' : ''}${tone === 'success' ? ' is-success' : ''}`;
  dom.phase.replaceChildren();
  if (!message) return;
  dom.phase.append(document.createTextNode(message));
  if (link) {
    dom.phase.append(document.createTextNode(' '));
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.textContent = link.label;
    dom.phase.append(anchor);
  }
}

function updateUI() {
  const source = sourceKey();
  const destination = destinationKey();
  const amount = dom.amount.value || '0';

  dom.directionButtons.forEach((button) => {
    const active = button.dataset.direction === state.direction;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = state.busy;
  });

  dom.quickButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.amount === dom.amount.value);
    button.disabled = state.busy;
  });
  dom.switchButton.disabled = state.busy;
  dom.amount.disabled = state.busy;

  dom.sourceChain.innerHTML = chainChip(source);
  dom.destinationChain.innerHTML = chainChip(destination);
  dom.destinationChain.classList.toggle('chain-chip-elysium', destination === 'elysium');
  dom.arrival.textContent = state.direction === 'deposit' ? 'Arrives in minutes' : 'Ready to claim in about 5–6 days';
  dom.arrival.classList.toggle('is-withdraw', state.direction === 'withdraw');
  dom.timingLabel.textContent = state.direction === 'deposit' ? 'Arrival' : 'Claimable';
  dom.timing.textContent = state.direction === 'deposit' ? 'In minutes' : 'In about 5–6 days';
  dom.summaryChain.textContent = CHAINS[destination].name;
  dom.receive.textContent = amount === '' ? '0.0' : amount;
  dom.summaryAmount.textContent = amount === '' ? '0' : amount;
  dom.withdrawNote.hidden = state.direction !== 'withdraw';
  dom.routeLabel.textContent = state.direction === 'deposit' ? 'DEPOSIT →' : '← WITHDRAW';
  dom.routeCard.classList.toggle('is-withdraw', state.direction === 'withdraw');
  if (dom.routeCard.dataset.direction !== state.direction) {
    dom.routeCard.dataset.direction = state.direction;
    dom.routeMotion.setAttribute('path', state.direction === 'deposit'
      ? 'M12 86 C 138 -12, 342 -12, 468 86'
      : 'M468 86 C 342 -12, 138 -12, 12 86');
    if (typeof dom.routeMotion.beginElement === 'function') dom.routeMotion.beginElement();
  }
  const sourceBalance = state.balances[source];
  const destinationBalance = state.balances[destination];
  dom.sourceBalance.textContent = state.account ? `Balance ${formatHype(sourceBalance)} HYPE` : 'Connect to view balance';
  dom.destinationBalance.textContent = state.account ? `Balance ${formatHype(destinationBalance)} HYPE` : 'Connect to view balance';

  dom.connectButtons.forEach((button) => {
    button.textContent = state.account ? short(state.account) : 'Connect wallet';
    button.classList.toggle('is-connected', Boolean(state.account));
    button.disabled = state.busy;
  });

  const wei = parseHype(dom.amount.value);
  if (state.busy) {
    dom.primary.disabled = true;
    dom.primary.textContent = state.stage || 'Working…';
  } else if (!state.account) {
    dom.primary.disabled = false;
    dom.primary.textContent = 'Connect wallet';
  } else if (!wei) {
    dom.primary.disabled = true;
    dom.primary.textContent = 'Enter an amount';
  } else {
    dom.primary.disabled = false;
    dom.primary.textContent = state.direction === 'deposit' ? 'Bridge HYPE to Elysium' : 'Start withdrawal';
  }
}

function setBusy(value, stage = null) {
  state.busy = value;
  state.stage = stage;
  updateUI();
}

async function connectWallet() {
  const wallet = provider();
  if (!wallet) {
    setPhase('No injected EVM wallet found. Install or open a compatible wallet, then try again.', 'error');
    return false;
  }
  try {
    setBusy(true, 'Waiting for wallet…');
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    state.account = accounts?.[0] || null;
    setPhase(state.account ? `Connected ${short(state.account)}.` : '', 'success');
    await refreshBalances();
    return Boolean(state.account);
  } catch (error) {
    setPhase(errorMessage(error), 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

async function switchChain(chainKey) {
  const wallet = provider();
  if (!wallet) throw new Error('Connect a wallet first.');
  const chain = CHAINS[chainKey];
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.hexId }] });
  } catch (error) {
    const code = error?.code ?? error?.cause?.code;
    if (code !== 4902) throw error;
    const details = {
      chainId: chain.hexId,
      chainName: chain.name,
      nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
      rpcUrls: [chain.rpc],
    };
    if (chain.explorer) details.blockExplorerUrls = [chain.explorer];
    await wallet.request({ method: 'wallet_addEthereumChain', params: [details] });
  }
  const active = await wallet.request({ method: 'eth_chainId' });
  if (Number.parseInt(active, 16) !== chain.id) throw new Error(`Switch your wallet to ${chain.name} and try again.`);
}

async function refreshBalances() {
  if (!state.account) {
    state.balances = { hyperevm: null, elysium: null };
    updateUI();
    return;
  }
  const results = await Promise.allSettled([
    rpc('hyperevm', 'eth_getBalance', [state.account, 'latest']),
    rpc('elysium', 'eth_getBalance', [state.account, 'latest']),
  ]);
  state.balances.hyperevm = results[0].status === 'fulfilled' ? BigInt(results[0].value) : null;
  state.balances.elysium = results[1].status === 'fulfilled' ? BigInt(results[1].value) : null;
  updateUI();
}

async function waitForReceipt(chainKey, hash) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await rpc(chainKey, 'eth_getTransactionReceipt', [hash]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error('Transaction sent, but confirmation is taking longer than expected. Keep the transaction hash and check the explorer.');
}

function withdrawData(account) {
  return `${WITHDRAW_ETH_SELECTOR}${account.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

async function assertExternallyOwnedAccount() {
  const code = await rpc('hyperevm', 'eth_getCode', [state.account, 'latest']);
  if (code && code !== '0x' && code !== '0x0') {
    throw new Error(state.direction === 'deposit'
      ? 'This address is a contract on HyperEVM, so the deposit could be credited to a different Elysium address.'
      : 'This destination is a contract on HyperEVM and may not be able to receive the withdrawal.');
  }
}

function addDeposit(hash, amount) {
  if (state.deposits.some((item) => item.hash.toLowerCase() === hash.toLowerCase())) return;
  state.deposits.unshift({ hash, amount, createdAt: new Date().toISOString(), status: 'pending' });
  saveDeposits();
  renderDeposits();
}

async function executeBridge() {
  if (!state.account && !(await connectWallet())) return;
  const amount = parseHype(dom.amount.value);
  if (!amount) return;

  const source = sourceKey();
  const chain = CHAINS[source];
  const isDeposit = state.direction === 'deposit';
  const to = isDeposit ? BRIDGE_CONTRACT : WITHDRAW_PRECOMPILE;
  const data = isDeposit ? DEPOSIT_ETH_SELECTOR : withdrawData(state.account);

  try {
    setPhase('Checking balances and simulating the transaction…');
    setBusy(true, 'Checking route…');
    await assertExternallyOwnedAccount();

    const balance = BigInt(await rpc(source, 'eth_getBalance', [state.account, 'latest']));
    if (balance < amount) throw new Error(`Not enough HYPE on ${chain.name} for this amount.`);

    setBusy(true, `Switch to ${chain.name}…`);
    await switchChain(source);

    const transaction = { from: state.account, to, value: toHex(amount), data };
    const [estimatedGasHex, gasPriceHex] = await Promise.all([
      rpc(source, 'eth_estimateGas', [transaction]),
      rpc(source, 'eth_gasPrice'),
    ]);
    const estimatedGas = BigInt(estimatedGasHex);
    const gasPrice = BigInt(gasPriceHex);
    const gas = (estimatedGas * 120n) / 100n;
    if (balance < amount + gas * gasPrice) throw new Error(`Not enough HYPE on ${chain.name} for the amount plus gas.`);

    setPhase(`Review the ${state.direction} transaction in your wallet. Destination: ${short(to)}.`);
    setBusy(true, 'Confirm in wallet…');
    const hash = await provider().request({
      method: 'eth_sendTransaction',
      params: [{ ...transaction, gas: toHex(gas), gasPrice: toHex(gasPrice) }],
    });

    if (isDeposit) addDeposit(hash, dom.amount.value);
    const explorerLink = isDeposit ? `${CHAINS.hyperevm.explorer}/tx/${hash}` : null;
    setPhase('Transaction sent. Waiting for confirmation…', 'info', explorerLink ? {
      href: explorerLink,
      label: `${short(hash, 10, 8)} ↗`,
    } : null);
    setBusy(true, 'Confirming…');
    const receipt = await waitForReceipt(source, hash);
    if (receipt.status !== '0x1') throw new Error(`Transaction ${short(hash, 10, 8)} reverted.`);

    if (isDeposit) {
      state.deposits = state.deposits.map((item) => item.hash.toLowerCase() === hash.toLowerCase() ? { ...item, status: 'confirmed' } : item);
      saveDeposits();
      renderDeposits();
      setPhase('Confirmed on HyperEVM. The official bridge is carrying your HYPE to Elysium.', 'success', {
        href: explorerLink,
        label: 'View transaction ↗',
      });
    } else {
      setPhase(`Withdrawal started on Elysium. It becomes claimable on HyperEVM in about 5–6 days. Save this hash: ${short(hash, 10, 8)}.`, 'success');
    }
    dom.amount.value = '';
    showToast(isDeposit ? 'The frog is carrying your HYPE across' : 'Withdrawal countdown started');
    await refreshBalances();
  } catch (error) {
    setPhase(errorMessage(error), 'error');
  } finally {
    setBusy(false);
    updateUI();
  }
}

function renderDeposits() {
  dom.depositList.innerHTML = '';
  if (!state.deposits.length) {
    const empty = document.createElement('li');
    empty.className = 'deposit-item';
    empty.innerHTML = '<span>No deposits saved in this browser yet.</span>';
    dom.depositList.append(empty);
    return;
  }

  state.deposits.forEach((deposit) => {
    const item = document.createElement('li');
    item.className = 'deposit-item';
    const status = deposit.status || 'pending';
    item.innerHTML = `
      <div>
        <strong>${deposit.amount ? `${deposit.amount} HYPE` : 'Tracked deposit'}</strong>
        <span class="status-pill ${status}">${status.toUpperCase()}</span>
        <button type="button" aria-label="Remove ${short(deposit.hash)}" data-remove-hash="${deposit.hash}">×</button>
      </div>
      <div>
        <span>${short(deposit.hash, 10, 8)}</span>
        <a href="${CHAINS.hyperevm.explorer}/tx/${deposit.hash}" target="_blank" rel="noreferrer">View ↗</a>
      </div>`;
    dom.depositList.append(item);
  });
}

async function refreshDeposits() {
  dom.refresh.disabled = true;
  try {
    await Promise.all(state.deposits.map(async (deposit) => {
      try {
        const receipt = await rpc('hyperevm', 'eth_getTransactionReceipt', [deposit.hash]);
        deposit.status = !receipt ? 'pending' : receipt.status === '0x1' ? 'confirmed' : 'failed';
      } catch {
        deposit.status ||= 'pending';
      }
    }));
    saveDeposits();
    renderDeposits();
    showToast('Deposit status refreshed');
  } finally {
    dom.refresh.disabled = false;
  }
}

function setDirection(direction) {
  if (state.busy || !['deposit', 'withdraw'].includes(direction)) return;
  state.direction = direction;
  setPhase('');
  updateUI();
}

dom.directionButtons.forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.direction)));
dom.switchButton.addEventListener('click', () => setDirection(state.direction === 'deposit' ? 'withdraw' : 'deposit'));

dom.amount.addEventListener('input', () => {
  dom.amount.value = sanitizeAmount(dom.amount.value);
  updateUI();
});

dom.quickButtons.forEach((button) => button.addEventListener('click', () => {
  dom.amount.value = button.dataset.amount;
  updateUI();
}));

dom.connectButtons.forEach((button) => button.addEventListener('click', () => {
  if (state.account) showToast(`Connected ${short(state.account)}`);
  else connectWallet();
}));

dom.primary.addEventListener('click', executeBridge);
dom.refresh.addEventListener('click', refreshDeposits);

dom.trackInput.addEventListener('input', () => {
  const valid = HASH_PATTERN.test(dom.trackInput.value.trim());
  dom.trackButton.disabled = !valid;
  dom.trackError.hidden = true;
});

dom.trackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const hash = dom.trackInput.value.trim();
  if (!HASH_PATTERN.test(hash)) {
    dom.trackError.textContent = 'Paste a HyperEVM transaction hash: 0x followed by 64 characters.';
    dom.trackError.hidden = false;
    return;
  }
  addDeposit(hash, null);
  dom.trackInput.value = '';
  dom.trackButton.disabled = true;
  await refreshDeposits();
});

dom.depositList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-hash]');
  if (!button) return;
  state.deposits = state.deposits.filter((item) => item.hash !== button.dataset.removeHash);
  saveDeposits();
  renderDeposits();
});

if (provider()?.on) {
  provider().on('accountsChanged', async (accounts) => {
    state.account = accounts?.[0] || null;
    setPhase(state.account ? `Connected ${short(state.account)}.` : 'Wallet disconnected.', state.account ? 'success' : 'info');
    await refreshBalances();
  });
  provider().on('chainChanged', () => refreshBalances());
}

async function initialize() {
  renderDeposits();
  updateUI();
  try {
    const accounts = provider() ? await provider().request({ method: 'eth_accounts' }) : [];
    state.account = accounts?.[0] || null;
    if (state.account) await refreshBalances();
  } catch {
    state.account = null;
  }
  updateUI();
  if (state.deposits.length) refreshDeposits();
}

initialize();
