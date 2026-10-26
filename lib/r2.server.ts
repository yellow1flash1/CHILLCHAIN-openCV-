// Server-only. Cloudflare R2 through its S3-compatible API. The browser uploads straight to R2 with a short-lived presigned URL.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function r2() {
  const account = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];
  if (!account || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error("Photo storage is not configured");
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { s3, bucket };
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  const { s3, bucket } = r2();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

export async function presignGet(key: string): Promise<string> {
  const { s3, bucket } = r2();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 600 });
}
