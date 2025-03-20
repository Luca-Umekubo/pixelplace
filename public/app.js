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

// Add this near the top of your file
let demoMode = false; // Add this flag for demo mode

// Helper function to safely handle BigInt serialization
function saveCanvasToLocalStorage() {
    try {
        // Convert BigInt to Number before saving
        const safeData = Array.from(canvasData).map(val => 
            typeof val === 'bigint' ? Number(val) : val
        );
        localStorage.setItem('pixelCanvasData', JSON.stringify(safeData));
        localStorage.setItem('pixelCanvasLastUpdated', Date.now());
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
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

// Connect wallet// Connect wallet
async function connectWallet() {
    try {
        console.log("Connecting wallet...");
        if (!window.ethereum) {
            console.error("No wallet provider found");
            updateStatus('MetaMask or other Web3 wallet not detected. Using demo mode.', 'info');
            demoMode = true;
            walletConnected = true; // Allow interaction in demo mode
            connectWalletBtn.textContent = 'Demo Mode Active';
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
        
        // Convert BigInt to Number if needed
        const sepoliaChainId = 11155111;
        const chainIdNum = typeof chainId === 'bigint' ? Number(chainId) : chainId;
        
        if (chainIdNum !== sepoliaChainId) {
            console.error("Wrong network");
            updateStatus('Please switch to Sepolia testnet in your wallet', 'error');
            walletStatusDiv.textContent = 'Connected to wrong network';
            walletStatusDiv.className = 'error';
            return;
        }
        
        // Initialize contract
        if (contractABI) {
            try {
                console.log("Initializing contract at address:", contractAddress);
                
                // For ethers v6 or v5
                contract = new ethers.Contract(contractAddress, contractABI, signer);
                console.log("Contract created:", contract);
                console.log("Available methods:", Object.keys(contract.functions || contract));
                
                // Test if contract is valid with a simple call
                console.log("Testing contract connection...");
                const testCall = await contract.get_canvas_dimensions();
                console.log("Contract test call successful:", testCall);
                
                // Update UI for successful connection
                walletConnected = true;
                walletStatusDiv.textContent = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
                walletStatusDiv.className = 'success';
                connectWalletBtn.textContent = 'Wallet Connected';
                
                // Check if user can place pixels
                await checkCooldown();
                
                // Update canvas from blockchain
                await fetchCanvasFromBlockchain();
                
                updateStatus('Wallet connected successfully', 'success');
            } catch (error) {
                console.error("Contract initialization or test call failed:", error);
                updateStatus('Contract connection failed. Running in demo mode.', 'info');
                demoMode = true;
                walletConnected = true; // Allow interaction in demo mode
                walletStatusDiv.textContent = `Demo mode: ${userAddress.substring(0, 6)}...`;
                walletStatusDiv.className = 'info';
                connectWalletBtn.textContent = 'Demo Mode Active';
                
                // Still load canvas from local storage
                loadCanvasFromLocalStorage();
                drawCanvas();
            }
        } else {
            console.error("Contract ABI not loaded");
            updateStatus('Contract ABI not loaded. Running in demo mode.', 'info');
            demoMode = true;
            walletConnected = true;
            walletStatusDiv.textContent = `Demo mode: ${userAddress.substring(0, 6)}...`;
            walletStatusDiv.className = 'info';
            connectWalletBtn.textContent = 'Demo Mode Active';
        }
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
    } catch (error) {
        console.error('Connection error:', error);
        updateStatus('Failed to connect wallet: ' + error.message, 'error');
        
        // Enable demo mode if wallet connection fails
        demoMode = true;
        walletConnected = true;
        walletStatusDiv.textContent = 'Demo mode active';
        walletStatusDiv.className = 'info';
        connectWalletBtn.textContent = 'Demo Mode Active';
        drawCanvas();
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

    function handleCanvasClick(event) {
        if (!walletConnected && !demoMode) {
            updateStatus('Please connect your wallet or use demo mode', 'info');
            return;
        }
        
        if (!demoMode && cooldownEndTime > Date.now()) {
            updateStatus('You must wait for the cooldown period to end', 'info');
            return;
        }
        
    }
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

function addCanvasHoverEffects() {
    canvas.onmousemove = function(e) {
        // Redraw the canvas first to clear any previous hover effects
        drawCanvas();
        
        const rect = canvas.getBoundingClientRect();
        const pixelSize = Math.floor(canvas.width / CANVAS_WIDTH);
        const mouseX = Math.floor((e.clientX - rect.left) / (canvas.width / CANVAS_WIDTH));
        const mouseY = Math.floor((e.clientY - rect.top) / (canvas.height / CANVAS_HEIGHT));
        
        // Allow drawing in demo mode or when wallet is connected and not in cooldown
        if (mouseX >= 0 && mouseX < CANVAS_WIDTH && mouseY >= 0 && mouseY < CANVAS_HEIGHT && 
            (demoMode || (walletConnected && cooldownEndTime <= Date.now()))) {
            
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

// Submit pixels to blockchain// Submit pixels to blockchain
async function submitPixelsToBlockchain() {
    if (selectedPixels.length === 0) {
        return;
    }
    
    try {
        updateStatus(demoMode ? 'Updating canvas in demo mode...' : 'Submitting pixels to blockchain...', 'info');
        
        // Update local state first
        selectedPixels.forEach(pixel => {
            const index = pixel.y * CANVAS_WIDTH + pixel.x;
            canvasData[index] = pixel.color;
        });
        
        // Save to localStorage regardless of blockchain connectivity
        saveCanvasToLocalStorage();
        
        // If in demo mode or contract is unavailable, just update locally
        if (demoMode || !walletConnected || !contract) {
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
        
        // Real blockchain interaction (only happens if not in demo mode)
        try {
            // Prepare transaction data
            const xCoords = selectedPixels.map(p => p.x);
            const yCoords = selectedPixels.map(p => p.y);
            const colors = selectedPixels.map(p => p.color);
            
            console.log("Contract methods:", Object.keys(contract.functions || contract));
            console.log("Attempting to call set_pixels with:", {xCoords, yCoords, colors});
            
            // Check if set_pixels method exists
            if (typeof contract.set_pixels !== 'function' && 
                (!contract.functions || typeof contract.functions.set_pixels !== 'function')) {
                console.error("set_pixels is not a function");
                throw new Error("Contract method 'set_pixels' not found");
            }
            
            // Try calling with different parameter formats
            let tx;
            try {
                // Try standard approach with gas estimation
                const gasEstimate = await contract.estimateGas.set_pixels(xCoords, yCoords, colors);
                console.log("Gas estimate:", gasEstimate);
                
                tx = await contract.set_pixels(xCoords, yCoords, colors, {
                    gasLimit: Math.floor(Number(gasEstimate) * 1.2)
                });
            } catch (gasError) {
                console.error("Standard call failed:", gasError);
                
                // Try alternative approach for ethers v5/v6 compatibility
                if (contract.functions && contract.functions.set_pixels) {
                    tx = await contract.functions.set_pixels(xCoords, yCoords, colors);
                } else {
                    // Try direct call without gas estimation
                    tx = await contract.set_pixels(xCoords, yCoords, colors);
                }
            }
            
            updateStatus('Transaction submitted! Waiting for confirmation...', 'info');
            const receipt = await tx.wait();
            console.log("Transaction receipt:", receipt);
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
            console.error("Blockchain transaction failed:", error);
            updateStatus('Blockchain transaction failed. Changes saved locally.', 'info');
            
            // Switch to demo mode on failure
            demoMode = true;
            walletConnected = true;
            connectWalletBtn.textContent = 'Demo Mode Active';
            
            // Clear selection but keep changes
            clearSelection();
        }
    } catch (error) {
        console.error('Transaction error:', error);
        updateStatus(`Error: ${error.message}. Changes saved locally.`, 'info');
        
        // Even if there's an error, we should keep the local changes
        drawCanvas();
        clearSelection();
    }
}

// Check cooldown period
// Check cooldown period
async function checkCooldown() {
    if (!walletConnected || !contract || demoMode) return;
    
    try {
        const userAddress = await signer.getAddress();
        
        // Try different ways to call the contract methods
        let canUpdate = false;
        try {
            // First try the direct method call
            canUpdate = await contract.can_update(userAddress);
        } catch (error) {
            console.log("Direct can_update call failed, trying alternative approach");
            // Try using the functions property (ethers v5 style)
            if (contract.functions && contract.functions.can_update) {
                canUpdate = await contract.functions.can_update(userAddress);
                // Unwrap the result if it's in an array
                if (Array.isArray(canUpdate)) {
                    canUpdate = canUpdate[0];
                }
            }
        }
        
        if (canUpdate) {
            cooldownEndTime = 0;
            cooldownTimerDiv.textContent = '';
            clearInterval(cooldownInterval);
        } else {
            // Get the cooldown period and last update time
            let cooldownPeriod;
            let lastUpdateTime;
            
            try {
                // Try direct call first
                cooldownPeriod = await contract.get_cool_down_period();
            } catch (error) {
                console.log("Direct cooldown period call failed, trying alternative");
                // Try functions approach
                if (contract.functions && contract.functions.get_cool_down_period) {
                    cooldownPeriod = await contract.functions.get_cool_down_period();
                    if (Array.isArray(cooldownPeriod)) {
                        cooldownPeriod = cooldownPeriod[0];
                    }
                }
            }
            
            try {
                // Try direct call first
                lastUpdateTime = await contract.last_update_time(userAddress);
            } catch (error) {
                console.log("Direct last_update_time call failed, trying alternative");
                // In ethers v6, method names might need to be adjusted - try functions method
                if (contract.functions) {
                    // Try with underscore (matching your ABI)
                    if (contract.functions.last_update_time) {
                        lastUpdateTime = await contract.functions.last_update_time(userAddress);
                        if (Array.isArray(lastUpdateTime)) {
                            lastUpdateTime = lastUpdateTime[0];
                        }
                    } 
                    // Try without underscore (just in case)
                    else if (contract.functions.lastUpdateTime) {
                        lastUpdateTime = await contract.functions.lastUpdateTime(userAddress);
                        if (Array.isArray(lastUpdateTime)) {
                            lastUpdateTime = lastUpdateTime[0];
                        }
                    }
                }
            }
            
            // If we got the values, calculate cooldown
            if (cooldownPeriod && lastUpdateTime) {
                // Convert BigInt to Number if needed
                const cooldownNum = typeof cooldownPeriod === 'bigint' ? Number(cooldownPeriod) : cooldownPeriod;
                const lastUpdateNum = typeof lastUpdateTime === 'bigint' ? Number(lastUpdateTime) : lastUpdateTime;
                
                cooldownEndTime = (lastUpdateNum + cooldownNum) * 1000; // Convert to ms
                
                // Start countdown
                updateCooldownTimer();
                cooldownInterval = setInterval(updateCooldownTimer, 1000);
            } else {
                console.error("Could not retrieve cooldown information");
            }
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
// Fetch canvas from blockchain with improved speed
async function fetchCanvasFromBlockchain() {
    let loadedFromBlockchain = false;
    
    if (!demoMode && walletConnected && contract) {
        try {
            updateStatus('Fetching canvas from blockchain...', 'info');
            
            // Create a grid of smaller chunks to load in parallel
            const CHUNK_SIZE = 10; // 10x10 chunks
            const chunks = [];
            
            for (let yChunk = 0; yChunk < CANVAS_HEIGHT/CHUNK_SIZE; yChunk++) {
                for (let xChunk = 0; xChunk < CANVAS_WIDTH/CHUNK_SIZE; xChunk++) {
                    chunks.push({x: xChunk * CHUNK_SIZE, y: yChunk * CHUNK_SIZE});
                }
            }
            
            // Process chunks in parallel with a concurrency limit
            const CONCURRENCY_LIMIT = 5; // Process 5 chunks at a time
            let completedChunks = 0;
            const totalChunks = chunks.length;
            let pixelsLoaded = 0;
            
            // Load chunks in batches
            for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
                const chunkBatch = chunks.slice(i, i + CONCURRENCY_LIMIT);
                
                // Update status
                updateStatus(`Loading canvas: ${Math.floor((completedChunks/totalChunks)*100)}%`, 'info');
                
                // Process this batch in parallel
                await Promise.all(chunkBatch.map(async (chunk) => {
                    // Load a chunk of pixels
                    for (let y = chunk.y; y < chunk.y + CHUNK_SIZE && y < CANVAS_HEIGHT; y++) {
                        for (let x = chunk.x; x < chunk.x + CHUNK_SIZE && x < CANVAS_WIDTH; x++) {
                            try {
                                // Try direct call first
                                let color;
                                try {
                                    color = await contract.get_pixel(x, y);
                                } catch (pixelError) {
                                    // Try alternative approach if direct call fails
                                    if (contract.functions && contract.functions.get_pixel) {
                                        color = await contract.functions.get_pixel(x, y);
                                        if (Array.isArray(color)) {
                                            color = color[0];
                                        }
                                    } else {
                                        throw pixelError;
                                    }
                                }
                                
                                const index = y * CANVAS_WIDTH + x;
                                
                                // Convert BigInt to Number if needed
                                canvasData[index] = typeof color === 'bigint' ? Number(color) : color;
                                pixelsLoaded++;
                            } catch (error) {
                                console.error(`Error fetching pixel at ${x},${y}:`, error);
                            }
                        }
                    }
                    
                    completedChunks++;
                }));
                
                // Redraw canvas after each batch to show progress
                drawCanvas();
            }
            
            if (pixelsLoaded > 0) {
                loadedFromBlockchain = true;
                updateStatus('Canvas loaded from blockchain successfully', 'success');
                // Save to localStorage for future use
                saveCanvasToLocalStorage();
            }
        } catch (error) {
            console.error('Fetch canvas error:', error);
            updateStatus('Failed to fetch canvas from blockchain. Using local data.', 'info');
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
            updateStatus('Started new canvas', 'info');
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