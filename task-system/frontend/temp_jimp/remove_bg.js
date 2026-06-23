const Jimp = require('jimp');

async function removeBg() {
  const image = await Jimp.read('../Logo MG hogar.jpeg');
  
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const data = image.bitmap.data;
  
  // Flood fill algorithm to find background
  // We'll mark visited pixels in a 2D array or Set
  const visited = new Uint8Array(width * height);
  const queue = [];
  
  // Start from edges
  for (let x = 0; x < width; x++) {
    queue.push(x); // x
    queue.push(0); // y
    queue.push(x); // x
    queue.push(height - 1); // y
  }
  for (let y = 0; y < height; y++) {
    queue.push(0); // x
    queue.push(y); // y
    queue.push(width - 1); // x
    queue.push(y); // y
  }
  
  function isBgColor(x, y) {
    const idx = (width * y + x) << 2;
    const r = data[idx + 0];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // White/off-white background
    return (r > 240 && g > 240 && b > 240);
  }

  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    
    const vIdx = y * width + x;
    if (visited[vIdx]) continue;
    
    if (isBgColor(x, y)) {
      visited[vIdx] = 1;
      // Make it transparent
      const dIdx = vIdx << 2;
      data[dIdx + 0] = 255;
      data[dIdx + 1] = 255;
      data[dIdx + 2] = 255;
      data[dIdx + 3] = 0; // transparent
      
      // push neighbors
      queue.push(x + 1, y);
      queue.push(x - 1, y);
      queue.push(x, y + 1);
      queue.push(x, y - 1);
    }
  }

  // Also do a small pass to anti-alias edges?
  // Let's just output it first.
  await image.writeAsync('../logo_transparent.png');
  console.log('Done removing background');
}

removeBg().catch(console.error);
