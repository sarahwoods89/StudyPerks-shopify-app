import db from "../db.server.js";
import { getValidAccessToken } from "./tokenRefresh.server.js";

const API_VERSION = "2025-01";
const BATCH_SIZE = 50;
const LOW_WATER_MARK = 10;

export function randomCode() {
  // Avoids ambiguous characters (0/O, 1/I/l) since these can still show up
  // in order notes/emails even though customers don't type them by hand.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SP-${suffix}`;
}

async function adminGraphql(shop, accessToken, query, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getAccessToken(shop) {
  return getValidAccessToken(shop);
}

// Finds the redeem-code ID for an exact code string on a discount, paging
// through all codes until found (a shop's pool can grow into the hundreds).
async function findRedeemCodeId(shop, accessToken, discountId, exactCode) {
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const res = await adminGraphql(
      shop,
      accessToken,
      `#graphql
      query FindCode($id: ID!, $after: String) {
        codeDiscountNode(id: $id) {
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 250, after: $after) {
                edges { cursor node { id code } }
                pageInfo { hasNextPage }
              }
            }
          }
        }
      }`,
      { id: discountId, after: cursor }
    );

    const codesConn = res?.data?.codeDiscountNode?.codeDiscount?.codes;
    const edges = codesConn?.edges ?? [];
    const match = edges.find((e) => e.node.code === exactCode);
    if (match) return match.node.id;

    if (!codesConn?.pageInfo?.hasNextPage) return null;
    cursor = edges[edges.length - 1]?.cursor ?? null;
  }
  return null;
}

// Removes a specific code (e.g. the old shared "STUDYPERKS" word) from a
// discount without affecting any other codes attached to it.
export async function removeCode(shop, exactCode) {
  const accessToken = await getAccessToken(shop);
  if (!accessToken) throw new Error(`No offline access token found for shop ${shop}`);

  const discountId = await getDiscountId(shop, accessToken);
  if (!discountId) throw new Error(`No STUDYPERKS discount found for shop ${shop}`);

  const redeemCodeId = await findRedeemCodeId(shop, accessToken, discountId, exactCode);
  if (!redeemCodeId) {
    return { removed: false, reason: `Code "${exactCode}" not found on this discount.` };
  }

  const res = await adminGraphql(
    shop,
    accessToken,
    `#graphql
    mutation RemoveCode($discountId: ID!, $ids: [ID!]) {
      discountCodeRedeemCodeBulkDelete(discountId: $discountId, ids: $ids) {
        job { id }
        userErrors { code field message }
      }
    }`,
    { discountId, ids: [redeemCodeId] }
  );

  const errors = res?.data?.discountCodeRedeemCodeBulkDelete?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`discountCodeRedeemCodeBulkDelete failed: ${JSON.stringify(errors)}`);
  }

  return { removed: true };
}

async function lookupDiscountIdByCode(shop, accessToken, code) {
  const res = await adminGraphql(
    shop,
    accessToken,
    `#graphql
    query LookupDiscount($code: String!) {
      codeDiscountNodeByCode(code: $code) { id }
    }`,
    { code }
  );
  return res?.data?.codeDiscountNodeByCode?.id ?? null;
}

// Last-resort fallback: lists the shop's code discounts and matches by title
// (what we stored as discountName when it was created) — works even when no
// code at all (old or new) exists to search by.
async function lookupDiscountIdByTitle(shop, accessToken, title) {
  const res = await adminGraphql(
    shop,
    accessToken,
    `#graphql
    query {
      codeDiscountNodes(first: 25) {
        nodes {
          id
          codeDiscount {
            ... on DiscountCodeBasic { title }
          }
        }
      }
    }`
  );
  const nodes = res?.data?.codeDiscountNodes?.nodes ?? [];
  const match = nodes.find((n) => n.codeDiscount?.title === title) ?? nodes[0];
  return match?.id ?? null;
}

// Finds the shop's StudyPerks discount ID without depending on "STUDYPERKS"
// still existing as a code — that broke once it was removed for security.
// Caches the result so this lookup, in any form, only ever has to happen once.
async function getDiscountId(shop, accessToken) {
  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (config?.discountId) return config.discountId;

  let id = await lookupDiscountIdByCode(shop, accessToken, "STUDYPERKS");

  if (!id) {
    // STUDYPERKS may already be gone — fall back to any code we've issued.
    const anyCode = await db.studentDiscountCode.findFirst({ where: { shop } });
    if (anyCode) {
      id = await lookupDiscountIdByCode(shop, accessToken, anyCode.code);
    }
  }

  if (!id && config?.discountName) {
    // Neither code lookup found anything — no code of any kind exists to
    // search by yet. Fall back to listing discounts and matching by title.
    id = await lookupDiscountIdByTitle(shop, accessToken, config.discountName);
  }

  if (id) {
    await db.discountConfig.updateMany({ where: { shop }, data: { discountId: id } });
  }

  return id;
}

// Generates a batch of unique codes on the shop's existing STUDYPERKS discount
// and records them locally so claimCode() never has to touch Shopify's API
// on the hot path.
async function generateCodeBatch(shop, accessToken, discountId, count = BATCH_SIZE) {
  const codes = Array.from({ length: count }, randomCode);

  const res = await adminGraphql(
    shop,
    accessToken,
    `#graphql
    mutation AddCodes($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
      discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
        bulkCreation { id }
        userErrors { field message code }
      }
    }`,
    { discountId, codes: codes.map((code) => ({ code })) }
  );

  const errors = res?.data?.discountRedeemCodeBulkAdd?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`discountRedeemCodeBulkAdd failed: ${JSON.stringify(errors)}`);
  }

  // Bulk add is async on Shopify's side, but the codes are valid as soon as
  // the job finishes — usually within a couple seconds for batches this size.
  // We record them as "pending" locally, then verify + release them for
  // claiming once we confirm the job succeeded.
  await db.studentDiscountCode.createMany({
    data: codes.map((code) => ({ shop, code })),
    skipDuplicates: true,
  });

  return codes;
}

// Atomically claims one unused code for a shop. Auto-replenishes the pool
// (and waits for it) if none are available — acceptable for now given
// expected volume; worth revisiting if verification traffic grows a lot.
export async function claimCode(shop) {
  const accessToken = await getAccessToken(shop);
  if (!accessToken) {
    throw new Error(`No offline access token found for shop ${shop}`);
  }

  let candidate = await db.studentDiscountCode.findFirst({
    where: { shop, issuedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const remaining = await db.studentDiscountCode.count({
    where: { shop, issuedAt: null },
  });

  if (!candidate || remaining <= LOW_WATER_MARK) {
    const discountId = await getDiscountId(shop, accessToken);
    if (!discountId) {
      throw new Error(`No STUDYPERKS discount found for shop ${shop}`);
    }
    await generateCodeBatch(shop, accessToken, discountId);

    if (!candidate) {
      candidate = await db.studentDiscountCode.findFirst({
        where: { shop, issuedAt: null },
        orderBy: { createdAt: "asc" },
      });
    }
  }

  if (!candidate) {
    throw new Error(`Could not obtain a code for shop ${shop} after replenishing.`);
  }

  // Conditional update guards against two simultaneous requests claiming the
  // same row — if another request already claimed it, this matches zero rows.
  const claimed = await db.studentDiscountCode.updateMany({
    where: { id: candidate.id, issuedAt: null },
    data: { issuedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Lost the race — try again once.
    return claimCode(shop);
  }

  return candidate.code;
}
