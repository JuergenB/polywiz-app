import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord, listRecords } from "@/lib/airtable/client";
import { deleteShortLinks } from "@/lib/short-io";
import { deleteLnkBioEntry, resolveCredentials as resolveLnkBioCredentials } from "@/lib/lnk-bio";
import { createBrandClient } from "@/lib/late-api/client";

interface CampaignFields {
  Status: string;
  Brand: string[];
}

interface PostFields {
  Campaign: string[];
  "Short URL": string;
  "Zernio Post ID": string;
  "Lnk.Bio Entry ID": string;
}

interface BrandFields {
  "Short Domain": string;
  "Short API Key Label": string;
  "Zernio API Key Label": string;
  "Lnk.Bio Enabled": boolean;
  "Lnk.Bio Client ID Label": string;
  "Lnk.Bio Client Secret Label": string;
}

/**
 * POST /api/campaigns/[id]/reset
 *
 * Reset a campaign to Draft status by deleting all generated posts
 * (and their Short.io links) and reverting the status.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const campaign = await getRecord<CampaignFields>("Campaigns", id);
    const status = campaign.fields.Status;

    // Only allow reset from Review, Generating, Scraping, Failed, or Active
    const resettableStatuses = ["Review", "Generating", "Scraping", "Failed", "Active"];
    if (!resettableStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Cannot reset a campaign in "${status}" status. Only Review, Generating, Scraping, Failed, or Active campaigns can be reset.` },
        { status: 400 }
      );
    }

    // Resolve brand for Short.io key + lnk.bio credentials + Zernio key (single fetch)
    let brand: { shortDomain?: string | null; shortApiKeyLabel?: string | null } | undefined;
    let lnkBioCreds: ReturnType<typeof resolveLnkBioCredentials> = null;
    let zernioApiKeyLabel: string | null = null;
    const brandId = campaign.fields.Brand?.[0];
    if (brandId) {
      try {
        const brandRecord = await getRecord<BrandFields>("Brands", brandId);
        brand = {
          shortDomain: brandRecord.fields["Short Domain"] || null,
          shortApiKeyLabel: brandRecord.fields["Short API Key Label"] || null,
        };
        lnkBioCreds = resolveLnkBioCredentials({
          lnkBioEnabled: brandRecord.fields["Lnk.Bio Enabled"],
          lnkBioClientIdLabel: brandRecord.fields["Lnk.Bio Client ID Label"] || null,
          lnkBioClientSecretLabel: brandRecord.fields["Lnk.Bio Client Secret Label"] || null,
        });
        zernioApiKeyLabel = brandRecord.fields["Zernio API Key Label"] || null;
      } catch { /* fall back to global Short.io config */ }
    }

    // Delete all linked posts
    const allPosts = await listRecords<PostFields>("Posts", {});
    const linkedPosts = allPosts.filter(
      (r) => r.fields.Campaign && r.fields.Campaign.includes(id)
    );

    // Collect short URLs for cleanup
    const shortUrls = linkedPosts
      .map((p) => p.fields["Short URL"])
      .filter(Boolean);

    // Delete Short.io links
    if (shortUrls.length > 0) {
      const deleted = await deleteShortLinks(shortUrls, brand);
      console.log(`[reset] Deleted ${deleted}/${shortUrls.length} Short.io links`);
    }

    // Delete lnk.bio entries and clear their IDs on the post records
    if (lnkBioCreds) {
      const postsWithEntries = linkedPosts.filter((p) => p.fields["Lnk.Bio Entry ID"]);
      let lnkBioDeleted = 0;
      for (const post of postsWithEntries) {
        const entryId = post.fields["Lnk.Bio Entry ID"];
        try {
          const ok = await deleteLnkBioEntry(lnkBioCreds, entryId);
          if (ok) lnkBioDeleted++;
          await updateRecord("Posts", post.id, { "Lnk.Bio Entry ID": "" });
        } catch (err) {
          console.warn(`[reset] Failed to delete lnk.bio entry ${entryId}:`, err);
        }
      }
      if (postsWithEntries.length > 0) {
        console.log(`[reset] Deleted ${lnkBioDeleted}/${postsWithEntries.length} lnk.bio entries`);
      }
    }

    // Cancel scheduled posts on Zernio
    const zernioPostIds = linkedPosts
      .map((p) => p.fields["Zernio Post ID"])
      .filter(Boolean);

    if (zernioPostIds.length > 0) {
      const late = createBrandClient({ zernioApiKeyLabel });
      let deletedZernio = 0;
      for (const zpid of zernioPostIds) {
        try {
          await late.posts.deletePost({ path: { postId: zpid } });
          deletedZernio++;
        } catch (err) {
          console.warn(`[reset] Failed to delete Zernio post ${zpid}:`, err);
        }
      }
      console.log(`[reset] Deleted ${deletedZernio}/${zernioPostIds.length} Zernio posts`);
    }

    // Delete Airtable post records
    for (const post of linkedPosts) {
      await deleteRecord("Posts", post.id);
    }

    // Reset campaign status to Draft
    await updateRecord("Campaigns", id, { Status: "Draft" });

    return NextResponse.json({
      success: true,
      deletedPosts: linkedPosts.length,
      deletedShortLinks: shortUrls.length,
    });
  } catch (error) {
    console.error("Failed to reset campaign:", error);
    return NextResponse.json(
      { error: "Failed to reset campaign" },
      { status: 500 }
    );
  }
}
