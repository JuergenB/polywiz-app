import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MediaItem } from "@/lib/media-items";

/**
 * Assemble multiple images into a PDF document for LinkedIn carousel posts.
 *
 * Each image becomes one full-bleed page. If a caption is provided,
 * a dark bar with white centered text (up to 2 lines, word-wrapped) is
 * rendered at the bottom of the page. Font size and bar height scale
 * proportionally to the image dimensions.
 */
export async function assembleCarouselPDF(
  items: MediaItem[] | string[]
): Promise<Buffer> {
  // Normalize to MediaItem[]
  const mediaItems: MediaItem[] = typeof items[0] === "string"
    ? (items as string[]).map((url) => ({ url, caption: "" }))
    : (items as MediaItem[]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const item of mediaItems) {
    const response = await fetch(item.url);
    if (!response.ok) {
      console.warn(`[pdf-carousel] Failed to fetch image: ${item.url} (${response.status})`);
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";

    let image;
    try {
      if (contentType.includes("png")) {
        image = await pdfDoc.embedPng(bytes);
      } else {
        image = await pdfDoc.embedJpg(bytes);
      }
    } catch (err) {
      console.warn(`[pdf-carousel] Failed to embed image: ${item.url}`, err);
      continue;
    }

    const pageWidth = image.width;

    // Pre-rendered slides from the carousel slide generator already have captions
    // baked in — use them full-bleed without adding a PDF caption bar.
    // Detects both Instagram (1080x1350) and LinkedIn (1080x1080) slide dimensions.
    const isPreRenderedSlide =
      (image.width === 1080 && image.height === 1350) ||
      (image.width === 1080 && image.height === 1080);

    if (!item.caption || isPreRenderedSlide) {
      // No caption or pre-rendered slide — full-bleed image only
      const page = pdfDoc.addPage([pageWidth, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      continue;
    }

    // --- Proportional caption sizing ---
    const fontSize = Math.round(pageWidth * 0.012);
    const clampedFontSize = Math.max(14, Math.min(fontSize, 36));
    const lineHeight = clampedFontSize * 1.35;
    const padding = Math.round(pageWidth * 0.03);
    const maxTextWidth = pageWidth - padding * 2;
    const textFont = item.caption.length > 60 ? font : fontBold;

    // Word-wrap to max 2 lines
    const lines = wordWrap(item.caption, textFont, clampedFontSize, maxTextWidth, 2);

    const barHeight = Math.round(lineHeight * lines.length + padding * 1.2);
    const pageHeight = image.height + barHeight;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw image at top
    page.drawImage(image, {
      x: 0,
      y: barHeight,
      width: image.width,
      height: image.height,
    });

    // Dark background bar
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: barHeight,
      color: rgb(0.12, 0.12, 0.12),
    });

    // Draw each line centered
    for (let i = 0; i < lines.length; i++) {
      const textWidth = textFont.widthOfTextAtSize(lines[i], clampedFontSize);
      const textX = (pageWidth - textWidth) / 2;
      // First line at top of bar, last line at bottom
      const textY = barHeight - padding * 0.6 - lineHeight * (i + 1) + lineHeight * 0.35;

      page.drawText(lines[i], {
        x: textX,
        y: textY,
        size: clampedFontSize,
        font: textFont,
        color: rgb(1, 1, 1),
      });
    }
  }

  if (pdfDoc.getPageCount() === 0) {
    throw new Error("No images could be embedded in the PDF");
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Word-wrap text into up to `maxLines` lines that fit within `maxWidth`.
 * Truncates with ellipsis if the text doesn't fit in the allowed lines.
 */
function wordWrap(
  text: string,
  pdfFont: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (pdfFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        if (lines.length >= maxLines) break;
      }
      currentLine = word;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // If we ran out of lines but have remaining text, truncate the last line
  if (lines.length === maxLines) {
    const remainingWords = words.slice(
      words.indexOf(currentLine) !== -1 ? words.indexOf(currentLine) : words.length
    );
    // Check if there's text we didn't fit
    const allFitted = lines.join(" ").split(/\s+/).length >= words.length;
    if (!allFitted) {
      let lastLine = lines[maxLines - 1];
      // Add remaining words that fit, then ellipsis
      while (pdfFont.widthOfTextAtSize(lastLine + "…", fontSize) > maxWidth && lastLine.length > 3) {
        lastLine = lastLine.replace(/\s+\S+$/, "");
      }
      lines[maxLines - 1] = lastLine + "…";
    }
  }

  return lines.length > 0 ? lines : [text.slice(0, 20) + "…"];
}
