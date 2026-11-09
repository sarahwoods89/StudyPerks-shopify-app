# Shopify offer sync deployment review

Prepared 11 September 2026. Target: the existing StudyPerks Shopify app and its
existing Railway production service. No new app/service or client-ID change.

## Exact files changed for this task

Modified:

- `.dockerignore` — exclude secrets and local tooling from the Docker context.
- `.eslintrc.cjs` — use Node test rules for the new tests, without requiring Jest.
- `app/lib/discountCodes.server.js` — optional non-caching, code-only discovery.
- `app/routes/app.settings.jsx` — validate input; persist and enqueue only after
  Shopify confirms success; immediately attempt signed delivery and show retry status.
- `app/shopify.server.js` — start the production retry worker.
- `env.d.ts` — document sync/reconciliation environment variable names.
- `package.json` — add `test:offers`.
- `prisma/schema.prisma` — add durable per-merchant `OfferSyncState` jobs.
- `shopify.app.studyperks-app.toml` — add the three discount webhook subscriptions.

Added:

- `railway.json` — require a passing `/health` check before replacing the deployment.

- `.railwayignore` — exclude local credentials and build artifacts from CLI uploads.
- `app/lib/offerSync.server.js` — the requested WSL HMAC sender, with redirects disabled.
- `app/lib/offerSnapshot.server.js` — fetch/normalize confirmed Shopify offers.
- `app/lib/offerQueue.server.js` — retries, per-shop leases, revisions, deduplication,
  and scheduled activation/expiry refreshes.
- `app/routes/webhooks.discounts.jsx` — authenticate and filter parent-discount events.
- `app/routes/internal.offers.reconcile.jsx` — protected bounded preview/apply endpoint.
- `app/routes/health.jsx` — application/database/queue-table health check.
- `prisma/migrations/20260911000000_offer_sync/migration.sql` — additive queue table/index.
- `scripts/offer-preflight.mjs` — live Shopify query validation without logging credentials.
- `tests/offer-sync.test.js` — mutation failure, HMAC, restrictions, event filtering,
  reconciliation authorization, duplicate delivery, retries and concurrency checks.
- `OFFER_SYNC_DEPLOYMENT.md` — this review and handoff.

The existing `.gitignore` edits and the two mobile-popup extension asset edits
were already present before this task. They have not been overwritten.

## Railway environment

New required variables:

| Name | Purpose |
| --- | --- |
| `STUDYPERKS_OFFER_SYNC_SECRET` | At least 32 random characters, exactly matching the main backend's `SHOPIFY_OFFER_SYNC_SECRET`. Configure through secrets management; never paste its value in chat. |
| `STUDYPERKS_OFFER_RECONCILE_TOKEN` | Separate random secret of at least 32 characters for controlled reconciliation. |

Optional: `STUDYPERKS_OFFER_SYNC_URL`; defaults to
`https://www.studyperks.me/internal/shopify/offers`.

Preserve the existing `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
`SHOPIFY_APP_URL` (or existing app URL configuration), `SCOPES` and other service
variables. The retry worker requires `NODE_ENV=production`, already set by the
existing Dockerfile. Do not change the Shopify client ID.

## Deployment and downtime

The live database comparison showed only one new table and one new index, with
no changes to existing merchant, session, invoice or discount data. This additive
change is compatible with the old app while it continues serving.

Use the existing `npm run setup` workflow (`prisma generate && prisma db push`)
without `--accept-data-loss` or a reset. The historical migration directory still
contains a SQLite-era migration and is not a complete PostgreSQL baseline; do
not blindly run the full `prisma migrate deploy` history against production.

Before releasing the Railway build, identify the existing project, production
environment and service; verify its source, start command, health-check and
volume settings. Configure `/health` as its health check and allow the new
deployment to become healthy before replacing the old deployment. No planned
application downtime is expected with an overlapping deployment and no attached
volume, but this cannot be confirmed until the service settings are inspected.
Railway documents a downtime window for services with attached volumes.

References:
- https://docs.railway.com/deployments/healthchecks
- https://docs.railway.com/guides/roll-back-bad-deploy

Deploy the Railway application first. Once healthy, release the updated webhook
configuration using the existing `shopify.app.studyperks-app.toml`; this does not
create a new Shopify app. Confirm both deployments independently.

## Controlled initial reconciliation

POST `/internal/offers/reconcile`, with `Authorization: Bearer <reconciliation
token>` supplied from secure environment configuration and a JSON body:

```json
{"shops":["merchant.myshopify.com"]}
```

This previews eligibility only. Maximum 10 explicit shops per request; there is
no unbounded all-shops operation. To queue the reviewed list, repeat with
`"confirm":"SYNC_CONFIRMED_OFFERS"`. The worker re-reads Shopify and signs the
result; it does not advertise stale local percentages. Missing discount IDs can
be discovered using an existing StudyPerks redemption code, never a title guess.
Records without an installed session or provable discount ownership are reported
and skipped. This endpoint never sends student emails.

## Main-backend handoff

The supplied WSL receiver verifies the expected timestamp/body HMAC. It currently
persists basic offer fields but discards `discountId` / `shopifyDiscountId`,
`restrictions`, `status`, `startsAt` and `endsAt`. Extend its validation/storage
and student-facing rendering to retain/use those fields. The Shopify sender now
includes them, but deploying this app alone cannot change backend storage.

Until that receiver supports richer restrictions, product/variant-specific,
minimum-spend/quantity, targeted-customer, per-item fixed discounts and truncated
collection lists are sent as inactive to prevent misleading catalogue offers.
Existing percentage/fixed discounts on all products or up to 100 collections are
supported. Ended/deleted/scheduled discounts are inactive; upcoming activation or
expiry is rechecked approximately every five minutes plus queue delay.

No redemption codes, student emails or Shopify access tokens are included in
offer payloads. Receiver failures remain queued, with backoff up to one hour.
Webhook refreshes deduplicate unchanged terms; explicit merchant saves and
reconciliation force a new delivery. Retried requests are freshly signed.

## Verification

- `npm run test:offers`: 12 passing tests.
- `npm run lint`: no errors; four pre-existing warnings.
- `npm run build`: production client/server build passed.
- `npm run setup`: completed against the configured Neon database; Prisma reports
  that the database is in sync. The additive queue table/index are now present.
- Live Shopify query verified against three existing merchants: confirmed 10%,
  11% and 15% offers. Two additional records lacked a usable session/discount ID.
- Production schema diff: only `OfferSyncState` and its index.
- Railway authentication is now complete. Verified existing project `shopify-app`
  (`98474b97-1ad3-476a-a32f-a3911a6b3bc2`), environment `production`, service
  `StudyPerks-shopify-app` (`9ba909d8-a83c-4e73-a094-578a5645bc66`), serving
  `app.studyperks.me`. Dockerfile builder, one replica, no attached volumes.
- The current deployment had no health check; `railway.json` now specifies
  `/health`. No planned downtime is expected with the health-gated replacement.
- The shared offer-sync secret was absent in Railway and in the main workspace's
  local `.env`. Its live-backend value/configuration must be confirmed before
  release. No Railway deployment has been performed.
