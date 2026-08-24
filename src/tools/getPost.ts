/**
 * get_post: read one post whole.
 *
 * A search row shows an extract of a post's tags, because a page of twenty
 * would otherwise spend four fifths of its answer on tag strings. This is where
 * the whole list lives, with a kind and a post count for every tag, alongside
 * the uploader's name and the number of comments.
 */

import { z } from "zod";
import type { Rule34Client } from "../rule34/client.js";
import { strictInput, wholeNumber } from "./arguments.js";
import { ok, toToolError, type ToolResult } from "./shared.js";

export const getPostDescription = [
  "Read one rule34.xxx post, named by its id or by a link to its page.",
  "Returns every tag the post carries, each with its kind (character, copyright, artist, general or",
  "metadata) and how many posts share it, alongside the image or video, the dimensions, the score,",
  "the rating, the uploader, the number of comments, the credited source and the publication date.",
  "Use this after a search, whose rows show only the first few tags of each post.",
].join(" ");

export const getPostInput = strictInput({
  id: wholeNumber("id", 1, Number.MAX_SAFE_INTEGER)
    .optional()
    .describe("The post's numeric id, as a search returns it."),
  url: z
    .string()
    .max(500)
    .optional()
    .describe(
      "A link to the post's page, such as https://rule34.xxx/index.php?page=post&s=view&id=2195419. " +
        "The link is read rather than followed.",
    ),
});

export const getPostOutputShape = {
  id: z.number().int(),
  post_url: z.string(),
  file_url: z.string(),
  preview_url: z.string().nullable(),
  sample_url: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  md5: z.string(),
  score: z.number().int().describe("The site's own score, updated once a day."),
  rating: z.string(),
  tags: z.array(
    z.object({
      name: z.string(),
      type: z.string().describe("character, copyright, artist, general or metadata."),
      post_count: z.number().int().describe("Posts the site credits to this tag."),
    }),
  ),
  source: z.string().nullable(),
  parent_id: z.number().int().nullable(),
  owner: z.string().nullable().describe("The account that uploaded the post."),
  comment_count: z.number().int().nullable(),
  created_at: z.string().nullable().describe("When the post was published, ISO 8601."),
  changed_at: z.string().nullable().describe("When the post last changed, ISO 8601."),
  status: z.string(),
  has_notes: z.boolean(),
  source_site: z.literal("rule34.xxx"),
  notes: z.array(z.string()),
};

export interface GetPostArgs {
  id?: number;
  url?: string;
}

export async function runGetPost(client: Rule34Client, args: GetPostArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getPost(args);
    const notes = cached ? ["Served from this server's short-lived in-memory cache."] : [];

    const structured = {
      id: data.id,
      post_url: data.postUrl,
      file_url: data.fileUrl,
      preview_url: data.previewUrl,
      sample_url: data.sampleUrl,
      width: data.width,
      height: data.height,
      md5: data.md5,
      score: data.score,
      rating: data.rating,
      tags: data.tagDetails.map((tag) => ({
        name: tag.name,
        type: tag.type,
        post_count: tag.postCount,
      })),
      source: data.source,
      parent_id: data.parentId,
      owner: data.owner,
      comment_count: data.commentCount,
      created_at: data.createdAt ?? null,
      changed_at: toIso(data.changedAtUnix),
      status: data.status,
      has_notes: data.hasNotes,
      source_site: "rule34.xxx" as const,
      notes,
    };

    return ok(structured, render(structured), notes);
  } catch (error) {
    return toToolError(error);
  }
}

function toIso(unixSeconds: number | null): string | null {
  return unixSeconds === null ? null : new Date(unixSeconds * 1000).toISOString();
}

/** The kinds worth naming first: they say what the post is of. */
const NAMED_FIRST = ["character", "copyright", "artist"];

function render(post: {
  id: number;
  post_url: string;
  file_url: string;
  width: number;
  height: number;
  score: number;
  rating: string;
  owner: string | null;
  created_at: string | null;
  comment_count: number | null;
  tags: Array<{ name: string; type: string; post_count: number }>;
}): string {
  const lines = [
    `Post #${post.id} · ${post.width}×${post.height} · score ${post.score} · ${post.rating}`,
    `  ${post.post_url}`,
    `  ${post.file_url}`,
  ];

  const posted = post.created_at ? post.created_at.slice(0, 10) : "an unstated date";
  lines.push(`  posted ${posted}${post.owner ? ` by ${post.owner}` : ""}`);
  if (post.comment_count !== null) {
    lines.push(`  ${post.comment_count} comment(s)`);
  }

  for (const kind of NAMED_FIRST) {
    const named = post.tags.filter((tag) => tag.type === kind).map((tag) => tag.name);
    if (named.length > 0) {
      lines.push(`  ${kind}: ${named.join(", ")}`);
    }
  }
  const rest = post.tags.filter((tag) => !NAMED_FIRST.includes(tag.type)).map((tag) => tag.name);
  lines.push(`  ${post.tags.length} tag(s): ${rest.join(" ")}`);

  return lines.join("\n");
}
