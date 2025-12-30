# Publish a post or reply

Start by POSTing an OIDC-authenticated activity into agent outbox. Agent processes the activity, signs it, and forwards it to the recipient's inbox.

The private key is obtained from the storage at `keys/private.pem`

Notes are stored in the storage at `things/${noteId}` where `noteId` is `Date.now() + '__' + randomUUID()` and made available on the agent at `users/${actor.id}/things/${noteId}`
