let socket = null;
let isConnected = false;
let startTime = null;

// UI Elements
const form = document.getElementById('scrapeForm');
const urlInput = document.getElementById('urlInput');
const submitButton = document.getElementById('submitButton');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const resultsContainer = document.getElementById('resultsContainer');
const connectionStatus = document.getElementById('connectionStatus');
const processedPages = document.getElementById('processedPages');
const foundLinks = document.getElementById('foundLinks');
const elapsedTime = document.getElementById('elapsedTime');
const memoryUsage = document.getElementById('memoryUsage');

// Initialize WebSocket connection
function initializeWebSocket() {
    if (socket) {
        socket.close();
    }

    socket = new WebSocket('ws://localhost:3000');

    socket.onopen = () => {
        isConnected = true;
        connectionStatus.classList.add('connected');
        connectionStatus.title = 'Connected to server';
    };

    socket.onclose = () => {
        isConnected = false;
        connectionStatus.classList.remove('connected');
        connectionStatus.title = 'Disconnected from server';
        setTimeout(initializeWebSocket, 5000); // Attempt to reconnect every 5 seconds
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        showAlert('Error connecting to server', 'danger');
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'progress':
            updateProgress(data);
            break;
        case 'result':
            addResult(data);
            break;
        case 'error':
            showAlert(data.message, 'danger');
            break;
        case 'complete':
            handleCompletion(data);
            break;
    }
}

// Update progress information
function updateProgress(data) {
    if (!startTime) {
        startTime = Date.now();
    }

    const progress = Math.round(data.progress * 100);
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    progressText.textContent = `${progress}%`;

    processedPages.textContent = data.processedPages || '0';
    foundLinks.textContent = data.foundLinks || '0';
    
    const timeElapsed = Math.round((Date.now() - startTime) / 1000);
    elapsedTime.textContent = formatTime(timeElapsed);
    
    if (data.memoryUsage) {
        memoryUsage.textContent = formatMemoryUsage(data.memoryUsage);
    }
}

// Add a result to the results container
function addResult(data) {
    const resultElement = document.createElement('div');
    resultElement.className = 'result-item';
    resultElement.innerHTML = `
        <div class="title">${data.title || 'Untitled'}</div>
        <div class="url">${data.url}</div>
    `;
    resultsContainer.appendChild(resultElement);
    resultsContainer.scrollTop = resultsContainer.scrollHeight;
}

// Handle completion of scraping
function handleCompletion(data) {
    showAlert('Scraping completed successfully!', 'success');
    submitButton.disabled = false;
    startTime = null;
}

// Show alert message
function showAlert(message, type) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.getElementById('alertContainer').appendChild(alertElement);
    setTimeout(() => alertElement.remove(), 5000);
}

// Format time in HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// Format memory usage
function formatMemoryUsage(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
        showAlert('Not connected to server', 'danger');
        return;
    }

    const url = urlInput.value.trim();
    if (!url) {
        showAlert('Please enter a URL', 'warning');
        return;
    }

    try {
        submitButton.disabled = true;
        resultsContainer.innerHTML = '';
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressText.textContent = '0%';
        processedPages.textContent = '0';
        foundLinks.textContent = '0';
        elapsedTime.textContent = '00:00:00';
        memoryUsage.textContent = '0 MB';
        startTime = null;

        const response = await fetch('/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error('Failed to start scraping');
        }

    } catch (error) {
        showAlert(error.message, 'danger');
        submitButton.disabled = false;
    }
});

// Initialize WebSocket connection when the page loads
document.addEventListener('DOMContentLoaded', initializeWebSocket);