/**
 * Reading the list of names rule34.xxx suggests for a piece of text.
 *
 * The site writes each entry twice over: a `label` it means to display, which
 * carries the post count in brackets, and a `value` a search actually takes.
 * The count is read out of the label because that is the only place the route
 * puts it.
 */

import { parseFailure } from "../../errors.js";
import type { TagSuggestion } from "../../types.js";
import { redactCredentials } from "../urls.js";

interface RawSuggestion {
  label?: unknown;
  value?: unknown;
}

/** The count the site prints at the end of a label, as in `kimono (55638)`. */
const COUNT_IN_LABEL = /\((\d+)\)\s*$/;

export function parseTagSuggestions(body: string, url: string): TagSuggestion[] {
  const safeUrl = redactCredentials(url);

  if (body.trim() === "") {
    throw parseFailure(safeUrl, "the response was empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw parseFailure(safeUrl, "the response is not JSON", error);
  }

  if (!Array.isArray(parsed)) {
    throw parseFailure(safeUrl, "the response is not a list of suggestions");
  }

  const suggestions: TagSuggestion[] = [];
  for (const entry of parsed) {
    const raw = (entry ?? {}) as RawSuggestion;
    const name = typeof raw.value === "string" ? raw.value.trim() : "";
    // An entry with no name names no tag, and carrying it forward would offer a
    // suggestion a caller cannot search for.
    if (name === "") {
      continue;
    }
    const label = typeof raw.label === "string" ? raw.label : "";
    const counted = COUNT_IN_LABEL.exec(label);
    suggestions.push({
      name,
      // Zero is a number of posts. A label the site printed no count into
      // leaves the count unknown.
      postCount: counted?.[1] === undefined ? null : Number(counted[1]),
    });
  }
  return suggestions;
}
