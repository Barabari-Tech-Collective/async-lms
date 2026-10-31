const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { withS3Prefix } = require('../utils/s3');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3Configured = () =>
  !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );

async function presignS3Url(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.includes('X-Amz-Signature') || trimmed.includes('AWSAccessKeyId')) return trimmed;
  if (!trimmed.includes('.amazonaws.com/')) return trimmed;
  try {
    const { hostname, pathname } = new URL(trimmed);
    let bucket = '';
    let key = '';
    if (hostname.startsWith('s3.') || hostname.startsWith('s3-')) {
      const parts = pathname.slice(1).split('/');
      bucket = parts[0];
      key = decodeURIComponent(parts.slice(1).join('/'));
    } else {
      bucket = hostname.split('.')[0];
      key = decodeURIComponent(pathname.slice(1));
    }
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
  } catch {
    return url;
  }
}

async function storeFile(file, { s3KeyPrefix, localSubPath }) {
  const safeName = file.originalname
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  const filename = `${Date.now()}-${safeName}`;

  if (s3Configured()) {
    try {
      const key = withS3Prefix(`${s3KeyPrefix}/${filename}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      console.log('S3 upload success:', url);
      return { url, name: file.originalname };
    } catch (s3Error) {
      console.error('S3 upload failed, using local fallback:', s3Error);
    }
  } else {
    console.log('S3 not configured, using local storage fallback');
  }

  // Local fallback
  const uploadDir = localSubPath
    ? path.join(__dirname, '..', 'public', 'uploads', localSubPath)
    : path.join(__dirname, '..', 'public', 'uploads');
  await mkdirAsync(uploadDir, { recursive: true });
  await writeFileAsync(path.join(uploadDir, filename), file.buffer);
  const base =
    process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
  const urlPath = localSubPath
    ? `uploads/${localSubPath}/${filename}`
    : `uploads/${filename}`;
  const url = `${base}/${urlPath}`;
  console.log('Local upload success:', url);
  return { url, name: file.originalname };
}

module.exports = {
  s3,
  s3Configured,
  presignS3Url,
  storeFile,
};
