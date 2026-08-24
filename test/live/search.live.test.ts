/**
 * Live suite: one real request per route, run on demand.
 *
 * These tests reach rule34.xxx, so they stay out of `npm test` and need
 * credentials in the environment. What they check is what fixtures cannot: that
 * the route still answers the document this client reads, and that a search
 * composed from the arguments still narrows the way the site's own grammar says
 * it does.
 */

import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { Rule34Client } from "../../src/rule34/client.js";
import { buildSearchQuery, type PostSearch } from "../../src/rule34/urls.js";
import type { PostList } from "../../src/types.js";

const config = loadConfig(process.env);
const credentials = config.credentials;
const reader = new Rule34Client({ config, logger: createLogger("silent") });

/**
 * Without credentials there is nothing to test, and nothing to fail either.
 *
 * A scheduled canary is the exception: it is the only thing that notices when
 * the site changes shape, so one running without credentials would pass every
 * night while testing nothing. Setting RULE34_LIVE says a run is meant to reach
 * the site, and a run that cannot fails loudly instead of skipping.
 */
if (!credentials && process.env.RULE34_LIVE === "1") {
  throw new Error(
    "RULE34_LIVE is set, so this run is meant to reach rule34.xxx, but RULE34_USER_ID and " +
      "RULE34_API_KEY are missing. Set both, or unset RULE34_LIVE to skip the live suite.",
  );
}

const live = credentials ? describe : describe.skip;

async function search(params: PostSearch): Promise<PostList> {
  const { data } = await reader.searchPosts(params);
  return data;
}

function report(title: string, query: string, list: PostList): void {
  const lines = [
    `\n${title}`,
    `  query : ${query}`,
    `  total : ${list.total.toLocaleString("en-US")}`,
    ...list.posts.map(
      (post) =>
        `  · ${post.postUrl}\n      ${post.width}x${post.height}` +
        ` score ${post.score} ${post.rating}\n      ${post.fileUrl}`,
    ),
  ];
  console.log(lines.join("\n"));
}

live("a search that reaches rule34.xxx", () => {
  it("finds colour artwork of a series", async () => {
    // Colour is stated by what a post does not carry: the site tags the black
    // and white ones, and tags nothing to say a post is in colour.
    const params: PostSearch = {
      tags: ["prince of tennis"],
      exclude: ["monochrome", "greyscale", "grayscale"],
      mediaType: "image",
      sort: "score",
      limit: 3,
      page: 1,
    };
    const list = await search(params);
    report("Prince of Tennis, colour images", buildSearchQuery(params), list);

    expect(list.total).toBeGreaterThan(0);
    expect(list.posts.length).toBeGreaterThan(0);
    for (const post of list.posts) {
      expect(post.fileUrl).toMatch(/\.(jpe?g|png)$/i);
      expect(post.tags).not.toContain("monochrome");
      expect(post.postUrl).toMatch(/^https:\/\/rule34\.xxx\/index\.php\?page=post/);
    }
  });

  it("finds video of a series' characters", async () => {
    const params: PostSearch = {
      tags: ["neon genesis evangelion"],
      mediaType: "video",
      sort: "score",
      limit: 3,
      page: 1,
    };
    const list = await search(params);
    report("Neon Genesis Evangelion, videos", buildSearchQuery(params), list);

    expect(list.total).toBeGreaterThan(0);
    expect(list.posts.length).toBeGreaterThan(0);
    for (const post of list.posts) {
      expect(post.fileUrl).toMatch(/\.(mp4|webm)$/i);
      expect(post.tags).toContain("video");
    }
  });

  it("counts a narrowed search as fewer than the search it narrows", async () => {
    // The site does the filtering, so its count follows the question. A total
    // that stayed put would mean a filter this client only claims to apply.
    const wide = await search({ tags: ["neon genesis evangelion"], limit: 1, page: 1 });
    const narrow = await search({
      tags: ["neon genesis evangelion"],
      mediaType: "video",
      limit: 1,
      page: 1,
    });
    expect(narrow.total).toBeLessThan(wide.total);
    expect(narrow.total).toBeGreaterThan(0);
  });

  it("names the tag that emptied a search", async () => {
    // A name one letter short of a real tag empties a search exactly the way a
    // combination the site holds nothing for does. Only the tag route separates
    // the two, and this is the answer a caller can act on.
    const params: PostSearch = {
      tags: ["neon genesis evangelion", "asuka langley sohry"],
      limit: 1,
      page: 1,
    };
    const list = await search(params);
    expect(list.total).toBe(0);

    const unknown = await reader.findUnknownTags(params.tags);
    console.log(`\nA search of ${params.tags.length} tags found nothing.`);
    console.log(`  unknown tags : ${unknown.join(", ")}`);
    expect(unknown).toEqual(["asuka_langley_sohry"]);
  });

  it("reads one post whole, from both formats at once", async () => {
    // The date comes from the XML and the uploader's name from the JSON, so a
    // fiche that lost either one would show this test a null.
    const { data } = await reader.getPost({
      url: "https://rule34.xxx/index.php?page=post&s=view&id=2195419",
    });
    console.log(`\nPost ${data.id}: ${data.tagDetails.length} tags, posted ${data.createdAt}`);
    console.log(`  uploader ${data.owner}, ${data.commentCount} comment(s)`);
    const kinds = new Set(data.tagDetails.map((tag) => tag.type));
    console.log(`  kinds : ${[...kinds].sort().join(", ")}`);

    expect(data.id).toBe(2195419);
    expect(data.createdAt).toMatch(/^2016-/);
    expect(data.owner).toBeTruthy();
    expect(data.commentCount).not.toBeNull();
    expect(kinds.has("character")).toBe(true);
    expect(kinds.has("copyright")).toBe(true);
  });
});
