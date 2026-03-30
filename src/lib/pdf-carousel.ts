import { PDFDocument } from "pdf-lib";

/**
 * Assemble multiple images into a PDF document for LinkedIn carousel posts.
 *
 * Each image becomes one full-bleed page sized to the image dimensions.
 * LinkedIn renders each page as a swipeable carousel slide.
 *
 * Limits: 100MB max, ~300 pages max (LinkedIn).
 * Typical usage: 2-10 slides of web-optimized images = well under 5MB.
 */
export async function assembleCarouselPDF(
  imageUrls: string[]
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const url of imageUrls) {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[pdf-carousel] Failed to fetch image: ${url} (${response.status})`);
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";

    let image;
    try {
      if (contentType.includes("png")) {
        image = await pdfDoc.embedPng(bytes);
      } else {
        // JPEG is the default — works for jpg, webp converted by CDN, etc.
        image = await pdfDoc.embedJpg(bytes);
      }
    } catch (err) {
      console.warn(`[pdf-carousel] Failed to embed image: ${url}`, err);
      continue;
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  if (pdfDoc.getPageCount() === 0) {
    throw new Error("No images could be embedded in the PDF");
  }

  return Buffer.from(await pdfDoc.save());
}
