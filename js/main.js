document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Mobile nav toggle
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
    const TOTAL_STEPS = 10;
    const SEPOLIA_CHAIN_ID = 11155111n;
    const SEPOLIA_CHAIN_HEX = '0xaa36a7';

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

    // Step items
    const stepItems = Array.from(document.querySelectorAll('.stepper [data-step-index]'));

    // Contract details (Sepolia)
    const FALLBACK_CONTRACT_ADDRESS = '0xdd63024953ad565748493F6B48a54E4886809667';
    const FALLBACK_CONTRACT_ABI = [
        'function getCurrentStep(address wallet) view returns (uint8)',
        'function currentStep(address wallet) view returns (uint8)',
        'function getCompletedSteps(address wallet) view returns (uint8)',
        'function completedSteps(address wallet) view returns (uint8)',
        'function getStepStatus(address wallet, uint8 step) view returns (uint8)'
    ];

    if (!connectBtn) return;

    const hasMetaMask = typeof window.ethereum !== 'undefined';

    function shortAddr(addr) {
        if (!addr) return '';
        const two = addr.startsWith('0x') ? addr.slice(2, 4) : addr.slice(0, 2);
        return two.toUpperCase();
    }

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

    function clearBadge() {
        const badge = ensureStepBadge();
        badge.textContent = '';
        badge.title = '';
    }

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

    function resetProgressUI() {
        setProgress(0);
        highlightSteps(0, -1);
        clearBadge();
        // Set all circles to Pending (status-0) by default
        stepItems.forEach((li) => {
            const circle = li.querySelector('.circle');
            if (!circle) return;
            circle.classList.remove('status-0', 'status-1', 'status-2');
            circle.classList.add('status-0');
        });
    }

    async function loadABI() {
        try {
            const res = await fetch('contractABI.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error('Failed to fetch ABI JSON');
            const data = await res.json();
            const address = (data && (data.address || data.contractAddress)) || FALLBACK_CONTRACT_ADDRESS;
            const abi = (data && data.abi) || FALLBACK_CONTRACT_ABI;
            return { address, abi };
        } catch (e) {
            console.warn('Using fallback ABI due to error loading contractABI.json:', e);
            return { address: FALLBACK_CONTRACT_ADDRESS, abi: FALLBACK_CONTRACT_ABI };
        }
    }

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
        // Normalize to numbers
        const currentNum = typeof current === 'bigint' ? Number(current) : Number(current || 0);
        const completedNum = typeof completed === 'bigint' ? Number(completed) : Number(completed || 0);
        // If completed not available, infer from current
        const inferredCompleted = completedNum || Math.max(0, currentNum - 1);
        return { currentStep: currentNum, completed: inferredCompleted, contract };
    }

    function applyStatusToStep(indexZeroBased, status) {
        const li = stepItems.find(el => Number(el.getAttribute('data-step-index')) === indexZeroBased);
        if (!li) return;
        const circle = li.querySelector('.circle');
        if (!circle) return;
        circle.classList.remove('status-0', 'status-1', 'status-2');
        const s = Math.max(0, Math.min(2, Number(status || 0)));
        circle.classList.add(`status-${s}`);
    }

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
    }

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

    async function refreshSession(provider, account) {
        try {
            const net = await provider.getNetwork();
            chainEl.textContent = net ? `${net.name || 'Unknown'} (${net.chainId})` : 'Unknown';
            const bal = await provider.getBalance(account);
            balanceEl.textContent = `${ethers.formatEther(bal)} ETH`;
            addressEl.textContent = account;
            avatarBtn.textContent = shortAddr(account);
            if (gradebookTitle) gradebookTitle.textContent = `Gradebook for ${account}`;
            connectBtn.classList.add('d-none');
            sessionBox.classList.remove('d-none');

            const badge = ensureStepBadge();

            if (net && net.chainId === SEPOLIA_CHAIN_ID) {
                const { address, abi } = await loadABI();
                try {
                    const { currentStep, completed, contract } = await fetchSteps(provider, account, address, abi);
                    badge.textContent = String(currentStep);
                    badge.title = `Current step for ${account}`;
                    setProgress(completed);
                    highlightSteps(completed, currentStep);
                    await updateStepStatuses(contract, account, { currentStep, completed });
                } catch (err) {
                    console.error('Failed to fetch steps:', err);
                    clearBadge();
                    resetProgressUI();
                }
            } else {
                badge.textContent = '';
                badge.title = 'Switch to Sepolia to load current step';
                resetProgressUI();
            }
        } catch (e) {
            console.error(e);
        }
    }

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

    function toggleMenu(force) {
        const isOpen = typeof force === 'boolean' ? force : menu.hidden;
        menu.hidden = !isOpen;
        avatarBtn.setAttribute('aria-expanded', String(isOpen));
    }

    // Events
    connectBtn.addEventListener('click', connect);
    avatarBtn && avatarBtn.addEventListener('click', () => toggleMenu());
    document.addEventListener('click', (e) => {
        if (!menu || menu.hidden) return;
        if (e.target === avatarBtn || avatarBtn.contains(e.target)) return;
        if (menu.contains(e.target)) return;
        toggleMenu(false);
    });

    copyBtn && copyBtn.addEventListener('click', async () => {
        const addr = addressEl.textContent;
        try {
            await navigator.clipboard.writeText(addr);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        } catch { }
    });

    disconnectBtn && disconnectBtn.addEventListener('click', () => {
        sessionStorage.removeItem('connectedAccount');
        sessionBox.classList.add('d-none');
        connectBtn.classList.remove('d-none');
        if (gradebookTitle) gradebookTitle.textContent = initialGradebookText;
        resetProgressUI();
        toggleMenu(false);
    });

    // Chain/account changes
    if (hasMetaMask) {
        const eth = window.ethereum;
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
        eth.on && eth.on('chainChanged', async () => {
            const provider = new ethers.BrowserProvider(eth);
            const accounts = await provider.listAccounts();
            const account = accounts[0]?.address || accounts[0];
            if (account) await refreshSession(provider, account);
        });
    }

    // Initialize default Pending status to avoid blue before connection
    resetProgressUI();

    tryAutoConnect();
})();
