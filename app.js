const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

class ScribdScraper {
  constructor(url, outputDir, options = { pdf: true, batchSize: 5 }) {
    this.url = url;
    this.outputDir = path.resolve(outputDir);
    this.options = options;
    this.pages = [];
    this.title = 'scribd-document';
  }

  static sanitizeFilename(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  static generateId(length = 5) {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  async init() {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      console.log(`[+] Fetching document metadata...`);
      const { data } = await axios.get(this.url);
      const $ = cheerio.load(data);
      
      this.title = ScribdScraper.sanitizeFilename($('title').text().trim()) || 'document';
      const scriptText = $('script:contains("docManager.addPage")').html();
      
      if (!scriptText) {
        throw new Error('Page script not found. Document might be private or layout changed.');
      }

      const contentUrlRegex = /contentUrl:\s*"(https:\/\/[^\"]+\.jsonp)"/g;
      const jsonpUrls = [];
      let match;

      while ((match = contentUrlRegex.exec(scriptText)) !== null) {
        jsonpUrls.push(match[1]);
      }

      console.log(`[+] Found ${jsonpUrls.length} pages. Starting batch download (${this.options.batchSize} per batch)...`);
      await this.processInBatches(jsonpUrls);

      if (this.options.pdf) {
        await this.generateHybridPDF();
      }

      console.log(`[+] Process finished successfully!`);
    } catch (error) {
      console.error(`[-] Critical error:`, error.message);
    }
  }

  async processInBatches(urls) {
    for (let i = 0; i < urls.length; i += this.options.batchSize) {
      const batch = urls.slice(i, i + this.options.batchSize);
      const promises = batch.map((url, index) => this.extractPageContent(url, i + index + 1));
      
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          this.pages[i + idx] = result.value;
        } else {
          console.error(`[-] Failed to process page ${i + idx + 1}`);
        }
      });
    }
  }

  async extractPageContent(jsonpUrl, pageNum) {
    try {
      const { data } = await axios.get(jsonpUrl);
      const jsonpContent = data.match(/window\.\w+_callback\(\[\"(.+)\"\]\)/);

      if (!jsonpContent || !jsonpContent[1]) return null;

      const htmlContent = jsonpContent[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
        
      const $ = cheerio.load(htmlContent);
      let imgUrl = $('img').attr('orig') || $('img.absimg').attr('src');

      if (imgUrl) {
        imgUrl = imgUrl.replace(/\\\"/g, '').replace(/\/$/, '');
        const imgName = `page-${pageNum}-${ScribdScraper.generateId()}.jpg`;
        const filePath = path.resolve(this.outputDir, imgName);
        await this.downloadImage(imgUrl, filePath);
        
        return { type: 'image', data: filePath };
      } else {
        $('br').replaceWith('\n');
        $('p, div, li, h1, h2, h3, h4, h5, h6').append('\n');

        let textContent = $('.text_layer').text();

        if (!textContent.trim()) {
          textContent = $('body').text();
        }

        textContent = textContent
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim();

        return { type: 'text', data: textContent };
      }
    } catch (error) {
      console.error(`[-] Error in JSONP ${jsonpUrl}:`, error.message);
      return null;
    }
  }

  async downloadImage(imgUrl, filePath) {
    const response = await axios({
      url: imgUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async generateHybridPDF() {
    console.log(`[+] Generating compiled PDF...`);
    const pdfFileName = `${this.title}-${ScribdScraper.generateId()}.pdf`;
    const outputFilePath = path.join(this.outputDir, pdfFileName);
    
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outputFilePath);
    doc.pipe(stream);

    for (const page of this.pages) {
      if (!page) continue;

      if (page.type === 'image') {
        const img = doc.openImage(page.data);
        doc.addPage({ size: [img.width, img.height] });
        doc.image(page.data, 0, 0, { width: img.width, height: img.height });
        
        fs.unlinkSync(page.data);
      } else if (page.type === 'text') {
        doc.addPage({ size: 'A4', margin: 50 });
        doc.fontSize(11).text(page.data, {
          align: 'justify',
          columns: 1,
          lineGap: 4
        });
      }
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        console.log(`[+] PDF saved at: ${outputFilePath}`);
        resolve();
      });
      stream.on('error', reject);
    });
  }
}

async function scrapeScribd(url, options = {}) {
  const config = {
    dir: options.dir ? path.resolve(options.dir) : process.cwd(),
    pdf: options.pdf !== undefined ? options.pdf : true,
    batchSize: options.batchSize || 5
  };

  const scraper = new ScribdScraper(url, config.dir, { 
    pdf: config.pdf, 
    batchSize: config.batchSize 
  });
  
  await scraper.init();
}

module.exports = scrapeScribd;
