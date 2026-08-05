require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const axios = require('axios');
const { uploadToR2 } = require('./config/r2');
const jwt = require('jsonwebtoken');

async function testEndpoint() {
  try {
    console.log("Uploading dummy image...");
    const dummyBuffer = Buffer.from('test image content');
    const url = await uploadToR2(dummyBuffer, 'test.webp', 'image/webp');
    console.log("Uploaded successfully:", url);

    // Generate a dummy admin token
    const secret = process.env.JWT_SECRET;
    const token = jwt.sign({ userId: 'dummy', role: 'admin' }, secret, { expiresIn: '1h' });

    console.log("Calling API to delete image...");
    const response = await axios.delete(`http://localhost:8090/api/admin/blogs/delete-image?imageUrl=${encodeURIComponent(url)}`, {
      headers: {
        'x-auth-token': token
      }
    });

    console.log("API response:", response.data);
  } catch (err) {
    console.error("Test failed:", err.response ? err.response.data : err.message);
  }
}

testEndpoint();
