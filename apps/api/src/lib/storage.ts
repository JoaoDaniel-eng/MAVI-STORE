import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IMAGE_TYPES } from "@mavi/shared";
import { env } from "../config/env";
import { AppError } from "../middleware/errors";

export const storageReady = () =>
  Boolean(
    env.STORAGE_BUCKET &&
      env.STORAGE_ACCESS_KEY &&
      env.STORAGE_SECRET_KEY &&
      env.STORAGE_ENDPOINT &&
      env.STORAGE_PUBLIC_URL,
  );

let client: S3Client | undefined;
function s3(): { c: S3Client; bucket: string } {
  if (!storageReady()) {
    throw new AppError(503, "storage_pending", "Armazenamento de imagens pendente de credenciais.");
  }
  client ??= new S3Client({
    region: "auto", // Cloudflare R2; para S3 puro, ajustar a região
    endpoint: env.STORAGE_ENDPOINT!,
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY!, secretAccessKey: env.STORAGE_SECRET_KEY! },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return { c: client, bucket: env.STORAGE_BUCKET! };
}

export const publicUrlFor = (key: string) => `${env.STORAGE_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;

export async function presignImageUpload(
  contentType: keyof typeof IMAGE_TYPES,
  size: number,
  purpose: "product" | "content" = "product",
) {
  const { c, bucket } = s3();
  const key = `${purpose === "content" ? "content" : "products"}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;
  const uploadUrl = await getSignedUrl(
    c,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300 },
  );
  return { key, uploadUrl, publicUrl: publicUrlFor(key), headers: { "Content-Type": contentType } };
}

/** Confirma que o arquivo realmente foi enviado antes de registrá-lo. */
export async function assertObjectExists(key: string) {
  const { c, bucket } = s3();
  try {
    await c.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    throw new AppError(400, "upload_not_found", "Arquivo não encontrado no armazenamento. Envie a imagem primeiro.");
  }
}

export async function deleteObject(key: string) {
  try {
    const { c, bucket } = s3();
    await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.error("Falha ao apagar objeto do storage:", key, err);
  }
}
