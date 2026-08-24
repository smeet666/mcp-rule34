/** Domain types shared by the reading layer and the MCP tools. */

/** What a caller may ask for, in the site's own vocabulary. */
export type MediaType = "image" | "animated" | "video" | "any";

/**
 * The two ratings rule34.xxx actually holds.
 *
 * The site's search accepts `safe`, `general` and `sensitive` and answers each
 * with zero posts and no error, so a caller filtering on one of them reads an
 * absence that the site never had. The vocabulary is closed here for that
 * reason. A post is still read with whatever letter it carries.
 */
export type Rating = "questionable" | "explicit";

export type SortOrder = "score" | "id" | "updated" | "random";

export interface Rule34Post {
  id: number;
  /** The page a person can open, as opposed to the API route that served it. */
  postUrl: string;
  fileUrl: string;
  sampleUrl: string | null;
  previewUrl: string | null;
  width: number;
  height: number;
  md5: string;
  score: number;
  /** `explicit`, `questionable` or `safe`, or the letter itself when unknown. */
  rating: string;
  tags: string[];
  /** Whatever the uploader credited, which may hold several addresses. */
  source: string | null;
  parentId: number | null;
  creatorId: number | null;
  status: string;
  hasChildren: boolean;
  hasComments: boolean;
  hasNotes: boolean;
  /** When the post was published, as the site printed it, in ISO 8601. */
  createdAt: string | null;
  /** Last change to the post, in Unix seconds. Retagging moves this, not the date above. */
  changedAtUnix: number | null;
}

export interface PostList {
  /** Posts the search matches across every page, as counted by the site. */
  total: number;
  offset: number;
  posts: Rule34Post[];
}

/** The kinds of tag the site numbers, named. */
export type TagType = "general" | "artist" | "copyright" | "character" | "metadata" | "unknown";

export interface TagRef {
  id: number;
  name: string;
  /** Posts the site's tag table credits to this tag. */
  postCount: number;
  type: TagType;
  /** The number the site used, kept whether or not it has a name here. */
  typeCode: number | null;
  ambiguous: boolean;
}

export interface TagOnPost {
  name: string;
  /** The kind the site published, or the word it used when that kind is new. */
  type: string;
  /** Posts the site credits to this tag. */
  postCount: number;
}

/**
 * One post, read from both formats the API publishes.
 *
 * The publication date and the uploader's numeric id come from the XML; the
 * uploader's name, the comment count and the tag types come from the JSON.
 */
export interface PostDetail {
  id: number;
  postUrl: string;
  fileUrl: string;
  sampleUrl: string | null;
  previewUrl: string | null;
  width: number;
  height: number;
  md5: string;
  score: number;
  rating: string;
  tags: string[];
  tagDetails: TagOnPost[];
  source: string | null;
  parentId: number | null;
  /** The uploader's name, which only the JSON route publishes. */
  owner: string | null;
  /** Comments on the post, which only the JSON route counts. */
  commentCount: number | null;
  status: string;
  hasNotes: boolean;
  changedAtUnix: number | null;
  /** Only the XML route publishes this, so it is absent until both are read. */
  createdAt?: string | null;
  /** Only the XML route publishes this. */
  creatorId?: number | null;
  hasComments?: boolean;
  hasChildren?: boolean;
}
