import { describe, expect, it } from "vitest";
import { parseTagList } from "../../src/rule34/parsers/tags.js";

const URL = "https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&name=black_hair";

const ONE_TAG =
  '<?xml version="1.0" encoding="UTF-8"?><tags type="array">' +
  '<tag type="0" count="1597958" name="black_hair" ambiguous="false" id="49"/>' +
  "</tags>";

describe("parseTagList", () => {
  it("reads what the site holds under a name", () => {
    const [tag] = parseTagList(ONE_TAG, URL);
    expect(tag?.name).toBe("black_hair");
    expect(tag?.id).toBe(49);
    expect(tag?.postCount).toBe(1_597_958);
    expect(tag?.ambiguous).toBe(false);
  });

  it("names the kind of tag the site numbers", () => {
    // The numbering is the site's; the words are what a caller can act on.
    const kind = (code: string) =>
      parseTagList(ONE_TAG.replace('type="0"', `type="${code}"`), URL)[0]?.type;
    expect(kind("0")).toBe("general");
    expect(kind("1")).toBe("artist");
    expect(kind("3")).toBe("copyright");
    expect(kind("4")).toBe("character");
    expect(kind("5")).toBe("metadata");
  });

  it("calls a kind it does not know unknown, and keeps the number", () => {
    // Guessing at a number the site has not documented would state a kind it
    // never wrote.
    const [tag] = parseTagList(ONE_TAG.replace('type="0"', 'type="7"'), URL);
    expect(tag?.type).toBe("unknown");
    expect(tag?.typeCode).toBe(7);
  });

  it("reads a name the site does not know as no tag at all", () => {
    // The route answers an unknown name with a root element named in the
    // singular, where a name it holds comes back under the plural one. Both
    // mean the same thing, and reading the singular as a broken document would
    // turn "no such tag" into "the site is unreadable".
    expect(parseTagList('<?xml version="1.0" encoding="UTF-8"?><tag type="array"/>', URL)).toEqual(
      [],
    );
    expect(parseTagList('<?xml version="1.0" encoding="UTF-8"?><tags type="array"/>', URL)).toEqual(
      [],
    );
  });

  it("refuses an answer that is not the document this route publishes", () => {
    expect(() => parseTagList("<html>maintenance</html>", URL)).toThrow(/parse_failure/);
    expect(() => parseTagList("", URL)).toThrow(/parse_failure/);
  });

  it("tells a missing key apart from a broken document", () => {
    const missingKey =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<error>Missing authentication. Go to api.rule34.xxx for more information</error>";
    expect(() => parseTagList(missingKey, URL)).toThrow(/invalid_input/);
  });
});
