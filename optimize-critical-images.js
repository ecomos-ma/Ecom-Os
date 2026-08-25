// Script to optimize critical images
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

async function optimizeImage(inputPath, outputPath, width, height, quality = 80) {
  try {
    console.log(`Optimizing ${inputPath}...`);
    
    const inputBuffer = readFileSync(inputPath);
    console.log(`  Original size: ${inputBuffer.length} bytes (${(inputBuffer.length / 1024).toFixed(2)} KB)`);

    // Optimize: resize to target dimensions, convert to WebP with quality
    const optimized = await sharp(inputBuffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality })
      .toBuffer();

    console.log(`  Optimized size: ${optimized.length} bytes (${(optimized.length / 1024).toFixed(2)} KB)`);
    console.log(`  Reduction: ${((1 - optimized.length / inputBuffer.length) * 100).toFixed(1)}%`);

    // Change extension to .webp
    const webpOutputPath = outputPath.replace(/\.[^.]+$/, '.webp');
    writeFileSync(webpOutputPath, optimized);
    console.log(`  Saved to ${webpOutputPath}`);
    return { original: inputBuffer.length, optimized: optimized.length, newPath: webpOutputPath };
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error);
    return null;
  }
}

async function main() {
  console.log('=== Critical Image Optimization ===\n');

  // Login hero image - likely displayed at ~800x600 or similar
  const loginResult = await optimizeImage(
    'src/assets/ChatGPT Image Aug 9, 2026, 09_03_26 PM.png',
    'src/assets/ChatGPT Image Aug 9, 2026, 09_03_26 PM.png',
    800,
    600,
    75
  );

  console.log();

  // Sidebar icon - displayed at 36x36 but file is 1024x1024
  const sidebarResult = await optimizeImage(
    'src/assets/AppStore_iOS_1024x1024.png',
    'src/assets/AppStore_iOS_1024x1024.png',
    64,
    64,
    80
  );

  console.log();

  console.log('=== Summary ===');
  if (loginResult && sidebarResult) {
    const totalOriginal = loginResult.original + sidebarResult.original;
    const totalOptimized = loginResult.optimized + sidebarResult.optimized;
    console.log(`Total original: ${totalOriginal} bytes (${(totalOriginal / 1024).toFixed(2)} KB)`);
    console.log(`Total optimized: ${totalOptimized} bytes (${(totalOptimized / 1024).toFixed(2)} KB)`);
    console.log(`Total reduction: ${((1 - totalOptimized / totalOriginal) * 100).toFixed(1)}%`);
    console.log(`Space saved: ${((totalOriginal - totalOptimized) / 1024).toFixed(2)} KB`);
    
    console.log('\n=== Next Steps ===');
    console.log('1. Update imports in the source files:');
    console.log(`   - Login.tsx: import heroImage from "../assets/ChatGPT Image Aug 9, 2026, 09_03_26 PM.webp"`);
    console.log(`   - Sidebar.tsx: import ecomosIconMark from "../assets/AppStore_iOS_1024x1024.webp"`);
  }
}

main();
