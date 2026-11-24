const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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

const S3_KEY_PREFIX = (process.env.AWS_S3_KEY_PREFIX || '').replace(
  /^\/+|\/+$/g,
  '',
);

function withS3Prefix(key) {
  return S3_KEY_PREFIX ? `${S3_KEY_PREFIX}/${key}` : key;
}

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

module.exports = {
  s3,
  s3Configured,
  presignS3Url,
  withS3Prefix,
};
