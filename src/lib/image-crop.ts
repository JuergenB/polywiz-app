import sharp from "sharp";
import { uploadImage } from "@/lib/blob-storage";

/**
 * Platform aspect ratio limits.
 * Images outside these ranges will be center-cropped to 16:9 as a fallback.
 */
const PLATFORM_ASPECT_LIMITS: Record<string, { min: number; max: number }> = {
  instagram: { min: 0.8, max: 1.91 },  // 4:5 portrait to ~2:1 landscape
  threads: { min: 0.8, max: 1.91 },
  // Other platforms are more permissive — add as needed
};

const FALLBACK_RATIO = 16 / 9; // 1.778

/**
 * Check if an image URL needs aspect ratio correction for a given platform.
 * If so, download, center-crop to 16:9, upload to Vercel Blob, and return the new URL.
 * Returns the original URL if no correction is needed.
 */
export async function ensureAspectRatio(
  imageUrl: string,
  platform: string,
  entityId: string
): Promise<string> {
  const limits = PLATFORM_ASPECT_LIMITS[platform];
  if (!limits) return imageUrl;

  try {
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) return imageUrl;

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) return imageUrl;

    const ratio = metadata.width / metadata.height;

    // Within allowed range — no crop needed
    if (ratio >= limits.min && ratio <= limits.max) return imageUrl;

    console.log(
      `[image-crop] ${platform}: aspect ratio ${ratio.toFixed(2)} outside ${limits.min}-${limits.max}, cropping to 16:9`
    );

    // Center-crop to 16:9
    let cropWidth: number;
    let cropHeight: number;

    if (ratio > limits.max) {
      // Too wide — reduce width
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * FALLBACK_RATIO);
      // If still too wide after 16:9 crop (shouldn't happen), cap at source width
      if (cropWidth > metadata.width) cropWidth = metadata.width;
    } else {
      // Too tall — reduce height
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / FALLBACK_RATIO);
      if (cropHeight > metadata.height) cropHeight = metadata.height;
    }

    const cropped = await sharp(buffer)
      .extract({
        left: Math.round((metadata.width - cropWidth) / 2),
        top: Math.round((metadata.height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    console.log(
      `[image-crop] Cropped: ${metadata.width}x${metadata.height} → ${cropWidth}x${cropHeight} (${(cropped.length / 1024).toFixed(0)}KB)`
    );

    // Upload cropped image to Vercel Blob
    const newUrl = await uploadImage("posts", entityId, cropped, "image/jpeg");
    return newUrl;
  } catch (err) {
    console.warn("[image-crop] Failed, using original:", err);
    return imageUrl;
  }
}
