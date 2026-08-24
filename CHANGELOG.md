# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-24

### Added

- `find_tags`: ask rule34.xxx which tag names begin with a piece of text, and
  how many posts each one carries. The route needs no credentials, so a server
  with none configured can still say how a tag is spelled.
- A search that finds nothing because a required tag does not exist now offers
  the names the site does hold that begin like it.
- A page beyond the end of a search says how many pages the search fills and
  that the page asked for lies past them, rather than serving an empty list with
  nothing said.
- A search whose results outrun the page ceiling says so, and names raising
  `limit` as the way to reach the rest.

### Changed

- A search row leads with the tags the search asked for, so a post matching on a
  name the site lists late still shows why it is there. Only names the post
  carries are lifted.
- `created_at` is described as the date rule34.xxx took the post in. The site
  imported much of its older catalogue in bulk, so thousands of posts share one
  day in November 2010, and reading that as a publication date states something
  about the work that the data says about the upload.
- The `sort` argument describes all four orders it accepts, `updated` and
  `random` included.

### Fixed

- A link carrying `id` twice with different values is refused instead of
  answering about the first of the two.
- A link whose `id` is not a usable number says so, rather than reporting that
  the link carries no id at all.
- A tag written with spaces alone is refused for being empty, without quoting a
  length it does not exceed.

## [0.1.0] - 2026-08-23

First release.

### Added

- `search_posts`: search rule34.xxx posts by one tag or by several at once, with
  alternatives and exclusions as their own arguments, a media type, a rating, a
  sort, and pagination. A row shows the first twelve tags of a post and states
  how many it carries in all.
- `get_post`: read one post named by its id or by a link to its page, with every
  tag typed and counted, the uploader, the comment count and the publication
  date. The post is read from both formats the API publishes, because neither
  carries all of that on its own.
- Credentials read from `RULE34_USER_ID` and `RULE34_API_KEY`. A server without
  them starts, publishes its tools, and answers each call by naming what to set.
- An empty search of several tags names the tags the site does not hold.
- The reading layer published on its own under the `./client` subpath, with the
  same pacing, cache and error taxonomy and no protocol attached.
