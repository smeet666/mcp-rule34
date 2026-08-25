/**
 * search_posts: find posts carrying a tag, or a combination of tags.
 *
 * The three tag arguments exist rather than one query string because the site's
 * search language can set a rating and a sort of its own. A caller writing
 * `sort:id:asc` inside a free-form query would contradict the `sort` argument
 * declared beside it, and the answer would report a sort it does not have.
 */

import { z } from "zod";
import type { Rule34Client } from "../rule34/client.js";
import { buildSearchQuery, MAX_TAGS, normalizeSearch, type PostSearch } from "../rule34/urls.js";
import { choice, strictInput, tagNames, wholeNumber } from "./arguments.js";
import {
  MAX_PAGE,
  ok,
  postSchema,
  renderPostList,
  TAG_PREVIEW,
  toPostOut,
  toToolError,
  type ToolResult,
} from "./shared.js";

export const searchPostsDescription = [
  "Search rule34.xxx for posts carrying a tag, or several tags at once.",
  "Tags are written as one token, so a name said as words is joined by underscores:",
  "'asuka langley sohryu' and 'ranma 1/2' are single tags, and this tool joins them for you.",
  "Returns each post's page, its image or video URL, dimensions, score and rating, alongside the",
  `number of posts the whole search matches. A row shows the first ${TAG_PREVIEW} of a post's tags and`,
  "says how many it has; call get_post for the whole list with a kind for every tag.",
  "Use 'media_type' to ask for still images, animations or video; the site classifies these itself.",
  "When a search finds nothing, the answer names the tags rule34.xxx does not hold, or says how many",
  "posts the tags match once the restrictions are dropped.",
].join(" ");

export const searchPostsInput = strictInput({
  tags: tagNames("tags", 1, MAX_TAGS).describe(
    "Tags a post must all carry, such as ['asuka langley sohryu', 'black hair'].",
  ),
  any_of: tagNames("any_of", 1, MAX_TAGS)
    .optional()
    .describe("Tags a post must carry at least one of."),
  exclude: tagNames("exclude", 1, MAX_TAGS)
    .optional()
    .describe("Tags a post must not carry, such as ['monochrome'] to leave out black and white."),
  media_type: choice(
    "media_type",
    ["image", "animated", "video", "any"],
    "The site states this in its own tags.",
  )
    .default("any")
    .describe(
      "'image' for stills, 'animated' for GIFs, 'video' for MP4. The site states this in its own " +
        "tags, so the classification is as good as the tagging.",
    ),
  rating: choice(
    "rating",
    ["questionable", "explicit"],
    "These are the two ratings rule34.xxx holds; any other answers zero posts and no error, which would " +
      "hand back an absence the site never had.",
  )
    .optional()
    .describe("The two ratings rule34.xxx holds. Leave unset to search both."),
  sort: choice("sort", ["score", "id", "updated", "random"], "The order the site sorts by.")
    .default("score")
    .describe(
      "'score' is the site's own tally of votes, recomputed once a day. 'id' is newest first. " +
        "'updated' is by when a post last changed, which retagging moves. 'random' draws a " +
        "different set on each call.",
    ),
  limit: wholeNumber("limit", 1, 100).default(20),
  page: wholeNumber("page", 1, MAX_PAGE).default(1),
});

export const searchPostsOutputShape = {
  tags: z.array(z.string()).describe("The required tags, as rule34.xxx spells them."),
  any_of: z.array(z.string()).describe("The alternatives, as rule34.xxx spells them."),
  exclude: z.array(z.string()).describe("The excluded tags, as rule34.xxx spells them."),
  query: z.string().describe("The search as it was sent, in the site's own language."),
  total: z.number().int().describe("Posts the whole search matches, as counted by the site."),
  page: z.number().int(),
  posts: z.array(postSchema),
  has_more: z.boolean(),
  next_page: z.number().int().nullable(),
  source: z.literal("rule34.xxx"),
  notes: z.array(z.string()),
};

export interface SearchPostsArgs {
  tags: string[];
  any_of?: string[];
  exclude?: string[];
  media_type: "image" | "animated" | "video" | "any";
  rating?: "questionable" | "explicit";
  sort: "score" | "id" | "updated" | "random";
  limit: number;
  page: number;
}

function toSearch(args: SearchPostsArgs): PostSearch {
  return {
    tags: args.tags,
    ...(args.any_of ? { anyOf: args.any_of } : {}),
    ...(args.exclude ? { exclude: args.exclude } : {}),
    mediaType: args.media_type,
    ...(args.rating ? { rating: args.rating } : {}),
    sort: args.sort,
    limit: args.limit,
    page: args.page,
  };
}

/**
 * The last page this search fills at the limit asked for.
 *
 * A search that found nothing fills the one page it was asked on, so that a
 * page beyond the end is told apart from a search with nothing in it.
 */
function lastPageOf(total: number, limit: number): number {
  return total === 0 ? 1 : Math.ceil(total / limit);
}

/** The next step, when there is one the schema would accept. */
function whatFollowsThisPage(nextPage: number | null): string {
  return nextPage === null ? "" : `\n\nMore posts match: call again with page=${nextPage}.`;
}

const quoted = (tags: string[]): string => tags.map((tag) => `'${tag}'`).join(", ");

/**
 * The opening of a misspelled name, which is the part worth asking about.
 *
 * The suggestion route matches from the start of a name, so a misspelled name
 * asked in full matches nothing. A slip usually lands late enough that the
 * opening survives it, and the opening is what finds the name that was meant.
 */
function openingOf(name: string): string {
  return name.slice(0, Math.max(3, Math.floor(name.length * 0.6)));
}

/**
 * Names the site offers that begin like the one it does not hold.
 *
 * A suggestion that cannot be fetched is a suggestion not made: the tag that is
 * missing is already named, and a failure here must not replace that answer.
 */
async function namesLike(client: Rule34Client, unknown: string): Promise<string> {
  try {
    const { data } = await client.findTags(openingOf(unknown));
    const offered = data
      .slice(0, 3)
      .map((tag) => `'${tag.name}'${tag.postCount === null ? "" : ` (${tag.postCount} posts)`}`);
    return offered.length === 0 ? "" : ` It does offer ${offered.join(", ")}.`;
  } catch {
    return "";
  }
}

/** The arguments that narrow a search, named as a caller passed them. */
function restrictionsIn(args: SearchPostsArgs): string[] {
  const named: string[] = [];
  if ((args.any_of ?? []).length > 0) {
    named.push("any_of");
  }
  if ((args.exclude ?? []).length > 0) {
    named.push("exclude");
  }
  if (args.media_type !== "any") {
    named.push("media_type");
  }
  if (args.rating) {
    named.push("rating");
  }
  return named;
}

/**
 * Why a search found nothing.
 *
 * A name the site never had empties a search exactly the way a combination it
 * holds nothing for does, and the two are indistinguishable in the answer. So
 * every empty search asks the tag route which of its names exist, whether it
 * carried one name or ten.
 *
 * Only the names that can be the cause are looked up. A required tag the site
 * does not hold empties the search on its own, and a group of alternatives does
 * the same when the site holds none of them. An excluded name the site never
 * had removes nothing, so it cannot be why the search is empty, and blaming it
 * would send a caller to fix the one thing that was not the problem.
 */
async function explainEmptySearch(client: Rule34Client, args: SearchPostsArgs): Promise<string[]> {
  const alternatives = args.any_of ?? [];
  const unknownRequired = await client.findUnknownTags(args.tags);
  const unknownAlternatives =
    alternatives.length > 0 ? await client.findUnknownTags(alternatives) : [];

  const [firstUnknown] = unknownRequired;
  if (firstUnknown !== undefined) {
    const near = await namesLike(client, firstUnknown);
    return [
      `rule34.xxx holds no tag named ${quoted(unknownRequired)}. ` +
        "A tag a search requires and the site does not hold empties that search on its own." +
        near,
    ];
  }

  if (alternatives.length > 0 && unknownAlternatives.length === alternatives.length) {
    return [
      `rule34.xxx holds none of the alternatives ${quoted(unknownAlternatives)}, ` +
        "so no post could carry one of them.",
    ];
  }

  // A restriction that leaves nothing looks exactly like tags the site holds
  // nothing for. Asking the same tags without the restrictions is what tells
  // the two apart, and it names the argument a caller would otherwise guess at.
  const restrictions = restrictionsIn(args);
  if (restrictions.length > 0) {
    const { data } = await client.searchPosts({ tags: args.tags, limit: 1, page: 1 });
    if (data.total > 0) {
      return [
        `The tags alone match ${data.total.toLocaleString("en-US")} post(s). ` +
          `What emptied this search is the restriction on ${restrictions.join(", ")}.`,
      ];
    }
  }

  return ["Every tag this search requires exists on rule34.xxx; no post carries them together."];
}

export async function runSearchPosts(
  client: Rule34Client,
  args: SearchPostsArgs,
): Promise<ToolResult> {
  try {
    const search = toSearch(args);
    const spelled = normalizeSearch(search);
    const query = buildSearchQuery(search);
    const { data, cached } = await client.searchPosts(search);

    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }

    // A row leads with the tags the search asked for, so that a post matching
    // on a name the site lists late still shows why it is here.
    const asked = [...spelled.required, ...spelled.alternatives];
    const posts = data.posts.map((post) => toPostOut(post, asked));
    // A truncated list passed off as whole is the one thing this saving must
    // not cost, so the answer says where the rest of the tags are.
    const trimmed = posts.filter((post) => post.tags_total > post.tags.length).length;
    if (trimmed > 0) {
      notes.push(
        `${trimmed} of these posts carry more tags than a row shows. Call get_post with an id for the ` +
          "whole list, with a kind and a post count for every tag.",
      );
    }
    // The site counts every match; this page carries at most `limit` of them.
    const lastPage = lastPageOf(data.total, args.limit);
    const hasMore = args.page < lastPage;
    const nextPage = hasMore && args.page < MAX_PAGE ? args.page + 1 : null;

    // Two silences a caller cannot tell apart from a failure. A page beyond the
    // end serves nothing while the same answer states a total, and a search
    // whose results outrun the page ceiling states that more remain while
    // offering no page to ask for.
    if (data.total > 0 && args.page > lastPage) {
      notes.push(
        `This search fills ${lastPage} page(s) at limit ${args.limit}, and page ${args.page} lies ` +
          "past the end, so no post is served.",
      );
    }
    if (hasMore && nextPage === null) {
      notes.push(
        `rule34.xxx holds more posts, and page ${MAX_PAGE} is as far as this tool reads. ` +
          "Raise limit to carry more of them per page, or narrow the search.",
      );
    }

    if (data.total === 0) {
      notes.push(...(await explainEmptySearch(client, args)));
    }

    const structured = {
      tags: spelled.required,
      any_of: spelled.alternatives,
      exclude: spelled.excluded,
      query,
      total: data.total,
      page: args.page,
      posts,
      has_more: hasMore,
      next_page: nextPage,
      source: "rule34.xxx" as const,
      notes,
    };

    const header =
      data.total === 0
        ? `No post on rule34.xxx matches ${query}.`
        : `${data.total.toLocaleString("en-US")} post(s) match ${query}. Page ${args.page}:`;
    const body = posts.length > 0 ? `\n${renderPostList(posts)}` : "";

    return ok(structured, `${header}${body}${whatFollowsThisPage(nextPage)}`, notes);
  } catch (error) {
    return toToolError(error);
  }
}
