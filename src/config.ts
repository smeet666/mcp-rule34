/**
 * Runtime configuration, read from environment variables.
 *
 * A bad value never stops the process: a server that dies at startup because of
 * a typo in a client configuration file is very hard to diagnose from the host
 * application, so an invalid value is clamped and reported on stderr. Missing
 * credentials are handled the same way — the server starts, publishes its
 * tools, and each call answers with what to set and where to get it.
 */

import process from "node:process";
import type { Credentials } from "./rule34/urls.js";
import { PKG_VERSION, REPO_URL } from "./version.js";

export type LogLevel = "silent" | "error" | "info" | "debug";

export interface Config {
  userAgent: string;
  credentials: Credentials | null;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

/** Identifies the client honestly, with an address that reaches a person. */
export const DEFAULT_USER_AGENT = `mcp-rule34/${PKG_VERSION} (+${REPO_URL})`;

export const DEFAULTS = {
  minIntervalMs: 1000,
  timeoutMs: 20_000,
  maxRetries: 3,
  cacheTtlMs: 5 * 60 * 1000,
  cacheMaxEntries: 300,
  logLevel: "error" as LogLevel,
};

/**
 * Floor on the request interval, enforced regardless of configuration.
 *
 * rule34.xxx limits its rate without publishing what the rate is: the account
 * page states a limit whose numbers are missing from the page itself, and a
 * handful of requests in a row is enough to draw a 429. Leaving the pacing
 * configurable down to zero would make the politeness of every installation
 * depend on whoever edited a JSON file.
 */
export const MIN_ALLOWED_INTERVAL_MS = 1000;

const LOG_LEVELS: LogLevel[] = ["silent", "error", "info", "debug"];

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

function warn(message: string): void {
  process.stderr.write(`[mcp-rule34] ${message}\n`);
}

function readNumber(name: string, env: NodeJS.ProcessEnv, range: NumericRange): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return range.fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`${name}="${raw}" is not a number, using ${range.fallback}`);
    return range.fallback;
  }
  const clamped = Math.min(range.max, Math.max(range.min, Math.round(parsed)));
  if (clamped !== Math.round(parsed)) {
    warn(`${name}=${raw} is out of range, clamped to ${clamped}`);
  }
  return clamped;
}

/**
 * Read the request interval, refusing anything below the floor.
 *
 * A value under the floor falls back to the default rather than to the floor
 * itself: someone who set 0 was not asking for the floor, they were asking for
 * no pacing at all, and the safe reading of that request is to ignore it.
 */
function readInterval(env: NodeJS.ProcessEnv): number {
  const raw = env.RULE34_MIN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULTS.minIntervalMs;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`RULE34_MIN_INTERVAL_MS="${raw}" is not a number, using ${DEFAULTS.minIntervalMs}ms`);
    return DEFAULTS.minIntervalMs;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_ALLOWED_INTERVAL_MS) {
    warn(
      `RULE34_MIN_INTERVAL_MS=${raw} is below the ${MIN_ALLOWED_INTERVAL_MS}ms floor and was ignored; ` +
        `using ${DEFAULTS.minIntervalMs}ms. This floor keeps the client from hammering rule34.xxx.`,
    );
    return DEFAULTS.minIntervalMs;
  }

  return Math.min(60_000, rounded);
}

/**
 * The pair the API route requires, or nothing.
 *
 * One half is as useless as none: the site answers a partial pair with its
 * authentication error, which a caller reads as a fault on the site's side.
 */
export function readCredentials(env: NodeJS.ProcessEnv): Credentials | null {
  const userId = env.RULE34_USER_ID?.trim() ?? "";
  const apiKey = env.RULE34_API_KEY?.trim() ?? "";
  if (userId === "" || apiKey === "") {
    return null;
  }
  return { userId, apiKey };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUserAgent = env.RULE34_USER_AGENT?.trim();
  const rawLogLevel = env.RULE34_LOG_LEVEL?.trim().toLowerCase();

  let logLevel = DEFAULTS.logLevel;
  if (rawLogLevel) {
    if (LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      warn(`RULE34_LOG_LEVEL="${rawLogLevel}" is unknown, using "${DEFAULTS.logLevel}"`);
    }
  }

  return {
    userAgent: rawUserAgent || DEFAULT_USER_AGENT,
    credentials: readCredentials(env),
    minIntervalMs: readInterval(env),
    timeoutMs: readNumber("RULE34_TIMEOUT_MS", env, {
      min: 1000,
      max: 120_000,
      fallback: DEFAULTS.timeoutMs,
    }),
    maxRetries: readNumber("RULE34_MAX_RETRIES", env, {
      min: 0,
      max: 10,
      fallback: DEFAULTS.maxRetries,
    }),
    cacheTtlMs: readNumber("RULE34_CACHE_TTL_MS", env, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
      fallback: DEFAULTS.cacheTtlMs,
    }),
    cacheMaxEntries: readNumber("RULE34_CACHE_MAX_ENTRIES", env, {
      min: 0,
      max: 10_000,
      fallback: DEFAULTS.cacheMaxEntries,
    }),
    logLevel,
  };
}

const LEVEL_RANK: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

/**
 * Logs go to stderr without exception. On a stdio transport, stdout carries the
 * protocol and any stray write there corrupts the session.
 */
export function createLogger(level: LogLevel) {
  const emit = (at: LogLevel, message: string) => {
    if (LEVEL_RANK[level] >= LEVEL_RANK[at]) {
      process.stderr.write(`[mcp-rule34] ${message}\n`);
    }
  };
  return {
    error: (message: string) => emit("error", message),
    info: (message: string) => emit("info", message),
    debug: (message: string) => emit("debug", message),
  };
}

export type Logger = ReturnType<typeof createLogger>;
