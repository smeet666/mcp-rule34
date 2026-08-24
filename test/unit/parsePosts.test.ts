import { describe, expect, it } from "vitest";
import { Rule34Error } from "../../src/errors.js";
import { parsePostList } from "../../src/rule34/parsers/posts.js";

const URL = "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=black_hair";

/** One post, with every attribute the route publishes. Values are invented. */
const ONE_POST = `<?xml version="1.0" encoding="UTF-8"?>
<posts count="1522047" offset="0">
  <post
    change="1787514379"
    created_at="Sun Aug 23 21:46:19 +0200 2026"
    creator_id="5740710"
    file_url="https://api-cdn.rule34.xxx/images/465/aaaa1111.png"
    has_children="false"
    has_comments="true"
    has_notes="false"
    height="2016"
    id="18540926"
    md5="aaaa1111"
    parent_id=""
    preview_height="150"
    preview_url="https://api-cdn.rule34.xxx/thumbnails/465/thumbnail_aaaa1111.jpg"
    preview_width="114"
    rating="e"
    sample_height="1116"
    sample_url="https://api-cdn.rule34.xxx/samples/465/sample_aaaa1111.jpg"
    sample_width="850"
    score="12"
    source="https://example.invalid/gallery"
    status="active"
    tags="asuka_langley_sohryu black_hair neon_genesis_evangelion"
    width="1536"
  />
</posts>`;

describe("parsePostList", () => {
  it("reads the total the site counted, alongside the rows it served", () => {
    // The total belongs to the search, and the rows belong to one page of it.
    // Reporting the number of rows as a total is how a search of a million
    // posts gets answered with "20".
    const list = parsePostList(ONE_POST, URL);
    expect(list.total).toBe(1522047);
    expect(list.offset).toBe(0);
    expect(list.posts).toHaveLength(1);
  });

  it("spells out the rating the XML abbreviates", () => {
    // This route writes one letter where the site writes a word. A caller that
    // asked for `explicit` has to find `explicit` in the answer.
    expect(parsePostList(ONE_POST, URL).posts[0]?.rating).toBe("explicit");
    expect(parsePostList(ONE_POST.replace('rating="e"', 'rating="q"'), URL).posts[0]?.rating).toBe(
      "questionable",
    );
    expect(parsePostList(ONE_POST.replace('rating="e"', 'rating="s"'), URL).posts[0]?.rating).toBe(
      "safe",
    );
  });

  it("keeps an unknown rating letter rather than guessing at it", () => {
    const post = parsePostList(ONE_POST.replace('rating="e"', 'rating="x"'), URL).posts[0];
    expect(post?.rating).toBe("x");
  });

  it("splits the tag string into the tags it holds", () => {
    expect(parsePostList(ONE_POST, URL).posts[0]?.tags).toEqual([
      "asuka_langley_sohryu",
      "black_hair",
      "neon_genesis_evangelion",
    ]);
  });

  it("reads an absent parent as absent", () => {
    // The attribute is present and empty on a post that has no parent. Reading
    // that as 0 invents a post id that belongs to somebody else.
    expect(parsePostList(ONE_POST, URL).posts[0]?.parentId).toBeNull();
  });

  it("reads an absent source as absent", () => {
    const withoutSource = ONE_POST.replace('source="https://example.invalid/gallery"', 'source=""');
    expect(parsePostList(withoutSource, URL).posts[0]?.source).toBeNull();
  });

  it("carries the numbers as numbers and the flags as flags", () => {
    const post = parsePostList(ONE_POST, URL).posts[0];
    expect(post?.id).toBe(18540926);
    expect(post?.width).toBe(1536);
    expect(post?.height).toBe(2016);
    expect(post?.score).toBe(12);
    expect(post?.hasComments).toBe(true);
    expect(post?.hasNotes).toBe(false);
  });

  it("tells when a post was published apart from when it last changed", () => {
    // The two are years apart on an old post that was retagged recently, so
    // reading one as the other dates a 2016 image to last spring.
    const post = parsePostList(
      ONE_POST.replace(
        'created_at="Sun Aug 23 21:46:19 +0200 2026"',
        'created_at="Sun Nov 13 13:22:51 +0100 2016"',
      ),
      URL,
    ).posts[0];
    expect(post?.createdAt).toBe("2016-11-13T12:22:51.000Z");
    expect(post?.changedAtUnix).toBe(1787514379);
  });

  it("reads a date it cannot make sense of as unknown", () => {
    const post = parsePostList(ONE_POST.replace(/created_at="[^"]*"/, 'created_at=""'), URL)
      .posts[0];
    expect(post?.createdAt).toBeNull();
  });

  it("addresses the page a person can open", () => {
    expect(parsePostList(ONE_POST, URL).posts[0]?.postUrl).toBe(
      "https://rule34.xxx/index.php?page=post&s=view&id=18540926",
    );
  });

  it("reads a search that found nothing as a search that found nothing", () => {
    // The site answers this with a document that counts zero, which is the one
    // shape that tells an absence apart from a truncated read.
    const empty = '<?xml version="1.0" encoding="UTF-8"?><posts count="0" offset="0"></posts>';
    const list = parsePostList(empty, URL);
    expect(list.total).toBe(0);
    expect(list.posts).toEqual([]);
  });

  it("refuses a document that carries no count", () => {
    // A total that cannot be read is unknown, and calling it 0 states that the
    // site holds nothing on a tag it may hold thousands of.
    const noCount = '<?xml version="1.0" encoding="UTF-8"?><posts offset="0"></posts>';
    expect(() => parsePostList(noCount, URL)).toThrow(Rule34Error);
    expect(() => parsePostList(noCount, URL)).toThrow(/parse_failure/);
  });

  it("tells a missing key apart from a broken document", () => {
    // The route answers an unauthenticated request with HTTP 200 and this
    // document. Reading it as a malformed answer sends a caller to look at the
    // site, when what is missing is in their own configuration.
    const missingKey =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<error>Missing authentication. Go to api.rule34.xxx for more information</error>";
    try {
      parsePostList(missingKey, URL);
      expect.unreachable("an unauthenticated answer must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Rule34Error);
      expect((error as Rule34Error).code).toBe("invalid_input");
      expect((error as Rule34Error).details.hint).toMatch(/RULE34_API_KEY/);
    }
  });

  it("refuses an answer that is not the document this route publishes", () => {
    expect(() => parsePostList("<html><body>maintenance</body></html>", URL)).toThrow(
      /parse_failure/,
    );
    expect(() => parsePostList("", URL)).toThrow(/parse_failure/);
  });

  it("names the failed URL without carrying the key into it", () => {
    const withKey = `${URL}&api_key=0123456789abcdef&user_id=6701429`;
    try {
      parsePostList("not xml", withKey);
      expect.unreachable("parsing garbage must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Rule34Error);
      expect((error as Rule34Error).details.url).not.toContain("0123456789abcdef");
    }
  });
});
