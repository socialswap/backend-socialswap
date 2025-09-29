// config/firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./socialswap-49189-firebase-adminsdk-fbsvc-13b4db401d.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
