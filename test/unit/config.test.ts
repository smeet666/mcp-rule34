import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  MIN_ALLOWED_INTERVAL_MS,
  loadConfig,
  readCredentials,
} from "../../src/config.js";

/** Warnings go to stderr, and a test that reads them must not print them. */
let warnings: string[];

beforeEach(() => {
  warnings = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    warnings.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readCredentials", () => {
  it("reads the pair the API route requires", () => {
    expect(readCredentials({ RULE34_USER_ID: "6701429", RULE34_API_KEY: "abc123" })).toEqual({
      userId: "6701429",
      apiKey: "abc123",
    });
  });

  it("trims what a configuration file tends to carry", () => {
    // A key pasted into a JSON file arrives with whatever surrounded it.
    expect(readCredentials({ RULE34_USER_ID: " 6701429 ", RULE34_API_KEY: "\tabc123\n" })).toEqual({
      userId: "6701429",
      apiKey: "abc123",
    });
  });

  it("reports no credentials rather than half a pair", () => {
    // Half a pair is refused the same way as none: the route needs both, and
    // sending one produces the site's authentication error, which reads as a
    // fault on its side.
    expect(readCredentials({})).toBeNull();
    expect(readCredentials({ RULE34_USER_ID: "6701429" })).toBeNull();
    expect(readCredentials({ RULE34_API_KEY: "abc123" })).toBeNull();
    expect(readCredentials({ RULE34_USER_ID: "6701429", RULE34_API_KEY: "   " })).toBeNull();
  });
});

describe("loadConfig", () => {
  it("stands on its defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config.minIntervalMs).toBe(DEFAULTS.minIntervalMs);
    expect(config.timeoutMs).toBe(DEFAULTS.timeoutMs);
    expect(config.maxRetries).toBe(DEFAULTS.maxRetries);
    expect(config.credentials).toBeNull();
    expect(config.userAgent).toMatch(/^mcp-rule34\//);
  });

  it("refuses an interval under the floor and says so", () => {
    // The site rate limits without publishing a rate, and a burst of a few
    // pages is enough to draw a 429. Someone who set 0 was asking for no pacing
    // at all, so the safe reading of that request is to ignore it.
    const config = loadConfig({ RULE34_MIN_INTERVAL_MS: "0" });
    expect(config.minIntervalMs).toBe(DEFAULTS.minIntervalMs);
    expect(warnings.join("")).toContain(String(MIN_ALLOWED_INTERVAL_MS));
  });

  it("lets an installation be slower than the floor", () => {
    expect(loadConfig({ RULE34_MIN_INTERVAL_MS: "4000" }).minIntervalMs).toBe(4000);
  });

  it("clamps a number that is out of range, and keeps the default for a word", () => {
    expect(loadConfig({ RULE34_TIMEOUT_MS: "999999" }).timeoutMs).toBe(120_000);
    expect(loadConfig({ RULE34_MAX_RETRIES: "soon" }).maxRetries).toBe(DEFAULTS.maxRetries);
    expect(warnings.join("")).toContain("RULE34_MAX_RETRIES");
  });

  it("keeps the default log level for a level it does not know", () => {
    expect(loadConfig({ RULE34_LOG_LEVEL: "verbose" }).logLevel).toBe(DEFAULTS.logLevel);
  });

  it("carries a contact address in the agent it identifies itself with", () => {
    // The site is asked for something on every call, and an agent with no way
    // back to a person is one an administrator can only block.
    expect(loadConfig({}).userAgent).toMatch(/https:\/\/github\.com\//);
  });
});
