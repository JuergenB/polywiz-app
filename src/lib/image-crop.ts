import sharp from "sharp";
import { uploadImage } from "@/lib/blob-storage";
import { outpaintImage } from "@/lib/replicate-outpaint";

/**
 * Platform aspect ratio limits. If a source image is outside [min, max] we bring it into range.
 * By default we CLAMP (center-crop to the nearest boundary), which preserves the maximum amount
 * of source detail. When a brand opts in (Brand.outpaintInsteadOfCrop === true), we OUTPAINT via
 * Replicate Bria to extend the narrow axis to the nearest boundary instead — zero editorial loss.
 */
const PLATFORM_ASPECT_LIMITS: Record<string, { min: number; max: number }> = {
  instagram: { min: 0.8, max: 1.91 },
  threads: { min: 0.8, max: 1.91 },
};

export interface EnsureAspectRatioOptions {
  /** When true, outpaint to the nearest valid aspect instead of center-cropping. Falls back to clamp-crop on outpaint failure. */
  outpaintInsteadOfCrop?: boolean;
}

/**
 * Ensure an image satisfies a platform's aspect constraints, re-upload if we had to change it, and
 * return a URL that's safe to publish. If the source is already in range, returns the original URL.
 */
export async function ensureAspectRatio(
  imageUrl: string,
  platform: string,
  entityId: string,
  opts: EnsureAspectRatioOptions = {}
): Promise<string> {
  const limits = PLATFORM_ASPECT_LIMITS[platform];
  if (!limits) return imageUrl;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return imageUrl;

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return imageUrl;

    const ratio = metadata.width / metadata.height;
    if (ratio >= limits.min && ratio <= limits.max) return imageUrl;

    // Clamp to the nearest valid ratio (not a hardcoded 16:9). Preserves the most source detail.
    const targetRatio = ratio < limits.min ? limits.min : limits.max;

    // Opt-in path: outpaint instead of cropping, so no pixels are discarded.
    if (opts.outpaintInsteadOfCrop) {
      try {
        const targetWidth =
          ratio < limits.min
            ? Math.round(metadata.height * targetRatio) // widen
            : metadata.width;
        const targetHeight =
          ratio < limits.min
            ? metadata.height
            : Math.round(metadata.width / targetRatio); // heighten
        console.log(
          `[image-crop] ${platform}: outpainting ${metadata.width}x${metadata.height} (${ratio.toFixed(2)}) → ${targetWidth}x${targetHeight} (${targetRatio.toFixed(2)})`
        );
        const outpainted = await outpaintImage(
          imageUrl,
          targetWidth,
          targetHeight,
          undefined,
          metadata.width,
          metadata.height
        );
        return outpainted.url;
      } catch (err) {
        console.warn(`[image-crop] Outpaint failed, falling back to clamp-crop:`, err);
        // fall through to crop
      }
    }

    // Default path: center-crop to the nearest valid ratio.
    console.log(
      `[image-crop] ${platform}: aspect ${ratio.toFixed(2)} outside [${limits.min}, ${limits.max}], clamping to ${targetRatio.toFixed(2)}`
    );

    let cropWidth: number;
    let cropHeight: number;
    if (ratio > limits.max) {
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * targetRatio);
      if (cropWidth > metadata.width) cropWidth = metadata.width;
    } else {
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / targetRatio);
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

    return await uploadImage("posts", entityId, cropped, "image/jpeg");
  } catch (err) {
    console.warn("[image-crop] Failed, using original:", err);
    return imageUrl;
  }
}
