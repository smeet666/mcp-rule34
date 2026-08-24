/**
 * Reading one post from the JSON route.
 *
 * This format carries three things the XML does not: the uploader by name, the
 * number of comments, and a type and a post count for every tag. It leaves out
 * the publication date, which is why a fiche reads both formats rather than
 * choosing one.
 */

import { missingCredentials, notFound, parseFailure, upstreamFailure } from "../../errors.js";
import type { PostDetail, TagOnPost } from "../../types.js";
import { buildPostPageUrl, redactCredentials } from "../urls.js";

/** The words this route writes where the tag route writes a number. */
const TYPES: Record<string, string> = {
  tag: "general",
  artist: "artist",
  copyright: "copyright",
  character: "character",
  metadata: "metadata",
};

interface RawTagInfo {
  tag?: unknown;
  type?: unknown;
  count?: unknown;
}

export function parsePostDetail(body: string, url: string, id: number): PostDetail {
  const safeUrl = redactCredentials(url);

  // A request naming an id the site does not hold is answered with an empty
  // body, the same zero bytes a truncated read produces. Asking for one post
  // makes the two the same answer: there is no such post to report.
  if (body.trim() === "") {
    throw notFound(safeUrl);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw parseFailure(safeUrl, "the response is not JSON", error);
  }

  // An unauthenticated request is answered with HTTP 200 and a bare string,
  // which is a fault in the caller's configuration rather than in the site.
  if (typeof parsed === "string") {
    if (/authenticat/i.test(parsed)) {
      throw missingCredentials(safeUrl);
    }
    throw upstreamFailure(safeUrl, parsed);
  }

  if (!Array.isArray(parsed)) {
    throw parseFailure(safeUrl, "the response is not a list of posts");
  }
  const [raw] = parsed;
  if (raw === undefined) {
    throw notFound(safeUrl);
  }
  if (raw === null || typeof raw !== "object") {
    throw parseFailure(safeUrl, "the first entry is not a post");
  }

  return readPost(raw as Record<string, unknown>, id);
}

function readPost(raw: Record<string, unknown>, askedFor: number): PostDetail {
  const id = readInteger(raw.id) ?? askedFor;
  const tags = readString(raw.tags)
    .split(/\s+/)
    .filter((tag) => tag !== "");

  return {
    id,
    postUrl: buildPostPageUrl(id),
    fileUrl: readString(raw.file_url),
    sampleUrl: readText(raw.sample_url),
    previewUrl: readText(raw.preview_url),
    width: readInteger(raw.width) ?? 0,
    height: readInteger(raw.height) ?? 0,
    md5: readString(raw.hash),
    score: readInteger(raw.score) ?? 0,
    rating: readString(raw.rating),
    tags,
    tagDetails: readTagDetails(raw.tag_info),
    source: readText(raw.source),
    // This route writes 0 where the XML writes an empty string, and 0 is a post
    // id that belongs to somebody else.
    parentId: nonZero(readInteger(raw.parent_id)),
    owner: readText(raw.owner),
    commentCount: readInteger(raw.comment_count),
    status: readString(raw.status),
    hasNotes: raw.has_notes === true,
    changedAtUnix: readInteger(raw.change),
  };
}

function readTagDetails(value: unknown): TagOnPost[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const info = (entry ?? {}) as RawTagInfo;
    const type = readString(info.type);
    return {
      name: readString(info.tag),
      // A word this site has not documented is carried as it came: naming it
      // something else would state a kind the site never wrote.
      type: TYPES[type] ?? type,
      postCount: readInteger(info.count) ?? 0,
    };
  });
}

function nonZero(value: number | null): number | null {
  return value === null || value === 0 ? null : value;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readText(value: unknown): string | null {
  const trimmed = readString(value).trim();
  return trimmed === "" ? null : trimmed;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = readString(value).trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
