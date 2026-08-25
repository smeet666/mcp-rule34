/**
 * Reading the `<posts>` document the API answers a search with.
 *
 * This route is read as XML rather than as JSON for one reason: the XML states
 * the total and states an empty result as `count="0"`, where the JSON answers a
 * search that found nothing with an empty body — the same zero bytes a
 * truncated read produces. A total that cannot be read is unknown here, never
 * zero.
 */

import { parseFailure } from "../../errors.js";
import type { PostList, Rule34Post } from "../../types.js";
import { buildPostPageUrl, redactCredentials } from "../urls.js";
import { type Attributes, readDocument, readInteger, readText, toArray } from "./document.js";

/** The letters this route writes where the site writes a word. */
const WHITESPACE = /\s+/;

const RATINGS: Record<string, string> = {
  e: "explicit",
  q: "questionable",
  s: "safe",
};

export function parsePostList(xml: string, url: string): PostList {
  const safeUrl = redactCredentials(url);
  const document = readDocument(xml, safeUrl);

  const posts = document.posts;
  if (posts === undefined || posts === null || typeof posts !== "object") {
    throw parseFailure(safeUrl, "no <posts> element");
  }

  const attributes = posts as Attributes & { post?: unknown };
  const total = readInteger(attributes["@_count"]);
  if (total === null) {
    throw parseFailure(safeUrl, "the <posts> element carries no count");
  }

  return {
    total,
    offset: readInteger(attributes["@_offset"]) ?? 0,
    posts: toArray(attributes.post).map(readPost),
  };
}

function readPost(attributes: Attributes): Rule34Post {
  const id = readInteger(attributes["@_id"]) ?? 0;
  const rating = attributes["@_rating"]?.trim() ?? "";

  return {
    id,
    postUrl: buildPostPageUrl(id),
    fileUrl: attributes["@_file_url"] ?? "",
    sampleUrl: readText(attributes["@_sample_url"]),
    previewUrl: readText(attributes["@_preview_url"]),
    width: readInteger(attributes["@_width"]) ?? 0,
    height: readInteger(attributes["@_height"]) ?? 0,
    md5: attributes["@_md5"] ?? "",
    score: readInteger(attributes["@_score"]) ?? 0,
    // An unknown letter is carried as it came: naming it would state a rating
    // the site never wrote.
    rating: RATINGS[rating] ?? rating,
    tags: (attributes["@_tags"] ?? "").split(WHITESPACE).filter((tag) => tag !== ""),
    source: readText(attributes["@_source"]),
    // The attribute is present and empty on a post with no parent, and 0 is a
    // post id that belongs to somebody else.
    parentId: readInteger(attributes["@_parent_id"]),
    creatorId: readInteger(attributes["@_creator_id"]),
    status: attributes["@_status"] ?? "",
    hasChildren: attributes["@_has_children"] === "true",
    hasComments: attributes["@_has_comments"] === "true",
    hasNotes: attributes["@_has_notes"] === "true",
    createdAt: readDate(attributes["@_created_at"]),
    changedAtUnix: readInteger(attributes["@_change"]),
  };
}

/**
 * The publication date, which this route prints in words rather than as a
 * stamp. A date that cannot be read is unknown: the post's `change` stamp is
 * the date of the last edit, and standing in for the other one would date an
 * old post to whenever somebody last retagged it.
 */
function readDate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
