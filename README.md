# [scribd-scraper](https://www.npmjs.com/package/scribd-scraper)

This tool scrapes Scribd documents, automatically detecting and extracting both text and images from pages, and compiles them into a PDF. 

**Key Features:**
* Extracts both raw text layers and scanned images.
* Generates a hybrid PDF automatically.
* Asynchronous batch downloading to speed up the process.
* Automatically creates the output directory if it doesn't exist.

## Installation

```bash
npm i scribd-scraper
```

## API

`scrapeScribd(url, [options])`

* `url` *(string)*: The URL of the Scribd document.
* `options` *(object)*: Optional configuration object.
    * `dir` *(string)*: The directory where the PDF and temporary files will be saved. Defaults to the current working directory (`process.cwd()`).
    * `pdf` *(boolean)*: Whether to compile the downloaded pages into a PDF. Defaults to `true`.
    * `batchSize` *(number)*: Number of pages to process simultaneously. Defaults to `5`.

## Examples

### Download and convert to PDF (Default)

By default, the script will download the document and save the compiled PDF in the same folder where the script is executed.

```javascript
const scrapeScribd = require('scribd-scraper');

async function run() {
  const url = '[https://pt.scribd.com/document/54073736/artigos-cientificos](https://pt.scribd.com/document/54073736/artigos-cientificos)';
  
  try {
    console.log("Starting scraper...");
    await scrapeScribd(url);
    console.log("Document downloaded and converted to PDF successfully.");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
```

### Save to a specific directory

```javascript
const scrapeScribd = require('scribd-scraper');

async function run() {
  const url = '[https://pt.scribd.com/document/54073736/artigos-cientificos](https://pt.scribd.com/document/54073736/artigos-cientificos)';
  
  try {
    await scrapeScribd(url, {
      dir: 'downloads'
    });
    console.log("Document saved in the ./downloads folder.");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
```

### Only extract images/text (No PDF)

If you only want the raw extracted pages (images or text blocks) and want to skip the PDF generation.

```javascript
const scrapeScribd = require('scribd-scraper');

async function run() {
  const url = '[https://pt.scribd.com/document/477711709/1990-02-mara-maravilha-pdf](https://pt.scribd.com/document/477711709/1990-02-mara-maravilha-pdf)';
  
  try {
    await scrapeScribd(url, {
      dir: 'raw_pages',
      pdf: false
    });
    console.log("Pages extracted successfully without generating a PDF.");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
```
