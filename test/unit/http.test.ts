import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import type { Rule34Error } from "../../src/errors.js";
import { fetchXml } from "../../src/rule34/http.js";
import { RateLimiter } from "../../src/rule34/rateLimiter.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");
const URL_WITH_KEY =
  "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=black_hair" +
  "&api_key=0123456789abcdef&user_id=6701429";

const OK_BODY = '<?xml version="1.0" encoding="UTF-8"?><posts count="0" offset="0"></posts>';

interface Answer {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Thrown instead of answering, to stand in for a transport failure. */
  throws?: Error;
}

/** Answers each call with the next scripted response, then repeats the last. */
function scriptedFetch(answers: Answer[]) {
  const calls: string[] = [];
  const impl = (async (input: unknown) => {
    const answer = answers[Math.min(calls.length, answers.length - 1)] ?? {};
    calls.push(String(input));
    if (answer.throws) {
      throw answer.throws;
    }
    return new Response(answer.body ?? OK_BODY, {
      status: answer.status ?? 200,
      headers: answer.headers,
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function deps(fetchImpl: typeof fetch, overrides: Partial<ReturnType<typeof loadConfig>> = {}) {
  const config = { ...loadConfig({}), maxRetries: 2, ...overrides };
  return {
    config,
    limiter: new RateLimiter({ minIntervalMs: config.minIntervalMs }),
    logger: createLogger("silent"),
    fetchImpl,
  };
}

/** Runs a request to completion, letting every scheduled wait elapse. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const raced = promise.catch((error: unknown) => ({ __error: error }) as never);
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
  const result = (await raced) as { __error?: unknown };
  if (result && typeof result === "object" && "__error" in result) {
    throw result.__error;
  }
  return result as T;
}

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchXml", () => {
  it("returns the document the site answered with", async () => {
    const { impl, calls } = scriptedFetch([{ body: OK_BODY }]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).resolves.toBe(OK_BODY);
    expect(calls).toHaveLength(1);
  });

  it("identifies itself with the configured agent", async () => {
    const seen: Record<string, string>[] = [];
    const impl = (async (_input: unknown, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return new Response(OK_BODY, { status: 200 });
    }) as unknown as typeof fetch;

    await settle(fetchXml(URL_WITH_KEY, deps(impl)));
    expect(seen[0]?.["User-Agent"]).toMatch(/^mcp-rule34\//);
  });

  it("waits as long as the site asked before trying again", async () => {
    // A site that says when to come back knows better than any guess made here.
    const { impl, calls } = scriptedFetch([
      { status: 429, headers: { "retry-after": "2" } },
      { status: 200, body: OK_BODY },
    ]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).resolves.toBe(OK_BODY);
    expect(calls).toHaveLength(2);
  });

  it("reports being rate limited as being rate limited", async () => {
    // The one thing this must never do is answer a refusal with an empty
    // result: a caller would read "the site holds nothing on this tag".
    const { impl } = scriptedFetch([{ status: 429 }]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).rejects.toThrow(/rate_limited/);
  });

  it("retries a fault on the site's side, then reports it as one", async () => {
    const { impl, calls } = scriptedFetch([{ status: 503 }]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).rejects.toThrow(/network_error/);
    expect(calls).toHaveLength(3);
  });

  it("stops asking for a page the site says it does not have", async () => {
    const { impl, calls } = scriptedFetch([{ status: 404 }]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).rejects.toThrow(/not_found/);
    expect(calls).toHaveLength(1);
  });

  it("names a request that ran out of time as one that ran out of time", async () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    const { impl } = scriptedFetch([{ throws: timeout }]);
    await expect(settle(fetchXml(URL_WITH_KEY, deps(impl)))).rejects.toThrow(/timeout/);
  });

  it("keeps the key out of every error it raises", async () => {
    const { impl } = scriptedFetch([{ status: 503 }]);
    try {
      await settle(fetchXml(URL_WITH_KEY, deps(impl)));
      expect.unreachable("a failing request must throw");
    } catch (error) {
      const failure = error as Rule34Error;
      expect(failure.details.url).not.toContain("0123456789abcdef");
      expect(failure.details.url).toContain("api_key=REDACTED");
    }
  });
});
