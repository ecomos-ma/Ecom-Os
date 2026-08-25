const sharp = require('sharp');
const path = require('path');

const input = path.join(__dirname, '..', 'public', '1.png');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  for (const size of sizes) {
    const output = path.join(__dirname, '..', 'public', `icon-${size}.png`);
    await sharp(input).resize(size, size).png().toFile(output);
    console.log(`Created ${output}`);
  }
  await sharp(input).resize(512, 512).png().toFile(path.join(__dirname, '..', 'public', 'maskable-icon-512.png'));
  console.log('Created public/maskable-icon-512.png');
  await sharp(input).resize(180, 180).png().toFile(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'));
  console.log('Created public/apple-touch-icon.png');
  await sharp(input).resize(48, 48).png().toFile(path.join(__dirname, '..', 'public', 'favicon.png'));
  console.log('Created public/favicon.png');
}

generate().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exit(1);
});