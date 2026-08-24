/**
 * find_tags: ask rule34.xxx how a tag is spelled.
 *
 * A search of a name the site does not hold ends there, and a caller with no
 * way to look a name up has no next step. This is that step, and it reads the
 * one route the site publishes for it.
 */

import { z } from "zod";
import type { Rule34Client } from "../rule34/client.js";
import { normalizeTag } from "../rule34/urls.js";
import { strictInput, tagName } from "./arguments.js";
import { ok, toToolError, type ToolResult } from "./shared.js";

/**
 * The most names the site ever offers.
 *
 * It answers ten whatever it holds, so ten back means the list was cut rather
 * than exhausted, and an answer that kept quiet about it would pass a cap off
 * as a complete list.
 */
export const SUGGEST_CAP = 10;

export const findTagsDescription = [
  "Find how rule34.xxx spells a tag, and how many posts carry it.",
  "The site matches from the start of a name, so 'kimagure' finds 'kimagure_orange_road'",
  "while 'orange road' finds nothing. It offers at most ten names.",
  "Use this before searching when a name might be spelled differently, and after a search that found",
  "nothing because a tag does not exist.",
].join(" ");

export const findTagsInput = strictInput({
  query: tagName("query", 60).describe(
    "The start of a tag name, such as 'kimagure' or 'prince of tennis'. Spaces are joined with underscores.",
  ),
});

export const findTagsOutputShape = {
  query: z.string().describe("The text as rule34.xxx would spell it."),
  tags: z.array(
    z.object({
      name: z.string().describe("The name a search takes."),
      post_count: z
        .number()
        .int()
        .nullable()
        .describe("Posts the site credits to it, or nothing when it printed no count."),
    }),
  ),
  source: z.literal("rule34.xxx"),
  notes: z.array(z.string()),
};

export interface FindTagsArgs {
  query: string;
}

export async function runFindTags(client: Rule34Client, args: FindTagsArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.findTags(args.query);
    const notes = cached ? ["Served from this server's short-lived in-memory cache."] : [];

    if (data.length === 0) {
      notes.push(
        "rule34.xxx offers no name for this text. It matches from the start of a name, so a word " +
          "sitting inside a tag finds nothing here; try the words a name begins with.",
      );
    } else if (data.length >= SUGGEST_CAP) {
      notes.push(
        "rule34.xxx caps this list at ten names, and it returned ten, so more may begin the same " +
          "way. Type more of the name to narrow it.",
      );
    }

    // The site was asked for the text spelled its way, and that spelling is the
    // one a caller has to search with.
    const asked = normalizeTag(args.query);

    const structured = {
      query: asked,
      tags: data.map((tag) => ({ name: tag.name, post_count: tag.postCount })),
      source: "rule34.xxx" as const,
      notes,
    };

    const body =
      data.length === 0
        ? `rule34.xxx offers no tag name beginning with ${asked}.`
        : `${data.length} name(s) rule34.xxx offers for ${asked}:\n${data
            .map(
              (tag) => `  ${tag.name}${tag.postCount === null ? "" : ` (${tag.postCount} posts)`}`,
            )
            .join("\n")}`;

    return ok(structured, body, notes);
  } catch (error) {
    return toToolError(error);
  }
}
