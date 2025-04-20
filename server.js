const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { puziPoStrani } = require('./extract');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use(express.json());

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    ws.on('error', console.error);

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Broadcast to all connected clients
function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Get memory usage
function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        heapUsed: used.heapUsed,
        heapTotal: used.heapTotal,
        external: used.external,
        percentageUsed: (used.heapUsed / used.heapTotal) * 100
    };
}

// Scraping endpoint
app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const startTime = Date.now();
    let processedPages = 0;
    let foundLinks = 0;

    try {
        const results = await puziPoStrani(url, {
            onProgress: (progress, stats) => {
                processedPages = stats.processedPages;
                foundLinks = stats.foundLinks;
                broadcast({
                    type: 'progress',
                    progress,
                    processedPages,
                    foundLinks,
                    memoryUsage: getMemoryUsage()
                });
            },
            onResult: (result) => {
                broadcast({
                    type: 'result',
                    ...result
                });
            }
        });

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const pagesPerSecond = processedPages / duration;

        broadcast({
            type: 'complete',
            stats: {
                totalTime: duration,
                pagesPerSecond,
                processedPages,
                foundLinks,
                memoryBefore: results.memoryBefore,
                memoryAfter: results.memoryAfter
            }
        });

        res.json({
            success: true,
            stats: {
                totalTime: duration,
                pagesPerSecond,
                processedPages,
                foundLinks
            }
        });
    } catch (error) {
        console.error('Scraping error:', error);
        broadcast({
            type: 'error',
            message: error.message,
            memoryUsage: getMemoryUsage()
        });
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});