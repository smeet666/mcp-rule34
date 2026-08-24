import { describe, expect, it } from "vitest";
import { Rule34Error } from "../../src/errors.js";
import {
  buildPostByIdJsonUrl,
  buildPostByIdXmlUrl,
  readPostPageUrl,
  resolvePostRef,
} from "../../src/rule34/urls.js";

const CREDENTIALS = { apiKey: "0123456789abcdef", userId: "6701429" };

describe("readPostPageUrl", () => {
  it("reads the id out of a post page", () => {
    expect(readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=2195419")).toBe(
      2195419,
    );
  });

  it("tolerates the extra parameters a copied link carries", () => {
    // A link copied from a result page keeps the search that produced it.
    expect(
      readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=18540109&tags=black_hair"),
    ).toBe(18540109);
  });

  it("accepts the subdomains the site serves from", () => {
    // The site answers on the bare host and serves media from several
    // subdomains, and it adds new ones. Matching the suffix survives that.
    expect(readPostPageUrl("https://www.rule34.xxx/index.php?page=post&s=view&id=42")).toBe(42);
  });

  it("refuses a host that is not the site", () => {
    // The URL is read, never fetched. Accepting a foreign host would still be
    // wrong: it would answer about a post the caller never named.
    for (const url of [
      "https://rule34.xxx.evil.com/index.php?page=post&s=view&id=42",
      "https://evil.com/index.php?page=post&s=view&id=42",
      "http://127.0.0.1:8080/index.php?page=post&s=view&id=42",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(() => readPostPageUrl(url), url).toThrow(/invalid_input/);
    }
  });

  it("refuses a page of the site that is not a post", () => {
    expect(() => readPostPageUrl("https://rule34.xxx/index.php?page=post&s=list&tags=x")).toThrow(
      /invalid_input/,
    );
    expect(() => readPostPageUrl("https://rule34.xxx/index.php?page=account&s=options")).toThrow(
      /invalid_input/,
    );
  });

  it("refuses a page naming two different posts", () => {
    // A query carrying `id` twice names two posts, and reading the first is a
    // coin flip on which one the caller meant. It is the contradiction an `id`
    // and a `url` that disagree are refused for, arriving by another door.
    expect(() =>
      readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=1&id=2"),
    ).toThrow(/invalid_input/);
  });

  it("accepts a page repeating the same id", () => {
    // Repeating one id names one post, so nothing is ambiguous.
    expect(readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=7&id=7")).toBe(7);
  });

  it("tells an id it cannot use apart from an id it cannot find", () => {
    // "carries no post id" sends a caller looking for a missing parameter. A
    // page carrying `id=-1` carries one; the value is what cannot be used.
    let missing = "";
    let outOfRange = "";
    try {
      readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=");
    } catch (error) {
      missing = (error as Error).message;
    }
    try {
      readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=-1");
    } catch (error) {
      outOfRange = (error as Error).message;
    }
    expect(missing).toMatch(/no post id/i);
    expect(outOfRange).not.toMatch(/no post id/i);
    expect(outOfRange).toContain("-1");
  });

  it("refuses a post page whose id is not a number", () => {
    expect(() => readPostPageUrl("https://rule34.xxx/index.php?page=post&s=view&id=abc")).toThrow(
      /invalid_input/,
    );
  });
});

describe("resolvePostRef", () => {
  it("takes an id on its own", () => {
    expect(resolvePostRef({ id: 2195419 })).toBe(2195419);
  });

  it("takes a URL on its own", () => {
    expect(
      resolvePostRef({ url: "https://rule34.xxx/index.php?page=post&s=view&id=2195419" }),
    ).toBe(2195419);
  });

  it("accepts both when they agree", () => {
    expect(
      resolvePostRef({
        id: 2195419,
        url: "https://rule34.xxx/index.php?page=post&s=view&id=2195419",
      }),
    ).toBe(2195419);
  });

  it("refuses both when they disagree", () => {
    // Preferring one would be a coin flip on which of the caller's two
    // arguments was the mistake, and the answer would carry no trace of it.
    expect(() =>
      resolvePostRef({ id: 1, url: "https://rule34.xxx/index.php?page=post&s=view&id=2" }),
    ).toThrow(Rule34Error);
    expect(() =>
      resolvePostRef({ id: 1, url: "https://rule34.xxx/index.php?page=post&s=view&id=2" }),
    ).toThrow(/invalid_input/);
  });

  it("refuses a request that names no post at all", () => {
    expect(() => resolvePostRef({})).toThrow(/invalid_input/);
  });

  it("refuses an id that is not a whole positive number", () => {
    expect(() => resolvePostRef({ id: 0 })).toThrow(/invalid_input/);
    expect(() => resolvePostRef({ id: -3 })).toThrow(/invalid_input/);
    expect(() => resolvePostRef({ id: 1.5 })).toThrow(/invalid_input/);
  });
});

describe("the two addresses one post is read from", () => {
  it("asks the XML route for the fields only it carries", () => {
    // The publication date and the uploader's numeric id live here.
    expect(buildPostByIdXmlUrl(2195419, CREDENTIALS)).toBe(
      "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id=2195419" +
        "&api_key=0123456789abcdef&user_id=6701429",
    );
  });

  it("asks the JSON route for the fields only it carries", () => {
    // The uploader's name, the comment count, and a type for every tag.
    expect(buildPostByIdJsonUrl(2195419, CREDENTIALS)).toBe(
      "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id=2195419" +
        "&json=1&fields=tag_info&api_key=0123456789abcdef&user_id=6701429",
    );
  });
});
