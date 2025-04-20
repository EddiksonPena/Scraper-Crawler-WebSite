const {JSDOM} = require('jsdom')
const rateLimit = require('express-rate-limit')
const robotsParser = require('robots-parser')
const fetch = require('node-fetch')
const puppeteer = require('puppeteer')

// Configuration
const CONFIG = {
    RATE_LIMIT_MS: 2000,
    MAX_RETRIES: 3,
    MAX_CONCURRENT: 3,
    TIMEOUT: 30000,
    SELECTORS: {
        APPLE_DOC: {
            // Simplified selectors to match Apple's structure
            NAVIGATION: 'nav, .navigation, .sidebar, aside',
            LINKS: 'a[href*="/documentation"], a[href*="/library"], a[href*="/api"]',
            WAIT_FOR: 'body' // Wait for basic page load instead of specific elements
        }
    }
}

// Queue for managing concurrent requests
class RequestQueue {
    constructor(maxConcurrent = CONFIG.MAX_CONCURRENT) {
        this.queue = []
        this.running = 0
        this.maxConcurrent = maxConcurrent
        this.browser = null
        this.visited = new Set()
    }

    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            })
        }
        return this.browser
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }

    async add(fn) {
        if (this.running >= this.maxConcurrent) {
            await new Promise(resolve => this.queue.push(resolve))
        }
        this.running++
        try {
            return await fn()
        } finally {
            this.running--
            if (this.queue.length > 0) {
                const next = this.queue.shift()
                next()
            }
        }
    }
}

const requestQueue = new RequestQueue()

function delay(ms) {
    return new Promise(resolve => global.setTimeout(resolve, ms));
}

async function fetchWithPuppeteer(url) {
    const browser = await requestQueue.initBrowser()
    const page = await browser.newPage()
    
    try {
        // Configure page
        await page.setViewport({ width: 1920, height: 1080 })
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
        
        // Enable JavaScript and wait for network to be idle
        await page.setJavaScriptEnabled(true)
        await page.setCacheEnabled(true)
        await page.setDefaultNavigationTimeout(CONFIG.TIMEOUT)

        // Navigate to page with more relaxed waiting conditions
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.TIMEOUT
        })

        // Wait for basic page load
        await page.waitForSelector('body', { timeout: CONFIG.TIMEOUT })
        
        // Add a small delay to ensure dynamic content loads
        await delay(2000)

        // Extract all documentation links
        const links = await page.evaluate(() => {
            // Get all links that match our documentation patterns
            const allLinks = Array.from(document.querySelectorAll('a'))
            return allLinks
                .filter(a => {
                    const href = a.href
                    return href && 
                           (href.includes('/documentation/') || 
                            href.includes('/library/') || 
                            href.includes('/api/')) &&
                           !href.includes('#') &&
                           !href.startsWith('javascript:')
                })
                .map(a => {
                    // Try to get the parent section name
                    let parentSection = ''
                    let element = a
                    while (element && !parentSection) {
                        const parent = element.parentElement
                        if (parent) {
                            const heading = parent.querySelector('h1, h2, h3, h4, h5, h6')
                            if (heading) {
                                parentSection = heading.textContent.trim()
                                break
                            }
                        }
                        element = parent
                    }

                    return {
                        href: a.href,
                        text: a.textContent.trim(),
                        type: 'documentation',
                        title: a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent.trim(),
                        parent: parentSection,
                        isFramework: a.href.includes('/documentation/') || a.href.includes('/library/'),
                        isAPI: a.href.includes('/api/')
                    }
                })
                .filter(link => link.text.length > 0)
        })

        // Get the page content
        const content = await page.content()
        return { content, links }
    } catch (error) {
        console.error(`Error fetching with Puppeteer: ${error.message}`)
        throw error
    } finally {
        await page.close()
    }
}

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const { content, links } = await fetchWithPuppeteer(url)
            return { content, links }
        } catch (error) {
            if (i === retries - 1) throw error
            await delay(CONFIG.RATE_LIMIT_MS * (i + 1))
        }
    }
}

async function puziPoStrani(base_URL, currentUrl, pages = {}, progressCallback = null) {
    const baseUrlObj = new URL(base_URL)
    const currentUrlObj = new URL(currentUrl)
    
    if (baseUrlObj.hostname !== currentUrlObj.hostname) {
        return pages
    }

    const normalizedCurrent = currentUrl
    if (pages[normalizedCurrent]) {
        pages[normalizedCurrent].referenceCount++
        return pages
    }

    console.log(`actively crawling on ${currentUrl}`)
    if (progressCallback) {
        progressCallback({
            currentUrl,
            totalLinks: Object.keys(pages).length
        })
    }
    
    try {
        const pageData = await vratiSadrzaj(currentUrl)
        if (!pageData) {
            return pages
        }

        pages[normalizedCurrent] = {
            url: currentUrl,
            referenceCount: 1,
            content: pageData,
            childUrls: pageData.links.map(l => l.href).filter(Boolean)
        }

        // Process all found links concurrently
        const crawlPromises = pageData.links
            .map(link => link.href)
            .filter(url => {
                try {
                    const urlObj = new URL(url)
                    return urlObj.hostname === baseUrlObj.hostname &&
                           !requestQueue.visited.has(url)
                } catch {
                    return false
                }
            })
            .map(url => puziPoStrani(base_URL, url, pages, progressCallback))

        await Promise.all(crawlPromises)
        
    } catch (error) {
        console.error(`Error processing ${currentUrl}:`, error)
    }
    
    return pages
}

async function vratiSadrzaj(url) {
    if (requestQueue.visited.has(url)) {
        return null
    }
    
    return await requestQueue.add(async () => {
        try {
            const { content, links } = await fetchWithPuppeteer(url)
            const dom = new JSDOM(content)
            const doc = dom.window.document

            requestQueue.visited.add(url)

            const pageData = {
                url: url,
                title: doc.title,
                headings: Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
                    level: parseInt(h.tagName.substring(1)),
                    text: h.textContent.trim(),
                    id: h.id || ''
                })),
                links: links,
                metadata: {
                    description: doc.querySelector('meta[name="description"]')?.content || 
                               doc.querySelector('meta[property="og:description"]')?.content || '',
                    keywords: doc.querySelector('meta[name="keywords"]')?.content || '',
                    author: doc.querySelector('meta[name="author"]')?.content || ''
                }
            }

            await delay(CONFIG.RATE_LIMIT_MS)
            return pageData
        } catch (error) {
            console.error(`Error fetching content from ${url}: ${error.message}`)
            throw error
        }
    })
}

function dataReport(pages) {
    const report = {
        summary: {
            totalPages: Object.keys(pages).length,
            successfulCrawls: 0,
            failedCrawls: 0,
            totalLinks: 0,
            totalContent: 0,
            averageContentLength: 0
        },
        topPages: [],
        errors: []
    }

    // Analyze pages
    Object.entries(pages).forEach(([url, data]) => {
        if (data.error) {
            report.summary.failedCrawls++
            report.errors.push({
                url: url,
                error: data.error
            })
        } else {
            report.summary.successfulCrawls++
        }

        report.summary.totalLinks += data.childUrls?.length || 0
        if (data.content?.fullText) {
            report.summary.totalContent += data.content.fullText.length
        }
    })

    // Calculate averages
    report.summary.averageContentLength = Math.round(
        report.summary.totalContent / report.summary.successfulCrawls
    )

    // Sort pages by reference count
    report.topPages = Object.entries(pages)
        .sort(([,a], [,b]) => b.referenceCount - a.referenceCount)
        .slice(0, 10)
        .map(([url, data]) => ({
            url,
            references: data.referenceCount,
            contentItems: (data.content?.headings?.length || 0)
        }))

    return report
}

// Clean up when done
process.on('SIGINT', async () => {
    console.log('Cleaning up...')
    await requestQueue.closeBrowser()
    process.exit()
})

module.exports = {
    puziPoStrani,
    vratiSadrzaj,
    dataReport
}