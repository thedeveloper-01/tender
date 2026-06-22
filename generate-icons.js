import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SVG_PATH = path.resolve('public/favicon.svg');
const PUBLIC_DIR = path.resolve('public');

// Helper to write an .ico file from PNG buffers
function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO format
  header.writeUInt16LE(images.length, 4);

  const entrySize = 16;
  const entries = Buffer.alloc(images.length * entrySize);
  const dataBuffers = [];

  let offset = 6 + images.length * entrySize;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const buf = img.buffer;
    
    const w = img.width === 256 ? 0 : img.width;
    const h = img.height === 256 ? 0 : img.height;
    
    entries.writeUInt8(w, i * entrySize + 0);
    entries.writeUInt8(h, i * entrySize + 1);
    entries.writeUInt8(0, i * entrySize + 2); // Color palette (0 for no palette)
    entries.writeUInt8(0, i * entrySize + 3); // Reserved
    entries.writeUInt16LE(1, i * entrySize + 4); // Color planes (1)
    entries.writeUInt16LE(32, i * entrySize + 6); // Bits per pixel (32)
    entries.writeUInt32LE(buf.length, i * entrySize + 8); // Image size
    entries.writeUInt32LE(offset, i * entrySize + 12); // Image offset

    dataBuffers.push(buf);
    offset += buf.length;
  }

  return Buffer.concat([header, entries, ...dataBuffers]);
}

async function main() {
  try {
    console.log('Generating high-quality icons from public/favicon.svg...');

    // 1. Generate favicon-512.png
    console.log('- Generating favicon-512.png...');
    await sharp(SVG_PATH)
      .resize(512, 512)
      .png()
      .toFile(path.join(PUBLIC_DIR, 'favicon-512.png'));

    // 2. Generate favicon-192.png
    console.log('- Generating favicon-192.png...');
    await sharp(SVG_PATH)
      .resize(192, 192)
      .png()
      .toFile(path.join(PUBLIC_DIR, 'favicon-192.png'));

    // 3. Generate apple-touch-icon.png
    console.log('- Generating apple-touch-icon.png...');
    await sharp(SVG_PATH)
      .resize(180, 180)
      .png()
      .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

    // 4. Generate favicon.ico (multi-resolution: 16x16, 32x32, 48x48)
    console.log('- Generating favicon.ico (16x16, 32x32, 48x48)...');
    const sizes = [16, 32, 48];
    const images = [];

    for (const size of sizes) {
      const buffer = await sharp(SVG_PATH)
        .resize(size, size)
        .png()
        .toBuffer();
      images.push({ buffer, width: size, height: size });
    }

    const icoBuffer = createIco(images);
    fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);

    console.log('🎉 All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
