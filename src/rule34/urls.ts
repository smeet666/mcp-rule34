/**
 * URL construction for rule34.xxx, and the one place a tag becomes a query.
 *
 * Everything a caller supplies passes through here, which is why the refusals
 * live here too: a tag is one token, and a token that carries a metatag or a
 * negation would set a filter the answer then reports as something else.
 */

import { invalidInput } from "../errors.js";
import type { MediaType, Rating, SortOrder } from "../types.js";

export const API_URL = "https://api.rule34.xxx/index.php";
export const SUGGEST_URL = "https://api.rule34.xxx/autocomplete.php";
export const SITE_URL = "https://rule34.xxx/index.php";

/** The site refuses more than this in one request, and caps silently below it. */
export const MAX_LIMIT = 1000;

/**
 * How each media type is expressed in the site's own tags.
 *
 * The site holds the distinction as tags, so it does the filtering and the
 * total it returns counts what was asked for. `animated` covers the GIFs, which
 * carry that tag without carrying `video`.
 */
const MEDIA_TOKENS: Record<MediaType, string[]> = {
  image: ["-video", "-animated"],
  animated: ["animated", "-video"],
  video: ["video"],
  any: [],
};

const SORT_TOKENS: Record<SortOrder, string> = {
  score: "sort:score:desc",
  id: "sort:id:desc",
  updated: "sort:updated:desc",
  random: "sort:random",
};

export interface Credentials {
  apiKey: string;
  userId: string;
}

export interface PostSearch {
  /** Tags a post must all carry. */
  tags: string[];
  /** Tags a post must carry at least one of. */
  anyOf?: string[];
  /** Tags a post must not carry. */
  exclude?: string[];
  mediaType?: MediaType;
  rating?: Rating;
  sort?: SortOrder;
  limit: number;
  /** Counted from 1, the way a caller counts. */
  page: number;
}

/**
 * How many tags one list may hold.
 *
 * The site accepts more, and a search of a dozen tags answers normally. The
 * bound is here because every tag is one more term to diagnose when a search
 * comes back empty, and a request whose address runs to kilobytes is one no
 * error message can usefully quote.
 */
export const MAX_TAGS = 10;

/**
 * Write a name the way rule34.xxx spells a tag.
 *
 * The site stores a tag as one token, joining with underscores what a person
 * says as words, so "asuka langley sohryu" and "asuka_langley_sohryu" are the
 * same request. Punctuation inside the name is part of it: the series tag is
 * `ranma_1/2`, slash included.
 */
export function normalizeTag(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw invalidInput(
      "A tag is required.",
      "Pass the tag to search for, such as 'black hair' or 'asuka langley sohryu'.",
    );
  }

  if (trimmed.startsWith("-")) {
    throw invalidInput(
      `"${trimmed}" starts with '-', which means "without this tag" on rule34.xxx.`,
      "This tool searches for a tag. Pass the tag itself, without the leading dash.",
    );
  }

  if (trimmed.includes(":")) {
    throw invalidInput(
      `"${trimmed}" carries a ':', which rule34.xxx reads as a filter rather than as a tag.`,
      "Filters are separate arguments here: use 'rating', 'sort' and 'media_type'.",
    );
  }

  return trimmed.replace(/\s+/g, "_").toLowerCase();
}

/** Normalize a list of tags, refusing a list longer than one search carries. */
function normalizeList(raw: string[] | undefined, argument: string): string[] {
  const tags = (raw ?? []).map(normalizeTag);
  if (tags.length > MAX_TAGS) {
    throw invalidInput(
      `'${argument}' holds ${tags.length} tags, and this tool searches at most ${MAX_TAGS} at a time.`,
      "Search on the tags that narrow the most, then look through the results.",
    );
  }
  return tags;
}

export interface NormalizedTags {
  required: string[];
  alternatives: string[];
  excluded: string[];
}

/**
 * The three lists as rule34.xxx spells them.
 *
 * An answer states the tags it searched for, and taking them back out of the
 * query string would state the site's grammar — its braces and its tilde — as
 * though they were tags.
 */
export function normalizeSearch(search: PostSearch): NormalizedTags {
  const required = normalizeList(search.tags, "tags");
  if (required.length === 0) {
    throw invalidInput(
      "At least one tag is required.",
      "Pass the tags to search for, such as ['asuka langley sohryu', 'black hair'].",
    );
  }

  const alternatives = normalizeList(search.anyOf, "any_of");
  const excluded = normalizeList(search.exclude, "exclude");

  // A tag both required and excluded matches nothing whatever the site holds,
  // and answering that with an empty result reads as an absence on the site's
  // side rather than a contradiction in the question.
  const contradiction = required.find((tag) => excluded.includes(tag));
  if (contradiction) {
    throw invalidInput(
      `'${contradiction}' is both required and excluded, so no post can match.`,
      "Remove it from one of the two lists.",
    );
  }

  return { required, alternatives, excluded };
}

/** The value of the site's `tags` parameter: the tags, then the filters. */
export function buildSearchQuery(search: PostSearch): string {
  const { required, alternatives, excluded } = normalizeSearch(search);

  const tokens = [...required];
  if (alternatives.length === 1) {
    // A group of one is the same request as the tag itself, and the braces
    // would suggest a choice the search does not make.
    tokens.push(...alternatives);
  } else if (alternatives.length > 1) {
    // The braces and the spaces inside them are the site's own grammar for a
    // choice; without them the tilde is read as part of a tag name.
    tokens.push(`( ${alternatives.join(" ~ ")} )`);
  }

  tokens.push(...excluded.map((tag) => `-${tag}`), ...MEDIA_TOKENS[search.mediaType ?? "any"]);
  if (search.rating) {
    tokens.push(`rating:${search.rating}`);
  }
  if (search.sort) {
    tokens.push(SORT_TOKENS[search.sort]);
  }
  return tokens.join(" ");
}

export function buildPostSearchUrl(search: PostSearch, credentials: Credentials): string {
  if (!Number.isInteger(search.limit) || search.limit < 1 || search.limit > MAX_LIMIT) {
    throw invalidInput(
      `limit must be a whole number between 1 and ${MAX_LIMIT}, and ${search.limit} is not.`,
      `rule34.xxx serves at most ${MAX_LIMIT} posts in one request.`,
    );
  }
  if (!Number.isInteger(search.page) || search.page < 1) {
    throw invalidInput(`page must be a whole number from 1 upwards, and ${search.page} is not.`);
  }

  const query = encodeURIComponent(buildSearchQuery(search));
  // `pid` on this route is a page number the site multiplies by the limit. The
  // same name means an absolute offset on the site's own pages, so the two are
  // reconciled here and nowhere else.
  const pid = search.page - 1;

  return (
    `${API_URL}?page=dapi&s=post&q=index` +
    `&tags=${query}&limit=${search.limit}&pid=${pid}` +
    `&api_key=${encodeURIComponent(credentials.apiKey)}` +
    `&user_id=${encodeURIComponent(credentials.userId)}`
  );
}

/**
 * Ask the tag route whether one exact name exists.
 *
 * A search of several tags that comes back empty says nothing about which tag
 * emptied it, and a misspelled name looks exactly like a combination the site
 * genuinely has nothing for. This is what tells the two apart.
 */
export function buildTagLookupUrl(tag: string, credentials: Credentials): string {
  return (
    `${API_URL}?page=dapi&s=tag&q=index&name=${encodeURIComponent(normalizeTag(tag))}` +
    `&api_key=${encodeURIComponent(credentials.apiKey)}` +
    `&user_id=${encodeURIComponent(credentials.userId)}`
  );
}

/**
 * The id inside a link to a post's page.
 *
 * The URL is read and never fetched: this server builds its own request from
 * the id it finds. Refusing a foreign host is still right, because a link to
 * somewhere else names no post this site holds.
 */
export function readPostPageUrl(raw: string): number {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch (error) {
    throw invalidInput(
      `"${raw}" is not a URL.`,
      "Pass a link to a post's page, such as https://rule34.xxx/index.php?page=post&s=view&id=2195419",
      error,
    );
  }

  const host = parsed.hostname.toLowerCase();
  // The site serves its pages on the bare host and its media from subdomains it
  // adds to over time, so the suffix is what stays true.
  if (host !== "rule34.xxx" && !host.endsWith(".rule34.xxx")) {
    throw invalidInput(
      `"${raw}" is not a rule34.xxx address.`,
      "This tool reads posts on rule34.xxx. A link elsewhere names no post it holds.",
    );
  }

  if (parsed.searchParams.get("page") !== "post" || parsed.searchParams.get("s") !== "view") {
    throw invalidInput(
      `"${raw}" is a rule34.xxx address, but not a post's page.`,
      "A post's page looks like https://rule34.xxx/index.php?page=post&s=view&id=2195419",
    );
  }

  // A query may carry `id` more than once, and reading the first would be a
  // coin flip on which post the caller meant. Two different values are the
  // contradiction an `id` and a `url` that disagree are refused for.
  const named: string[] = [...new Set(parsed.searchParams.getAll("id"))];
  if (named.length > 1) {
    throw invalidInput(
      `"${raw}" names ${named.length} different posts: ${named.join(", ")}.`,
      "Pass a link to one post.",
    );
  }

  const written: string = named[0] ?? "";
  if (written === "") {
    throw invalidInput(`"${raw}" carries no post id.`);
  }

  const id = Number(written);
  if (!Number.isInteger(id) || id < 1) {
    throw invalidInput(
      `"${raw}" carries '${written}', which is not a post id.`,
      "A post id is a whole number from 1 upwards.",
    );
  }
  return id;
}

/** The one post an `id` and a `url` name, refusing a pair that disagrees. */
export function resolvePostRef(ref: { id?: number; url?: string }): number {
  const fromUrl = ref.url === undefined ? null : readPostPageUrl(ref.url);
  const fromId = ref.id;

  if (fromId !== undefined) {
    if (!Number.isInteger(fromId) || fromId < 1) {
      throw invalidInput(`id must be a whole number from 1 upwards, and ${fromId} is not.`);
    }
    // Preferring one would be a coin flip on which of the caller's two
    // arguments was the mistake, and the answer would carry no trace of it.
    if (fromUrl !== null && fromUrl !== fromId) {
      throw invalidInput(
        `'id' names post ${fromId} and 'url' names post ${fromUrl}, so they cannot both be read.`,
        "Pass one of the two, or make them agree.",
      );
    }
    return fromId;
  }

  if (fromUrl !== null) {
    return fromUrl;
  }

  throw invalidInput(
    "Either 'id' or 'url' must be given.",
    "Pass the numeric post id, or a link to the post's page on rule34.xxx.",
  );
}

/**
 * A post is read from two addresses, because neither format carries everything.
 *
 * The XML states the publication date and the uploader's numeric id. The JSON
 * states the uploader's name, the number of comments, and a type and a count
 * for every tag. A fiche that read one of them would leave out what the other
 * one holds.
 */
export function buildPostByIdXmlUrl(id: number, credentials: Credentials): string {
  return `${API_URL}?page=dapi&s=post&q=index&id=${id}${credentialsQuery(credentials)}`;
}

export function buildPostByIdJsonUrl(id: number, credentials: Credentials): string {
  return `${API_URL}?page=dapi&s=post&q=index&id=${id}&json=1&fields=tag_info${credentialsQuery(credentials)}`;
}

function credentialsQuery(credentials: Credentials): string {
  return (
    `&api_key=${encodeURIComponent(credentials.apiKey)}` +
    `&user_id=${encodeURIComponent(credentials.userId)}`
  );
}

/**
 * Ask the site which tag names begin with a piece of text.
 *
 * rule34.xxx publishes this route on its API host and answers it without
 * credentials, so none are sent. It matches from the start of a name and caps
 * its answer at ten, both of which the tool that calls it has to state.
 *
 * An empty query is refused here: the site answers one with the tags it holds
 * most of, which is an answer to a question nobody asked.
 */
export function buildTagSuggestUrl(text: string): string {
  return `${SUGGEST_URL}?q=${encodeURIComponent(normalizeTag(text))}`;
}

export function buildPostPageUrl(id: number): string {
  return `${SITE_URL}?page=post&s=view&id=${id}`;
}

/**
 * Strip the key out of a URL before anything shows it.
 *
 * An error names the address it failed on, a model reads that text, and the
 * conversation it lands in outlives the request. The user id stays readable:
 * it names the account without opening it, which keeps a support question
 * answerable.
 */
export function redactCredentials(url: string): string {
  return url.replace(/([?&]api_key=)[^&]*/gi, "$1REDACTED");
}
