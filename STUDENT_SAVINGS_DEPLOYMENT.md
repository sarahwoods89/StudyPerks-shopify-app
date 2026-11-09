# Student savings tracking

Implemented in the Shopify app.

## Endpoint

`POST https://app.studyperks.me/api/internal/student-savings`

Request JSON:

```json
{"identityHash":"64-lowercase-hex-character-sha256"}
```

Headers:

- `X-StudyPerks-Timestamp`: Unix timestamp in seconds.
- `X-StudyPerks-Signature`: lowercase HMAC-SHA256 hex digest of the exact string
  `${timestamp}.${JSON.stringify(body)}`.

The shared secret is `STUDYPERKS_SAVINGS_API_SECRET`, at least 32 random
characters. This must also be configured in the StudyPerks backend caller under
the same name. The endpoint rejects stale timestamps older than five minutes,
invalid signatures and malformed identity hashes, and returns `Cache-Control:
no-store`.

Response:

```json
{"currencies":[{"currencyCode":"EUR","totalSaved":42.6,"totalSpent":284,"orderCount":6}]}
```

Currencies are never combined. The endpoint does not return order IDs, shops,
discount codes, products, dates, wallet addresses or email addresses.

## Tracking behavior

`orders/paid` and `orders/updated` are authenticated by Shopify. A unique `SP-`
code is attributed only when both the issued-code row and its hashed student
claim exist. `STUDYPERKS` remains aggregate-only. Repeated deliveries upsert by
shop/order ID, and the code redemption is updated atomically. Updates preserve
the last confirmed StudyPerks-specific discount amount when Shopify omits it;
the code never substitutes the whole order discount when multiple promotions
exist.

The new fields are nullable for historical compatibility:

- `AffiliateTransaction.identityHash`
- `AffiliateTransaction.discountAmount`
- `AffiliateTransaction.currencyCode`

Migration: `20260927000000_student_savings_tracking`.

## Required caller change

The StudyPerks verification response used when issuing a discount code must
include the same 64-character `identityHash` that is stored in
`StudentDiscountClaim`. The Shopify route validates the hash before creating a
claim. The StudyPerks server should derive it from its authenticated wallet
session, call this endpoint server-to-server, and never let a browser submit an
arbitrary identity hash.

Required StudyPerks backend variables:

- `SHOPIFY_APP_INTERNAL_URL=https://app.studyperks.me`
- `STUDYPERKS_SAVINGS_API_SECRET` — the same 32+ character secret as the
  Shopify app environment.

Historical orders that were recorded without an identity hash cannot be safely
assigned to a student after the fact and are excluded from student totals.
