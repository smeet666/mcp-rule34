/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one cache serve every tool: per-tool
 * instances would each open their own request stream and defeat the pacing that
 * keeps this server welcome on a site which limits its rate.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { Rule34Client } from "./rule34/client.js";
import type { GetPostArgs } from "./tools/getPost.js";
import {
  getPostDescription,
  getPostInput,
  getPostOutputShape,
  runGetPost,
} from "./tools/getPost.js";
import type { SearchPostsArgs } from "./tools/searchPosts.js";
import {
  runSearchPosts,
  searchPostsDescription,
  searchPostsInput,
  searchPostsOutputShape,
} from "./tools/searchPosts.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new Rule34Client({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-rule34", version: PKG_VERSION },
    {
      instructions:
        "Tools for searching rule34.xxx by tag, through the site's own API. This server reads and never " +
        "contributes anything back. It needs credentials: set RULE34_USER_ID and RULE34_API_KEY, both shown " +
        "under 'API Access Credentials' at https://rule34.xxx/index.php?page=account&s=options once signed in, " +
        "and note that the site issues one key per person. Tags are single tokens: a name said as words, such " +
        "as 'asuka langley sohryu', is one tag, and the tools join it for you. The site holds two ratings, " +
        "'questionable' and 'explicit'; asking for anything else is refused rather than answered with nothing. " +
        "Typical flow: search_posts to find posts by tag, then get_post with an id for one post's whole tag " +
        "list, since a search row shows only its first few tags. " +
        "A 'rate_limited' error means the site is refusing this client for now, not that a search found " +
        "nothing. When you show a post to a user, link its rule34.xxx page.",
    },
  );

  // Registered in the order a caller meets them: a search names the posts, and
  // a post is then read whole.
  server.registerTool(
    "search_posts",
    {
      title: "Search posts by tag",
      description: searchPostsDescription,
      inputSchema: searchPostsInput,
      outputSchema: z.object(searchPostsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runSearchPosts(client, args as SearchPostsArgs),
  );

  server.registerTool(
    "get_post",
    {
      title: "Read one post",
      description: getPostDescription,
      inputSchema: getPostInput,
      outputSchema: z.object(getPostOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runGetPost(client, args as GetPostArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, ` +
      `cache ${config.cacheTtlMs}ms, credentials ${config.credentials ? "set" : "missing"}`,
  );

  return server;
}
