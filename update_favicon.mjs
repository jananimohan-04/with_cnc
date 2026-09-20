import sharp from 'sharp';

async function generateFavicon() {
  const inputImage = 'public/arguscnc-logo.jpg';
  
  // Create a square favicon containing the full logo, padded with white
  await sharp(inputImage)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile('public/favicon.ico');
    
  await sharp(inputImage)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile('public/apple-touch-icon.png');
    
  // Also update the mark if it's used in the collapsed sidebar
  // Wait, if they want the full logo in the favicon, they might want the full logo in the collapsed sidebar too, or maybe just padded.
  await sharp(inputImage)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile('public/arguscnc-mark.jpg');

  console.log("Updated favicons with full logo");
}

generateFavicon().catch(console.error);
