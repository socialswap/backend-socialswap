const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

// Defensive dotenv loading to support any loading order or scripts
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let s3ClientInstance = null;

const getS3Client = () => {
  if (!s3ClientInstance) {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      console.error("R2 credentials not fully loaded in process.env:", {
        endpoint: !!endpoint,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey
      });
    }

    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
};

const uploadToR2 = async (fileBuffer, originalName, mimeType) => {
  try {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

    if (!bucketName) {
      throw new Error("CLOUDFLARE_R2_BUCKET_NAME is not defined in environment variables");
    }

    const fileExtension = originalName.split('.').pop() || 'webp';
    const key = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    };

    const client = getS3Client();
    const command = new PutObjectCommand(uploadParams);
    await client.send(command);

    return `${publicUrl}/${key}`;
  } catch (error) {
    console.error('R2 upload error:', error);
    throw new Error('R2 upload failed: ' + error.message);
  }
};

const deleteFromR2 = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

    if (!bucketName) {
      throw new Error("CLOUDFLARE_R2_BUCKET_NAME is not defined in environment variables");
    }

    let key = '';
    if (publicUrl && fileUrl.startsWith(publicUrl)) {
      key = fileUrl.replace(`${publicUrl}/`, '');
    } else {
      key = fileUrl.split('/').pop();
    }

    if (!key) return;

    const deleteParams = {
      Bucket: bucketName,
      Key: key,
    };

    const client = getS3Client();
    const command = new DeleteObjectCommand(deleteParams);
    await client.send(command);
  } catch (error) {
    console.error('R2 delete error:', error);
  }
};

module.exports = {
  uploadToR2,
  deleteFromR2,
};
