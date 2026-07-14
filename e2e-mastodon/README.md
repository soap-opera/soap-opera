# Mastodon Interoperability Tests

In order to run e2e interoperability tests for Mastodon, you have to set up and run a Mastodon instance on localhost:3000.
You also have to set up reverse proxy with https for localhost services:

- for Community Solid Server on localhost:33000 - `solid.test`, `*.solid.test`
- for Soap Opera service on localhost:55000 - `soap.test`

I use mkcert to manage local TLS certificates, Caddy as a reverse proxy [configured](./caddy-soap-opera.conf) for CSS and Soap Opera, and modified [Docker configuration](./mastodon-dev-compose.yaml) for Mastodon.

See [github workflow](../.github/workflows/e2e-mastodon.yml) with specific setup steps on Ubuntu. You can modify the setup for other systems.
