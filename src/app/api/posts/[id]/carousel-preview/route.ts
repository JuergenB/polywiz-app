import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { parseMediaItems, serializeMediaItems, type MediaItem } from "@/lib/media-items";
import { renderCarouselSlides, type SlideOptions, type RGB } from "@/lib/image-caption";
import { uploadImage } from "@/lib/blob-storage";

interface PostFields {
  Content: string;
  Platform: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
}

/**
 * POST /api/posts/[id]/carousel-preview
 *
 * Render Instagram carousel slides with adaptive frame color and captions.
 *
 * Body:
 *   - apply: boolean — false = return base64 previews, true = upload to Blob + update post
 *   - slideOptions: SlideOptions[] — optional per-slide options:
 *       { frameColor?: {r,g,b}, removeColor?: {r,g,b}, removeTolerance?: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const apply = body.apply === true;
    const slideOptions: (SlideOptions | undefined)[] | undefined = body.slideOptions;
    const platform: string | undefined = body.platform;

    const post = await getRecord<PostFields>("Posts", id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Use platform from request body, fall back to post's platform
    const resolvedPlatform = platform || (post.fields.Platform || "instagram").toLowerCase();

    const mediaItems = parseMediaItems(post.fields);
    if (mediaItems.length < 2) {
      return NextResponse.json(
        { error: "Carousel requires at least 2 images" },
        { status: 400 }
      );
    }

    // Render all slides with platform-specific dimensions
    const slideResults = await renderCarouselSlides(mediaItems, slideOptions, resolvedPlatform);

    if (!apply) {
      // Preview mode: return base64 data URIs + frame colors used
      const previews = slideResults.map((result, i) => ({
        index: i,
        dataUri: `data:image/jpeg;base64,${result.buffer.toString("base64")}`,
        caption: mediaItems[i]?.caption || "",
        frameColor: result.frameColor,
      }));

      return NextResponse.json({ previews });
    }

    // Apply mode: upload rendered slides to Vercel Blob, update post
    const newMediaItems: MediaItem[] = [];
    for (let i = 0; i < slideResults.length; i++) {
      const url = await uploadImage("posts", id, slideResults[i].buffer, "image/jpeg");
      newMediaItems.push({
        url,
        caption: mediaItems[i]?.caption || "",
      });
    }

    const serialized = serializeMediaItems(newMediaItems);
    await updateRecord("Posts", id, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
    });

    return NextResponse.json({
      applied: true,
      mediaItems: newMediaItems,
    });
  } catch (err) {
    console.error("[carousel-preview] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to render carousel slides" },
      { status: 500 }
    );
  }
}
