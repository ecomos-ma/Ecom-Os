import { Jimp } from 'jimp';

const input = 'public/1.png';
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function writeImage(image, output) {
  return new Promise((resolve, reject) => {
    image.write(output, (err) => {
      if (err) return reject(err);
      resolve(output);
    });
  });
}

async function generate() {
  const image = await Jimp.read(input);
  for (const size of sizes) {
    const output = `public/icon-${size}.png`;
    const clone = image.clone().resize({ w: size, h: size, mode: Jimp.RESIZE_BICUBIC });
    await writeImage(clone, output);
    console.log(`Created ${output}`);
  }
  const mask = image.clone().resize({ w: 512, h: 512, mode: Jimp.RESIZE_BICUBIC });
  await writeImage(mask, 'public/maskable-icon-512.png');
  console.log('Created public/maskable-icon-512.png');
  const apple = image.clone().resize({ w: 180, h: 180, mode: Jimp.RESIZE_BICUBIC });
  await writeImage(apple, 'public/apple-touch-icon.png');
  console.log('Created public/apple-touch-icon.png');
  const favicon = image.clone().resize({ w: 48, h: 48, mode: Jimp.RESIZE_BICUBIC });
  await writeImage(favicon, 'public/favicon.png');
  console.log('Created public/favicon.png');
  try {
    const ico = image.clone().resize({ w: 48, h: 48, mode: Jimp.RESIZE_BICUBIC });
    await writeImage(ico, 'public/favicon.ico');
    console.log('Created public/favicon.ico');
  } catch (err) {
    console.warn('Could not create favicon.ico, PNG favicon is available.', err);
  }
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});