import { describe, expect, it } from "vitest";
import { Rule34Error } from "../../src/errors.js";
import {
  buildPostPageUrl,
  buildTagSuggestUrl,
  buildPostSearchUrl,
  buildSearchQuery,
  buildTagLookupUrl,
  normalizeTag,
  redactCredentials,
} from "../../src/rule34/urls.js";

const CREDENTIALS = { apiKey: "0123456789abcdef", userId: "6701429" };

describe("normalizeTag", () => {
  it("writes a name the way rule34.xxx spells a tag", () => {
    // Tags are one token: what a person says as words, the site stores joined
    // by underscores. Someone asking for a character types the name.
    expect(normalizeTag("black hair")).toBe("black_hair");
    expect(normalizeTag("Asuka Langley Sohryu")).toBe("asuka_langley_sohryu");
    expect(normalizeTag("Urusei   Yatsura")).toBe("urusei_yatsura");
  });

  it("keeps a name that is already written as a tag", () => {
    expect(normalizeTag("asuka_langley_sohryu")).toBe("asuka_langley_sohryu");
  });

  it("keeps the punctuation a tag is allowed to carry", () => {
    // A slash is part of the name itself, and the tag `ranma_1/2` is the one
    // the site holds for that series.
    expect(normalizeTag(" ranma 1/2 ")).toBe("ranma_1/2");
  });

  it("refuses a tag that carries a metatag", () => {
    // `rating:` and `sort:` are arguments this tool declares. Reading them out
    // of a tag would let a caller set a filter the answer then reports as
    // something else, so they are refused where they cannot be seen.
    expect(() => normalizeTag("rating:safe")).toThrow(Rule34Error);
    expect(() => normalizeTag("sort:score:desc")).toThrow(/invalid_input/);
  });

  it("refuses a negated tag", () => {
    // Exclusion has an argument of its own, so a dash here is either a mistake
    // or an attempt to negate a tag the answer says it searched for.
    expect(() => normalizeTag("-black_hair")).toThrow(/invalid_input/);
  });

  it("refuses an empty tag rather than searching for everything", () => {
    expect(() => normalizeTag("   ")).toThrow(/invalid_input/);
  });
});

describe("buildSearchQuery", () => {
  it("joins several tags, which the site reads as all of them at once", () => {
    expect(
      buildSearchQuery({
        tags: ["Asuka Langley Sohryu", "black hair"],
        limit: 20,
        page: 1,
      }),
    ).toBe("asuka_langley_sohryu black_hair");
  });

  it("groups the alternatives the site reads as any of them", () => {
    // The braces and the spaces inside them are what the site's own grammar
    // requires; without them the tilde is read as part of a tag name.
    expect(
      buildSearchQuery({
        tags: ["asuka_langley_sohryu"],
        anyOf: ["blonde hair", "red hair"],
        limit: 20,
        page: 1,
      }),
    ).toBe("asuka_langley_sohryu ( blonde_hair ~ red_hair )");
  });

  it("states a lone alternative as a plain tag", () => {
    // A group of one is the same request as the tag itself, and the braces
    // would suggest a choice the search does not make.
    expect(
      buildSearchQuery({ tags: ["black_hair"], anyOf: ["blue eyes"], limit: 20, page: 1 }),
    ).toBe("black_hair blue_eyes");
  });

  it("negates what is excluded", () => {
    expect(
      buildSearchQuery({
        tags: ["black_hair"],
        exclude: ["3d", "cosplay"],
        limit: 20,
        page: 1,
      }),
    ).toBe("black_hair -3d -cosplay");
  });

  it("asks the site for one kind of media at a time", () => {
    // The site's own tags carry the distinction, so it does the filtering and
    // the count it returns stays the count of what was asked for.
    const base = { tags: ["black_hair"], limit: 20, page: 1 };
    expect(buildSearchQuery({ ...base, mediaType: "image" })).toBe("black_hair -video -animated");
    expect(buildSearchQuery({ ...base, mediaType: "animated" })).toBe("black_hair animated -video");
    expect(buildSearchQuery({ ...base, mediaType: "video" })).toBe("black_hair video");
    expect(buildSearchQuery({ ...base, mediaType: "any" })).toBe("black_hair");
  });

  it("writes the whole query in the order the site reads it", () => {
    expect(
      buildSearchQuery({
        tags: ["asuka langley sohryu", "black hair"],
        anyOf: ["blonde hair", "red hair"],
        exclude: ["3d", "cosplay"],
        mediaType: "image",
        rating: "explicit",
        sort: "score",
        limit: 20,
        page: 1,
      }),
    ).toBe(
      "asuka_langley_sohryu black_hair ( blonde_hair ~ red_hair ) -3d -cosplay " +
        "-video -animated rating:explicit sort:score:desc",
    );
  });

  it("sorts at random without a direction", () => {
    expect(buildSearchQuery({ tags: ["urusei_yatsura"], sort: "random", limit: 20, page: 1 })).toBe(
      "urusei_yatsura sort:random",
    );
  });

  it("refuses a search with no tag at all", () => {
    expect(() => buildSearchQuery({ tags: [], limit: 20, page: 1 })).toThrow(/invalid_input/);
  });

  it("refuses more tags than it will carry", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `tag_${index}`);
    expect(() => buildSearchQuery({ tags: eleven, limit: 20, page: 1 })).toThrow(/invalid_input/);
  });

  it("refuses a tag that is required and excluded at once", () => {
    // Such a search matches nothing by construction. Sending it would answer a
    // contradiction with an absence, which reads as "the site holds none".
    expect(() =>
      buildSearchQuery({ tags: ["black hair"], exclude: ["black_hair"], limit: 20, page: 1 }),
    ).toThrow(/invalid_input/);
  });
});

describe("buildPostSearchUrl", () => {
  it("addresses the API route and carries the credentials", () => {
    const url = buildPostSearchUrl(
      { tags: ["black_hair"], mediaType: "image", limit: 20, page: 1 },
      CREDENTIALS,
    );
    expect(url).toBe(
      "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index" +
        "&tags=black_hair%20-video%20-animated&limit=20&pid=0" +
        "&api_key=0123456789abcdef&user_id=6701429",
    );
  });

  it("encodes the punctuation a tag carries", () => {
    const url = buildPostSearchUrl({ tags: ["ranma 1/2"], limit: 5, page: 1 }, CREDENTIALS);
    expect(url).toContain("tags=ranma_1%2F2");
    expect(url).not.toContain("ranma_1/2");
  });

  it("encodes the grammar of a group of alternatives", () => {
    const url = buildPostSearchUrl(
      { tags: ["black_hair"], anyOf: ["blue eyes", "green eyes"], limit: 5, page: 1 },
      CREDENTIALS,
    );
    expect(url).toContain("black_hair%20(%20blue_eyes%20~%20green_eyes%20)");
  });

  it("encodes the colon a metatag carries", () => {
    const url = buildPostSearchUrl(
      { tags: ["asuka_langley_sohryu"], rating: "explicit", sort: "score", limit: 5, page: 1 },
      CREDENTIALS,
    );
    expect(url).toContain("rating%3Aexplicit%20sort%3Ascore%3Adesc");
  });

  it("counts pages the way the API counts them", () => {
    // A caller counts from 1, and `pid` on this route is a page number that the
    // site multiplies by the limit. The same name means an absolute offset on
    // the site's own pages, which is why the translation happens here and
    // nowhere else.
    const page3 = buildPostSearchUrl({ tags: ["black_hair"], limit: 20, page: 3 }, CREDENTIALS);
    expect(page3).toContain("&pid=2");
    const page1 = buildPostSearchUrl({ tags: ["black_hair"], limit: 20, page: 1 }, CREDENTIALS);
    expect(page1).toContain("&pid=0");
  });

  it("refuses a limit the site would silently cap", () => {
    expect(() =>
      buildPostSearchUrl({ tags: ["black_hair"], limit: 1001, page: 1 }, CREDENTIALS),
    ).toThrow(/invalid_input/);
  });
});

describe("buildTagLookupUrl", () => {
  it("asks the tag route for one exact name", () => {
    // This is what answers "which of these tags does not exist" once a search
    // of several tags comes back empty.
    expect(buildTagLookupUrl("ranma 1/2", CREDENTIALS)).toBe(
      "https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index" +
        "&name=ranma_1%2F2&api_key=0123456789abcdef&user_id=6701429",
    );
  });
});

describe("redactCredentials", () => {
  it("keeps the key out of anything a caller is shown", () => {
    // An error names the URL it failed on, a model reads that text, and the
    // conversation it lands in outlives the request.
    const url = buildPostSearchUrl({ tags: ["black_hair"], limit: 20, page: 1 }, CREDENTIALS);
    const shown = redactCredentials(url);
    expect(shown).not.toContain(CREDENTIALS.apiKey);
    expect(shown).toContain("api_key=REDACTED");
    // The user id identifies the account without unlocking it, and leaving it
    // readable keeps a support question answerable.
    expect(shown).toContain("user_id=6701429");
  });
});

describe("buildTagSuggestUrl", () => {
  it("asks the suggestion route, which needs no credentials", () => {
    // The site publishes this route on its API host and answers it without a
    // key, so none is sent and none appears in the address.
    const url = buildTagSuggestUrl("orange road");
    expect(url).toBe("https://api.rule34.xxx/autocomplete.php?q=orange_road");
    expect(url).not.toContain("api_key");
    expect(url).not.toContain("user_id");
  });

  it("writes the text the way a tag is spelled", () => {
    expect(buildTagSuggestUrl("Kimagure Orange")).toContain("q=kimagure_orange");
    expect(buildTagSuggestUrl("ranma 1/2")).toContain("q=ranma_1%2F2");
  });

  it("refuses a search for nothing", () => {
    // The site answers an empty query with the tags it holds most of, which is
    // an answer to a question nobody asked.
    expect(() => buildTagSuggestUrl("   ")).toThrow(/invalid_input/);
  });
});

describe("buildPostPageUrl", () => {
  it("points at the page a person can open, rather than the API", () => {
    expect(buildPostPageUrl(18540926)).toBe(
      "https://rule34.xxx/index.php?page=post&s=view&id=18540926",
    );
  });
});
