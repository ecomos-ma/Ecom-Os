import { Jimp } from 'jimp';

async function inspect() {
  const img = await Jimp.read('public/1.png');
  const proto = Object.getPrototypeOf(img);
  console.log('resize exists', typeof img.resize);
  console.log('writeAsync exists', typeof img.writeAsync);
  console.log('write exists', typeof img.write);
  console.log('keys', Object.getOwnPropertyNames(proto).filter((key) => key.includes('write') || key.includes('resize') || key.includes('clone')));
}

inspect().catch((error) => {
  console.error('inspect failed', error);
  process.exit(1);
});