# Follow and get followed

## Get followed

In order to be followed, we need to be able to receive a Follow activity into the inbox, verify it, and add the actor into the followers.

This doesn't seem to be possible with the Pod as-is. We therefore start developing the agent.
The agent provides inbox and other necessary endpoints, and persists data into the Solid pod.

## Follow

In order to folow, we need to send Follow activity into the inbox of the followed person.
