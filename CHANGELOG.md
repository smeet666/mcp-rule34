# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

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
