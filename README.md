# mcp-rule34

[![npm](https://img.shields.io/npm/v/mcp-rule34.svg)](https://www.npmjs.com/package/mcp-rule34)
[![CI](https://github.com/smeet666/mcp-rule34/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-rule34/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-rule34.svg)](./LICENSE)

An [MCP](https://modelcontextprotocol.io) server for [rule34.xxx](https://rule34.xxx).
Search the site's posts by tag through its own API, and get back each post's page,
its file, its dimensions, its score, its rating and its full tag list, alongside
the number of posts the whole search matches.

**This server needs credentials.** rule34.xxx issues an API key per account, and
its terms allow automated reading through the API alone. Getting one takes a
minute and is described under [Configuration](#configuration).

_(Version française plus bas / [French version below](#mcp-rule34-français))_

---

## Quickstart

**Claude Code**

```bash
claude mcp add rule34 --env RULE34_USER_ID=your-id --env RULE34_API_KEY=your-key -- npx -y mcp-rule34
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "rule34": {
      "command": "npx",
      "args": ["-y", "mcp-rule34"],
      "env": {
        "RULE34_USER_ID": "your-id",
        "RULE34_API_KEY": "your-key"
      }
    }
  }
}
```

Put this in your **user** configuration rather than in a project file: a
`.mcp.json` at the root of a repository travels with the repository, and the key
travels with it.

## Configuration

| Variable                   | What it is                                        | Default                     |
| -------------------------- | ------------------------------------------------- | --------------------------- |
| `RULE34_USER_ID`           | Your numeric account id. Required.                | —                           |
| `RULE34_API_KEY`           | Your API key. Required, and personal.             | —                           |
| `RULE34_MIN_INTERVAL_MS`   | Milliseconds between two requests.                | `1000`, and never lower     |
| `RULE34_TIMEOUT_MS`        | How long one request may take.                    | `20000`                     |
| `RULE34_MAX_RETRIES`       | Attempts after the first, for transient failures. | `3`                         |
| `RULE34_CACHE_TTL_MS`      | How long an answer stays in memory.               | `300000`                    |
| `RULE34_CACHE_MAX_ENTRIES` | How many answers stay in memory.                  | `300`                       |
| `RULE34_USER_AGENT`        | Overrides the agent this client sends.            | `mcp-rule34/<version> (+…)` |
| `RULE34_LOG_LEVEL`         | `silent`, `error`, `info` or `debug`, on stderr.  | `error`                     |

**Where the credentials come from.** Sign in, open
[Account options](https://rule34.xxx/index.php?page=account&s=options), and find
the row named _API Access Credentials_. It shows `&api_key=…&user_id=…`; those
two values are what goes in the configuration above. If the key is empty, tick
_Generate New Key?_ and save.

The site issues **one key per person** and asks that applications serving its
content display no advertising and put it behind no paywall. This server ships
no key of its own, and each user brings their own.

A server started without credentials still starts, publishes its tool, and
answers every call by naming the two variables to set. It never sends a request
it knows the site will refuse.

## Tools

| Tool           | What it does                                                  | Key parameters                                                               |
| -------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `search_posts` | Finds posts carrying a tag, or several at once.               | `tags`, `any_of`, `exclude`, `media_type`, `rating`, `sort`, `limit`, `page` |
| `get_post`     | Reads one post whole, with a kind for every tag.              | `id`, `url`                                                                  |
| `find_tags`    | Finds how the site spells a tag, and how many posts carry it. | `query`                                                                      |

### Finding how a tag is spelled

`find_tags` asks rule34.xxx which names begin with a piece of text, and how many
posts each one carries. It matches from the start of a name, so `kimagure` finds
`kimagure_orange_road` while a word sitting in the middle of a name finds
nothing. The site offers at most ten names and the answer says so, since ten
back means the list was cut rather than exhausted.

This is also what a search that found nothing falls back on: when a required tag
does not exist, the answer names it and offers the names the site does hold that
begin like it.

### A search names posts, a post is then read whole

A post on rule34.xxx carries a median of about two hundred tags, and some carry
nine hundred. A page of twenty results with every tag spelled out would spend
four fifths of its answer on tag strings nobody reads, so a search row shows the
first twelve and states how many the post carries in all.

`get_post` reads one post by its id, or by a link to its page, and returns every
tag with its kind, character, copyright, artist, general or metadata, and how
many posts share it, alongside the uploader, the number of comments and the
date the site took it in. A link is read rather than followed: this server builds its
own request from the id it finds in it.

Reading one post costs two requests, because neither format the API publishes
carries everything: the date the site took the post in comes from one, and the
uploader's name, the comment count and the tag kinds from the other.

### Tags are single tokens

rule34.xxx stores a tag as one token, joining with underscores what a person
says as words. `asuka langley sohryu` and `asuka_langley_sohryu` are the same
tag, and this server writes the second from the first. Punctuation inside a name
belongs to it: the series tag is `ranma_1/2`, slash included.

### Three lists, three questions

```jsonc
{
  "tags": ["asuka langley sohryu", "black hair"], // every one of these
  "any_of": ["blonde hair", "red hair"], // at least one of these
  "exclude": ["monochrome", "3d"], // none of these
}
```

Filters live in arguments of their own rather than inside the tags, so an answer
can state the rating and the sort it actually used.

### Asking for images, animations or video

`media_type` takes `image`, `animated`, `video` or `any`. rule34.xxx carries the
distinction in its own tags, so the site does the filtering and the total it
returns counts what was asked for. The classification is therefore as good as
the site's tagging.

Colour is stated by absence: the site tags what is black and white, and tags
nothing to say a post is in colour. Ask for colour with
`"exclude": ["monochrome", "greyscale", "grayscale"]`.

### Ratings

The site holds two ratings: `questionable` and `explicit`. Asking rule34.xxx for
`safe`, `general` or `sensitive` returns zero posts and no error, which reads as
an absence rather than as a rating the site never had, so this server refuses
those three instead of passing them on.

### When a search finds nothing

A tag that does not exist empties a search exactly the way a combination the
site holds nothing for does. When a search of several tags comes back empty,
this server asks the site which of the names it holds, and the answer says which
one it does not:

```
No post on rule34.xxx matches neon_genesis_evangelion asuka_langley_sohry.

Note: rule34.xxx holds no tag named 'asuka_langley_sohry'. A tag that does not
exist empties a search on its own.
```

## What an answer states

Every answer carries the total the site counted for the whole search, the page
that was served, and the search as it was sent in the site's own language. A
post carries its rule34.xxx page, its file, its thumbnail, its dimensions, its
score, its rating, its tags, whatever the uploader credited as a source, and the
date rule34.xxx took it in.

A post carries two dates, and neither one is when its subject was made. The
first is the day the site took the post in, the second the day the post last
changed, which retagging moves. rule34.xxx imported much of its older catalogue
in bulk, so thousands of posts share one day in November 2010: a question about
what came first is answered by the import, not by the work.

## What this server does not do

It never uploads, votes, comments, or writes anything to rule34.xxx.

## Errors

Every failure carries one of six codes, and the code opens the message:
`not_found`, `invalid_input`, `rate_limited`, `parse_failure`, `network_error`,
`timeout`.

`rate_limited` means the site is refusing this client for now, and it never
means a search found nothing. rule34.xxx limits its rate without publishing what
the rate is, so this client asks one question at a time, with a second between
two requests that no configuration can shorten, and it backs further off when the
site pushes back.

## Using it as a library

The reading layer is published on its own, without the protocol:

```ts
import { Rule34Client } from "mcp-rule34/client";
```

It carries the same pacing, the same cache and the same error taxonomy.

## Development

```bash
npm install
npm test          # unit tests, no network
npm run typecheck
npm run check     # biome and prettier
npm run build
```

A live suite reaches the site and runs only when credentials are present:

```bash
RULE34_USER_ID=… RULE34_API_KEY=… npm run test:live
```

## License

MIT.

---

# mcp-rule34 (français)

Un serveur [MCP](https://modelcontextprotocol.io) pour
[rule34.xxx](https://rule34.xxx). Cherche les posts du site par tag, à travers sa
propre API, et rend pour chacun sa page, son fichier, ses dimensions, son score,
sa classification et ses tags, avec le nombre de posts que la recherche entière
trouve.

**Ce serveur demande des identifiants.** rule34.xxx délivre une clé d'API par
compte, et ses conditions n'autorisent la lecture automatisée que par cette API.
En obtenir une prend une minute, voir [Configuration](#configuration-1).

## Démarrage

**Claude Code**

```bash
claude mcp add rule34 --env RULE34_USER_ID=votre-id --env RULE34_API_KEY=votre-clé -- npx -y mcp-rule34
```

**Claude Desktop, Cursor, et tout client au format standard**

```json
{
  "mcpServers": {
    "rule34": {
      "command": "npx",
      "args": ["-y", "mcp-rule34"],
      "env": {
        "RULE34_USER_ID": "votre-id",
        "RULE34_API_KEY": "votre-clé"
      }
    }
  }
}
```

À placer dans votre configuration **utilisateur** plutôt que dans un fichier de
projet : un `.mcp.json` à la racine d'un dépôt part avec le dépôt, et la clé
part avec lui.

## Configuration

| Variable                   | Ce que c'est                                       | Défaut                      |
| -------------------------- | -------------------------------------------------- | --------------------------- |
| `RULE34_USER_ID`           | L'identifiant numérique du compte. Obligatoire.    | —                           |
| `RULE34_API_KEY`           | La clé d'API. Obligatoire, et personnelle.         | —                           |
| `RULE34_MIN_INTERVAL_MS`   | Millisecondes entre deux requêtes.                 | `1000`, jamais moins        |
| `RULE34_TIMEOUT_MS`        | Durée maximale d'une requête.                      | `20000`                     |
| `RULE34_MAX_RETRIES`       | Tentatives après la première, sur panne passagère. | `3`                         |
| `RULE34_CACHE_TTL_MS`      | Durée de vie d'une réponse en mémoire.             | `300000`                    |
| `RULE34_CACHE_MAX_ENTRIES` | Nombre de réponses gardées en mémoire.             | `300`                       |
| `RULE34_USER_AGENT`        | Remplace l'agent que ce client envoie.             | `mcp-rule34/<version> (+…)` |
| `RULE34_LOG_LEVEL`         | `silent`, `error`, `info` ou `debug`, sur stderr.  | `error`                     |

**Où trouver les identifiants.** Connectez-vous, ouvrez
[les options du compte](https://rule34.xxx/index.php?page=account&s=options), et
cherchez la ligne _API Access Credentials_. Elle affiche `&api_key=…&user_id=…` :
ces deux valeurs vont dans la configuration ci-dessus. Si la clé est vide, cochez
_Generate New Key?_ puis enregistrez.

Le site délivre **une clé par personne** et demande qu'une application servant
son contenu n'affiche aucune publicité et ne le mette derrière aucun péage. Ce
serveur n'embarque aucune clé, et chacun apporte la sienne.

Un serveur démarré sans identifiants démarre quand même, publie son outil, et
répond à chaque appel en nommant les deux variables à régler. Il n'émet jamais
une requête dont il sait que le site la refusera.

## Les outils

| Outil          | Ce qu'il fait                                                        | Paramètres principaux                                                        |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `search_posts` | Trouve les posts portant un tag, ou plusieurs.                       | `tags`, `any_of`, `exclude`, `media_type`, `rating`, `sort`, `limit`, `page` |
| `get_post`     | Lit un post en entier, avec le type de chacun de ses tags.           | `id`, `url`                                                                  |
| `find_tags`    | Trouve comment le site écrit un tag, et combien de posts le portent. | `query`                                                                      |

### Trouver comment un tag s'écrit

`find_tags` demande à rule34.xxx quels noms commencent par un texte, et combien
de posts chacun porte. La correspondance part du début d'un nom, donc `kimagure`
trouve `kimagure_orange_road` là où un mot situé au milieu d'un nom ne trouve
rien. Le site propose au plus dix noms et la réponse le dit, puisque dix en
retour signifie une liste coupée plutôt qu'épuisée.

C'est aussi le repli d'une recherche qui n'a rien trouvé : quand un tag requis
n'existe pas, la réponse le nomme et propose les noms que le site détient et qui
commencent comme lui.

### La recherche nomme les posts, la fiche les lit en entier

Un post de rule34.xxx porte une médiane d'environ deux cents tags, et certains
en portent neuf cents. Une page de vingt résultats avec tous les tags écrits
dépenserait quatre cinquièmes de sa réponse en chaînes que personne ne lit, donc
une ligne de recherche montre les douze premiers et dit combien le post en porte
au total.

`get_post` lit un post par son identifiant, ou par un lien vers sa page, et rend
chaque tag avec son type, personnage, copyright, artiste, général ou métadonnée,
et le nombre de posts qui le partagent, avec le déposant, le nombre de
commentaires et la date à laquelle le site l'a pris. Un lien est lu et non suivi : ce serveur
construit sa propre requête à partir de l'identifiant qu'il y trouve.

Lire une fiche coûte deux requêtes, parce qu'aucun des deux formats publiés par
l'API ne porte tout : la date à laquelle le site a pris le post vient de l'un,
et le nom du déposant, le nombre de commentaires et les types de tags viennent
de l'autre.

### Un tag est un seul mot

rule34.xxx range un tag en un seul mot, en joignant par des underscores ce qu'une
personne dit en plusieurs. `asuka langley sohryu` et `asuka_langley_sohryu` sont
le même tag, et ce serveur écrit le second à partir du premier. La ponctuation
d'un nom lui appartient : le tag de la série est `ranma_1/2`, barre oblique
comprise.

### Trois listes, trois questions

```jsonc
{
  "tags": ["asuka langley sohryu", "black hair"], // tous ceux-là
  "any_of": ["blonde hair", "red hair"], // au moins un de ceux-là
  "exclude": ["monochrome", "3d"], // aucun de ceux-là
}
```

Les filtres vivent dans leurs propres arguments plutôt que dans les tags, ce qui
permet à une réponse d'énoncer la classification et le tri qu'elle a réellement
appliqués.

### Demander des images, des animations ou de la vidéo

`media_type` accepte `image`, `animated`, `video` ou `any`. rule34.xxx porte la
distinction dans ses propres tags, donc c'est le site qui filtre et le total
qu'il rend compte bien ce qui a été demandé. Le classement vaut donc ce que vaut
le travail de ses contributeurs.

La couleur s'énonce par une absence : le site tague le noir et blanc, et ne
tague rien pour dire qu'un post est en couleur. Demandez la couleur par
`"exclude": ["monochrome", "greyscale", "grayscale"]`.

### Les classifications

Le site tient deux classifications : `questionable` et `explicit`. Demander
`safe`, `general` ou `sensitive` à rule34.xxx rend zéro post et aucune erreur, ce
qui se lit comme une absence plutôt que comme une classification que le site n'a
jamais eue, donc ce serveur refuse ces trois-là au lieu de les transmettre.

### Quand une recherche ne trouve rien

Un tag qui n'existe pas vide une recherche exactement comme le fait une
combinaison dont le site n'a rien. Quand une recherche de plusieurs tags revient
vide, ce serveur demande au site lesquels de ces noms il détient, et la réponse
dit celui qu'il ne connaît pas.

## Ce qu'une réponse énonce

Chaque réponse porte le total compté par le site pour la recherche entière, la
page servie, et la requête telle qu'elle a été envoyée dans le langage du site.
Un post porte sa page rule34.xxx, son fichier, sa vignette, ses dimensions, son
score, sa classification, ses tags, la source créditée par le déposant quand il
en a crédité une, et la date à laquelle rule34.xxx l'a pris.

Un post porte deux dates, et aucune n'est celle où son sujet a été fait. La
première est le jour où le site a pris le post, la seconde le jour où il a
changé pour la dernière fois, que le retaguage déplace. rule34.xxx a importé en
masse une grande partie de son fonds ancien, donc des milliers de posts portent
un même jour de novembre 2010 : une question sur ce qui vient en premier est
répondue par l'import, jamais par l'œuvre.

## Ce que ce serveur ne fait pas

Il ne téléverse rien, ne vote pas, ne commente pas, et n'écrit rien sur
rule34.xxx.

## Les erreurs

Toute panne porte un de six codes, et le code ouvre le message : `not_found`,
`invalid_input`, `rate_limited`, `parse_failure`, `network_error`, `timeout`.

`rate_limited` veut dire que le site refuse ce client pour l'instant, et jamais
qu'une recherche n'a rien trouvé. rule34.xxx limite son débit sans publier
lequel, donc ce client pose une question à la fois, avec une seconde entre deux
requêtes qu'aucune configuration ne peut raccourcir, et il s'écarte davantage
quand le site le repousse.

## L'utiliser comme bibliothèque

La couche de lecture est publiée seule, sans le protocole :

```ts
import { Rule34Client } from "mcp-rule34/client";
```

Elle porte le même rythme, le même cache et la même taxonomie d'erreurs.

## Le développement

```bash
npm install
npm test          # tests unitaires, sans réseau
npm run typecheck
npm run check     # biome et prettier
npm run build
```

Une suite en direct atteint le site et ne tourne qu'avec des identifiants :

```bash
RULE34_USER_ID=… RULE34_API_KEY=… npm run test:live
```

## Licence

MIT.
