import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';

const bucketPrefix=process.env.MINIO_BUCKET_PREFIX || 'nudra';
if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(bucketPrefix)) throw new Error('Invalid MINIO_BUCKET_PREFIX');
export const THUMBNAIL_BUCKET = bucketPrefix+'-thumbnails';
export const RAW_VIDEO_BUCKET = bucketPrefix+'-raw-videos';
export const HLS_BUCKET = bucketPrefix+'-hls';

const isProduction = process.env.NODE_ENV === 'production';
const configuredEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
const storageEndpoint = /^https?:\/\//i.test(configuredEndpoint)
  ? configuredEndpoint.replace(/\/$/, '')
  : `http://${configuredEndpoint}:${process.env.MINIO_PORT || '9000'}`;
const accessKeyId = process.env.MINIO_ACCESS_KEY || (isProduction ? '' : 'nudra_minio');
const secretAccessKey = process.env.MINIO_SECRET_KEY || (isProduction ? '' : 'nudra_minio_secret');

if (isProduction && (!accessKeyId || !secretAccessKey)) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required in production');
}

export const minioClient = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint: storageEndpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 2500, requestTimeout: 30000 },
});

// Kept as a source-compatible alias for routes that still use the old name.
export const r2Client = minioClient;

const publicStorageUrl = isProduction
  ? process.env.PUBLIC_STORAGE_URL
  : process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000';

if (isProduction && !publicStorageUrl) {
  throw new Error('PUBLIC_STORAGE_URL is required in production');
}

export const PUBLIC_STORAGE_URL = String(publicStorageUrl || '').replace(/\/$/, '');

function encodedObjectPath(objectName: string): string {
  return objectName.split('/').map(encodeURIComponent).join('/');
}

export async function ensureBucket(): Promise<void> {
  for (const bucket of [THUMBNAIL_BUCKET, RAW_VIDEO_BUCKET, HLS_BUCKET]) {
    try {
      await minioClient.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`MinIO bucket reachable: ${bucket}`);
    } catch (headError) {
      try {
        await minioClient.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`MinIO bucket created: ${bucket}`);
      } catch (createError) {
        console.error(`MinIO bucket is missing or inaccessible: ${bucket}`, headError);
        throw createError;
      }
    }

    // Development uses direct browser access for public buckets. Production
    // access policies are applied by the VPS MinIO bootstrap, not by the API.
    if (!isProduction && bucket === THUMBNAIL_BUCKET) {
      const policy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        }],
      };
      await minioClient.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }));
    }
  }
}

export function getHlsObjectPrefix(lessonId: string): string {
  return `lessons/${lessonId}/`;
}

export function getHlsPlaylistKey(lessonId: string): string {
  return `${getHlsObjectPrefix(lessonId)}index.m3u8`;
}

export function getThumbnailUrl(objectName: string): string {
  return `${PUBLIC_STORAGE_URL}/${THUMBNAIL_BUCKET}/${encodedObjectPath(objectName)}`;
}

export async function getPresignedVideoUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 300
): Promise<string> {
  return await getSignedUrl(
    minioClient,
    new GetObjectCommand({ Bucket: bucket, Key: objectName }),
    { expiresIn: expirySeconds }
  );
}

export async function downloadObject(bucket: string, key: string, localPath: string): Promise<void> {
  const res = await minioClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for ${bucket}/${key}`);
  await pipeline(res.Body as Readable, createWriteStream(localPath));
}

export async function removeObject(bucket: string, key: string): Promise<void> {
  await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listRawVideoKeys(lessonId: string): Promise<string[]> {
  const found: { name: string; lastModified: Date }[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await minioClient.send(
      new ListObjectsV2Command({
        Bucket: RAW_VIDEO_BUCKET,
        Prefix: `lessons/raw/${lessonId}/`,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) found.push({ name: obj.Key, lastModified: obj.LastModified ?? new Date(0) });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return found.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).map((o) => o.name);
}

export const storage = {
  async bucketExists(bucket: string) {
    await minioClient.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(2500) });
    return true;
  },
  async getObject(bucket: string, key: string) {
    const res = await minioClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body as Readable;
  },
  async putObject(bucket: string, key: string, body: Buffer | Readable, _size?: number, meta?: Record<string, string>) {
    await minioClient.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body as never, ContentType: meta && meta['Content-Type'] }));
  },
  async removeObject(bucket: string, key: string) {
    await removeObject(bucket, key);
  },
  listObjectsV2(bucket: string, prefix: string, _recursive?: boolean) {
    return {
      [Symbol.asyncIterator]: async function* () {
        let token: string | undefined;
        do {
          const r = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
          for (const o of r.Contents ?? []) yield { name: o.Key, lastModified: o.LastModified };
          token = r.IsTruncated ? r.NextContinuationToken : undefined;
        } while (token);
      },
    };
  },
};
