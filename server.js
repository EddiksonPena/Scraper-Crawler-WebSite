const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const path = require('path')
const { puziPoStrani, dataReport } = require('./extract')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Memory usage monitoring
function getMemoryUsage() {
    const used = process.memoryUsage()
    return {
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
        percentageUsed: Math.round((used.heapUsed / used.heapTotal) * 100)
    }
}

// WebSocket connection handling
wss.on('connection', ws => {
    console.log('New WebSocket connection')
    
    ws.on('error', console.error)
    
    ws.on('close', () => {
        console.log('Client disconnected')
    })
})

// Broadcast to all connected clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data))
        }
    })
}

app.use(express.static('public'))
app.use(express.json())

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
    const startTime = Date.now()
    const startMemory = getMemoryUsage()
    const url = req.body.url
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' })
    }

    try {
        console.log(`Starting crawl of ${url}`)
        broadcast({
            type: 'start',
            url: url,
            memory: startMemory
        })

        const pages = await puziPoStrani(url, url, {}, (progress) => {
            const memory = getMemoryUsage()
            broadcast({
                type: 'progress',
                ...progress,
                memory
            })
        })

        const endTime = Date.now()
        const duration = (endTime - startTime) / 1000
        const endMemory = getMemoryUsage()
        
        const report = dataReport(pages)
        report.performance = {
            duration,
            pagesPerSecond: (report.summary.totalPages / duration).toFixed(2),
            startMemory,
            endMemory,
            memoryDelta: {
                heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                heapTotal: endMemory.heapTotal - startMemory.heapTotal
            }
        }

        broadcast({
            type: 'complete',
            report
        })

        res.json({
            status: 'success',
            report
        })

    } catch (error) {
        const errorMemory = getMemoryUsage()
        console.error('Scraping error:', error)
        
        broadcast({
            type: 'error',
            error: error.message,
            memory: errorMemory
        })

        res.status(500).json({
            status: 'error',
            error: error.message,
            memory: errorMemory
        })
    }
})

// Health check endpoint
app.get('/health', (req, res) => {
    const memory = getMemoryUsage()
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory
    })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})