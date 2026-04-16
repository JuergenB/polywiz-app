"use client";

import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Save, Users } from "lucide-react";

interface CollaborationSectionProps {
  postId: string;
  collaborators: string[];
  userTags: string[];
  isPublished: boolean;
}

/** Strip @ prefix and whitespace from a username. */
function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** Parse comma-separated usernames, strip @, filter empties. */
function parseUsernames(input: string): string[] {
  return input
    .split(",")
    .map(cleanUsername)
    .filter((u) => u.length > 0);
}

export function CollaborationSection({
  postId,
  collaborators: initialCollaborators,
  userTags: initialUserTags,
  isPublished,
}: CollaborationSectionProps) {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collabInput, setCollabInput] = useState(initialCollaborators.join(", "));
  const [tagsInput, setTagsInput] = useState(initialUserTags.join(", "));
  const [editing, setEditing] = useState(false);

  const scrollIntoView = () => {
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const parsedCollabs = parseUsernames(collabInput);
  const parsedTags = parseUsernames(tagsInput);
  const collabError = parsedCollabs.length > 3 ? "Maximum 3 collaborators allowed" : null;

  // Summary for header — use saved (initial) values, or current input if editing
  const displayCollabs = editing ? parsedCollabs : initialCollaborators;
  const displayTags = editing ? parsedTags : initialUserTags;
  const parts: string[] = [];
  if (displayCollabs.length > 0) {
    parts.push(`${displayCollabs.length} collaborator${displayCollabs.length > 1 ? "s" : ""}`);
  }
  if (displayTags.length > 0) {
    parts.push(`${displayTags.length} tag${displayTags.length > 1 ? "s" : ""}`);
  }
  const summary = parts.join(", ");

  const hasChanges =
    JSON.stringify(parsedCollabs) !== JSON.stringify(initialCollaborators) ||
    JSON.stringify(parsedTags) !== JSON.stringify(initialUserTags);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborators: JSON.stringify(parsedCollabs),
          userTags: JSON.stringify(parsedTags),
        }),
      });
      if (!res.ok) throw new Error("Failed to save collaboration settings");
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Collaboration settings saved");
    },
    onError: () => toast.error("Failed to save collaboration settings"),
  });

  return (
    <div className="border-t border-border">
      <button
        onClick={() => {
          const opening = !expanded;
          setExpanded(opening);
          // When empty and not published, go straight to edit mode — no intermediate "click to add" step
          if (opening && !isPublished && initialCollaborators.length === 0 && initialUserTags.length === 0) {
            setEditing(true);
          }
          if (opening) scrollIntoView();
        }}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="h-3 w-3" />
        <span>Collaboration</span>
        {summary && (
          <span className="text-[10px] text-muted-foreground/60">({summary})</span>
        )}
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div ref={contentRef} className="px-6 pb-3">
          {editing && !isPublished ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Collaborators (max 3)</label>
                <input
                  value={collabInput}
                  onChange={(e) => setCollabInput(e.target.value)}
                  placeholder="username1, username2"
                  className="w-full text-xs leading-relaxed bg-background border rounded-md p-2"
                />
                {collabError && (
                  <p className="text-[10px] text-destructive">{collabError}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Image Tags</label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="artistname, galleryname"
                  className="w-full text-xs leading-relaxed bg-background border rounded-md p-2"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  disabled={!hasChanges || !!collabError || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setCollabInput(initialCollaborators.join(", "));
                    setTagsInput(initialUserTags.join(", "));
                    // If nothing was saved, collapse entirely — don't show empty read-only state
                    if (initialCollaborators.length === 0 && initialUserTags.length === 0) {
                      setExpanded(false);
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`text-xs leading-relaxed text-muted-foreground${!isPublished ? " cursor-pointer hover:text-foreground" : ""}`}
              onClick={() => { if (!isPublished) { setEditing(true); scrollIntoView(); } }}
              title={isPublished ? undefined : "Click to edit"}
            >
              {initialCollaborators.length > 0 || initialUserTags.length > 0 ? (
                <div className="space-y-1">
                  {initialCollaborators.length > 0 && (
                    <div>Collaborators: {initialCollaborators.map(u => `@${u}`).join(", ")}</div>
                  )}
                  {initialUserTags.length > 0 && (
                    <div>Image tags: {initialUserTags.map(u => `@${u}`).join(", ")}</div>
                  )}
                </div>
              ) : (
                <span className="italic">Click to add collaborators or image tags</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
