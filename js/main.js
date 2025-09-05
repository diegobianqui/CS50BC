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

    if (!connectBtn) return;

    const hasMetaMask = typeof window.ethereum !== 'undefined';

    function shortAddr(addr) {
        return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';
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
            await refreshSession(provider, account);
            // Persist simple session
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

    // Toggle menu
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

    tryAutoConnect();
})();
