import { Client } from 'minio';

export const THUMBNAIL_BUCKET = 'nudra-thumbnails';
export const RAW_VIDEO_BUCKET = 'nudra-raw-videos';
export const HLS_BUCKET = 'nudra-hls';

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'nudra_minio',
  secretKey: process.env.MINIO_SECRET_KEY || 'nudra_minio_secret',
});

export const MINIO_PUBLIC_ENDPOINT =
  process.env.MINIO_PUBLIC_ENDPOINT ||
  `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`;

function publicReadPolicy(bucket: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: ['arn:aws:s3:::' + bucket + '/*'],
      },
    ],
  };
}

function privatePolicy(bucket: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Deny',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: ['arn:aws:s3:::' + bucket + '/*'],
      },
    ],
  };
}

async function ensurePublicBucket(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
  }
  await minioClient.setBucketPolicy(bucket, JSON.stringify(publicReadPolicy(bucket)));
  console.log('MinIO bucket ready: ' + bucket);
}

async function ensurePrivateBucket(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
  }
  await minioClient.setBucketPolicy(bucket, JSON.stringify(privatePolicy(bucket)));
  console.log('MinIO bucket ready: ' + bucket);
}

export async function ensureBucket(): Promise<void> {
  try {
    await ensurePublicBucket(THUMBNAIL_BUCKET);
    await ensurePrivateBucket(RAW_VIDEO_BUCKET);
    await ensurePublicBucket(HLS_BUCKET);
  } catch (err) {
    console.error('MinIO bucket setup failed', err);
  }
}

export function getHlsObjectPrefix(lessonId: string): string {
  return `lessons/${lessonId}/`;
}

export function getHlsPlaylistKey(lessonId: string): string {
  return `${getHlsObjectPrefix(lessonId)}index.m3u8`;
}

export function getThumbnailUrl(objectName: string): string {
  return `${MINIO_PUBLIC_ENDPOINT}/${THUMBNAIL_BUCKET}/${objectName}`;
}

export async function getPresignedVideoUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 300
): Promise<string> {
  return await minioClient.presignedGetObject(bucket, objectName, expirySeconds);
}

/** Raw uploads live at lessons/raw/<lessonId>/<uuid>.<ext>; newest first. */
export async function listRawVideoKeys(lessonId: string): Promise<string[]> {
  const found: { name: string; lastModified: Date }[] = [];
  const stream = minioClient.listObjectsV2(RAW_VIDEO_BUCKET, `lessons/raw/${lessonId}/`, true);
  for await (const obj of stream as AsyncIterable<{ name?: string; lastModified?: Date }>) {
    if (obj.name) found.push({ name: obj.name, lastModified: obj.lastModified ?? new Date(0) });
  }
  return found.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).map((o) => o.name);
}
