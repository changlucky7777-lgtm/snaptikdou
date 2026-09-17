const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const svgPath = path.join(__dirname, '../public/logo.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  // 1. Generate logo-512.png (512x512)
  const logo512Path = path.join(__dirname, '../public/logo-512.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(logo512Path);
  console.log('Generated public/logo-512.png (512x512)');

  // 2. Generate favicon.png (64x64)
  const faviconPath = path.join(__dirname, '../public/favicon.png');
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(faviconPath);
  console.log('Generated public/favicon.png (64x64)');

  // 3. Generate favicon.ico (48x48) & apple-touch-icon (180x180)
  const icoPath = path.join(__dirname, '../public/favicon.ico');
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(icoPath);
  console.log('Generated public/favicon.ico (48x48)');

  const appleIconPath = path.join(__dirname, '../public/apple-touch-icon.png');
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(appleIconPath);
  console.log('Generated public/apple-touch-icon.png (180x180)');
}

generate().catch(console.error);
