/**
 * Error taxonomy surfaced to the calling model.
 *
 * A caller branches on the code that opens the message, so the code has to say
 * where the fault is. The distinction that matters most on this route is
 * between a document this server could not read and an account it was not given
 * the credentials for: the site answers both with HTTP 200, and only one of
 * them is fixed by editing a configuration file.
 */

export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "parse_failure"
  | "network_error"
  | "timeout";

export interface ErrorDetails {
  url?: string;
  status?: number;
  retryAfterMs?: number;
  hint?: string;
}

export class Rule34Error extends Error {
  constructor(
    readonly code: ErrorCode,
    text: string,
    readonly details: ErrorDetails = {},
    options?: ErrorOptions,
  ) {
    // The message a caller reads says what this server could not do. The error
    // that led there is kept as the cause, where a maintainer reading a stack
    // finds it and a caller never has to.
    super(`[${code}] ${text}`, options);
    this.name = "Rule34Error";
  }
}

const ISSUES_URL = "https://github.com/smeet666/mcp-rule34/issues";

export function invalidInput(message: string, hint?: string, cause?: unknown): Rule34Error {
  return new Rule34Error("invalid_input", message, hint ? { hint } : {}, { cause });
}

/**
 * The credentials are missing or refused.
 *
 * This is `invalid_input` rather than a failure of the site: the request was
 * well formed and the site answered it, and what is missing lives in the
 * caller's own configuration.
 */
export function missingCredentials(url: string): Rule34Error {
  return new Rule34Error(
    "invalid_input",
    "rule34.xxx answered that this request carries no valid API credentials.",
    {
      url,
      hint:
        "Set RULE34_USER_ID and RULE34_API_KEY in the env block of this server's entry in your MCP client " +
        "configuration. Both are shown under 'API Access Credentials' at " +
        "https://rule34.xxx/index.php?page=account&s=options once you are signed in. The site issues one key " +
        "per person, so use your own rather than sharing one.",
    },
  );
}

export function notFound(url: string): Rule34Error {
  return new Rule34Error("not_found", "rule34.xxx has nothing at this address.", {
    url,
    status: 404,
    hint: "Check the post id. Ids come from a search; they are not stable to guess by hand.",
  });
}

/**
 * The site is being asked too often.
 *
 * This never becomes an empty result. rule34.xxx limits its rate without
 * publishing one, and a refusal rendered as zero posts reads as "the site holds
 * nothing on this tag", which is the one thing a caller must not be told here.
 */
export function rateLimited(url: string, retryAfterMs: number): Rule34Error {
  return new Rule34Error(
    "rate_limited",
    "rule34.xxx is refusing requests from this client for now (HTTP 429). " +
      "This does NOT mean the search found nothing.",
    {
      url,
      status: 429,
      retryAfterMs,
      hint:
        "Wait before asking again. If it keeps happening, raise RULE34_MIN_INTERVAL_MS in your MCP client " +
        "configuration to slow this server down.",
    },
  );
}

export function parseFailure(url: string, what: string, cause?: unknown): Rule34Error {
  return new Rule34Error(
    "parse_failure",
    `The request was answered, but not with the document this route publishes (${what}).`,
    { url, hint: `Please report this, with the query you used, at ${ISSUES_URL}` },
    { cause },
  );
}

/** The site answered with a failure of its own, in the shape its API documents. */
export function upstreamFailure(url: string, message: string): Rule34Error {
  return new Rule34Error("network_error", `rule34.xxx reported a failure: ${message}`, {
    url,
    hint: "This is the site's own message. Waiting and asking again is usually the only remedy.",
  });
}
