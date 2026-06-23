const Jimp = require('jimp');

async function analyze() {
  const image = await Jimp.read('../Logo MG hogar.jpeg');
  console.log('Width:', image.bitmap.width, 'Height:', image.bitmap.height);
  
  // Corners
  const c1 = image.getPixelColor(0, 0);
  const c2 = image.getPixelColor(image.bitmap.width - 1, 0);
  const c3 = image.getPixelColor(0, image.bitmap.height - 1);
  const c4 = image.getPixelColor(image.bitmap.width - 1, image.bitmap.height - 1);
  
  console.log('Corners (RGBA):');
  console.log(Jimp.intToRGBA(c1));
  console.log(Jimp.intToRGBA(c2));
  console.log(Jimp.intToRGBA(c3));
  console.log(Jimp.intToRGBA(c4));
}

analyze().catch(console.error);
