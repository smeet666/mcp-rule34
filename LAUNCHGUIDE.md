# Launch guide

Copy for directories and marketplaces that ask for a description, a feature
list and example prompts.

## Tagline

Search rule34.xxx by tag, with honest totals and a search language a model can
actually aim.

## Short description

An MCP server for rule34.xxx, read through the site's own API. Search posts by
one tag or by several at once, ask for still images, animations or video, and
get back each post's page, its file, its dimensions, its score, its rating and
its full tag list, alongside the number of posts the whole search matches.

Tags are written as single tokens on the site, so a name said as words is
joined for you: `asuka langley sohryu` and `ranma 1/2` are single tags. When a
search of several tags finds nothing, the answer names the tags the site does
not hold, which turns the most common mistake into something a caller can fix.

## Who it is for

Anyone who wants an assistant to search a large tagged image catalogue and
report what it found without overstating it.

## Requirements

An account on rule34.xxx and the API key it issues, both set as environment
variables. The site issues one key per person, and this server ships none.

## Features

- Search by one tag or by up to ten at once, with alternatives and exclusions
  as separate arguments
- Ask for still images, animations or video; the site does the filtering, so
  the total counts what was asked for
- Every answer carries the total for the whole search, not the size of one page
- A search row shows the first twelve tags of a post and states how many it
  carries in all; get_post reads the whole list, with a kind for every tag
- A rating the site does not hold is refused rather than answered with nothing
- An empty search of several tags names the tag that does not exist
- Rate limiting is reported as rate limiting, never as an absence of results
- One request at a time, a second apart, and no configuration can make it faster
- The API key never appears in a message, a log line or a cache key

## Example prompts

- "Find the highest scoring colour artwork tagged prince of tennis"
- "Show me videos tagged neon genesis evangelion"
- "Search for asuka langley sohryu with black hair, no 3d, images only"

## Tools

- Tool: search_posts — Finds posts carrying a tag or several at once, and
  returns each post's page, file, dimensions, score and rating
- Tool: get_post — Reads one post whole, with a kind and a post count for every
  tag, the uploader, the comments and the publication date

## Keywords

rule34, booru, tags, image-search, tag-search, gallery, adult, read-only
