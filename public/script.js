let socket;
let isProcessing = false;

document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    setupEventListeners();
});

function initializeWebSocket() {
    socket = new WebSocket('ws://localhost:3000');
    
    socket.onopen = () => {
        console.log('WebSocket connection established');
        updateConnectionStatus(true);
    };
    
    socket.onclose = () => {
        console.log('WebSocket connection closed');
        updateConnectionStatus(false);
        setTimeout(initializeWebSocket, 5000); // Attempt to reconnect every 5 seconds
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
    
    socket.onmessage = (event) => {
        handleWebSocketMessage(JSON.parse(event.data));
    };
}

function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
    statusElement.className = isConnected ? 'text-success' : 'text-danger';
}

function setupEventListeners() {
    document.getElementById('scrapeForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('clearResults').addEventListener('click', clearResults);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    if (isProcessing) return;

    const url = document.getElementById('urlInput').value.trim();
    if (!url) {
        showAlert('Please enter a valid URL', 'danger');
        return;
    }

    try {
        isProcessing = true;
        updateUIForProcessing(true);
        
        const response = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        displayResults(result);
    } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred while scraping: ' + error.message, 'danger');
    } finally {
        isProcessing = false;
        updateUIForProcessing(false);
    }
}

function handleWebSocketMessage(data) {
    if (data.type === 'progress') {
        updateProgress(data);
    } else if (data.type === 'stats') {
        updateStats(data);
    } else if (data.type === 'error') {
        showAlert(data.message, 'danger');
    }
}

function updateProgress(data) {
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    
    progressBar.style.width = `${data.progress}%`;
    progressBar.setAttribute('aria-valuenow', data.progress);
    progressBar.textContent = `${Math.round(data.progress)}%`;
    
    if (data.message) {
        statusText.textContent = data.message;
    }
}

function updateStats(data) {
    const statsContainer = document.getElementById('stats');
    statsContainer.innerHTML = '';
    
    const stats = [
        { label: 'Pages Processed', value: data.pagesProcessed },
        { label: 'Links Found', value: data.linksFound },
        { label: 'Processing Time', value: formatTime(data.processingTime) },
        { label: 'Memory Usage', value: formatBytes(data.memoryUsage) }
    ];
    
    stats.forEach(stat => {
        const div = document.createElement('div');
        div.className = 'stat-item p-2 bg-light rounded';
        div.innerHTML = `
            <div class="fw-bold">${stat.label}</div>
            <div>${stat.value}</div>
        `;
        statsContainer.appendChild(div);
    });
}

function displayResults(data) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';
    
    if (data.links && data.links.length > 0) {
        const list = document.createElement('ul');
        list.className = 'list-group';
        
        data.links.forEach(link => {
            const item = document.createElement('li');
            item.className = 'list-group-item';
            item.innerHTML = `
                <a href="${link.url}" target="_blank">${link.title || link.url}</a>
                ${link.description ? `<p class="mb-0 text-muted small">${link.description}</p>` : ''}
            `;
            list.appendChild(item);
        });
        
        resultsContainer.appendChild(list);
    } else {
        resultsContainer.innerHTML = '<p class="text-muted">No results found</p>';
    }
}

function updateUIForProcessing(isProcessing) {
    const submitButton = document.querySelector('button[type="submit"]');
    const urlInput = document.getElementById('urlInput');
    
    submitButton.disabled = isProcessing;
    urlInput.disabled = isProcessing;
    submitButton.innerHTML = isProcessing ? 
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...' : 
        'Start Scraping';
}

function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertsContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

function clearResults() {
    document.getElementById('results').innerHTML = '';
    document.getElementById('stats').innerHTML = '';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressBar').textContent = '0%';
    document.getElementById('statusText').textContent = '';
}

function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds % 60}s`;
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}