// filepath: /Users/diego/CS50BC/CS50BC/js/main.js
// Main client-side script for the CS50B Gradebook demo.
// It sets up basic UI behaviors, integrates MetaMask via ethers.js v6,
// reads on-chain progress from a Sepolia contract, and updates the stepper UI.

document.addEventListener('DOMContentLoaded', () => {
    // Populate the current year in the footer, if present
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Simple mobile nav toggle accessibility: maintain aria-expanded state
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.getElementById('nav-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
    }
});

// Wallet / MetaMask + ethers.js v6
(function () {
    // Total steps in the gradebook flow (1-indexed on-chain, 0-indexed in DOM data attributes)
    const TOTAL_STEPS = 10;
    // Sepolia chain IDs in bigint (from ethers) and hex (for wallet_switchEthereumChain)
    const SEPOLIA_CHAIN_ID = 11155111n;
    const SEPOLIA_CHAIN_HEX = '0xaa36a7';

    // Cache top-right wallet UI elements
    const connectBtn = document.getElementById('connectWalletBtn');
    const sessionBox = document.getElementById('walletSession');
    const avatarBtn = document.getElementById('walletAvatar');
    const menu = document.getElementById('walletMenu');
    const addressEl = document.getElementById('walletAddress');
    const chainEl = document.getElementById('walletChain');
    const balanceEl = document.getElementById('walletBalance');
    const copyBtn = document.getElementById('walletCopyBtn');
    const disconnectBtn = document.getElementById('walletDisconnectBtn');
    const gradebookTitle = document.getElementById('gradebookTitle');
    const initialGradebookText = gradebookTitle ? gradebookTitle.textContent : '';
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressHeader = document.getElementById('currentProgressHeader');
    const progressContainer = document.getElementById('progressContainer');
    const progressLoginAlert = document.getElementById('progressLoginAlert');

    // All stepper <li> elements with a data-step-index (0..9)
    const stepItems = Array.from(document.querySelectorAll('.stepper [data-step-index]'));

    // Contract details fallbacks.
    const FALLBACK_CONTRACT_ADDRESS = '0xdd63024953ad565748493F6B48a54E4886809667';
    const FALLBACK_CONTRACT_ABI = [
        'function getCurrentStep(address wallet) view returns (uint8)',
        'function currentStep(address wallet) view returns (uint8)',
        'function getCompletedSteps(address wallet) view returns (uint8)',
        'function completedSteps(address wallet) view returns (uint8)',
        'function getStepStatus(address wallet, uint8 step) view returns (uint8)'
    ];

    // Message to show for Submitted (yellow) steps
    const SUBMITTED_MESSAGE = 'Your submission has been received. Be sure you\'ve submitted your Google Form as well! It may take up to three weeks for your submission to be graded, please be patient. Also note that your submissions will not necessarily be graded in order.';

    // If the page has no connect button, bail out (nothing to wire up)
    if (!connectBtn) return;

    // Basic provider existence check
    const hasMetaMask = typeof window.ethereum !== 'undefined';

    // Render a tiny 2-character avatar seed from the wallet address (e.g., '0xAB...')
    function shortAddr(addr) {
        if (!addr) return '';
        const two = addr.startsWith('0x') ? addr.slice(2, 4) : addr.slice(0, 2);
        return two.toUpperCase();
    }

    // Mask address for display: keep first 10 characters, replace the rest with '...'
    function maskAddress(addr) {
        if (!addr) return '';
        return addr.length <= 10 ? addr : addr.slice(0, 10) + '...';
    }

    // Ensure a small numeric badge element exists near the avatar to show current step
    function ensureStepBadge() {
        let badge = document.getElementById('walletStepBadge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'walletStepBadge';
            badge.className = 'wallet-step-badge';
            badge.textContent = '';
            if (avatarBtn && avatarBtn.parentNode) {
                avatarBtn.parentNode.insertBefore(badge, avatarBtn);
            }
        }
        return badge;
    }

    // Clear the current-step badge content and tooltip
    function clearBadge() {
        const badge = ensureStepBadge();
        badge.textContent = '';
        badge.title = '';
    }

    // Update progress bar width and textual summary from a completed steps count
    function setProgress(completedCount) {
        const completed = Math.max(0, Math.min(TOTAL_STEPS, Number(completedCount || 0)));
        const pct = Math.round((completed / TOTAL_STEPS) * 100);
        if (progressBar) {
            progressBar.style.width = pct + '%';
            progressBar.setAttribute('aria-valuenow', String(pct));
        }
        if (progressText) {
            progressText.textContent = `${completed} of ${TOTAL_STEPS} assignments complete.`;
        }
    }

    // Highlight completed and active steps in the stepper
    // - completedCount is a number of steps fully done
    // - currentStepNum is a 1-based index from the contract (or bigint); convert to 0-based for DOM
    function highlightSteps(completedCount, currentStepNum) {
        const completed = Number(completedCount || 0);
        const currentIdx = typeof currentStepNum === 'number' ? currentStepNum - 1 : (typeof currentStepNum === 'bigint' ? Number(currentStepNum) - 1 : -1);
        stepItems.forEach((li) => {
            li.classList.remove('completed', 'active');
            const idxAttr = li.getAttribute('data-step-index');
            const idx = idxAttr ? Number(idxAttr) : -1;
            if (idx < completed) li.classList.add('completed');
            if (idx === currentIdx) li.classList.add('active');
        });
    }

    // Reset progress visuals to a neutral state (before connection or when disconnected)
    function resetProgressUI() {
        setProgress(0);
        highlightSteps(0, -1);
        clearBadge();
        // Force all circles to Pending (status-0) to avoid any theme default colors
        stepItems.forEach((li) => {
            const circle = li.querySelector('.circle');
            if (!circle) return;
            circle.classList.remove('status-0', 'status-1', 'status-2');
            circle.classList.add('status-0');
        });
        // Remove any submit buttons
        document.querySelectorAll('.submit-step-btn').forEach(btn => btn.remove());
        // Remove any submitted-note messages when not logged in
        document.querySelectorAll('.submitted-note').forEach(note => note.remove());
        // Remove any approval sub-items
        document.querySelectorAll('.approval-subitem').forEach(el => el.remove());
        // Hide progress UI when not connected or off sepolia
        progressHeader && progressHeader.classList.add('d-none');
        progressContainer && progressContainer.classList.add('d-none');
        progressText && progressText.classList.add('d-none');
        progressLoginAlert && progressLoginAlert.classList.remove('d-none');
    }

    // Load config.json for contract addresses keyed by chainId.
    async function loadConfig() {
        try {
            const res = await fetch('config.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error('Failed to fetch config.json');
            return await res.json();
        } catch (e) {
            console.warn('config.json not found or invalid, using fallbacks:', e);
            return null;
        }
    }

    // Load contract ABI/address. Prefer config.json by chainId, else contractABI.json, else fallbacks.
    async function loadContractInfo(chainId) {
        // 1) Try config.json
        const config = await loadConfig();
        if (config && config.contracts) {
            const byId = config.contracts[String(chainId)];
            const cfgAddr = byId && (byId.gradebook || byId.address);
            if (cfgAddr) {
                // Try to get ABI from contractABI.json, else use fallback ABI
                try {
                    const res = await fetch('contractABI.json', { cache: 'no-cache' });
                    if (res.ok) {
                        const data = await res.json();
                        const abi = (data && data.abi) || FALLBACK_CONTRACT_ABI;
                        return { address: cfgAddr, abi };
                    }
                } catch (e) {
                    // ignore, will fallback
                }
                return { address: cfgAddr, abi: FALLBACK_CONTRACT_ABI };
            }
        }
        // 2) Fallback to contractABI.json if it includes an address
        try {
            const res = await fetch('contractABI.json', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                const address = (data && (data.address || data.contractAddress)) || FALLBACK_CONTRACT_ADDRESS;
                const abi = (data && data.abi) || FALLBACK_CONTRACT_ABI;
                return { address, abi };
            }
        } catch (e) {
            // ignore, will fallback
        }
        // 3) Absolute fallback
        return { address: FALLBACK_CONTRACT_ADDRESS, abi: FALLBACK_CONTRACT_ABI };
    }

    // Query the contract for the current step and count of completed steps.
    // Supports multiple method names for compatibility (getCurrentStep/currentStep, getCompletedSteps/completedSteps).
    // Returns numeric values and the constructed contract instance.
    async function fetchSteps(provider, account, address, abi) {
        const contract = new ethers.Contract(address, abi, provider);
        let current, completed;
        try {
            current = await contract.getCurrentStep(account);
        } catch (_) {
            try { current = await contract.currentStep(account); } catch { current = 0; }
        }
        try {
            completed = await contract.getCompletedSteps(account);
        } catch (_) {
            try { completed = await contract.completedSteps(account); } catch { completed = 0; }
        }
        // Normalize to numbers from potential bigint
        const currentNum = typeof current === 'bigint' ? Number(current) : Number(current || 0);
        const completedNum = typeof completed === 'bigint' ? Number(completed) : Number(completed || 0);
        // If completed not provided by contract, infer from current (previous steps complete)
        const inferredCompleted = completedNum || Math.max(0, currentNum - 1);
        return { currentStep: currentNum, completed: inferredCompleted, contract };
    }

    // Apply a status class (traffic-light: 0 gray, 1 yellow, 2 green) to a specific step circle
    function applyStatusToStep(indexZeroBased, status) {
        const li = stepItems.find(el => Number(el.getAttribute('data-step-index')) === indexZeroBased);
        if (!li) return;
        const circle = li.querySelector('.circle');
        if (!circle) return;
        circle.classList.remove('status-0', 'status-1', 'status-2');
        const s = Math.max(0, Math.min(2, Number(status || 0)));
        circle.classList.add(`status-${s}`);

        // Show submitted guidance in the step content only for yellow (status-1)
        const content = li.querySelector('.step-content');
        if (content) {
            const note = content.querySelector('.submitted-note');
            if (s === 1) {
                if (!note) {
                    const p = document.createElement('p');
                    p.className = 'submitted-note';
                    p.textContent = SUBMITTED_MESSAGE;
                    content.appendChild(p);
                } else {
                    note.textContent = SUBMITTED_MESSAGE;
                }
            } else if (note) {
                note.remove();
            }
        }
    }

    // Helper: keep the GitHub icon while updating button text
    function setSubmitBtnLabel(btnEl, label) {
        if (!btnEl) return;
        const icon = btnEl.querySelector('i');
        // Rebuild content: icon + text node
        btnEl.textContent = '';
        if (icon) btnEl.appendChild(icon);
        btnEl.appendChild(document.createTextNode(label));
    }

    // Create or remove the Submit button for the current step based on statuses
    function updateSubmitButton(provider, contract, account, currentStep, statuses) {
        // Remove existing buttons and action subitems to keep only one visible at a time
        document.querySelectorAll('.submit-step-btn').forEach(btn => btn.remove());
        document.querySelectorAll('.action-subitem').forEach(el => el.remove());
        const stepNum = Number(currentStep || 0);
        if (!(stepNum >= 1 && stepNum <= TOTAL_STEPS)) return;
        const idx = stepNum - 1;
        const currStatus = Number(statuses?.[idx]);
        const prevStatus = idx > 0 ? Number(statuses?.[idx - 1]) : undefined;
        const prevApproved = stepNum === 1 ? true : prevStatus === 2;
        const shouldShow = prevApproved && currStatus === 0; // current pending, previous approved
        if (!shouldShow) return;
        const li = stepItems.find(el => Number(el.getAttribute('data-step-index')) === idx);
        if (!li) return;
        const content = li.querySelector('.step-content');
        if (!content) return;
        const wrap = document.createElement('div');
        wrap.className = 'action-subitem mt-2';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-github submit-step-btn';
        btn.title = `Submit step ${stepNum}`;
        // Add GitHub icon + label
        const icon = document.createElement('i');
        icon.className = 'fab fa-github mr-1';
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode('submit50'));
        btn.addEventListener('click', async () => {
            await submitCurrentStep(provider, contract, stepNum, account, btn);
        });
        wrap.appendChild(btn);
        content.appendChild(wrap);
    }

    // Call the contract method submitStepN() with a signer; refresh UI on success
    async function submitCurrentStep(provider, contract, stepNum, account, btnEl) {
        try {
            // Ensure on Sepolia
            const net = await provider.getNetwork();
            if (!net || net.chainId !== SEPOLIA_CHAIN_ID) {
                const switched = await maybeSwitchToSepolia();
                if (!switched) return;
            }
            const signer = await provider.getSigner();
            const writable = contract.connect(signer);
            const method = `submitStep${stepNum}`;
            if (typeof writable[method] !== 'function') {
                alert('Submit not supported by contract.');
                return;
            }
            if (btnEl) { btnEl.disabled = true; setSubmitBtnLabel(btnEl, 'Submitting...'); }
            const tx = await writable[method]();
            await tx.wait();
            if (btnEl) { setSubmitBtnLabel(btnEl, 'Submitted'); }
            // Refresh session to reflect new statuses
            await refreshSession(new ethers.BrowserProvider(window.ethereum), account);
        } catch (e) {
            console.error('Submit failed:', e);
            if (btnEl) { btnEl.disabled = false; setSubmitBtnLabel(btnEl, 'submit50'); }
            alert('Transaction failed or was rejected.');
        }
    }

    // Populate per-step status by calling contract.getStepStatus(wallet, step)
    // If not available, fallback to: completed => 2 (green), current => 1 (yellow), others => 0 (gray)
    async function updateStepStatuses(contract, account, fallbackFrom) {
        // Try using contract.getStepStatus for steps 1..TOTAL_STEPS
        let statuses = [];
        let usedOnChain = true;
        try {
            const queries = Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const stepNum = i + 1; // contract is 1-indexed
                return contract.getStepStatus(account, stepNum).then(v => (typeof v === 'bigint' ? Number(v) : Number(v))).catch(() => undefined);
            });
            statuses = await Promise.all(queries);
            // If all undefined, treat as missing support
            if (statuses.every(v => v === undefined)) usedOnChain = false;
        } catch (_) {
            usedOnChain = false;
        }
        if (!usedOnChain) {
            // Fallback: 2 for completed, 1 for current step, 0 otherwise
            statuses = Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const stepNum = i + 1;
                if (fallbackFrom && stepNum <= Number(fallbackFrom.completed)) return 2;
                if (fallbackFrom && stepNum === Number(fallbackFrom.currentStep)) return 1;
                return 0;
            });
        }
        statuses.forEach((st, i) => applyStatusToStep(i, st));
        // Also update the Submit button visibility for the current step
        updateSubmitButton(new ethers.BrowserProvider(window.ethereum), contract, account, fallbackFrom?.currentStep, statuses);
        return statuses;
    }

    // Build an Etherscan tx URL by chain
    function etherscanTxUrl(chainId, txHash) {
        const id = typeof chainId === 'bigint' ? Number(chainId) : Number(chainId);
        if (id === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
        // Fallback: mainnet pattern (not used here)
        return `https://etherscan.io/tx/${txHash}`;
    }

    // Fetch approval transactions for this account by scanning Etherscan txlist of the contract
    async function fetchApprovalTxMap(contractAddress, account, chainId, abi) {
        try {
            const cfg = await loadConfig();
            const apiKey = cfg?.etherscanApiKey || cfg?.apiKeys?.etherscan || '';
            const id = typeof chainId === 'bigint' ? Number(chainId) : Number(chainId);
            if (id !== 11155111) return {}; // Only implement for Sepolia
            const apiBase = 'https://api-sepolia.etherscan.io/api';
            const url = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&sort=asc${apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : ''}`;
            const res = await fetch(url, { cache: 'no-cache' });
            const json = await res.json();
            if (!json || json.status === '0' || !Array.isArray(json.result)) return {};
            const txs = json.result;
            const iface = new ethers.Interface(abi);
            const acct = (account || '').toLowerCase();
            const caddr = (contractAddress || '').toLowerCase();
            const map = {}; // stepNum -> txHash (latest wins due to asc order overwrite)
            for (const tx of txs) {
                if (!tx || (tx.to || '').toLowerCase() !== caddr) continue;
                const data = tx.input;
                if (!data || data === '0x') continue;
                try {
                    const parsed = iface.parseTransaction({ data });
                    const name = parsed?.name || parsed?.fragment?.name;
                    if (!name || !name.startsWith('approveStep')) continue;
                    const stepNum = Number(name.replace('approveStep', ''));
                    const arg0 = (parsed.args?.[0] || '').toString().toLowerCase();
                    if (arg0 === acct && stepNum >= 1 && stepNum <= TOTAL_STEPS) {
                        map[stepNum] = tx.hash;
                    }
                } catch (_) {
                    // ignore undecodable tx
                }
            }
            return map;
        } catch (e) {
            console.warn('Failed to fetch approval txs from Etherscan:', e);
            return {};
        }
    }

    function applyApprovalSubItem(stepIndexZeroBased, txHash, chainId) {
        const li = stepItems.find(el => Number(el.getAttribute('data-step-index')) === stepIndexZeroBased);
        if (!li) return;
        const content = li.querySelector('.step-content');
        if (!content) return;
        // Remove any existing subitem first
        const existing = content.querySelector('.approval-subitem');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.className = 'approval-subitem mt-1';
        const icon = document.createElement('i');
        icon.className = 'fas fa-check-circle text-success mr-1';
        wrap.appendChild(icon);
        const label = document.createElement('span');
        label.textContent = 'Approved';
        wrap.appendChild(label);
        if (txHash) {
            const space = document.createTextNode(' · ');
            wrap.appendChild(space);
            const a = document.createElement('a');
            a.href = etherscanTxUrl(chainId, txHash);
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'View tx';
            wrap.appendChild(a);
        }
        content.appendChild(wrap);
    }

    async function updateApprovalSubItemsForStatuses(contractAddress, account, chainId, abi, statuses) {
        // Clear existing
        document.querySelectorAll('.approval-subitem').forEach(el => el.remove());
        if (!Array.isArray(statuses)) return;
        const anyApproved = statuses.some(s => Number(s) === 2);
        if (!anyApproved) return;
        const txMap = await fetchApprovalTxMap(contractAddress, account, chainId, abi);
        statuses.forEach((st, i) => {
            if (Number(st) === 2) {
                const txHash = txMap[i + 1];
                applyApprovalSubItem(i, txHash, chainId);
            }
        });
    }

    // Attempt to switch the connected wallet to Sepolia.
    // Returns true if already on Sepolia or successfully switched/added, otherwise false.
    async function maybeSwitchToSepolia() {
        try {
            const eth = window.ethereum;
            if (!eth || !eth.request) return false;
            const provider = new ethers.BrowserProvider(eth);
            const net = await provider.getNetwork();
            if (net.chainId === SEPOLIA_CHAIN_ID) return true;
            const ok = confirm('Not on Sepolia. Switch network to Sepolia?');
            if (!ok) return false;
            try {
                await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_HEX }] });
                return true;
            } catch (err) {
                // If Sepolia is unknown to the wallet, try adding it
                if (err && (err.code === 4902 || err.code === -32603)) {
                    try {
                        await eth.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: SEPOLIA_CHAIN_HEX,
                                chainName: 'Sepolia',
                                nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                                rpcUrls: ['https://rpc.sepolia.org', 'https://1rpc.io/sepolia'],
                                blockExplorerUrls: ['https://sepolia.etherscan.io']
                            }]
                        });
                        return true;
                    } catch (addErr) {
                        console.warn('Failed to add Sepolia network', addErr);
                    }
                }
                console.warn('Failed to switch network', err);
                return false;
            }
        } catch (e) {
            console.warn('maybeSwitchToSepolia error', e);
            return false;
        }
    }

    // After a connection or environment change, refresh session UI:
    // - Show chain name/id, balance, full address, short avatar seed
    // - Update page title with the address
    // - On Sepolia, fetch contract data and update progress & statuses; otherwise, reset and prompt in badge tooltip
    async function refreshSession(provider, account) {
        try {
            const net = await provider.getNetwork();
            chainEl.textContent = net ? `${net.name || 'Unknown'} (${net.chainId})` : 'Unknown';
            const bal = await provider.getBalance(account);
            balanceEl.textContent = `${ethers.formatEther(bal)} ETH`;
            // Store full address for copy; display masked address for anonymity
            addressEl.dataset.fullAddress = account;
            addressEl.textContent = maskAddress(account);
            avatarBtn.textContent = shortAddr(account);
            if (gradebookTitle) gradebookTitle.textContent = `Gradebook for ${maskAddress(account)}`;
            connectBtn.classList.add('d-none');
            sessionBox.classList.remove('d-none');

            const badge = ensureStepBadge();

            if (net && net.chainId === SEPOLIA_CHAIN_ID) {
                const { address, abi } = await loadContractInfo(net.chainId);
                try {
                    const { currentStep, completed, contract } = await fetchSteps(provider, account, address, abi);
                    badge.textContent = String(currentStep);
                    badge.title = `Current step for ${maskAddress(account)}`;
                    // Show progress UI when connected and on Sepolia
                    progressHeader && progressHeader.classList.remove('d-none');
                    progressContainer && progressContainer.classList.remove('d-none');
                    progressText && progressText.classList.remove('d-none');
                    progressLoginAlert && progressLoginAlert.classList.add('d-none');
                    setProgress(completed);
                    highlightSteps(completed, currentStep);
                    const statuses = await updateStepStatuses(contract, account, { currentStep, completed });
                    await updateApprovalSubItemsForStatuses(address, account, net.chainId, abi, statuses);
                } catch (err) {
                    console.error('Failed to fetch steps:', err);
                    clearBadge();
                    resetProgressUI();
                }
            } else {
                // Not on Sepolia: clear badge and show hint, reset local UI
                badge.textContent = '';
                badge.title = 'Switch to Sepolia to load current step';
                resetProgressUI();
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Prompt user to connect with MetaMask. If not on Sepolia, offer to switch/add it.
    // On success, refresh the session and remember the account for this tab via sessionStorage.
    async function connect() {
        if (!hasMetaMask) {
            alert('MetaMask not found. Please install MetaMask.');
            window.open('https://metamask.io/download/', '_blank');
            return;
        }
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send('eth_requestAccounts', []);
            const account = accounts[0];

            const net = await provider.getNetwork();
            if (!net || net.chainId !== SEPOLIA_CHAIN_ID) {
                await maybeSwitchToSepolia();
            }

            await refreshSession(new ethers.BrowserProvider(window.ethereum), account);
            sessionStorage.setItem('connectedAccount', account);
        } catch (e) {
            console.error('Failed to connect:', e);
        }
    }

    // If the user already authorized the site, pick the first account and refresh the session silently
    async function tryAutoConnect() {
        if (!hasMetaMask) return;
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.listAccounts();
            if (accounts && accounts[0]) {
                await refreshSession(provider, accounts[0].address || accounts[0]);
            }
        } catch { }
    }

    // Helper to open/close the wallet details menu and sync aria-expanded
    function toggleMenu(force) {
        const isOpen = typeof force === 'boolean' ? force : menu.hidden;
        menu.hidden = !isOpen;
        avatarBtn.setAttribute('aria-expanded', String(isOpen));
    }

    // Wire up UI events
    connectBtn.addEventListener('click', connect);
    avatarBtn && avatarBtn.addEventListener('click', () => toggleMenu());
    document.addEventListener('click', (e) => {
        if (!menu || menu.hidden) return;
        if (e.target === avatarBtn || avatarBtn.contains(e.target)) return;
        if (menu.contains(e.target)) return;
        toggleMenu(false);
    });

    // Copy full address to clipboard with a small confirmation affordance on the button
    copyBtn && copyBtn.addEventListener('click', async () => {
        const addr = addressEl.dataset.fullAddress || addressEl.textContent;
        try {
            await navigator.clipboard.writeText(addr);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        } catch { }
    });

    // Simulate a "disconnect" UI locally (MetaMask itself does not provide a true disconnect API)
    disconnectBtn && disconnectBtn.addEventListener('click', () => {
        sessionStorage.removeItem('connectedAccount');
        sessionBox.classList.add('d-none');
        connectBtn.classList.remove('d-none');
        if (gradebookTitle) gradebookTitle.textContent = initialGradebookText;
        resetProgressUI();
        toggleMenu(false);
    });

    // React to wallet events to keep UI in sync when the user switches accounts or networks externally
    if (hasMetaMask) {
        const eth = window.ethereum;
        // Account changed: if none, show connect button; else refresh session for the new account
        eth.on && eth.on('accountsChanged', async (accs) => {
            if (!accs || !accs.length) {
                sessionBox.classList.add('d-none');
                connectBtn.classList.remove('d-none');
                if (gradebookTitle) gradebookTitle.textContent = initialGradebookText;
                resetProgressUI();
                return;
            }
            const provider = new ethers.BrowserProvider(eth);
            await refreshSession(provider, accs[0]);
        });
        // Chain changed: re-pull current account and refresh (covers switching to/from Sepolia)
        eth.on && eth.on('chainChanged', async () => {
            const provider = new ethers.BrowserProvider(eth);
            const accounts = await provider.listAccounts();
            const account = accounts[0]?.address || accounts[0];
            if (account) await refreshSession(provider, account);
        });
    }

    // Initialize default Pending visuals to avoid theme/hover colors before any connection
    resetProgressUI();

    // Attempt an automatic session restore on page load
    tryAutoConnect();
})();
