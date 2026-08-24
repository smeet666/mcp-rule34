/**
 * Pieces the tool layer shares: the result envelope, error rendering, and the
 * text mirror of a structured answer.
 */

import { z } from "zod";
import { Rule34Error } from "../errors.js";
import type { Rule34Post } from "../types.js";

/** Many MCP clients render only the text block, so it must stand on its own. */
export const MAX_TEXT_MIRROR_CHARS = 2000;

/**
 * The last page a search will accept.
 *
 * A sentence may only name a page the schema would accept, or it sends a caller
 * into an argument that is refused.
 */
export const MAX_PAGE = 200;

/**
 * How many of a post's tags a search row shows.
 *
 * Posts carry a median of about two hundred tags and some carry nine hundred,
 * so a page of twenty would spend four fifths of its answer on tag strings. A
 * row shows an extract and states the real count beside it, and get_post reads
 * the whole list when a caller wants it.
 */
export const TAG_PREVIEW = 12;

export const postSchema = z.object({
  id: z.number().int(),
  post_url: z.string().describe("The rule34.xxx page for this post."),
  file_url: z.string().describe("The image or video itself, on the site's CDN."),
  preview_url: z.string().nullable().describe("Thumbnail, when the site published one."),
  sample_url: z.string().nullable().describe("Reduced copy, when the site published one."),
  width: z.number().int(),
  height: z.number().int(),
  score: z.number().int().describe("The site's own score, updated once a day."),
  rating: z.string().describe("As the site holds it: 'explicit' or 'questionable'."),
  tags: z.array(z.string()).describe("The first tags of the post, at most 12 of them."),
  tags_total: z.number().int().describe("How many tags the post carries in all."),
  source: z.string().nullable().describe("Whatever the uploader credited, when they credited any."),
  created_at: z.string().nullable().describe("When the post was published, ISO 8601."),
  has_comments: z.boolean(),
  parent_id: z.number().int().nullable(),
});

export type PostOut = z.infer<typeof postSchema>;

export function toPostOut(post: Rule34Post): PostOut {
  return {
    id: post.id,
    post_url: post.postUrl,
    file_url: post.fileUrl,
    preview_url: post.previewUrl,
    sample_url: post.sampleUrl,
    width: post.width,
    height: post.height,
    score: post.score,
    rating: post.rating,
    tags: post.tags.slice(0, TAG_PREVIEW),
    tags_total: post.tags.length,
    source: post.source,
    created_at: post.createdAt,
    has_comments: post.hasComments,
    parent_id: post.parentId,
  };
}

export interface ToolResult {
  // The SDK's CallToolResult carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * A block ending in lines that open "Note:" gives a caller no way to tell one
 * of those from the same words inside a tag somebody else published. Indenting
 * such a line in the body keeps the two apart, and the structured payload still
 * carries the text exactly as it was published.
 */
function indentMarkerLines(body: string): string {
  return body.replace(/^(Note:)/gm, " $1");
}

/**
 * Build a result whose text block ends with its notes.
 *
 * The notes are what qualifies an answer: that a tag in the search does not
 * exist, that the page asked for lies past the end, that the words came from
 * this server's cache. A client rendering only the text reads an unqualified
 * answer without them.
 */
export function ok(
  structured: Record<string, unknown>,
  text: string,
  notes: string[] = [],
): ToolResult {
  const trailer = notes.map((note) => `Note: ${note}`).join("\n");
  const budget = MAX_TEXT_MIRROR_CHARS - (trailer ? trailer.length + 2 : 0);
  const body = truncate(indentMarkerLines(text), Math.max(0, budget));

  return {
    content: [{ type: "text", text: trailer ? `${body}\n\n${trailer}` : body }],
    structuredContent: structured,
  };
}

/**
 * Error results carry no structuredContent: the SDK validates it against the
 * tool's declared output schema, which an error payload does not satisfy.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof Rule34Error
      ? error
      : new Rule34Error("network_error", error instanceof Error ? error.message : String(error));

  const lines = [known.message];
  if (known.details.hint) {
    lines.push(`Hint: ${known.details.hint}`);
  }
  if (known.details.url) {
    lines.push(`URL: ${known.details.url}`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Compact listing, one post to a line and a half. */
export function renderPostList(posts: PostOut[]): string {
  return posts
    .map((post, index) => {
      const head =
        `${index + 1}. #${post.id} · ${post.width}×${post.height} · score ${post.score}` +
        ` · ${post.rating}`;
      return `${head}\n   ${post.post_url}\n   ${post.file_url}`;
    })
    .join("\n");
}
