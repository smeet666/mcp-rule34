import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { Rule34Client } from "../../src/rule34/client.js";

const CREDENTIALS = { RULE34_USER_ID: "6701429", RULE34_API_KEY: "0123456789abcdef" };

function postsDocument(count: number, ids: number[]): string {
  const posts = ids
    .map(
      (id) =>
        `<post id="${id}" width="100" height="100" score="1" rating="e" md5="deadbeef" ` +
        `file_url="https://api-cdn.rule34.xxx/images/1/deadbeef.png" tags="black_hair" ` +
        `parent_id="" source="" status="active" has_children="false" has_comments="false" ` +
        `has_notes="false" change="1787514379" created_at="Sun Nov 13 13:22:51 +0100 2016"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><posts count="${count}" offset="0">${posts}</posts>`;
}

const DETAIL_JSON = JSON.stringify([
  {
    id: 2195419,
    width: 1920,
    height: 1350,
    score: 178,
    rating: "explicit",
    hash: "aaaa1111",
    file_url: "https://api-cdn.rule34.xxx/images/2027/aaaa1111.jpeg",
    tags: "black_hair",
    tag_info: [{ count: 1597958, type: "tag", tag: "black_hair" }],
    owner: "a_person",
    comment_count: 4,
    parent_id: 0,
    source: "",
    status: "active",
    has_notes: false,
    change: 1741898933,
  },
]);

/** The same post as the XML route publishes it, carrying the date. */
const DETAIL_XML =
  '<?xml version="1.0" encoding="UTF-8"?><posts count="1" offset="0">' +
  '<post id="2195419" width="1920" height="1350" score="178" rating="e" md5="aaaa1111" ' +
  'file_url="https://api-cdn.rule34.xxx/images/2027/aaaa1111.jpeg" tags="black_hair" ' +
  'parent_id="" source="" status="active" has_children="false" has_comments="true" ' +
  'has_notes="false" creator_id="46501" change="1741898933" ' +
  'created_at="Sun Nov 13 13:22:51 +0100 2016"/></posts>';

const KNOWN_TAG =
  '<?xml version="1.0" encoding="UTF-8"?><tags type="array">' +
  '<tag type="0" count="1597958" name="black_hair" ambiguous="false" id="49"/></tags>';
const UNKNOWN_TAG = '<?xml version="1.0" encoding="UTF-8"?><tags type="array"/>';

/** Answers by route, and counts what was asked. */
function stubFetch(routes: [RegExp, string][]) {
  const calls: string[] = [];
  const impl = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    for (const [pattern, body] of routes) {
      if (pattern.test(url)) {
        return new Response(body, { status: 200 });
      }
    }
    return new Response("<posts/>", { status: 404 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = CREDENTIALS) {
  const config = { ...loadConfig(env), minIntervalMs: 0, maxRetries: 0 };
  return new Rule34Client({ config, logger: createLogger("silent"), fetchImpl });
}

const SEARCH_ROUTE: [RegExp, string] = [/s=post/, postsDocument(2, [1, 2])];

describe("Rule34Client", () => {
  it("refuses to search before it has credentials, without asking the site", async () => {
    // Sending the request anyway would return the site's authentication error,
    // which reads as a fault on its side rather than a setting never made.
    const { impl, calls } = stubFetch([SEARCH_ROUTE]);
    const bare = client(impl, {});
    await expect(bare.searchPosts({ tags: ["black hair"], limit: 5, page: 1 })).rejects.toThrow(
      /invalid_input/,
    );
    // The refusal has to say what to set and where, since nothing else will.
    await expect(
      bare.searchPosts({ tags: ["black hair"], limit: 5, page: 1 }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      details: { hint: expect.stringContaining("RULE34_API_KEY") },
    });
    expect(calls).toHaveLength(0);
  });

  it("reads a search and says it came from the site", async () => {
    const { impl } = stubFetch([SEARCH_ROUTE]);
    const read = await client(impl).searchPosts({ tags: ["black hair"], limit: 5, page: 1 });
    expect(read.cached).toBe(false);
    expect(read.data.total).toBe(2);
    expect(read.data.posts.map((post) => post.id)).toEqual([1, 2]);
  });

  it("answers the same question twice without asking twice, and says so", async () => {
    const { impl, calls } = stubFetch([SEARCH_ROUTE]);
    const reader = client(impl);
    await reader.searchPosts({ tags: ["black hair"], limit: 5, page: 1 });
    const second = await reader.searchPosts({ tags: ["black hair"], limit: 5, page: 1 });
    expect(second.cached).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("treats a different question as a different question", async () => {
    const { impl, calls } = stubFetch([SEARCH_ROUTE]);
    const reader = client(impl);
    await reader.searchPosts({ tags: ["black hair"], limit: 5, page: 1 });
    await reader.searchPosts({ tags: ["black hair"], limit: 5, page: 2 });
    await reader.searchPosts({ tags: ["black hair"], mediaType: "video", limit: 5, page: 1 });
    expect(calls).toHaveLength(3);
  });

  it("keeps the key out of the addresses it remembers", async () => {
    // The cache key is the address, and an address with the key in it puts the
    // key in a second place for no gain.
    const { impl } = stubFetch([SEARCH_ROUTE]);
    const reader = client(impl);
    await reader.searchPosts({ tags: ["black hair"], limit: 5, page: 1 });
    expect(JSON.stringify([...reader.cacheKeys()])).not.toContain("0123456789abcdef");
  });

  it("reads a tag the site knows", async () => {
    const { impl } = stubFetch([[/s=tag/, KNOWN_TAG]]);
    const read = await client(impl).lookupTag("black hair");
    expect(read.data?.name).toBe("black_hair");
    expect(read.data?.type).toBe("general");
  });

  it("reads a tag the site does not know as nothing, rather than as a failure", async () => {
    const { impl } = stubFetch([[/s=tag/, UNKNOWN_TAG]]);
    const read = await client(impl).lookupTag("asuka langley sohry");
    expect(read.data).toBeNull();
  });

  it("names which tags of a search do not exist", async () => {
    // This is what turns "no results" into something a caller can act on when
    // one name out of several was misspelled.
    const impl = (async (input: unknown) => {
      const url = String(input);
      const known = url.includes("name=black_hair");
      return new Response(known ? KNOWN_TAG : UNKNOWN_TAG, { status: 200 });
    }) as unknown as typeof fetch;

    const unknown = await client(impl).findUnknownTags([
      "black hair",
      "asuka langley sohry",
      "ranma 1/2",
    ]);
    expect(unknown).toEqual(["asuka_langley_sohry", "ranma_1/2"]);
  });

  it("asks about each name once, however many times it was given", async () => {
    const { impl, calls } = stubFetch([[/s=tag/, KNOWN_TAG]]);
    await client(impl).findUnknownTags(["black hair", "black_hair", "Black Hair"]);
    expect(calls).toHaveLength(1);
  });

  it("reads one post from both formats, so nothing either one holds is lost", async () => {
    // The date lives only in the XML and the uploader's name only in the JSON.
    // A fiche reading one of them would leave out what the other carries.
    const { impl, calls } = stubFetch([
      [/json=1/, DETAIL_JSON],
      [/s=post/, DETAIL_XML],
    ]);
    const read = await client(impl).getPost({ id: 2195419 });

    expect(calls).toHaveLength(2);
    expect(read.data.owner).toBe("a_person");
    expect(read.data.commentCount).toBe(4);
    expect(read.data.createdAt).toBe("2016-11-13T12:22:51.000Z");
    expect(read.data.creatorId).toBe(46501);
    expect(read.data.tagDetails[0]).toEqual({
      name: "black_hair",
      type: "general",
      postCount: 1597958,
    });
  });

  it("reads a post named by its page instead of by its id", async () => {
    const { impl } = stubFetch([
      [/json=1/, DETAIL_JSON],
      [/s=post/, DETAIL_XML],
    ]);
    const read = await client(impl).getPost({
      url: "https://rule34.xxx/index.php?page=post&s=view&id=2195419&tags=black_hair",
    });
    expect(read.data.id).toBe(2195419);
  });

  it("refuses to read a post before it has credentials", async () => {
    const { impl, calls } = stubFetch([[/./, DETAIL_JSON]]);
    await expect(client(impl, {}).getPost({ id: 1 })).rejects.toThrow(/invalid_input/);
    expect(calls).toHaveLength(0);
  });
});
