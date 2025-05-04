const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { JSDOM } = require('jsdom');

async function composeImageFromHTML(htmlPath, outputPath) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const page = doc.querySelector('.newpage');
    const width = parseInt(page.style.width);
    const height = parseInt(page.style.height);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Draw images
    const images = doc.querySelectorAll('.image_layer img');
    for (const img of images) {
        const { left, top, width: w, height: h } = img.style;
        const leftPx = parseInt(left);
        const topPx = parseInt(top);
        const imgWidth = parseInt(w);
        const imgHeight = parseInt(h);
        const src = img.src;

        const image = await loadImage(src);
        ctx.drawImage(image, leftPx, topPx, imgWidth, imgHeight);
    }

    // Draw absolutely positioned text
    const spans = doc.querySelectorAll('.text_layer span.a');
    for (const span of spans) {
        const style = span.style;
        const left = parseFloat(style.left || 0);
        const top = parseFloat(style.top || 0);
        const color = style.color || 'black';
        const opacity = parseFloat(style.opacity || 1.0);
        const fontSize = parseFloat(span.closest('div').style.fontSize || '16');

        const text = span.textContent.trim();
        if (!text) continue;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(text, left, top);
        ctx.restore();
    }

    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => console.log(`Saved to ${outputPath}`));
}

const html = fs.readFileSync('test.html', 'utf-8');

composeImageFromHTML(html, 'page3.png');