/**
 * The reading layer: requests, pacing, cache, and the shapes they produce.
 *
 * Nothing here imports the MCP SDK, so this file is also what the package
 * publishes under its `./client` entry point: a program can read rule34.xxx
 * with the same pacing and the same error taxonomy without a protocol attached.
 */

import type { Config, Logger } from "../config.js";
import { invalidInput } from "../errors.js";
import type { PostDetail, PostList, TagRef } from "../types.js";
import { TtlLruCache } from "./cache.js";
import { fetchXml } from "./http.js";
import { parsePostDetail } from "./parsers/postDetail.js";
import { parsePostList } from "./parsers/posts.js";
import { parseTagList } from "./parsers/tags.js";
import { RateLimiter } from "./rateLimiter.js";
import {
  buildPostByIdJsonUrl,
  buildPostByIdXmlUrl,
  buildPostSearchUrl,
  buildTagLookupUrl,
  normalizeTag,
  type Credentials,
  type PostSearch,
  redactCredentials,
  resolvePostRef,
} from "./urls.js";

/** Every read says whether it reached the site or answered from memory. */
export interface Read<T> {
  data: T;
  cached: boolean;
}

export interface Rule34ClientDeps {
  config: Config;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export class Rule34Client {
  private readonly limiter: RateLimiter;
  private readonly cache: TtlLruCache<string>;

  constructor(private readonly deps: Rule34ClientDeps) {
    this.limiter = new RateLimiter({ minIntervalMs: deps.config.minIntervalMs });
    this.cache = new TtlLruCache(deps.config.cacheMaxEntries, deps.config.cacheTtlMs);
  }

  /** The addresses currently held, for a diagnostic to look at. */
  cacheKeys(): string[] {
    return this.cache.keys();
  }

  async searchPosts(search: PostSearch): Promise<Read<PostList>> {
    const url = buildPostSearchUrl(search, this.credentials());
    const { body, cached } = await this.read(url);
    return { data: parsePostList(body, url), cached };
  }

  /**
   * One post, read from both formats the API publishes.
   *
   * Neither format carries everything: the publication date and the uploader's
   * numeric id come from the XML, and the uploader's name, the comment count
   * and the tag types come from the JSON. Reading one of them would leave out
   * what the other holds, so a fiche costs two reads of the site.
   */
  async getPost(ref: { id?: number; url?: string }): Promise<Read<PostDetail>> {
    const credentials = this.credentials();
    const id = resolvePostRef(ref);

    const jsonUrl = buildPostByIdJsonUrl(id, credentials);
    const json = await this.read(jsonUrl);
    // Reading the JSON first means a post the site no longer holds is reported
    // as absent before a second request is spent on it.
    const detail = parsePostDetail(json.body, jsonUrl, id);

    const xmlUrl = buildPostByIdXmlUrl(id, credentials);
    const xml = await this.read(xmlUrl);
    const [fromXml] = parsePostList(xml.body, xmlUrl).posts;

    return {
      data: {
        ...detail,
        createdAt: fromXml?.createdAt ?? null,
        creatorId: fromXml?.creatorId ?? null,
        hasComments: fromXml?.hasComments ?? (detail.commentCount ?? 0) > 0,
        hasChildren: fromXml?.hasChildren ?? false,
      },
      cached: json.cached && xml.cached,
    };
  }

  /** The tag under this exact name, or nothing when the site holds no such tag. */
  async lookupTag(name: string): Promise<Read<TagRef | null>> {
    const url = buildTagLookupUrl(name, this.credentials());
    const { body, cached } = await this.read(url);
    const [tag] = parseTagList(body, url);
    return { data: tag ?? null, cached };
  }

  /**
   * Which of these names the site does not hold as a tag.
   *
   * A search of several tags that finds nothing says nothing about which tag
   * emptied it, and a misspelled name is indistinguishable from a combination
   * the site genuinely has nothing for. Each distinct name costs one request,
   * which is why this is worth spending only once a search has come back empty.
   */
  async findUnknownTags(names: string[]): Promise<string[]> {
    const distinct = [...new Set(names.map(normalizeTag))];
    const unknown: string[] = [];
    for (const name of distinct) {
      const { data } = await this.lookupTag(name);
      if (data === null) {
        unknown.push(name);
      }
    }
    return unknown;
  }

  private credentials(): Credentials {
    const credentials = this.deps.config.credentials;
    if (!credentials) {
      throw invalidInput(
        "This server has no rule34.xxx API credentials, so it cannot ask the site anything.",
        "Set RULE34_USER_ID and RULE34_API_KEY in the env block of this server's entry in your MCP client " +
          "configuration. Both are shown under 'API Access Credentials' at " +
          "https://rule34.xxx/index.php?page=account&s=options once you are signed in. The site issues one " +
          "key per person, so use your own rather than sharing one.",
      );
    }
    return credentials;
  }

  /**
   * Fetch one address, remembering the answer under it.
   *
   * The key is the address without the key in it: two searches differ by their
   * query and never by their credentials, and holding the secret in a second
   * place buys nothing.
   */
  private async read(url: string): Promise<{ body: string; cached: boolean }> {
    const key = redactCredentials(url);
    const remembered = this.cache.get(key);
    if (remembered !== undefined) {
      this.deps.logger.debug(`cache hit for ${key}`);
      return { body: remembered, cached: true };
    }

    const body = await fetchXml(url, {
      config: this.deps.config,
      limiter: this.limiter,
      logger: this.deps.logger,
      fetchImpl: this.deps.fetchImpl,
    });
    this.cache.set(key, body);
    return { body, cached: false };
  }
}
