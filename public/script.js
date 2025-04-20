// WebSocket connection
let socket = null;
let isConnected = false;

// Connect to WebSocket server
function connectWebSocket() {
    socket = new WebSocket('ws://localhost:3000');
    
    socket.onopen = () => {
        console.log('WebSocket connected');
        isConnected = true;
        updateConnectionStatus(true);
    };
    
    socket.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected = false;
        updateConnectionStatus(false);
        // Try to reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleProgress(data);
    };
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (connected) {
        statusElement.classList.remove('bg-danger');
        statusElement.classList.add('bg-success');
        statusElement.title = 'Connected';
    } else {
        statusElement.classList.remove('bg-success');
        statusElement.classList.add('bg-danger');
        statusElement.title = 'Disconnected';
    }
}

// Handle form submission
document.getElementById('scraperForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    
    if (!isValidUrl(url)) {
        showAlert('Please enter a valid URL', 'danger');
        return;
    }
    
    // Reset UI
    resetUI();
    
    try {
        const response = await fetch('/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        handleResults(data);
    } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred while scraping', 'danger');
    }
});

// Handle progress updates
function handleProgress(data) {
    if (data.type === 'progress') {
        updateProgress(data.progress);
        updateStats(data);
    } else if (data.type === 'error') {
        showAlert(data.message, 'danger');
    }
}

// Update progress bar
function updateProgress(progress) {
    const progressBar = document.querySelector('.progress-bar');
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    progressBar.textContent = `${progress}%`;
}

// Update statistics
function updateStats(data) {
    document.getElementById('pagesProcessed').textContent = data.pagesProcessed || 0;
    document.getElementById('linksFound').textContent = data.linksFound || 0;
    document.getElementById('elapsedTime').textContent = formatTime(data.elapsedTime || 0);
    document.getElementById('memoryUsage').textContent = formatMemory(data.memoryUsage || 0);
}

// Handle final results
function handleResults(data) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';
    
    data.links.forEach(link => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <h6><a href="${link.url}" target="_blank">${link.title || link.url}</a></h6>
            ${link.description ? `<p>${link.description}</p>` : ''}
            <div class="metadata">
                <span>Depth: ${link.depth || 'N/A'}</span>
                ${link.lastModified ? `• Last modified: ${new Date(link.lastModified).toLocaleDateString()}` : ''}
            </div>
        `;
        resultsContainer.appendChild(resultItem);
    });
    
    showAlert('Scraping completed successfully!', 'success');
}

// Reset UI elements
function resetUI() {
    updateProgress(0);
    document.getElementById('results').innerHTML = '';
    document.querySelectorAll('.alert').forEach(alert => alert.remove());
    updateStats({
        pagesProcessed: 0,
        linksFound: 0,
        elapsedTime: 0,
        memoryUsage: 0
    });
}

// Show alert message
function showAlert(message, type) {
    const alertsContainer = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertsContainer.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// Utility function to validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Utility function to format time
function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Utility function to format memory
function formatMemory(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Initialize WebSocket connection
connectWebSocket();