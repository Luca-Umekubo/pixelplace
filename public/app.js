// Firebase initialization
const firebaseConfig = {
    apiKey: "AIzaSyAA7760MtOIQ4ulFwJyoToa3X1nvYxo8Aw",
    authDomain: "pixelplaceeth.firebaseapp.com",
    projectId: "pixelplaceeth",
    storageBucket: "pixelplaceeth.firebasestorage.app",
    messagingSenderId: "757687507121",
    appId: "1:757687507121:web:1313f3d96da4d2a7dcaa90",
    measurementId: "G-T1SK2VJ19G"
  };

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Add this at the top of your app.js file after the ethers library is loaded
console.log("Ethers version:", ethers.version);

// Contract configuration
const contractAddress = "0xaC2F161898a9541292C9D35e0aeB496709131248"; // Fill after deployment
const CANVAS_WIDTH = 100;
const CANVAS_HEIGHT = 100;
const MAX_PIXELS_PER_TRANSACTION = 25;
let contractABI;

// App state
let provider;
let signer;
let contract;
let walletConnected = false;
let selectedColor = 0;
let selectedPixels = [];
let canvasData = Array(CANVAS_WIDTH * CANVAS_HEIGHT).fill(0);
let cooldownEndTime = 0;
let cooldownInterval;

// UI elements
const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');
const colorPalette = document.getElementById('color-palette');
const connectWalletBtn = document.getElementById('connect-wallet');
const submitPixelsBtn = document.getElementById('submit-pixels');
const clearSelectionBtn = document.getElementById('clear-selection');
const statusDiv = document.getElementById('status');
const walletStatusDiv = document.getElementById('wallet-status');
const selectedPixelsDiv = document.getElementById('selected-pixels');
const cooldownTimerDiv = document.getElementById('cooldown-timer');

// Color palette - 16 colors
const colors = [
    '#FFFFFF', // White
    '#000000', // Black
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    '#FFFF00', // Yellow
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFA500', // Orange
    '#800080', // Purple
    '#008000', // Dark Green
    '#A52A2A', // Brown
    '#808080', // Gray
    '#FFC0CB', // Pink
    '#FFD700', // Gold
    '#87CEEB'  // Sky Blue
];

// Initialize app
async function init() {
    try {
        // Load ABI
        const response = await fetch('./contract/abi.json');
        contractABI = await response.json();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize canvas
        initCanvas();
        
        // Initialize color palette
        initColorPalette();
        
        // Try to connect to previously connected wallet
        if (window.ethereum && window.ethereum.selectedAddress) {
            connectWallet();
        }
        
        // Subscribe to canvas updates in Firestore
        subscribeToCanvasUpdates();
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('Failed to initialize the application', 'error');
    }
}

// Set up event listeners
function setupEventListeners() {
    connectWalletBtn.addEventListener('click', connectWallet);
    submitPixelsBtn.addEventListener('click', submitPixelsToBlockchain);
    clearSelectionBtn.addEventListener('click', clearSelection);
    canvas.addEventListener('click', handleCanvasClick);
}

// Initialize canvas
function initCanvas() {
    // Calculate pixel size based on canvas dimensions
    const pixelSize = Math.floor(canvas.width / CANVAS_WIDTH);
    
    // Draw empty canvas
    drawCanvas();
    
    // Adjust canvas container to match
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.style.width = `${canvas.width}px`;
    canvasContainer.style.height = `${canvas.height}px`;
}

// Initialize color palette
function initColorPalette() {
    colors.forEach((color, index) => {
        const colorElement = document.createElement('div');
        colorElement.className = 'color-option';
        colorElement.style.backgroundColor = color;
        colorElement.dataset.colorIndex = index;
        
        if (index === selectedColor) {
            colorElement.classList.add('selected');
        }
        
        colorElement.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(el => {
                el.classList.remove('selected');
            });
            colorElement.classList.add('selected');
            selectedColor = index;
        });
        
        colorPalette.appendChild(colorElement);
    });
}

// Connect wallet
async function connectWallet() {
    try {
        console.log("Connecting wallet...");
        if (!window.ethereum) {
            console.error("No wallet provider found");
            updateStatus('MetaMask or other Web3 wallet not detected', 'error');
            return;
        }
        
        console.log("Requesting accounts...");
        // Request accounts access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        console.log("Setting up provider...");
        // Check if we're using ethers v5 or v6
        if (ethers.version && ethers.version.startsWith('6.')) {
            // Ethers v6 approach
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
        } else {
            // Ethers v5 approach
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
        }
        
        const userAddress = await signer.getAddress();
        console.log("Connected address:", userAddress);
        
        // Check network - works with both v5 and v6
        const network = await provider.getNetwork();
        console.log("Connected to network:", network);
        
        // Different chainId property location in v5 vs v6
        const chainId = network.chainId ? network.chainId : network.id;
        if (chainId !== 11155111n && chainId !== 11155111) { // Support both BigInt and Number
            console.error("Wrong network");
            
            // Try to switch network
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0xaa36a7' }], // 0xaa36a7 is hex for 11155111 (Sepolia)
                });
                // Reload the page after network switch
                window.location.reload();
                return;
            } catch (switchError) {
                console.error("Failed to switch network:", switchError);
                updateStatus('Please switch to Sepolia testnet in your wallet', 'error');
                walletStatusDiv.textContent = 'Connected to wrong network';
                walletStatusDiv.className = 'error';
                return;
            }
        }
        
        // Initialize contract
        console.log("Contract address:", contractAddress);
        console.log("Contract ABI:", contractABI);
        
        if (ethers.version && ethers.version.startsWith('6.')) {
            // Ethers v6
            contract = new ethers.Contract(contractAddress, contractABI, signer);
        } else {
            // Ethers v5
            contract = new ethers.Contract(contractAddress, contractABI, signer);
        }
        
        // Update UI
        walletConnected = true;
        walletStatusDiv.textContent = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
        walletStatusDiv.className = 'success';
        connectWalletBtn.textContent = 'Wallet Connected';
        
        // Check if user can place pixels
        await checkCooldown();
        
        // Update canvas from blockchain
        await fetchCanvasFromBlockchain();
        
        updateStatus('Wallet connected successfully', 'success');
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
    } catch (error) {
        console.error('Connection error:', error);
        updateStatus('Failed to connect wallet: ' + error.message, 'error');
    }
}

// Handle accounts changed in MetaMask
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // User disconnected their wallet
        walletConnected = false;
        walletStatusDiv.textContent = 'Not connected';
        walletStatusDiv.className = 'info';
        connectWalletBtn.textContent = 'Connect Wallet';
        updateStatus('Wallet disconnected', 'info');
    } else {
        // Account changed, reload page for simplicity
        window.location.reload();
    }
}

// Update status message
function updateStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
}

// Handle canvas click
function handleCanvasClick(event) {
    if (!walletConnected) {
        updateStatus('Please connect your wallet first', 'info');
        return;
    }
    
    if (cooldownEndTime > Date.now()) {
        updateStatus('You must wait for the cooldown period to end', 'info');
        return;
    }
    
    // Calculate pixel coordinates
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / (canvas.width / CANVAS_WIDTH));
    const y = Math.floor((event.clientY - rect.top) / (canvas.height / CANVAS_HEIGHT));
    
    // Check if within bounds
    if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
        return;
    }
    
    // Check if this pixel is already selected
    const pixelIndex = y * CANVAS_WIDTH + x;
    const selectedIndex = selectedPixels.findIndex(p => p.x === x && p.y === y);
    
    if (selectedIndex !== -1) {
        // If already selected, update color
        selectedPixels[selectedIndex].color = selectedColor;
    } else {
        // If we already have max pixels selected, alert user
        if (selectedPixels.length >= MAX_PIXELS_PER_TRANSACTION) {
            updateStatus(`Maximum ${MAX_PIXELS_PER_TRANSACTION} pixels can be selected`, 'error');
            return;
        }
        
        // Add to selected pixels
        selectedPixels.push({ x, y, color: selectedColor });
    }
    
    // Redraw canvas
    drawCanvas();
    
    // Update UI
    updateSelectedPixelsCount();
    
    // Enable submit button if we have selections
    submitPixelsBtn.disabled = selectedPixels.length === 0;
    clearSelectionBtn.disabled = selectedPixels.length === 0;
}

// Update the selected pixels count display
function updateSelectedPixelsCount() {
    selectedPixelsDiv.textContent = `Selected: ${selectedPixels.length}/${MAX_PIXELS_PER_TRANSACTION} pixels`;
}

// Clear selection
function clearSelection() {
    selectedPixels = [];
    drawCanvas();
    updateSelectedPixelsCount();
    submitPixelsBtn.disabled = true;
    clearSelectionBtn.disabled = true;
}

// Draw canvas
function drawCanvas() {
    const pixelSize = Math.floor(canvas.width / CANVAS_WIDTH);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all pixels
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
        for (let x = 0; x < CANVAS_WIDTH; x++) {
            const index = y * CANVAS_WIDTH + x;
            const colorIndex = canvasData[index];
            
            ctx.fillStyle = colors[colorIndex];
            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
    }
    
    // Draw selected pixels with a highlight
    selectedPixels.forEach(pixel => {
        ctx.fillStyle = colors[pixel.color];
        ctx.fillRect(pixel.x * pixelSize, pixel.y * pixelSize, pixelSize, pixelSize);
        
        // Add a border to show it's selected
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(pixel.x * pixelSize, pixel.y * pixelSize, pixelSize, pixelSize);
    });
    
    // Draw grid (optional - can be removed for performance)
    ctx.strokeStyle = '#DDDDDD';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x <= CANVAS_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * pixelSize, 0);
        ctx.lineTo(x * pixelSize, CANVAS_HEIGHT * pixelSize);
        ctx.stroke();
    }
    
    for (let y = 0; y <= CANVAS_HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * pixelSize);
        ctx.lineTo(CANVAS_WIDTH * pixelSize, y * pixelSize);
        ctx.stroke();
    }
}

// Submit pixels to blockchain
async function submitPixelsToBlockchain() {
    if (!walletConnected || selectedPixels.length === 0) {
        return;
    }
    
    try {
        updateStatus('Submitting pixels to blockchain...', 'info');
        
        // Prepare transaction data
        const xCoords = selectedPixels.map(p => p.x);
        const yCoords = selectedPixels.map(p => p.y);
        const colors = selectedPixels.map(p => p.color);
        
        // Estimate gas
        const gasEstimate = await contract.estimateGas.set_pixels(xCoords, yCoords, colors);
        
        // Send transaction with 20% more gas than estimated
        const tx = await contract.set_pixels(xCoords, yCoords, colors, {
            gasLimit: Math.floor(gasEstimate.toNumber() * 1.2)
        });
        
        updateStatus('Transaction submitted! Waiting for confirmation...', 'info');
        
        // Wait for transaction to be mined
        const receipt = await tx.wait();
        
        updateStatus('Pixels updated successfully!', 'success');
        
        // Update local state
        selectedPixels.forEach(pixel => {
            const index = pixel.y * CANVAS_WIDTH + pixel.x;
            canvasData[index] = pixel.color;
        });
        
        // Clear selection
        clearSelection();
        
        // Update Firestore with new canvas data
        updateFirestoreCanvas();
        
        // Set cooldown
        await checkCooldown();
    } catch (error) {
        console.error('Transaction error:', error);
        updateStatus(`Transaction failed: ${error.message}`, 'error');
    }
}

// Check cooldown period
async function checkCooldown() {
    if (!walletConnected) return;
    
    try {
        const userAddress = await signer.getAddress();
        const canUpdate = await contract.can_update(userAddress);
        
        if (canUpdate) {
            cooldownEndTime = 0;
            cooldownTimerDiv.textContent = '';
            clearInterval(cooldownInterval);
        } else {
            const cooldownPeriod = await contract.get_cool_down_period();
            const lastUpdateTime = await contract.last_update_time(userAddress);
            cooldownEndTime = (lastUpdateTime.toNumber() + cooldownPeriod.toNumber()) * 1000; // Convert to ms
            
            // Start countdown
            updateCooldownTimer();
            cooldownInterval = setInterval(updateCooldownTimer, 1000);
        }
    } catch (error) {
        console.error('Cooldown check error:', error);
    }
}

// Update cooldown timer
function updateCooldownTimer() {
    const now = Date.now();
    if (cooldownEndTime > now) {
        const timeLeft = Math.ceil((cooldownEndTime - now) / 1000);
        cooldownTimerDiv.textContent = `Cooldown: ${timeLeft} seconds remaining`;
    } else {
        cooldownTimerDiv.textContent = '';
        clearInterval(cooldownInterval);
    }
}

// Fetch canvas data from blockchain
async function fetchCanvasFromBlockchain() {
    if (!walletConnected) return;
    
    try {
        updateStatus('Fetching canvas from blockchain...', 'info');
        
        // This is inefficient but works for demonstration purposes
        // In a production app, you'd want to use events or a more efficient batch fetch method
        for (let y = 0; y < CANVAS_HEIGHT; y++) {
            for (let x = 0; x < CANVAS_WIDTH; x++) {
                const color = await contract.get_pixel(x, y);
                const index = y * CANVAS_WIDTH + x;
                canvasData[index] = color;
            }
        }
        
        drawCanvas();
        updateStatus('Canvas loaded successfully', 'success');
        
        // Update Firestore with the latest data
        updateFirestoreCanvas();
    } catch (error) {
        console.error('Fetch canvas error:', error);
        updateStatus('Failed to fetch canvas from blockchain', 'error');
    }
}

// Update Firestore with canvas data
function updateFirestoreCanvas() {
    db.collection('canvas').doc('current').set({
        data: canvasData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch(error => {
        console.error('Firestore update error:', error);
    });
}

// Subscribe to canvas updates in Firestore
function subscribeToCanvasUpdates() {
    db.collection('canvas').doc('current').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data && data.data) {
                canvasData = data.data;
                drawCanvas();
            }
        }
    }, error => {
        console.error('Firestore subscription error:', error);
    });
}

// Initialize the app when page loads
window.addEventListener('DOMContentLoaded', init);