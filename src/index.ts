#!/usr/bin/env node
/**
 * Entry point: an MCP server for rule34.xxx over stdio.
 */

import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger, loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const server = createServer({ config, logger });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    // The close is attempted, and a close that fails changes nothing: the
    // process leaves on either path.
    server
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[mcp-rule34] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
