# Web Scraper and Crawler

A powerful web scraper and crawler built with Node.js, featuring real-time progress tracking and support for dynamic websites.

## Features

- Single page scraping and full website crawling
- Real-time progress tracking with WebSocket support
- Support for JavaScript-heavy websites using Puppeteer
- Concurrent request handling with rate limiting
- Memory usage monitoring
- Export data in multiple formats (JSON, YAML, CSV)
- Beautiful and responsive UI

## Installation

1. Clone the repository:
```bash
git clone https://github.com/EddiksonPena/Scraper-Crawler-WebSite.git
cd Scraper-Crawler-WebSite
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter a URL in the input field
2. Choose between:
   - "Scrape Single Page" for single page extraction
   - "Crawl Website" for full website crawling
3. Monitor progress in real-time
4. Export the results in your preferred format

## Configuration

Key configuration options in `extract.js`:

```javascript
const CONFIG = {
    RATE_LIMIT_MS: 2000,    // Delay between requests
    MAX_RETRIES: 3,         // Maximum retry attempts
    MAX_CONCURRENT: 3,      // Maximum concurrent requests
    TIMEOUT: 30000         // Request timeout in milliseconds
}
```

## API Endpoints

- `POST /scrape`
  - Body: `{ url: string, action: "scrape" | "crawl" }`
  - Returns scraped/crawled data with performance metrics

- `POST /export/:format`
  - Formats: `json`, `yaml`, `csv`
  - Returns data in the specified format

## WebSocket Events

- `progress`
  - Reports crawling progress and memory usage
  - Includes current URL and total pages crawled

- `error`
  - Reports any errors during scraping/crawling
  - Includes error message and memory state

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Eddikson Pena
- GitHub: [@EddiksonPena](https://github.com/EddiksonPena)