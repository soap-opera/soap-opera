# Follow and get followed

## Get followed

In order to be followed, we need to be able to receive a Follow activity into the inbox, verify it, and add the actor into the followers.

The agent provides inbox and other necessary endpoints, executes side effects, and persists data into the Solid pod.

Follows are stored in the storage in `followers` with triples of the form `actorId schema:follows objectId`

## Follow

In order to follow, we need to send Follow activity into the inbox of the followed person.

Start by POSTing an OIDC-authenticated activity into agent outbox.
Agent processes the activity, signs it, and forwards it to the recipient's inbox.

[See also this issue](https://github.com/solid/activitypub-interop/issues/7)

The follow activity is saved in the storage at `activities/${randomUUID()}`.

The private key is obtained from the storage at `keys/private.pem`

On receipt of an `Accept`, actors we are following are stored in the storage in `following` with triples of the form `actorId schema:follows objectId`

Following and followers collections are served by the agent with pagination based on the data stored in the storage.
