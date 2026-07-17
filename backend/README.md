# Ifric Registry Service — backend

NestJS + MongoDB backend. See the [root README](../README.md) for what this
service is, architecture notes, and how the Auth/Company/Product/Certificate
controllers and the ICID integration fit together.

## Quick start

```bash
cp .env.example .env   # fill in the required values — see comments in the file
npm install
npm run start:dev
```

## Scripts

```bash
npm run start:dev   # watch mode
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
npm run lint
npm test              # unit tests
npm run test:e2e      # e2e tests
```

## API docs

Once running: `http://localhost:4007/api-docs` (Swagger UI). Static specs:
`openapi.yaml`, `openapi.company.yaml` — regenerate with
`npm run generate:openapi` (app must be running). See the root README for
what each spec covers.
