/**
 * Reading the `<tags>` document, which says whether a name is a tag at all.
 *
 * This is what a search of several tags needs when it finds nothing: a
 * misspelled name and a combination the site genuinely holds nothing for
 * produce the same empty result, and only this route separates them.
 */

import { parseFailure } from "../../errors.js";
import type { TagRef, TagType } from "../../types.js";
import { redactCredentials } from "../urls.js";
import { type Attributes, readDocument, readInteger, toArray } from "./document.js";

/**
 * How the site numbers the kinds of tag.
 *
 * Read off the site itself rather than assumed: `black_hair` answers 0,
 * `jall_boint` 1, `prince_of_tennis` 3, `asuka_langley_sohryu` 4 and
 * `crossover` 5.
 */
const TYPES: Record<number, TagType> = {
  0: "general",
  1: "artist",
  3: "copyright",
  4: "character",
  5: "metadata",
};

export function parseTagList(xml: string, url: string): TagRef[] {
  const safeUrl = redactCredentials(url);
  const document = readDocument(xml, safeUrl);

  const tags = document.tags;
  if (tags !== undefined && tags !== null && typeof tags === "object") {
    return toArray((tags as { tag?: unknown }).tag).map(readTag);
  }

  // A name the site holds nothing for comes back under a root element named in
  // the singular and carrying nothing. Reading that as a broken document would
  // turn "no such tag" into "the site is unreadable", which is the opposite of
  // what this route is asked.
  const lone = document.tag;
  if (lone !== undefined && lone !== null && typeof lone === "object") {
    const attributes = lone as Attributes;
    return attributes["@_name"] === undefined ? [] : [readTag(attributes)];
  }

  throw parseFailure(safeUrl, "no <tags> element");
}

function readTag(attributes: Attributes): TagRef {
  const typeCode = readInteger(attributes["@_type"]);
  return {
    id: readInteger(attributes["@_id"]) ?? 0,
    name: attributes["@_name"] ?? "",
    postCount: readInteger(attributes["@_count"]) ?? 0,
    // A number this site has not documented is left unnamed: calling it
    // something would state a kind the site never wrote.
    type: (typeCode === null ? undefined : TYPES[typeCode]) ?? "unknown",
    typeCode,
    ambiguous: attributes["@_ambiguous"] === "true",
  };
}
