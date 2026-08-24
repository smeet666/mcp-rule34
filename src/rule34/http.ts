/**
 * HTTP layer: one GET of the API route, classified, with backoff.
 *
 * Two conditions decide the shape of this file. rule34.xxx refuses a client
 * that asks too often with HTTP 429, and it answers a request carrying no valid
 * credentials with HTTP 200 and an error document. So a status of 200 is not
 * proof of an answer, and a refusal must never reach a caller as an empty
 * result — the document itself is classified further up, by the parser.
 */

import type { Config, Logger } from "../config.js";
import { Rule34Error, notFound, rateLimited } from "../errors.js";
import { type RateLimiter, sleep } from "./rateLimiter.js";
import { redactCredentials } from "./urls.js";

const BACKOFF_BASE_MS = 2000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 30_000;

/** Exponential backoff with jitter, so parallel clients do not resynchronise. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const uncapped = BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt;
  const capped = Math.min(BACKOFF_MAX_MS, uncapped);
  return Math.round(capped * (0.5 + random() * 0.5));
}

export interface HttpDeps {
  config: Config;
  limiter: RateLimiter;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch one API document, retrying what is worth retrying.
 *
 * The whole retry chain, backoff waits included, runs inside a single limiter
 * slot. Waiting outside it would let a queued request slip into the same
 * refusal window the current one is backing away from.
 */
export async function fetchXml(url: string, deps: HttpDeps): Promise<string> {
  const { config, limiter, logger } = deps;
  const doFetch = deps.fetchImpl ?? fetch;
  // Every message and every log line names the address without the key in it.
  const safeUrl = redactCredentials(url);

  return await limiter.schedule(async () => {
    let lastError: Rule34Error | undefined;

    // Set when the site says how long to stay away, replacing our own guess for
    // the next attempt. Applied here rather than where it is read, so no wait
    // is ever served after the last attempt, when nobody would use it.
    let askedWaitMs: number | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delay = Math.min(askedWaitMs ?? backoffDelay(attempt - 1), BACKOFF_MAX_MS);
        askedWaitMs = null;
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${safeUrl}`);
        await sleep(delay);
      }

      let status: number;
      let body: string;
      let retryAfterMs: number | null = null;
      try {
        await limiter.beforeRequest();
        const response = await doFetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        body = await response.text();
      } catch (error) {
        lastError = asTransportError(error, safeUrl);
        logger.debug(`${lastError.code} for ${safeUrl}: ${lastError.message}`);
        continue;
      }

      if (status === 429) {
        limiter.penalize();
        logger.info(`rate limited on ${safeUrl}, interval now ${limiter.currentIntervalMs}ms`);
        askedWaitMs = retryAfterMs;
        lastError = rateLimited(safeUrl, retryAfterMs ?? backoffDelay(attempt));
        continue;
      }

      // Retrying this would only repeat the same answer.
      if (status === 404) {
        throw notFound(safeUrl);
      }

      if (status >= 500) {
        lastError = new Rule34Error("network_error", `rule34.xxx returned HTTP ${status}.`, {
          url: safeUrl,
          status,
        });
        continue;
      }

      if (status >= 400) {
        throw new Rule34Error("network_error", `rule34.xxx refused the request (HTTP ${status}).`, {
          url: safeUrl,
          status,
        });
      }

      limiter.relax();
      return body;
    }

    throw (
      lastError ??
      new Rule34Error("network_error", `Could not fetch ${safeUrl}.`, {
        url: safeUrl,
      })
    );
  });
}

/** `Retry-After` carries either seconds or an HTTP date. */
function parseRetryAfter(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const when = Date.parse(raw);
  if (Number.isNaN(when)) {
    return null;
  }
  return Math.max(0, when - Date.now());
}

function asTransportError(error: unknown, safeUrl: string): Rule34Error {
  if (error instanceof Rule34Error) {
    return error;
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new Rule34Error("timeout", "rule34.xxx did not answer in time.", {
      url: safeUrl,
      hint: "Raise RULE34_TIMEOUT_MS if this happens often on a slow connection.",
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Rule34Error("network_error", `Could not reach rule34.xxx: ${message}`, {
    url: safeUrl,
  });
}
