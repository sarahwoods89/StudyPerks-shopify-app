# Shopify App Pricing setup

The app checks Shopify App Pricing from the authenticated embedded-app loader. Global enforcement is disabled unless `SHOPIFY_APP_PRICING_ENFORCED=true`. During rollout, `SHOPIFY_APP_PRICING_TEST_SHOPS` can contain a comma-separated list of shop domains to enforce only for those shops while the global switch stays off.

When enabled, the app queries the Partner API `activeSubscription` field. Any active StudyPerks plan grants access; a shop without an active plan is sent to that shop's Shopify-hosted plan selection page. Partner API failures return a retryable error and are not treated as an unpaid subscription.

## Production environment variables

Set these in the app host's secret/environment settings. Do not commit or paste the access token into source control.

- `SHOPIFY_PARTNER_ORG_ID`: numeric organization ID from the Partner Dashboard URL.
- `SHOPIFY_PARTNER_API_ACCESS_TOKEN`: access token for a Partner API client with **Manage apps** permission.
- `SHOPIFY_APP_GID`: app GID in the form `gid://shopify/App/123456` from the Partner Dashboard.
- `SHOPIFY_APP_HANDLE`: app handle used in Shopify's plan-selection URL.
- `SHOPIFY_PARTNER_API_VERSION`: optional; defaults to `2026-07`.
- `SHOPIFY_APP_PRICING_ENFORCED`: leave unset or `false` until every founding store is authorized for the private plan and the flow has been verified. Set to `true` only for the billing rollout.
- `SHOPIFY_APP_PRICING_TEST_SHOPS`: optional comma-separated `*.myshopify.com` domains to stage enforcement for selected test shops only.

The plan selection redirect uses the app root (`/`), which redirects to `/app` while preserving Shopify's query parameters.

Before enabling enforcement, confirm that every existing founding merchant has access to the private Founding Partner plan and has selected it. Merchants with no active subscription will otherwise be redirected to Shopify's plan-selection page.
