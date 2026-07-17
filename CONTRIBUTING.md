# Contributing

Thanks for your interest in contributing to Ifric Registry Service.

## Getting set up

1. `cd backend && npm install`
2. Copy `backend/.env.example` to `backend/.env` and fill in the required values (see `README.md` for what each one does).
3. Start MongoDB locally, or run `docker compose up mongo` from the repo root.
4. `npm run start:dev`

The service needs a running [ICID](README.md#icid)-compatible instance reachable at `ICID_SERVICE_BACKEND_URL` for company creation and certificate endpoints to work end to end; everything else runs against MongoDB alone.

## Before opening a PR

- `npm run lint`
- `npm run build`
- `npm run test`
- Add or update unit tests for any behavior you change.
- Keep public classes and methods documented — see `CODE_STYLE` notes in `README.md` for the expected comment density.

## Reporting issues

Open a GitHub issue with steps to reproduce, expected vs. actual behavior, and relevant logs. For security issues, please do not open a public issue — see `SECURITY.md` if present, or contact the maintainers directly.

## Pull requests

- Keep PRs focused on one change.
- Describe *why* the change is needed, not just what it does.
- Link any related issue.
