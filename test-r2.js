require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { uploadToR2, deleteFromR2 } = require('./config/r2');
const https = require('https');

async function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode);
    }).on('error', (e) => {
      resolve(e.message);
    });
  });
}

async function testR2() {
  try {
    console.log("Uploading dummy image...");
    const dummyBuffer = Buffer.from('test image content');
    const url = await uploadToR2(dummyBuffer, 'test.webp', 'image/webp');
    console.log("Uploaded successfully:", url);

    console.log("Checking status:", await checkUrl(url));

    console.log("Waiting 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Deleting dummy image...");
    await deleteFromR2(url);
    console.log("Deleted successfully.");
    
    console.log("Waiting 2 seconds for propagation...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("Checking status after delete:", await checkUrl(url));
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testR2();
