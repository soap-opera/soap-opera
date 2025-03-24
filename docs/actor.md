# Actor

_Resolve actor on Mastodon via webfinger_

Resources:

- https://datenwissen.de/2020/07/mit-solid-nach-mastodon-posten-geht-das
- https://blog.joinmastodon.org/2018/06/how-to-implement-a-basic-activitypub-server/
- https://vincenttunru.com/solid-fediverse-mastodon/

## Prerequisities

- Community Solid Server (and also try other flavors)
- domain-based pods (not subpaths) - Pod storage must be the origin without path (for successful hosting of the webfinger)

## How to do it

- create `.well-known/webfinger` on your Pod ([template](./webfinger.json)) with content type `application/json`
- create `profile/actor` on your Pod ([template](./actor-solid.json)) with content type `application/activity+json`
- try to resolve it on mastodon via the handle

## What doesn't work

- storing the actor as `text/turtle` or `application/ld+json` doesn't work. Mastodon seems to request (`Accept`) or expect (`Content-Type`) `application/activity+json`, and CSS responds with error.
- for this and other compatibility reasons, the actor can not be in the same resource as webId profile document.

## What works

- `PUT` the actor with content-type `application/activity+json`. This will be then served with the same `content-type`.

## To test

- Can actor contain hash, or does it need to be a root of the document?
- How does NSS work?
