/**
 * Turning one API answer into a document, and classifying the answers that are
 * not one.
 *
 * Every route of this API answers a request carrying no valid credentials with
 * HTTP 200 and an `<error>` document, so the transport cannot tell that apart
 * from a result. It is told apart here, once, for every route.
 */

import { XMLParser } from "fast-xml-parser";
import { missingCredentials, parseFailure, upstreamFailure } from "../../errors.js";

export type Attributes = Record<string, string | undefined>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Attribute values are converted one field at a time by each parser, so that
  // an empty `parent_id` stays empty instead of becoming a number.
  parseAttributeValue: false,
  trimValues: true,
});

export function readDocument(xml: string, safeUrl: string): Record<string, unknown> {
  if (xml.trim() === "") {
    throw parseFailure(safeUrl, "the response was empty");
  }

  let document: unknown;
  try {
    document = parser.parse(xml);
  } catch (error) {
    throw parseFailure(safeUrl, error instanceof Error ? error.message : "unreadable XML");
  }

  if (document === null || typeof document !== "object") {
    throw parseFailure(safeUrl, "the response is not an XML document");
  }

  const parsed = document as Record<string, unknown>;
  const failure = parsed.error;
  if (failure !== undefined) {
    const message = typeof failure === "string" ? failure : String(failure);
    // A fault in the caller's configuration rather than in the site.
    if (/authenticat/i.test(message)) {
      throw missingCredentials(safeUrl);
    }
    throw upstreamFailure(safeUrl, message);
  }

  return parsed;
}

/** A lone element parses to an object, several to an array, none to nothing. */
export function toArray(value: unknown): Attributes[] {
  if (value === undefined || value === null) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]) as Attributes[];
}

export function readText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function readInteger(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
