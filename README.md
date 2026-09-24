# Ecom API Documentation _(ecom-api-docs)_

[![OpenAPI](https://img.shields.io/badge/Spec-OpenAPI%203.0.3-6BA539?style=flat-square&logo=openapiinitiative)](https://swagger.io/specification/)
[![Swagger UI](https://img.shields.io/badge/UI-Swagger%20UI%205-85EA2D?style=flat-square&logo=swagger&logoColor=black)](https://github.com/swagger-api/swagger-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

OpenAPI/Swagger docs for the Ecom web app and FileManager microservice.

Supplementary API reference for [Ecom](https://github.com/thaihadefi/Ecom), covering the `Web` app and the `FileManager` microservice in a single OpenAPI 3.0 specification rendered with Swagger UI. Server-rendered pages are out of scope, except for a few read-only ones that the spec documents directly.

- **Live docs:** https://ecom-api-docs.vercel.app/
- **Spec:** [openapi.yaml](openapi.yaml) (source of truth) / [openapi.json](openapi.json) (generated)
- **Source:** [thaihadefi/Ecom](https://github.com/thaihadefi/Ecom)

The spec's own tag list (storefront, admin, payments, FileManager, site) defines what is covered. Browse it in Swagger UI rather than here.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Repository layout](#repository-layout)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Background

The spec states these decisions explicitly so readers don't have to infer them from the source:

- **REST Level 2.** JSON endpoints are plural resources under `/api` (storefront) and `/admin/api` (admin), and the HTTP method states the action: `POST` creates, `PUT`/`PATCH` change, `DELETE` removes, and `GET` never writes. Payment and OAuth callbacks keep the URLs their providers call.
- **Response convention.** Success is HTTP 200 with `{ "code": "success", ... }`. Errors use the matching status (400/401/403/404/409/429/500/502/503) with `{ "code": "error", "message": "..." }`. JSON endpoints never redirect: an unauthenticated or unauthorized request gets 401/403 whatever the method, and only server-rendered pages redirect to login.
- **Auth.** Browsers use the `tokenUser`/`tokenAdmin` HTTP-only cookies. API clients use `Authorization: Bearer <accessToken>`, which the login endpoints return. A request carrying that header is authenticated by the header alone. FileManager's `/files` and `/folders` use `Authorization: Bearer <FILE_MANAGER_SECRET>`.
- **Try it out.** The `servers` entry is `http://localhost:3000` because neither service is deployed publicly yet, so "Try it out" only reaches a copy of Ecom you have running. The Web app sends CORS headers on non-admin routes, so the Vercel copy can reach a local storefront with a Bearer token: log in, then paste the returned `accessToken` under "Authorize". Admin endpoints skip CORS on purpose, so try those from the same-origin copy at `/api-docs/`, where the browser sends the login cookie automatically.
- **Verified, not just written.** `yarn verify` diffs the spec against the Ecom source: routes, required auth, Joi constraints, upload limits, permissions, rate limits, and the error statuses each operation can return. `yarn contract:status` boots both apps on a throwaway database and checks the real HTTP status of requests that should fail.
- **Real-time chat.** Socket.IO isn't a REST operation, so it has no tag to browse. The event names and connection details are in the spec's top-level description instead.

## Install

```bash
yarn install
```

### Dependencies

- Node.js 18+ and Yarn for building and previewing the docs.
- For `yarn verify` and the contract tests you also need:
  - Node.js 22.12+, because these commands load the Ecom source and its dependencies (`sanitize-html` requires it);
  - a checkout of [Ecom](https://github.com/thaihadefi/Ecom) next to this repository, or at the path in `ECOM_DIR`, with `yarn install` run in `Web` and `FileManager`;
  - Python 3.9+ for the Schemathesis pass.

## Usage

All commands are defined in [package.json](package.json).

### After editing `openapi.yaml`

```bash
yarn build         # validate, regenerate openapi.json / index.html / vendor/swagger-ui
yarn validate      # validation only
yarn start         # serve locally on http://localhost:8080
yarn sync-web      # build, then copy the site into ../Ecom/Web/public/api-docs
```

### After a change in Ecom

Update `openapi.yaml` whenever a route, method or payload changes in Ecom, then check it:

```bash
yarn verify           # compare the spec against the Ecom source; fails on any difference
yarn sync-statuses    # add error statuses the source can return but an operation doesn't list yet
yarn contract:setup   # once: install the contract-test dependencies and Schemathesis
yarn contract:status  # real HTTP statuses, against a throwaway database
yarn contract         # Schemathesis: generated requests for every operation (slow)
```

## Repository layout

- `openapi.yaml` is the spec and the only file to edit by hand. `openapi.json` and the copy embedded in `index.html` are generated.
- `scripts/build.js` validates the spec, regenerates `openapi.json` and `index.html`, and copies Swagger UI into `vendor/`.
- `audit/` implements `yarn verify`. Each check is one file under `audit/checks/`, and `audit/run.js` runs them.
- `contract/` runs the Ecom apps against a throwaway MongoDB and checks them against the spec. `status-codes.js` holds requests that must fail with a given status, and `run.js` runs a Schemathesis pass.
- `index.html`, `css/`, `js/` and `vendor/swagger-ui/` are the Swagger UI page and its assets. They are served from the same origin, with no third-party CDN.

## Deployment

- **Vercel** serves the repository root at https://ecom-api-docs.vercel.app/. Push the regenerated `index.html`, `openapi.yaml`, `openapi.json`, `vendor/`, `css/` and `js/` together.
- **Same-origin copy:** `yarn sync-web` copies the same files into `Web/public/api-docs` in the Ecom repository, which serves them at `/api-docs/`. This copy is what lets "Try it out" send the HTTP-only cookies for admin endpoints. Redeploy Ecom after every spec change so the two copies stay identical.
- The generated files (`openapi.json`, the spec embedded in `index.html`, and `vendor/swagger-ui/`) come from `yarn build`. Never edit them by hand.
- **Swagger UI version:** bump it in `package.json` with `yarn add --dev --exact swagger-ui-dist@<version>`, then run `yarn build`.

## Contributing

Ask questions and report spec mistakes in [GitHub issues](https://github.com/thaihadefi/ecom-api-docs/issues). If you open a pull request, edit only `openapi.yaml` by hand and run `yarn build` and `yarn verify` before submitting.

## License

[MIT](LICENSE) © 2026 Ecom Team
