import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord, listRecords } from "@/lib/airtable/client";

interface CampaignFields {
  Status: string;
}

/**
 * POST /api/campaigns/[id]/reset
 *
 * Reset a campaign to Draft status by deleting all generated posts
 * and reverting the status. Used during development/testing to
 * allow regeneration without deleting the entire campaign.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const campaign = await getRecord<CampaignFields>("Campaigns", id);
    const status = campaign.fields.Status;

    // Only allow reset from Review, Generating, Scraping, or Failed
    const resettableStatuses = ["Review", "Generating", "Scraping", "Failed"];
    if (!resettableStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Cannot reset a campaign in "${status}" status. Only Review, Generating, Scraping, or Failed campaigns can be reset.` },
        { status: 400 }
      );
    }

    // Delete all linked posts
    const allPosts = await listRecords<{ Campaign: string[] }>("Posts", {});
    const linkedPosts = allPosts.filter(
      (r) => r.fields.Campaign && r.fields.Campaign.includes(id)
    );

    for (const post of linkedPosts) {
      await deleteRecord("Posts", post.id);
    }

    // Reset campaign status to Draft
    await updateRecord("Campaigns", id, { Status: "Draft" });

    return NextResponse.json({
      success: true,
      deletedPosts: linkedPosts.length,
    });
  } catch (error) {
    console.error("Failed to reset campaign:", error);
    return NextResponse.json(
      { error: "Failed to reset campaign" },
      { status: 500 }
    );
  }
}
