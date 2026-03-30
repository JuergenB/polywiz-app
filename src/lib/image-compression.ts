"use client";

import imageCompression from "browser-image-compression";

const MAX_SIZE_MB = 2;
const MAX_DIMENSION = 2048;
const SKIP_THRESHOLD_KB = 200;

const VALID_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function validateImage(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!VALID_IMAGE_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Unsupported image type: ${file.type}. Use JPEG, PNG, WebP, or GIF.`,
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is ${sizeMB}MB — maximum is 10MB. Try a smaller image.`,
    };
  }

  return { valid: true };
}

/** Check if a PNG has transparency. Uses OffscreenCanvas with a timeout to avoid hanging. */
async function hasTransparency(file: File): Promise<boolean> {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;

    const result = await Promise.race([
      (async () => {
        const bitmap = await createImageBitmap(file);
        const canvas = new OffscreenCanvas(
          Math.min(bitmap.width, 64),
          Math.min(bitmap.height, 64)
        );
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) return true;
        }
        return false;
      })(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);

    return result;
  } catch {
    return false;
  }
}

export async function compressImage(file: File): Promise<File> {
  // Skip compression for small files or GIFs (animated)
  if (file.size < SKIP_THRESHOLD_KB * 1024 || file.type === "image/gif") {
    return file;
  }

  // Convert PNG/WebP to JPEG if no transparency (much smaller for photos)
  let outputType: string | undefined;
  if (file.type === "image/png" || file.type === "image/webp") {
    const transparent = await hasTransparency(file);
    if (!transparent) {
      outputType = "image/jpeg";
    }
  }

  try {
    // Timeout the entire compression to 15 seconds
    const compressed = await Promise.race([
      imageCompression(file, {
        maxSizeMB: MAX_SIZE_MB,
        maxWidthOrHeight: MAX_DIMENSION,
        useWebWorker: true,
        initialQuality: 0.75,
        fileType: outputType,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Compression timed out")), 15000)
      ),
    ]);

    const converted = outputType && outputType !== file.type
      ? ` [${file.type.split("/")[1]} → ${outputType.split("/")[1]}]`
      : "";

    console.log(
      `Image compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${((1 - compressed.size / file.size) * 100).toFixed(0)}% reduction)${converted}`
    );

    return compressed;
  } catch (err) {
    console.warn("Image compression failed, using original:", err);
    return file;
  }
}
