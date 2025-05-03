const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const axiosRetry = require('axios-retry').default;
const sanitizeFilename = require('sanitize-filename');

function toFileName(str) {
  return sanitizeFilename( str.trim().toLowerCase().
  normalize("NFD").replace(/[\u0300-\u036f]/g, "").
  replace(/\s+/g, '-'));
}

function generateRandomID(length = 5) {
  return Math.random().toString(36).substring(2, 2 + length);
}

async function downloadImage(imgUrl, dir) {
  try {
    const response = await axios({
      url: imgUrl,
      responseType: 'stream'
    });

    const imgName = path.basename(imgUrl);
    const filePath = path.resolve(dir, imgName);
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Error downloading image ${imgUrl}`);
  }
}

async function fetchImagesFromJsonp(contentUrl, dir) {
  try {
    const response = await axios.get(contentUrl);
    const data = response.data;

    const jsonpContent = data.match(/window\.\w+_callback\(\[\"(.+)\"\]\);/);

    if (jsonpContent && jsonpContent[1]) {
      const htmlContent = jsonpContent[1];
      const $ = cheerio.load(htmlContent);
      let imgUrl = $('img').attr('orig');
      if (imgUrl) {
        imgUrl = imgUrl.replace(/\\\"/g, '').replace(/\/$/, '');
        await downloadImage(imgUrl, dir);
      }
    }
  } catch (error) {
    throw new Error(`Error processing JSONP ${contentUrl}`);
  }
}

async function scrapeScribd(url, dir, pdf = false, retries = 3) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    // Setup axios-retry globally, if desired
    if (retries > 0) {
      axiosRetry(axios, {
        retries: retries, // Number of retry attempts
        retryDelay: axiosRetry.exponentialDelay, // Wait time between retries
        retryCondition: (error) => {
          // Retry only on network errors or 5xx responses
          if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
            console.log("Network error received. Retrying ... ");
            return true;
          } else {
            return false;
          }
        }
      });
    }

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const scriptText = $('script:contains("docManager.addPage")').html();
    const contentUrlRegex = /contentUrl:\s*"(https:\/\/[^\"]+\.jsonp)"/g;

    console.log(`${url} successfully fetched. Loading images ...`);

    let match;
    let count = 0;
    while ((match = contentUrlRegex.exec(scriptText)) !== null) {
      const contentUrl = match[1];
      await fetchImagesFromJsonp(contentUrl, dir);
      count++;
    }

    console.log(`${count} images successfully downloaded to ${dir}`)

    const title = toFileName($('title').text().trim())
    const randomID = generateRandomID();
    const pdfFileName = `${title}-${randomID}.pdf`;

    if (pdf) {
      await imagesToPDF(dir, pdfFileName);
      console.log(`PDF file successfully created: ${dir}/${pdfFileName}`)
      const images = fs.readdirSync(dir).filter(file => file.endsWith('.jpg') || file.endsWith('.png'));
      for (const image of images) {
        fs.unlinkSync(path.join(dir, image));
      }
    }
  } catch (error) {
    console.error(`Error processing main page:`, error.message);
  }
}

async function imagesToPDF(dir, pdfFileName) {
  const doc = new PDFDocument({ autoFirstPage: false });
  const outputFilePath = path.join(dir, pdfFileName);
  const stream = fs.createWriteStream(outputFilePath);
  doc.pipe(stream);

  const images = fs.readdirSync(dir)
      .filter(file => file.endsWith('.jpg') || file.endsWith('.png'))
      .sort((a, b) => {
        // sort by page number of this pattern: 2-d9b624f494.jpg (page 2)
        const getPageNumber = (filename) => {
          const match = filename.match(/^(\d+)-/);
          return match ? parseInt(match[1], 10) : 0;
        };
        return getPageNumber(a) - getPageNumber(b);
      });

  for (const image of images) {
    const imgPath = path.join(dir, image);
    const img = doc.openImage(imgPath);

    doc.addPage({ size: [img.width, img.height] });
    doc.image(imgPath, 0, 0, { width: img.width, height: img.height });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = scrapeScribd;
