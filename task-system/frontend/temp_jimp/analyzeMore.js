const Jimp = require('jimp');

async function analyzeMore() {
  const image = await Jimp.read('../Logo MG hogar.jpeg');
  let counts = {};
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    // quantize colors slightly to group them
    const rq = Math.floor(r/10)*10;
    const gq = Math.floor(g/10)*10;
    const bq = Math.floor(b/10)*10;
    const key = `${rq},${gq},${bq}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  console.log('Top 10 colors:', sorted.slice(0, 10));
}

analyzeMore().catch(console.error);
