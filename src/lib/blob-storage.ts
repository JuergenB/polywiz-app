import { put, del } from "@vercel/blob";
import { randomBytes } from "crypto";

function generatePath(prefix: string, id: string, ext: string): string {
  const timestamp = Date.now();
  const hex = randomBytes(4).toString("hex");
  return `images/${prefix}/${id}/${timestamp}-${hex}.${ext}`;
}

function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[contentType] || "jpg";
}

export async function uploadImage(
  prefix: "campaigns" | "posts" | "brands",
  entityId: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const ext = extFromContentType(contentType);
  const path = generatePath(prefix, entityId, ext);

  const blob = await put(path, buffer, {
    access: "public",
    contentType,
  });

  return blob.url;
}

export async function deleteImage(url: string): Promise<void> {
  await del(url);
}

/** Check if a URL is a Vercel Blob URL. */
export function isBlobUrl(url: string): boolean {
  return url.includes(".public.blob.vercel-storage.com/");
}
