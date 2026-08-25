// Script to optimize PWA icons using sharp
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';

async function optimizeIcon(inputPath, outputPath, size) {
  try {
    console.log(`Optimizing ${inputPath}...`);
    
    const inputBuffer = readFileSync(inputPath);
    console.log(`  Original size: ${inputBuffer.length} bytes (${(inputBuffer.length / 1024).toFixed(2)} KB)`);

    // Optimize PNG: resize to exact dimensions, compress
    const optimized = await sharp(inputBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true
      })
      .toBuffer();

    console.log(`  Optimized size: ${optimized.length} bytes (${(optimized.length / 1024).toFixed(2)} KB)`);
    console.log(`  Reduction: ${((1 - optimized.length / inputBuffer.length) * 100).toFixed(1)}%`);

    writeFileSync(outputPath, optimized);
    console.log(`  Saved to ${outputPath}`);
    return { original: inputBuffer.length, optimized: optimized.length };
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error);
    return null;
  }
}

async function main() {
  console.log('=== PWA Icon Optimization ===\n');

  const icons = [
    { input: 'public/icon-384.png', output: 'public/icon-384.png', size: 384 },
    { input: 'public/icon-512.png', output: 'public/icon-512.png', size: 512 },
    { input: 'public/maskable-icon-512.png', output: 'public/maskable-icon-512.png', size: 512 },
  ];

  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const icon of icons) {
    const result = await optimizeIcon(icon.input, icon.output, icon.size);
    if (result) {
      totalOriginal += result.original;
      totalOptimized += result.optimized;
    }
    console.log();
  }

  console.log('=== Summary ===');
  console.log(`Total original: ${totalOriginal} bytes (${(totalOriginal / 1024).toFixed(2)} KB)`);
  console.log(`Total optimized: ${totalOptimized} bytes (${(totalOptimized / 1024).toFixed(2)} KB)`);
  console.log(`Total reduction: ${((1 - totalOptimized / totalOriginal) * 100).toFixed(1)}%`);
  console.log(`Space saved: ${((totalOriginal - totalOptimized) / 1024).toFixed(2)} KB`);
}

main();
