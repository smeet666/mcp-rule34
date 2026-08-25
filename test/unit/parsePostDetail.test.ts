import { describe, expect, it } from "vitest";
import { Rule34Error } from "../../src/errors.js";
import { parsePostDetail } from "../../src/rule34/parsers/postDetail.js";

const URL = "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id=2195419&json=1";

/** One post as the JSON route publishes it. Values are invented. */
const ONE_POST = JSON.stringify([
  {
    change: 1_741_898_933,
    comment_count: 4,
    directory: 2027,
    file_url: "https://api-cdn.rule34.xxx/images/2027/aaaa1111.jpeg",
    has_notes: false,
    hash: "aaaa1111",
    height: 1350,
    id: 2_195_419,
    image: "aaaa1111.jpeg",
    owner: "a_person",
    parent_id: 0,
    preview_url: "https://api-cdn.rule34.xxx/thumbnails/2027/thumbnail_aaaa1111.jpg",
    rating: "explicit",
    sample: true,
    sample_url: "https://api-cdn.rule34.xxx/samples/2027/sample_aaaa1111.jpg",
    score: 178,
    source: "",
    status: "active",
    tags: "asuka_langley_sohryu black_hair neon_genesis_evangelion crossover",
    tag_info: [
      { count: 18_248, type: "character", tag: "asuka_langley_sohryu" },
      { count: 1_597_958, type: "tag", tag: "black_hair" },
      { count: 34_625, type: "copyright", tag: "neon_genesis_evangelion" },
      { count: 194_847, type: "metadata", tag: "crossover" },
    ],
    width: 1920,
  },
]);

describe("parsePostDetail", () => {
  it("reads what only this route carries", () => {
    // The uploader by name and the number of comments are the reason a single
    // post is read here rather than out of a search.
    const post = parsePostDetail(ONE_POST, URL, 2_195_419);
    expect(post.owner).toBe("a_person");
    expect(post.commentCount).toBe(4);
  });

  it("names the kind of every tag, and how many posts carry it", () => {
    const post = parsePostDetail(ONE_POST, URL, 2_195_419);
    expect(post.tagDetails).toEqual([
      { name: "asuka_langley_sohryu", type: "character", postCount: 18_248 },
      { name: "black_hair", type: "general", postCount: 1_597_958 },
      { name: "neon_genesis_evangelion", type: "copyright", postCount: 34_625 },
      { name: "crossover", type: "metadata", postCount: 194_847 },
    ]);
  });

  it("keeps a kind it does not know rather than guessing at it", () => {
    const odd = ONE_POST.replace('"type":"metadata"', '"type":"newthing"');
    const post = parsePostDetail(odd, URL, 2_195_419);
    expect(post.tagDetails.at(-1)?.type).toBe("newthing");
  });

  it("reads the absence of a parent as an absence", () => {
    // This route writes 0 where the XML writes an empty string, and 0 is a post
    // id that belongs to somebody else.
    expect(parsePostDetail(ONE_POST, URL, 2_195_419).parentId).toBeNull();
  });

  it("reads an uncredited source as an absence", () => {
    expect(parsePostDetail(ONE_POST, URL, 2_195_419).source).toBeNull();
  });

  it("carries the tags as a list as well as the details", () => {
    expect(parsePostDetail(ONE_POST, URL, 2_195_419).tags).toEqual([
      "asuka_langley_sohryu",
      "black_hair",
      "neon_genesis_evangelion",
      "crossover",
    ]);
  });

  it("reads a post the site does not hold as absent", () => {
    // This route answers a search that matched nothing with an empty body, and
    // a request naming one id matches nothing when that post is gone.
    expect(() => parsePostDetail("", URL, 999)).toThrow(/not_found/);
    expect(() => parsePostDetail("[]", URL, 999)).toThrow(/not_found/);
  });

  it("refuses an answer that is not this route's document", () => {
    expect(() => parsePostDetail("<html>maintenance</html>", URL, 1)).toThrow(/parse_failure/);
    expect(() => parsePostDetail('{"not":"a list"}', URL, 1)).toThrow(/parse_failure/);
  });

  it("tells a missing key apart from a broken document", () => {
    const missing = JSON.stringify(
      "Missing authentication. Go to api.rule34.xxx for more information",
    );
    try {
      parsePostDetail(missing, URL, 1);
      expect.unreachable("an unauthenticated answer must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Rule34Error);
      expect((error as Rule34Error).code).toBe("invalid_input");
      expect((error as Rule34Error).details.hint).toMatch(/RULE34_API_KEY/);
    }
  });

  it("keeps the key out of the address it names", () => {
    const withKey = `${URL}&api_key=0123456789abcdef`;
    try {
      parsePostDetail("not json", withKey, 1);
      expect.unreachable("garbage must fail");
    } catch (error) {
      expect((error as Rule34Error).details.url).not.toContain("0123456789abcdef");
    }
  });
});
