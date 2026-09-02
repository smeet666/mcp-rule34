# mcp-rule34

[![npm](https://img.shields.io/npm/v/mcp-rule34.svg)](https://www.npmjs.com/package/mcp-rule34)
[![CI](https://github.com/smeet666/mcp-rule34/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-rule34/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-rule34.svg)](./LICENSE)
[![LobeHub](https://lobehub.com/badge/mcp/smeet666-mcp-rule34)](https://lobehub.com/mcp/smeet666-mcp-rule34)

[rule34.xxx](https://rule34.xxx) is a large image board whose posts are indexed
entirely by tags, and it publishes an API for reading them. A post carries its
identifier, the address of its page and of its file, its dimensions, the score
its viewers gave it, its rating, and the full list of tags it was filed under.
The site holds tens of millions of posts and answers a tag search with the number
it matched.

This server connects a chat client to that index. You can search the posts by
tags, combining required tags, alternatives and exclusions, read one post's
record by its identifier, and look up how the site spells a tag before searching
on it. **It needs an account and an API key**, which the site issues per person.

_[Version française](#mcp-rule34-français)_

---

## Install

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

Node 24 or later is required. The two credentials are required; everything else
under [Configuration](#configuration) is optional.

### With Docker

```json
{
  "mcpServers": {
    "rule34": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "RULE34_USER_ID",
        "-e",
        "RULE34_API_KEY",
        "ghcr.io/smeet666/mcp-rule34:2.0.2"
      ]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`api.rule34.xxx` and `rule34.xxx`, and the two credentials from your environment:
no volume, no port.

### Bundle, without npm

Download `mcp-rule34-2.0.2.mcpb` from
[the latest release](https://github.com/smeet666/mcp-rule34/releases/latest) and
open it. A client that supports MCP bundles installs it on its own, with no npm
to run. The credentials are still set in the client's configuration.

## What you can ask

- "How does the site spell that tag?"
- "Find posts tagged with those two, sorted by score."
- "Same search, leaving out monochrome."
- "Read me the record for post 1234567."
- "How many posts does that search match?"

The ordinary path runs from a tag lookup to a search: `find_tags` gives the
spelling the site uses, and `search_posts` takes it.

## Tools

| Tool           | What it does                                                  |
| -------------- | ------------------------------------------------------------- |
| `find_tags`    | Finds how the site spells a tag, and how many posts carry it. |
| `search_posts` | Searches the posts by tags, with alternatives and exclusions. |
| `get_post`     | Reads one post's record by its identifier or its address.     |

**Look a tag up before searching on it.** The site indexes by tag alone, and a
tag it does not hold matches nothing, which reads as an empty result rather than
as a misspelling.

### `find_tags`

Finds how the site spells a tag.

| Argument | Type                        | Required | What it does         |
| -------- | --------------------------- | -------- | -------------------- |
| `query`  | string, up to 60 characters | yes      | The text to look up. |

**In return:** `query` as it was sent, and `tags`, each with the spelling the site
uses and the number of posts carrying it.

### `search_posts`

Searches the posts by tags.

| Argument     | Type                                                  | Required | What it does                             |
| ------------ | ----------------------------------------------------- | -------- | ---------------------------------------- |
| `tags`       | array of 1 to 10 tag names                            | yes      | Tags a post must carry.                  |
| `any_of`     | array of 1 to 10 tag names                            | no       | Tags a post must carry at least one of.  |
| `exclude`    | array of 1 to 10 tag names                            | no       | Tags a post must carry none of.          |
| `media_type` | `image`, `animated`, `video` or `any`, default `any`  | no       | Stills, GIFs or MP4.                     |
| `rating`     | `questionable` or `explicit`                          | no       | Both are searched when this is left out. |
| `sort`       | `score`, `id`, `updated` or `random`, default `score` | no       | The order the site sorts by.             |
| `limit`      | integer, 1 to 100, default `20`                       | no       | Posts to serve.                          |
| `page`       | integer, 1 to 200, default `1`                        | no       | Which page of posts.                     |

`media_type` is read off the site's own tags, so the classification is as good as
the tagging. The two ratings above are the only ones the site holds: any other
value answers zero posts and no error, which would hand back an absence the site
never had.

**In return:** `tags`, `any_of` and `exclude` as the site spells them; `query`,
the search as it was sent in the site's own language; `total`, the posts the
whole search matches as counted by the site; and the posts themselves, each with
its `id`, `post_url`, `file_url`, `preview_url`, `sample_url`, `width`,
`height`, `score`, `rating` and `tags`. The score is the site's own and it is
updated once a day.

### `get_post`

Reads one post's record.

| Argument | Type                  | Required   | What it does                    |
| -------- | --------------------- | ---------- | ------------------------------- |
| `id`     | integer, 1 or more    | one of two | The post identifier.            |
| `url`    | a rule34.xxx post URL | one of two | The address of the post's page. |

**In return:** the post a search row carries, with its full tag list.

## Configuration

The two credentials are required. Everything else is optional, and all of it goes
in the `env` block of your client config.

| Variable                   | Default              | What it does                                                                       |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `RULE34_USER_ID`           | none, required       | Your numeric account id.                                                           |
| `RULE34_API_KEY`           | none, required       | Your API key, which is personal.                                                   |
| `RULE34_USER_AGENT`        | the project identity | Names your application to the site, with an address where a person can be reached. |
| `RULE34_MIN_INTERVAL_MS`   | `1000`               | Gap between two requests, from 1000 to 60000.                                      |
| `RULE34_TIMEOUT_MS`        | `20000`              | Deadline for one request, from 1000 to 120000.                                     |
| `RULE34_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 10.                                  |
| `RULE34_CACHE_TTL_MS`      | `300000`             | How long an answer stays in memory, from 0 to 86400000.                            |
| `RULE34_CACHE_MAX_ENTRIES` | `300`                | Answers held in memory at once, from 0 to 10000.                                   |
| `RULE34_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                           |

**Where the credentials come from.** Sign in, open
[Account options](https://rule34.xxx/index.php?page=account&s=options), and find
the row named _API Access Credentials_. It shows `&api_key=…&user_id=…`, and
those two values are what goes in the configuration above. If the key is empty,
tick _Generate New Key?_ and save.

The site issues one key per person, and asks that applications serving its
content display no advertising and put it behind no paywall. This server ships no
key of its own, and each user brings their own. Started without credentials, it
runs, publishes its tools, and answers every call by naming the two variables to
set: it sends no request it knows the site will refuse.

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                 |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `not_found`     | The site answered, and holds nothing at that address.   | Check the identifier with `search_posts`.                                                                  |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument. A missing credential is reported here.                         |
| `rate_limited`  | The site asked this client to slow down.                | Wait the number of seconds the hint names and call again with the same arguments. The post is still there. |
| `parse_failure` | The answer arrived in a shape this client cannot read.  | Report it at [the issue tracker](https://github.com/smeet666/mcp-rule34/issues).                           |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                         |
| `timeout`       | The request passed its deadline.                        | Raise `RULE34_TIMEOUT_MS`, or ask for fewer posts.                                                         |

## As a library

The layer reading the site is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { Rule34Client } from "mcp-rule34/client";

const client = new Rule34Client({ credentials: { userId: "…", apiKey: "…" } });
const { data, cached } = await client.searchPosts({ tags: ["example"], limit: 5 });
console.log(data.total, cached);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. The one-second floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least a second between them, and that floor
holds however the server is configured. The `User-Agent` always ends with the
project identity and an address where a person can be reached.

Reads go to the API the site documents, and the credentials it issues are what
its terms ask automated reading to use. Every result carries the address of the
post's page. Nothing is downloaded: a file address travels through an answer as a
string.

This MCP server is an unofficial project, with no affiliation to rule34.xxx.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `api.rule34.xxx` and `rule34.xxx` and nothing else,
holds its answers in memory while it runs, and writes nothing to disk. Your
credentials are read from the environment and sent to that site alone.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
site itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-rule34/issues). Pull requests
are welcome; opening an issue first helps agree on the shape of the change. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The posts and the tags belong to rule34.xxx and to
the people who uploaded them.

---

<a name="mcp-rule34-français"></a>

# mcp-rule34 (français)

_[English version](#mcp-rule34)_

[rule34.xxx](https://rule34.xxx) est un grand imageboard dont les publications
sont indexées entièrement par étiquettes, et il publie une API pour les lire. Une
publication porte son identifiant, l'adresse de sa page et de son fichier, ses
dimensions, la note que ses visiteurs lui ont donnée, son classement, et la liste
complète des étiquettes sous lesquelles elle est rangée. Le site contient des
dizaines de millions de publications et répond à une recherche par étiquettes en
donnant le nombre qu'elle a trouvé.

Ce serveur relie un client de conversation à cet index. On peut chercher les
publications par étiquettes, en combinant les étiquettes exigées, les
alternatives et les exclusions, lire la fiche d'une publication par son
identifiant, et vérifier comment le site orthographie une étiquette avant de
chercher dessus. **Il demande un compte et une clé d'API**, que le site délivre
par personne.

## Installation

**Claude Code**

```bash
claude mcp add rule34 --env RULE34_USER_ID=votre-id --env RULE34_API_KEY=votre-cle -- npx -y mcp-rule34
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

```json
{
  "mcpServers": {
    "rule34": {
      "command": "npx",
      "args": ["-y", "mcp-rule34"],
      "env": {
        "RULE34_USER_ID": "votre-id",
        "RULE34_API_KEY": "votre-cle"
      }
    }
  }
}
```

Node 24 ou plus récent est nécessaire. Les deux identifiants sont obligatoires ;
tout le reste, sous [Configuration](#configuration-1), est facultatif.

### Avec Docker

```json
{
  "mcpServers": {
    "rule34": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "RULE34_USER_ID",
        "-e",
        "RULE34_API_KEY",
        "ghcr.io/smeet666/mcp-rule34:2.0.2"
      ]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `api.rule34.xxx` et `rule34.xxx`, et des deux identifiants pris dans
votre environnement : aucun volume, aucun port.

### Bundle, sans npm

Téléchargez `mcp-rule34-2.0.2.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-rule34/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm à
lancer. Les identifiants se posent toujours dans la configuration du client.

## Ce qu'on peut demander

- « Comment le site orthographie-t-il cette étiquette ? »
- « Trouve les publications portant ces deux étiquettes, triées par note. »
- « La même recherche, sans monochrome. »
- « Lis-moi la fiche de la publication 1234567. »
- « Combien de publications cette recherche trouve-t-elle ? »

Le chemin ordinaire va d'une recherche d'étiquette à une recherche de
publications : `find_tags` donne l'orthographe qu'emploie le site, et
`search_posts` la reprend.

## Les outils

| Outil          | Ce qu'il fait                                                                |
| -------------- | ---------------------------------------------------------------------------- |
| `find_tags`    | Trouve l'orthographe d'une étiquette, et combien de publications la portent. |
| `search_posts` | Cherche les publications par étiquettes, avec alternatives et exclusions.    |
| `get_post`     | Lit la fiche d'une publication par son identifiant ou son adresse.           |

**Vérifiez une étiquette avant de chercher dessus.** Le site indexe par étiquette
seule, et une étiquette qu'il ne connaît pas ne correspond à rien, ce qui se lit
comme un résultat vide plutôt que comme une faute d'orthographe.

### `find_tags`

Trouve l'orthographe d'une étiquette.

| Argument | Type                          | Requis | Ce qu'il fait        |
| -------- | ----------------------------- | ------ | -------------------- |
| `query`  | chaîne, jusqu'à 60 caractères | oui    | Le texte à vérifier. |

**En retour :** `query` tel qu'envoyé, et `tags`, chacune avec l'orthographe
qu'emploie le site et le nombre de publications qui la portent.

### `search_posts`

Cherche les publications par étiquettes.

| Argument     | Type                                                 | Requis | Ce qu'il fait                                             |
| ------------ | ---------------------------------------------------- | ------ | --------------------------------------------------------- |
| `tags`       | tableau de 1 à 10 noms d'étiquettes                  | oui    | Étiquettes qu'une publication doit porter.                |
| `any_of`     | tableau de 1 à 10 noms d'étiquettes                  | non    | Étiquettes dont une publication doit porter au moins une. |
| `exclude`    | tableau de 1 à 10 noms d'étiquettes                  | non    | Étiquettes qu'une publication ne doit pas porter.         |
| `media_type` | `image`, `animated`, `video` ou `any`, défaut `any`  | non    | Images fixes, GIF ou MP4.                                 |
| `rating`     | `questionable` ou `explicit`                         | non    | Les deux sont cherchés quand il est omis.                 |
| `sort`       | `score`, `id`, `updated` ou `random`, défaut `score` | non    | L'ordre de tri du site.                                   |
| `limit`      | entier, 1 à 100, défaut `20`                         | non    | Publications à servir.                                    |
| `page`       | entier, 1 à 200, défaut `1`                          | non    | Quelle page de publications.                              |

`media_type` se lit sur les étiquettes du site lui-même, donc la classification
vaut ce que vaut l'étiquetage. Les deux classements ci-dessus sont les seuls que
le site connaisse : toute autre valeur rend zéro publication et aucune erreur, ce
qui livrerait une absence que le site n'a jamais eue.

**En retour :** `tags`, `any_of` et `exclude` tels que le site les
orthographie ; `query`, la recherche telle qu'elle a été envoyée dans la langue
du site ; `total`, les publications que toute la recherche trouve, tel que le
site les compte ; et les publications elles-mêmes, chacune avec son `id`,
`post_url`, `file_url`, `preview_url`, `sample_url`, `width`, `height`, `score`,
`rating` et `tags`. La note est celle du site et elle est mise à jour une fois
par jour.

### `get_post`

Lit la fiche d'une publication.

| Argument | Type                           | Requis        | Ce qu'il fait                    |
| -------- | ------------------------------ | ------------- | -------------------------------- |
| `id`     | entier, 1 ou plus              | l'un des deux | L'identifiant de la publication. |
| `url`    | une adresse de page rule34.xxx | l'un des deux | L'adresse de la page.            |

**En retour :** la publication que porte une ligne de recherche, avec sa liste
complète d'étiquettes.

## Configuration

Les deux identifiants sont obligatoires. Tout le reste est facultatif, et tout se
pose dans le bloc `env` de la configuration du client.

| Variable                   | Défaut               | Ce qu'elle fait                                                                   |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `RULE34_USER_ID`           | aucun, obligatoire   | L'identifiant numérique de votre compte.                                          |
| `RULE34_API_KEY`           | aucun, obligatoire   | Votre clé d'API, qui est personnelle.                                             |
| `RULE34_USER_AGENT`        | l'identité du projet | Nomme votre application auprès du site, avec une adresse où joindre une personne. |
| `RULE34_MIN_INTERVAL_MS`   | `1000`               | Écart entre deux requêtes, de 1000 à 60000.                                       |
| `RULE34_TIMEOUT_MS`        | `20000`              | Délai d'une requête, de 1000 à 120000.                                            |
| `RULE34_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 10.                                    |
| `RULE34_CACHE_TTL_MS`      | `300000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.             |
| `RULE34_CACHE_MAX_ENTRIES` | `300`                | Réponses gardées en mémoire à la fois, de 0 à 10000.                              |
| `RULE34_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.               |

**D'où viennent les identifiants.** Connectez-vous, ouvrez
[Account options](https://rule34.xxx/index.php?page=account&s=options), et
trouvez la ligne _API Access Credentials_. Elle affiche `&api_key=…&user_id=…`,
et ces deux valeurs sont ce qui va dans la configuration ci-dessus. Si la clé est
vide, cochez _Generate New Key?_ et enregistrez.

Le site délivre une clé par personne, et demande que les applications servant son
contenu n'affichent aucune publicité et ne le placent derrière aucun péage. Ce
serveur n'embarque aucune clé, et chacun apporte la sienne. Démarré sans
identifiants, il tourne, publie ses outils, et répond à chaque appel en nommant
les deux variables à poser : il n'envoie aucune requête dont il sait que le site
la refusera.

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                   | Que faire                                                                                             |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `not_found`     | Le site a répondu, et n'a rien à cette adresse.      | Vérifiez l'identifiant avec `search_posts`.                                                           |
| `invalid_input` | Les arguments ont été refusés avant toute requête.   | Lisez le message, qui nomme l'argument. Un identifiant manquant est signalé ici.                      |
| `rate_limited`  | Le site demande à ce client de ralentir.             | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La publication est toujours là. |
| `parse_failure` | La réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-rule34/issues).                |
| `network_error` | La requête n'a pas abouti.                           | Réessayez sous peu.                                                                                   |
| `timeout`       | La requête a dépassé son délai.                      | Augmentez `RULE34_TIMEOUT_MS`, ou demandez moins de publications.                                     |

## Comme bibliothèque

La couche qui lit le site est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { Rule34Client } from "mcp-rule34/client";

const client = new Rule34Client({ credentials: { userId: "…", apiKey: "…" } });
const { data, cached } = await client.searchPosts({ tags: ["example"], limit: 5 });
console.log(data.total, cached);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Le plancher d'une seconde entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins une seconde entre elles, et ce
plancher tient quelle que soit la configuration. Le `User-Agent` se termine
toujours par l'identité du projet et une adresse où joindre une personne.

Les lectures passent par l'API que le site documente, et les identifiants qu'il
délivre sont ce que ses conditions demandent d'employer pour une lecture
automatisée. Chaque résultat porte l'adresse de la page de la publication. Rien
n'est téléchargé : une adresse de fichier traverse une réponse comme une chaîne
de caractères.

Ce MCP est un projet non officiel, sans affiliation à rule34.xxx.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `api.rule34.xxx` et `rule34.xxx`, garde ses réponses
en mémoire le temps qu'il tourne, et n'écrit rien sur le disque. Vos identifiants
sont lus dans l'environnement et envoyés à ce seul site. [PRIVACY.md](PRIVACY.md)
dit ce qu'une requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le site lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-rule34/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les publications et les étiquettes appartiennent à
rule34.xxx et aux personnes qui les ont déposées.
