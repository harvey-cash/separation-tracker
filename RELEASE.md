# Release notes

## Public web release output

The main public web release still stages two hosted surfaces:

1. the Brave Paws landing page from `apps/brave-paws-landing/dist`
2. the Brave Paws app from `apps/brave-paws-app/dist`

Brave Paws Streamer is retired and no longer packaged.

## Tailnet-first v0.2 deployment

For Harvey's real v0.2 usage, the important deployment target is the local QUANTUM server described in [docs/quantum-local-tailnet.md](docs/quantum-local-tailnet.md).

That local deployment serves:

- `/separation/`
- `/separation/app/`
- `/separation/api/`
- `/separation/camera/`

## Manual release workflow

The manual GitHub release workflow still packages the landing page and app for `main`-based public releases.

## Main-only CD

Automated CD remains `main`-only.
Feature branches get CI validation without triggering deployment.
