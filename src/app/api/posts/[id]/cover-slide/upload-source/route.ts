import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/blob-storage";

/**
 * POST /api/posts/[id]/cover-slide/upload-source
 *
 * Upload a raw image to Vercel Blob for use as a cover-slide background
 * source. Returns only the URL — does NOT mutate the post's media or any
 * Airtable field. The caller (cover slide designer) keeps the URL in local
 * session state and only persists it when the user applies the cover (at
 * which point it gets saved into CoverSlideData.sourceImageUrl via the main
 * cover-slide route).
 *
 * Accepts multipart/form-data with a "file" field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    const url = await uploadImage("posts", id, buffer, contentType);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[cover-slide/upload-source] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
