// Firebase initialization
const firebaseConfig = {
    // Fill in your Firebase config here
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

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
let db = null;

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
    '#FFFFFF', // White (index 0 for default)
    '#000000', // Black
    '#808080', // Grey
    '#D3D3D3', // Light Grey
    '#FF0000', // Red
    '#FFA500', // Orange
    '#8B4513', // Brown
    '#FFFF00', // Yellow
    '#90EE90', // Light Green
    '#008000', // Green
    '#ADD8E6', // Light Blue
    '#0000FF', // Blue
    '#00008B', // Dark Blue
    '#800080', // Purple
    '#FFC0CB', // Pink
    '#F5DEB3'  // Tan/Skin color
];

// Initialize Firebase with error handling
function initializeFirebase() {
    // Check if Firebase config has been properly set
    const isConfigValid = firebaseConfig && 
                         firebaseConfig.apiKey !== "YOUR_API_KEY" &&
                         firebaseConfig.projectId !== "YOUR_PROJECT_ID";
    
    if (!isConfigValid) {
        console.warn("Firebase configuration is missing or using placeholder values. Firestore functionality will be limited.");
        return false;
    }
    
    try {
        firebase.initializeApp(firebaseConfig);
        return true;
    } catch (error) {
        console.error("Firebase initialization error:", error);
        return false;
    }
}

// Store and load from localStorage as a fallback
function saveCanvasToLocalStorage() {
    try {
        localStorage.setItem('pixelCanvasData', JSON.stringify(canvasData));
        localStorage.setItem('pixelCanvasLastUpdated', Date.now());
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadCanvasFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('pixelCanvasData');
        if (savedData) {
            canvasData = JSON.parse(savedData);
            console.log('Loaded canvas data from localStorage');
            return true;
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
    }
    return false;
}

// Initialize app
async function init() {
    try {
        // Try to load canvas data from localStorage first
        loadCanvasFromLocalStorage();
        
        // Load ABI
        try {
            const response = await fetch('./contract/abi.json');
            contractABI = await response.json();
            console.log("ABI loaded successfully");
        } catch (error) {
            console.error("Error loading ABI:", error);
        }
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize canvas
        initCanvas();
        
        // Initialize color palette
        initColorPalette();
        
        // Initialize Firebase with error handling
        const firebaseInitialized = initializeFirebase();
        if (firebaseInitialized) {
            db = firebase.firestore();
            // Subscribe to canvas updates in Firestore
            subscribeToCanvasUpdates();
        }
        
        // Try to connect to previously connected wallet
        if (window.ethereum && window.ethereum.selectedAddress) {
            connectWallet();
        }
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
    
    // Add hover effects
    addCanvasHoverEffects();
    
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
        console.log("Ethers version or type:", typeof ethers, ethers.version);
        
        // Different approach based on how ethers is structured
        if (typeof ethers.BrowserProvider === 'function') {
            // Ethers v6 approach
            console.log("Using ethers v6 approach");
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
        } else if (ethers.providers && typeof ethers.providers.Web3Provider === 'function') {
            // Ethers v5 approach
            console.log("Using ethers v5 approach");
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
        } else {
            // Direct approach if structure is different
            console.log("Using direct ethers approach");
            provider = new ethers.JsonRpcProvider(window.ethereum);
            signer = provider.getSigner();
        }
        
        const userAddress = await signer.getAddress();
        console.log("Connected address:", userAddress);
        
        // Check network
        const network = await provider.getNetwork();
        console.log("Connected to network:", network);
        
        // Different chainId property location in v5 vs v6
        const chainId = network.chainId ? network.chainId : network.id;
        console.log("Chain ID:", chainId);
        
        if (chainId !== 11155111n && chainId !== 11155111) { // Support both BigInt and Number
            console.error("Wrong network");
            updateStatus('Please switch to Sepolia testnet in your wallet', 'error');
            walletStatusDiv.textContent = 'Connected to wrong network';
            walletStatusDiv.className = 'error';
            return;
        }
        
        // Initialize contract
        if (contractABI) {
            console.log("Initializing contract at address:", contractAddress);
            contract = new ethers.Contract(contractAddress, contractABI, signer);
        } else {
            console.error("Contract ABI not loaded");
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
        
        // Add a more visible border to show it's selected
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(pixel.x * pixelSize, pixel.y * pixelSize, pixelSize, pixelSize);
        
        // Add a second, inner highlight for better visibility
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(pixel.x * pixelSize + 2, pixel.y * pixelSize + 2, pixelSize - 4, pixelSize - 4);
    });
    
    // Draw grid - improved visibility for the larger canvas
    ctx.strokeStyle = '#E0E0E0';
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

// Add a separate function for hover effects to prevent artifacts
function addCanvasHoverEffects() {
    canvas.onmousemove = function(e) {
        // Redraw the canvas first to clear any previous hover effects
        drawCanvas();
        
        const rect = canvas.getBoundingClientRect();
        const pixelSize = Math.floor(canvas.width / CANVAS_WIDTH);
        const mouseX = Math.floor((e.clientX - rect.left) / (canvas.width / CANVAS_WIDTH));
        const mouseY = Math.floor((e.clientY - rect.top) / (canvas.height / CANVAS_HEIGHT));
        
        // Only show hover effect if we're within bounds and not during cooldown
        if (mouseX >= 0 && mouseX < CANVAS_WIDTH && mouseY >= 0 && mouseY < CANVAS_HEIGHT && 
            walletConnected && cooldownEndTime <= Date.now()) {
            
            // Check if we're not hovering over an already selected pixel
            const isSelected = selectedPixels.some(p => p.x === mouseX && p.y === mouseY);
            
            if (!isSelected) {
                // Draw hover effect
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(mouseX * pixelSize, mouseY * pixelSize, pixelSize, pixelSize);
            }
        }
    };
    
    // Clear hover effect when mouse leaves canvas
    canvas.onmouseleave = function() {
        drawCanvas();
    };
}

// Submit pixels to blockchain
async function submitPixelsToBlockchain() {
    if (selectedPixels.length === 0) {
        return;
    }
    
    try {
        updateStatus('Submitting pixels to blockchain...', 'info');
        
        // Update local state first
        selectedPixels.forEach(pixel => {
            const index = pixel.y * CANVAS_WIDTH + pixel.x;
            canvasData[index] = pixel.color;
        });
        
        // Save to localStorage regardless of blockchain connectivity
        saveCanvasToLocalStorage();
        
        if (!walletConnected || !contract) {
            console.log("Running in demo mode - no contract available");
            updateStatus('Pixels updated in demo mode!', 'success');
            drawCanvas();
            clearSelection();
            
            // Set a mock cooldown
            cooldownEndTime = Date.now() + 60000; // 1 minute cooldown
            updateCooldownTimer();
            cooldownInterval = setInterval(updateCooldownTimer, 1000);
            
            // Update Firestore if enabled
            if (db) {
                updateFirestoreCanvas();
            }
            
            return;
        }
        
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
        
        // Clear selection
        clearSelection();
        
        // Update Firestore if enabled
        if (db) {
            updateFirestoreCanvas();
        }
        
        // Set cooldown
        await checkCooldown();
    } catch (error) {
        console.error('Transaction error:', error);
        updateStatus(`Transaction failed: ${error.message}`, 'error');
    }
}

// Check cooldown period
async function checkCooldown() {
    if (!walletConnected || !contract) return;
    
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

// Fetch canvas from blockchain with fallback to localStorage
async function fetchCanvasFromBlockchain() {
    let loadedFromBlockchain = false;
    
    if (walletConnected && contract) {
        try {
            updateStatus('Fetching canvas from blockchain...', 'info');
            
            // Try to fetch from blockchain
            for (let y = 0; y < CANVAS_HEIGHT; y++) {
                for (let x = 0; x < CANVAS_WIDTH; x++) {
                    try {
                        const color = await contract.get_pixel(x, y);
                        const index = y * CANVAS_WIDTH + x;
                        canvasData[index] = color;
                        loadedFromBlockchain = true;
                    } catch (error) {
                        console.error(`Error fetching pixel at ${x},${y}:`, error);
                    }
                }
            }
            
            if (loadedFromBlockchain) {
                updateStatus('Canvas loaded from blockchain successfully', 'success');
                // Save to localStorage for future use
                saveCanvasToLocalStorage();
            }
        } catch (error) {
            console.error('Fetch canvas error:', error);
            updateStatus('Failed to fetch canvas from blockchain', 'error');
        }
    }
    
    // If we couldn't load from blockchain, try localStorage
    if (!loadedFromBlockchain) {
        if (loadCanvasFromLocalStorage()) {
            updateStatus('Canvas loaded from local storage', 'info');
        } else {
            // Initialize with a blank canvas
            console.log('Initializing blank canvas');
            for (let i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
                canvasData[i] = 0; // White
            }
        }
    }
    
    // Draw the canvas with whatever data we have
    drawCanvas();
    
    // Update Firestore if enabled
    if (db) {
        updateFirestoreCanvas();
    }
}

// Update Firestore with canvas data
function updateFirestoreCanvas() {
    // Skip Firestore operations if Firebase isn't properly configured
    if (!db) {
        console.log("Skipping Firestore update - Firebase not configured");
        return;
    }

    try {
        db.collection('canvas').doc('current').set({
            data: canvasData,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        })
        .catch(error => {
            console.error('Firestore update error:', error);
        });
    } catch (error) {
        console.error("Error updating Firestore:", error);
    }
}

// Subscribe to canvas updates in Firestore
function subscribeToCanvasUpdates() {
    // Skip Firestore operations if Firebase isn't properly configured
    if (!db) {
        console.log("Skipping Firestore subscription - Firebase not configured");
        return;
    }

    try {
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
    } catch (error) {
        console.error("Error subscribing to Firestore:", error);
    }
}

// Initialize the app when page loads
window.addEventListener('DOMContentLoaded', init);