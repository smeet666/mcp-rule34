import { describe, expect, it } from "vitest";
import { Rule34Error } from "../../src/errors.js";
import { parseTagSuggestions } from "../../src/rule34/parsers/suggestions.js";

const URL = "https://api.rule34.xxx/autocomplete.php?q=kim";

const THREE = JSON.stringify([
  { label: "kimono (55638)", value: "kimono" },
  { label: "kimetsu_no_yaiba (47140)", value: "kimetsu_no_yaiba" },
  { label: "kim_possible (21600)", value: "kim_possible" },
]);

describe("parseTagSuggestions", () => {
  it("reads the name the site would search, and what it counts for it", () => {
    // The site writes the count into the label it means to display; the value
    // is the name a search takes.
    expect(parseTagSuggestions(THREE, URL)).toEqual([
      { name: "kimono", postCount: 55638 },
      { name: "kimetsu_no_yaiba", postCount: 47140 },
      { name: "kim_possible", postCount: 21600 },
    ]);
  });

  it("reads a label carrying no count as a count it does not know", () => {
    // Zero is a number of posts, and a tag whose count the site did not print
    // is a tag whose count is unknown.
    const noCount = JSON.stringify([{ label: "kimono", value: "kimono" }]);
    expect(parseTagSuggestions(noCount, URL)).toEqual([{ name: "kimono", postCount: null }]);
  });

  it("reads a name the site offers nothing for as nothing offered", () => {
    // This route answers with an empty list rather than an empty body, which is
    // an absence a caller can act on.
    expect(parseTagSuggestions("[]", URL)).toEqual([]);
  });

  it("drops an entry carrying no name rather than inventing one", () => {
    const odd = JSON.stringify([{ label: "(12)" }, { label: "kimono (55638)", value: "kimono" }]);
    expect(parseTagSuggestions(odd, URL)).toEqual([{ name: "kimono", postCount: 55638 }]);
  });

  it("refuses an answer that is not this route's document", () => {
    expect(() => parseTagSuggestions("<html>maintenance</html>", URL)).toThrow(/parse_failure/);
    expect(() => parseTagSuggestions("", URL)).toThrow(/parse_failure/);
    expect(() => parseTagSuggestions('{"not":"a list"}', URL)).toThrow(/parse_failure/);
  });

  it("keeps the key out of the address it names", () => {
    try {
      parseTagSuggestions("not json", `${URL}&api_key=0123456789abcdef`);
      expect.unreachable("garbage must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Rule34Error);
      expect((error as Rule34Error).details.url).not.toContain("0123456789abcdef");
    }
  });
});
