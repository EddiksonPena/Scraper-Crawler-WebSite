const puppeteer = require('puppeteer');

// Configuration
const RATE_LIMIT_MS = 1000;
const MAX_RETRIES = 3;
const MAX_CONCURRENT = 5;
const TIMEOUT = 30000;
const BROWSER_POOL_SIZE = 3;
const BATCH_SIZE = 5;

// URL Queue for managing crawling
class UrlQueue {
    constructor() {
        this.queue = new Set();
        this.processing = new Set();
        this.visited = new Set();
    }

    add(url) {
        if (!this.visited.has(url) && !this.processing.has(url)) {
            this.queue.add(url);
        }
    }

    getNextBatch(size = BATCH_SIZE) {
        const batch = [];
        const iterator = this.queue.values();
        
        for (let i = 0; i < size && this.queue.size > 0; i++) {
            const { value: url } = iterator.next();
            if (url) {
                batch.push(url);
                this.queue.delete(url);
                this.processing.add(url);
            }
        }
        
        return batch;
    }

    markVisited(url) {
        this.processing.delete(url);
        this.visited.add(url);
    }

    hasMore() {
        return this.queue.size > 0 || this.processing.size > 0;
    }
}

// Browser pool management
class BrowserPool {
    constructor(size = BROWSER_POOL_SIZE) {
        this.browsers = [];
        this.size = size;
        this.currentIndex = 0;
    }

    async initialize() {
        for (let i = 0; i < this.size; i++) {
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            this.browsers.push(browser);
        }
    }

    getBrowser() {
        const browser = this.browsers[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.size;
        return browser;
    }

    async close() {
        await Promise.all(this.browsers.map(browser => browser.close()));
    }
}

// Memory management
function checkMemoryUsage() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    return heapUsedMB;
}

function shouldGarbageCollect() {
    const heapUsedMB = checkMemoryUsage();
    return heapUsedMB > 1024; // Trigger GC if heap usage exceeds 1GB
}

// Main crawling function
async function puziPoStrani(startUrl, options = {}) {
    const { onProgress = () => {}, onResult = () => {} } = options;
    const urlQueue = new UrlQueue();
    const browserPool = new BrowserPool();
    let processedPages = 0;
    let foundLinks = 0;

    await browserPool.initialize();
    urlQueue.add(startUrl);

    const memoryBefore = checkMemoryUsage();

    while (urlQueue.hasMore()) {
        const batch = urlQueue.getNextBatch();
        const results = await Promise.all(
            batch.map(url => fetchWithPuppeteer(url, browserPool.getBrowser()))
        );

        for (const result of results) {
            if (result.success) {
                processedPages++;
                foundLinks += result.links.length;
                result.links.forEach(link => urlQueue.add(link));
                onResult(result);
            }
            urlQueue.markVisited(result.url);
        }

        const progress = processedPages / (processedPages + urlQueue.queue.size);
        onProgress(progress, { processedPages, foundLinks });

        if (shouldGarbageCollect()) {
            global.gc && global.gc();
        }

        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }

    const memoryAfter = checkMemoryUsage();
    await browserPool.close();

    return { memoryBefore, memoryAfter, processedPages, foundLinks };
}

// Page fetching function
async function fetchWithPuppeteer(url, browser) {
    const page = await browser.newPage();
    
    try {
        // Configure page settings
        await page.setJavaScriptEnabled(true);
        await page.setCacheEnabled(true);
        await page.setRequestInterception(true);

        // Handle resource interception
        page.on('request', request => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Navigate to page
        await page.goto(url, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
            timeout: TIMEOUT
        });

        // Wait for content to load
        await Promise.race([
            page.waitForSelector('nav.documentation-nav'),
            page.waitForSelector('.documentation-hero'),
            new Promise(resolve => setTimeout(resolve, 3000))
        ]);

        // Extract links and metadata
        const links = await page.evaluate(() => {
            const selectors = [
                'nav.documentation-nav a',
                '.documentation-hero a',
                'a[href^="/documentation/"]'
            ];
            
            const links = new Set();
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(a => {
                    if (a.href && a.href.includes('/documentation/')) {
                        links.add(a.href);
                    }
                });
            });
            
            return Array.from(links);
        });

        const title = await page.title();
        const metadata = await page.evaluate(() => {
            const metaTags = {};
            document.querySelectorAll('meta').forEach(meta => {
                const name = meta.getAttribute('name') || meta.getAttribute('property');
                if (name) {
                    metaTags[name] = meta.getAttribute('content');
                }
            });
            return metaTags;
        });

        return { success: true, url, title, links, metadata };
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return { success: false, url, error: error.message };
    } finally {
        await page.close();
    }
}

module.exports = { puziPoStrani };