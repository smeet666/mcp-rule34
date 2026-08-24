/**
 * End-to-end contract tests over a real MCP client and server pair, with the
 * network replaced by canned answers.
 *
 * Everything asserted here goes over the protocol, because a tool's contract is
 * what a client sees rather than what a function returns.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";

const CREDENTIALS = { RULE34_USER_ID: "6701429", RULE34_API_KEY: "0123456789abcdef" };

function postsDocument(count: number, ids: number[]): string {
  const posts = ids
    .map(
      (id) =>
        `<post id="${id}" width="1536" height="2016" score="12" rating="e" md5="deadbeef" ` +
        `file_url="https://api-cdn.rule34.xxx/images/1/deadbeef.png" ` +
        `preview_url="https://api-cdn.rule34.xxx/thumbnails/1/thumbnail_deadbeef.jpg" ` +
        `sample_url="" tags="${MANY_TAGS}" ` +
        `parent_id="" source="" status="active" has_children="false" has_comments="false" ` +
        `has_notes="false" change="1787514379" created_at="Sun Nov 13 13:22:51 +0100 2016"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><posts count="${count}" offset="0">${posts}</posts>`;
}

/** More tags than a search row shows, so the cap and the count are visible. */
const MANY_TAGS = Array.from({ length: 40 }, (_, index) => `tag_${index}`).join(" ");

/**
 * A post carrying the searched tag far down its list, which is where the site
 * puts it when the list runs alphabetically.
 */
const LATE_TAG_POST =
  '<?xml version="1.0" encoding="UTF-8"?><posts count="247" offset="0">' +
  `<post id="17543976" width="795" height="863" score="10" rating="e" md5="deadbeef" ` +
  `file_url="https://api-cdn.rule34.xxx/images/1/deadbeef.png" preview_url="" sample_url="" ` +
  `tags="${Array.from({ length: 20 }, (_, index) => `aaa_${index}`).join(" ")} prince_of_tennis zzz_last" ` +
  `parent_id="" source="" status="active" has_children="false" has_comments="false" ` +
  `has_notes="false" change="1787514379" created_at="Sun Nov 13 13:22:51 +0100 2016"/></posts>`;

const DETAIL_JSON = JSON.stringify([
  {
    id: 2195419,
    width: 1920,
    height: 1350,
    score: 178,
    rating: "explicit",
    hash: "aaaa1111",
    file_url: "https://api-cdn.rule34.xxx/images/2027/aaaa1111.jpeg",
    tags: "black_hair asuka_langley_sohryu",
    tag_info: [
      { count: 1597958, type: "tag", tag: "black_hair" },
      { count: 18248, type: "character", tag: "asuka_langley_sohryu" },
    ],
    owner: "a_person",
    comment_count: 4,
    parent_id: 0,
    source: "",
    status: "active",
    has_notes: false,
    change: 1741898933,
  },
]);

const DETAIL_XML =
  '<?xml version="1.0" encoding="UTF-8"?><posts count="1" offset="0">' +
  '<post id="2195419" width="1920" height="1350" score="178" rating="e" md5="aaaa1111" ' +
  'file_url="https://api-cdn.rule34.xxx/images/2027/aaaa1111.jpeg" tags="black_hair" ' +
  'parent_id="" source="" status="active" has_children="false" has_comments="true" ' +
  'has_notes="false" creator_id="46501" change="1741898933" ' +
  'created_at="Sun Nov 13 13:22:51 +0100 2016"/></posts>';

/** Ten names, which is the most the suggestion route ever offers. */
const TEN_SUGGESTIONS = JSON.stringify(
  Array.from({ length: 10 }, (_, index) => ({
    label: `kimagure_${index} (${100 - index})`,
    value: `kimagure_${index}`,
  })),
);

const ONE_SUGGESTION = JSON.stringify([
  { label: "kimagure_orange_road (325)", value: "kimagure_orange_road" },
]);

const KNOWN_TAG =
  '<?xml version="1.0" encoding="UTF-8"?><tags type="array">' +
  '<tag type="0" count="1597958" name="black_hair" ambiguous="false" id="49"/></tags>';
const UNKNOWN_TAG = '<?xml version="1.0" encoding="UTF-8"?><tag type="array"/>';

interface StubRoute {
  status?: number;
  body: string;
}

/** Routes a request URL to a canned answer, by pattern. */
function stubFetch(routes: [RegExp, StubRoute][]): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    for (const [pattern, route] of routes) {
      if (pattern.test(url)) {
        return new Response(route.body, { status: route.status ?? 200 });
      }
    }
    return new Response("nothing here", { status: 404 });
  }) as unknown as typeof fetch;
}

async function connect(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = CREDENTIALS) {
  const config = {
    ...loadConfig(env),
    // No pacing and no retries: these tests assert behaviour, not timing.
    minIntervalMs: 0,
    maxRetries: 0,
    logLevel: "silent" as const,
  };
  const server = createServer({ config, logger: createLogger("silent"), fetchImpl });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

const FOUND: [RegExp, StubRoute][] = [
  [/s=post/, { body: postsDocument(1599409, [18540926, 18540927]) }],
  [/s=tag/, { body: KNOWN_TAG }],
];

interface SearchOutput {
  tags: string[];
  any_of: string[];
  exclude: string[];
  query: string;
  total: number;
  page: number;
  posts: Array<{
    id: number;
    post_url: string;
    file_url: string;
    tags: string[];
    tags_total: number;
  }>;
  has_more: boolean;
  next_page: number | null;
  source: string;
  notes: string[];
}

describe("MCP tool contract", () => {
  it("exposes the documented tool, with both of its schemas", async () => {
    const client = await connect(stubFetch(FOUND));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["search_posts", "get_post", "find_tags"]);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      // A caller cannot rely on a shape the server never declared.
      expect(tool.outputSchema).toBeTruthy();
    }
  });

  it("answers a search with the site's total and the page it served", async () => {
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], media_type: "image", limit: 2 },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(result.isError).toBeFalsy();
    expect(output.total).toBe(1599409);
    expect(output.posts).toHaveLength(2);
    expect(output.page).toBe(1);
    expect(output.has_more).toBe(true);
    expect(output.next_page).toBe(2);
    expect(output.query).toContain("black_hair -video -animated");
    expect(output.posts[0]?.post_url).toBe(
      "https://rule34.xxx/index.php?page=post&s=view&id=18540926",
    );
  });

  it("states the tags it searched for, without the site's grammar among them", async () => {
    // The query carries braces and a tilde where a choice was asked for. Taking
    // the tags back out of it would state those as though they were tags.
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: {
        tags: ["Asuka Langley Sohryu"],
        any_of: ["blonde hair", "red hair"],
        exclude: ["monochrome"],
      },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.tags).toEqual(["asuka_langley_sohryu"]);
    expect(output.any_of).toEqual(["blonde_hair", "red_hair"]);
    expect(output.exclude).toEqual(["monochrome"]);
    expect(output.query).toBe(
      "asuka_langley_sohryu ( blonde_hair ~ red_hair ) -monochrome sort:score:desc",
    );
  });

  it("says in its text what it says in its payload", async () => {
    // Many clients render only the text block, so a total that appears in one
    // and not the other is a total half the callers never see.
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], limit: 2 },
    });
    const [content] = result.content as Array<{ text: string }>;
    expect(content?.text).toContain("1,599,409");
    expect(content?.text).toContain("18540926");
  });

  it("refuses an argument it does not declare, and names it", async () => {
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], mediatype: "image" },
    });
    const [content] = result.content as Array<{ text: string }>;
    expect(result.isError).toBe(true);
    expect(content?.text).toContain("invalid_input");
    expect(content?.text).toContain("mediatype");
    expect(content?.text).toContain("media_type");
  });

  it("refuses a rating the site does not hold", async () => {
    // `safe` answers zero posts and no error on this site, so accepting it
    // would hand back an absence the site never had.
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], rating: "safe" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("invalid_input");
  });

  it("names the tag that emptied a search of several", async () => {
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/name=black_hair/, { body: KNOWN_TAG }],
        [/s=tag/, { body: UNKNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair", "asuka langley sohry"] },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.total).toBe(0);
    expect(output.notes.join(" ")).toContain("asuka_langley_sohry");
  });

  it("names a single tag the site does not hold", async () => {
    // One tag is the whole search, so a name the site never had empties it on
    // its own. Answering that with a bare zero says the site holds nothing on a
    // subject it may hold hundreds of.
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/s=tag/, { body: UNKNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["kimagure orange rado"] },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.total).toBe(0);
    expect(output.notes.join(" ")).toContain("kimagure_orange_rado");
  });

  it("says the tags exist when a search of real tags finds nothing", async () => {
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/s=tag/, { body: KNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair", "asuka langley sohryu"] },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.notes.join(" ")).toMatch(/exists? on rule34\.xxx/);
    expect(output.notes.join(" ")).not.toMatch(/holds no tag/);
  });

  it("does not blame an excluded tag for an empty search", async () => {
    // Excluding a tag nobody carries removes nothing, so a name the site does
    // not hold cannot be why the search came back empty. Naming it as the cause
    // would send a caller to fix the one thing that was not the problem.
    const asked: string[] = [];
    const counting = (async (input: unknown) => {
      const url = String(input);
      asked.push(url);
      if (url.includes("s=tag")) {
        return new Response(url.includes("name=black_hair") ? KNOWN_TAG : UNKNOWN_TAG, {
          status: 200,
        });
      }
      return new Response(postsDocument(0, []), { status: 200 });
    }) as unknown as typeof fetch;

    const client = await connect(counting);
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], exclude: ["not a real tag at all"] },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.notes.join(" ")).not.toMatch(/holds no tag/);
    // The excluded name is never looked up, since it cannot be the cause. The
    // search URL carries it as a negation, so only the tag route counts here.
    const lookups = asked.filter((url) => url.includes("s=tag"));
    expect(lookups.some((url) => url.includes("name=not_a_real_tag_at_all"))).toBe(false);
    expect(lookups.some((url) => url.includes("name=black_hair"))).toBe(true);
  });

  it("blames the alternatives only when the site holds none of them", async () => {
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/name=black_hair/, { body: KNOWN_TAG }],
        [/s=tag/, { body: UNKNOWN_TAG }],
      ]),
    );
    const partly = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], any_of: ["black hair", "no such tag"] },
    });
    // One alternative exists, so the group still matches something.
    expect((partly.structuredContent as unknown as SearchOutput).notes.join(" ")).not.toMatch(
      /holds none/,
    );

    const none = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], any_of: ["no such tag", "nor this one"] },
    });
    expect((none.structuredContent as unknown as SearchOutput).notes.join(" ")).toMatch(
      /holds none/,
    );
  });

  it("spends no request on a search that found something", async () => {
    // A search that found posts needs no diagnosis, and asking the tag route
    // about every name would spend requests to learn nothing.
    const asked: string[] = [];
    const counting = (async (input: unknown) => {
      asked.push(String(input));
      return new Response(postsDocument(3, [1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = await connect(counting);
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair", "asuka langley sohryu"] },
    });

    expect((result.structuredContent as unknown as SearchOutput).total).toBe(3);
    expect(asked).toHaveLength(1);
    expect(asked.every((url) => url.includes("s=post"))).toBe(true);
  });

  it("reports a refusal by the site as a refusal", async () => {
    // The failure this must never render as an empty result.
    const client = await connect(stubFetch([[/s=post/, { status: 429, body: "" }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("rate_limited");
  });

  it("says what to configure when it has no credentials", async () => {
    const client = await connect(stubFetch(FOUND), {});
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"] },
    });
    const [content] = result.content as Array<{ text: string }>;
    expect(result.isError).toBe(true);
    expect(content?.text).toContain("RULE34_API_KEY");
  });

  it("keeps the key out of what it says when a request fails", async () => {
    const client = await connect(stubFetch([[/s=post/, { status: 503, body: "" }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"] },
    });
    expect((result.content as Array<{ text: string }>)[0]?.text).not.toContain("0123456789abcdef");
  });

  it("shows a few of a post's tags and states how many it has", async () => {
    // A page of twenty posts carries thousands of tags, and four fifths of the
    // answer would be tag strings nobody reads. A row shows an extract, and the
    // count says what the extract left out, so the list is never passed off as
    // whole.
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], limit: 1 },
    });
    const output = result.structuredContent as unknown as SearchOutput;

    expect(output.posts[0]?.tags).toHaveLength(12);
    expect(output.posts[0]?.tags_total).toBe(40);
    expect(output.notes.join(" ")).toMatch(/get_post/);
  });

  it("reads one post whole, with a kind for every tag", async () => {
    const client = await connect(
      stubFetch([
        [/json=1/, { body: DETAIL_JSON }],
        [/s=post/, { body: DETAIL_XML }],
      ]),
    );
    const result = await client.callTool({ name: "get_post", arguments: { id: 2195419 } });
    const post = result.structuredContent as unknown as {
      id: number;
      owner: string | null;
      comment_count: number | null;
      created_at: string | null;
      tags: Array<{ name: string; type: string; post_count: number }>;
    };

    expect(result.isError).toBeFalsy();
    expect(post.id).toBe(2195419);
    expect(post.owner).toBe("a_person");
    expect(post.comment_count).toBe(4);
    expect(post.created_at).toBe("2016-11-13T12:22:51.000Z");
    expect(post.tags).toEqual([
      { name: "black_hair", type: "general", post_count: 1597958 },
      { name: "asuka_langley_sohryu", type: "character", post_count: 18248 },
    ]);
  });

  it("reads a post named by the page a person would open", async () => {
    const client = await connect(
      stubFetch([
        [/json=1/, { body: DETAIL_JSON }],
        [/s=post/, { body: DETAIL_XML }],
      ]),
    );
    const result = await client.callTool({
      name: "get_post",
      arguments: {
        url: "https://rule34.xxx/index.php?page=post&s=view&id=2195419&tags=black_hair",
      },
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { id: number }).id).toBe(2195419);
  });

  it("refuses an id and a URL that name different posts", async () => {
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "get_post",
      arguments: { id: 1, url: "https://rule34.xxx/index.php?page=post&s=view&id=2" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("invalid_input");
  });

  it("says what the tags alone match when a restriction emptied the search", async () => {
    // A restriction that leaves nothing is indistinguishable from tags the site
    // holds nothing for, and a caller told only that the tags exist has to
    // guess which of their arguments to drop.
    const counting: string[] = [];
    const impl = (async (input: unknown) => {
      const url = String(input);
      counting.push(url);
      if (url.includes("s=tag")) {
        return new Response(KNOWN_TAG, { status: 200 });
      }
      // The restricted search carries the media tokens; the retry does not.
      const restricted = url.includes("-video");
      return new Response(restricted ? postsDocument(0, []) : postsDocument(9, [1]), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = await connect(impl);
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], media_type: "image", rating: "explicit" },
    });
    const note = (result.structuredContent as unknown as SearchOutput).notes.join(" ");

    expect(note).toContain("9");
    expect(note).toContain("media_type");
    expect(note).toContain("rating");
  });

  it("claims nothing about the tags alone when they match nothing either", async () => {
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/s=tag/, { body: KNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair", "asuka langley sohryu"], media_type: "video" },
    });
    const note = (result.structuredContent as unknown as SearchOutput).notes.join(" ");

    expect(note).toMatch(/no post carries them together/);
    expect(note).not.toMatch(/alone match/);
  });

  it("spends no retry when the search carried no restriction", async () => {
    const asked: string[] = [];
    const impl = (async (input: unknown) => {
      const url = String(input);
      asked.push(url);
      return new Response(url.includes("s=tag") ? KNOWN_TAG : postsDocument(0, []), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = await connect(impl);
    await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], media_type: "any" },
    });

    // One search and one tag lookup, and nothing else to learn.
    expect(asked.filter((url) => url.includes("s=post"))).toHaveLength(1);
  });

  it("spends no retry when a required tag is the reason", async () => {
    // The cause is already known, so dropping the restrictions would answer a
    // question nobody is left asking.
    const asked: string[] = [];
    const impl = (async (input: unknown) => {
      const url = String(input);
      asked.push(url);
      return new Response(url.includes("s=tag") ? UNKNOWN_TAG : postsDocument(0, []), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = await connect(impl);
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["no such tag"], media_type: "image" },
    });

    expect((result.structuredContent as unknown as SearchOutput).notes.join(" ")).toContain(
      "holds no tag",
    );
    expect(asked.filter((url) => url.includes("s=post"))).toHaveLength(1);
  });

  it("says that a page lies past the end rather than serving a bare emptiness", async () => {
    // A search of sixteen posts fills one page of twenty. Answering page 200
    // with an empty list and nothing else reads as a failure, or as a search
    // that found nothing, while the same object states a total of sixteen.
    const client = await connect(stubFetch([[/s=post/, { body: postsDocument(16, []) }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["black hair"], limit: 20, page: 200 },
    });
    const output = result.structuredContent as unknown as SearchOutput;
    const note = output.notes.join(" ");

    expect(output.total).toBe(16);
    expect(output.posts).toEqual([]);
    // The note names how far the search actually reaches, so the caller can go
    // there rather than guess.
    expect(note).toMatch(/past the end/i);
    expect(note).toContain("1 page");
    expect(note).toContain("200");
  });

  it("spends no diagnosis on a page past the end of a search that found nothing", async () => {
    // Two different silences: a page beyond the end, and tags the site holds
    // nothing for. The second already has its own answer, and saying both would
    // blame the page for an emptiness the tags caused.
    const client = await connect(
      stubFetch([
        [/s=post/, { body: postsDocument(0, []) }],
        [/s=tag/, { body: UNKNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["no such tag"], limit: 20, page: 200 },
    });
    const note = (result.structuredContent as unknown as SearchOutput).notes.join(" ");

    expect(note).toContain("holds no tag");
    expect(note).not.toMatch(/past the end/i);
  });

  it("says why it stops paging while posts remain", async () => {
    // At a limit of one, the page ceiling is reached long before the results
    // are. Stating that more remain and offering no next page is a pair of
    // fields that contradict each other unless the reason is given.
    const client = await connect(stubFetch([[/s=post/, { body: postsDocument(247, [17543976]) }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["prince of tennis"], limit: 1, page: 200 },
    });
    const output = result.structuredContent as unknown as SearchOutput;
    const note = output.notes.join(" ");

    expect(output.has_more).toBe(true);
    expect(output.next_page).toBeNull();
    expect(note).toMatch(/as far as this tool reads|page ceiling|stops/i);
    // Raising the limit reaches the rest, which is the way out worth naming.
    expect(note).toContain("limit");
  });

  it("shows the tags that were searched for, however far down the post lists them", async () => {
    // A row that omits the very tag it matched on reads as an off-topic result.
    const client = await connect(stubFetch([[/s=post/, { body: LATE_TAG_POST }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["prince of tennis"], limit: 1 },
    });
    const row = (result.structuredContent as unknown as SearchOutput).posts[0];

    expect(row?.tags[0]).toBe("prince_of_tennis");
    expect(row?.tags).toHaveLength(12);
    expect(row?.tags_total).toBe(22);
  });

  it("never puts a tag in a row that the post does not carry", async () => {
    // Hoisting the searched tags must lift what is there, never add what is
    // not: a row is what the post carries.
    const client = await connect(stubFetch([[/s=post/, { body: LATE_TAG_POST }]]));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["prince of tennis"], any_of: ["monochrome", "aaa_19"], limit: 1 },
    });
    const row = (result.structuredContent as unknown as SearchOutput).posts[0];

    expect(row?.tags).toContain("prince_of_tennis");
    expect(row?.tags).toContain("aaa_19");
    expect(row?.tags).not.toContain("monochrome");
  });

  it("refuses a tag made of spaces without quoting a length it does not exceed", async () => {
    // Three spaces are refused for being empty, and a message opening on "at
    // most 120 characters" sends a caller counting characters they never wrote.
    const client = await connect(stubFetch(FOUND));
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["   "] },
    });
    const [content] = result.content as Array<{ text: string }>;

    expect(content?.text).toContain("invalid_input");
    expect(content?.text).not.toContain("120");
  });

  it("describes every order it accepts", async () => {
    // A description naming two of the four leaves the other two undiscoverable,
    // and a caller cannot ask for what the tool never told them about.
    const client = await connect(stubFetch(FOUND));
    const { tools } = await client.listTools();
    const search = tools.find((tool) => tool.name === "search_posts");
    expect(search).toBeDefined();
    const properties = (search?.inputSchema ?? {}) as {
      properties?: Record<string, { description?: string }>;
    };
    const sort = properties.properties?.sort?.description;

    for (const order of ["score", "id", "updated", "random"]) {
      expect(sort, order).toContain(order);
    }
  });

  it("says where the date it carries comes from", async () => {
    // Thousands of old posts share the day the site imported them, so calling
    // this the publication date states something about the work that the data
    // says about the upload.
    const client = await connect(stubFetch(FOUND));
    const { tools } = await client.listTools();
    const post = tools.find((tool) => tool.name === "get_post");
    expect(post).toBeDefined();
    const properties = (post?.outputSchema ?? {}) as {
      properties?: Record<string, { description?: string }>;
    };
    const created = properties.properties?.created_at?.description;

    expect(created).toMatch(/added to rule34\.xxx/i);
    expect(created).not.toMatch(/\bpublished\b/i);
  });

  it("offers the names the site holds for a piece of text", async () => {
    const client = await connect(stubFetch([[/autocomplete/, { body: ONE_SUGGESTION }]]));
    const result = await client.callTool({
      name: "find_tags",
      arguments: { query: "kimagure orange" },
    });
    const output = result.structuredContent as unknown as {
      query: string;
      tags: Array<{ name: string; post_count: number | null }>;
      notes: string[];
    };

    expect(result.isError).toBeFalsy();
    expect(output.query).toBe("kimagure_orange");
    expect(output.tags).toEqual([{ name: "kimagure_orange_road", post_count: 325 }]);
  });

  it("says that the site caps the list it offers", async () => {
    // Ten names back is what the site always answers when it has ten to give,
    // so a caller reading ten must not conclude that ten is all there is.
    const client = await connect(stubFetch([[/autocomplete/, { body: TEN_SUGGESTIONS }]]));
    const result = await client.callTool({ name: "find_tags", arguments: { query: "kimagure" } });
    const output = result.structuredContent as unknown as { notes: string[] };

    expect(output.notes.join(" ")).toMatch(/ten|caps/i);
  });

  it("says how the route matches when it offers nothing", async () => {
    // It matches from the start of a name, so a word sitting inside a tag finds
    // nothing, and a caller told only "no match" would stop looking.
    const client = await connect(stubFetch([[/autocomplete/, { body: "[]" }]]));
    const result = await client.callTool({
      name: "find_tags",
      arguments: { query: "orange road" },
    });
    const output = result.structuredContent as unknown as {
      tags: unknown[];
      notes: string[];
    };

    expect(output.tags).toEqual([]);
    expect(output.notes.join(" ")).toMatch(/start of a name/i);
  });

  it("offers near names when a search names a tag the site does not hold", async () => {
    // A misspelling ends a search, and naming the real tag is what turns the
    // refusal into a next step.
    const client = await connect(
      stubFetch([
        [/autocomplete/, { body: ONE_SUGGESTION }],
        [/s=post/, { body: postsDocument(0, []) }],
        [/s=tag/, { body: UNKNOWN_TAG }],
      ]),
    );
    const result = await client.callTool({
      name: "search_posts",
      arguments: { tags: ["kimagure orange rado"] },
    });
    const note = (result.structuredContent as unknown as SearchOutput).notes.join(" ");

    expect(note).toContain("kimagure_orange_rado");
    expect(note).toContain("kimagure_orange_road");
  });
});
