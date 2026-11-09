import { createHash } from "node:crypto";
import { getValidAccessToken } from "./tokenRefresh.server.js";

export const OFFER_QUERY = `#graphql
  query StudyPerksConfirmedOffer($id: ID!) {
    shop { name currencyCode }
    codeDiscountNode(id: $id) {
      id
      codeDiscount {
        __typename
        ... on DiscountCodeBasic {
          title status startsAt endsAt updatedAt
          context { __typename }
          minimumRequirement {
            __typename
            ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount currencyCode } }
            ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
          }
          customerGets {
            value {
              __typename
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
            }
            items {
              __typename
              ... on AllDiscountItems { allItems }
              ... on DiscountCollections {
                collections(first: 100) { nodes { id } pageInfo { hasNextPage } }
              }
              ... on DiscountProducts {
                products(first: 100) { nodes { id } pageInfo { hasNextPage } }
                productVariants(first: 100) { nodes { id } pageInfo { hasNextPage } }
              }
            }
          }
        }
      }
    }
  }`;

export function offerFingerprint(offer) {
  const { updatedAt, ...content } = offer;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function normalizeOffer(config, data) {
  if (!data?.shop?.name || !data.shop.currencyCode) throw new Error("Missing Shopify shop details");
  const discount = data.codeDiscountNode?.codeDiscount;
  const base = {
    shop: config.shop,
    displayName: data.shop.name,
    discountId: config.discountId,
    shopifyDiscountId: config.discountId,
    discountName: config.discountName,
    discountType: config.discountType,
    discountValue: config.discountValue,
    currencyCode: data.shop.currencyCode,
    appliesTo: config.discountCollections.length ? "collections" : "all",
    collectionIds: [...config.discountCollections].sort(),
    active: false,
    updatedAt: new Date().toISOString(),
  };
  if (!data.codeDiscountNode) return { ...base, status: "DELETED" };
  if (discount?.__typename !== "DiscountCodeBasic") {
    return { ...base, status: "UNSUPPORTED", restrictions: { unsupportedType: true } };
  }
  const value = discount.customerGets.value;
  const items = discount.customerGets.items;
  const percentage = value.__typename === "DiscountPercentage";
  const amount = value.__typename === "DiscountAmount";
  if (!percentage && !amount) throw new Error("Unsupported Shopify discount value");
  const collections = items.collections?.nodes?.map(({ id }) => id).sort() || [];
  const products = items.products?.nodes?.map(({ id }) => id).sort() || [];
  const variants = items.productVariants?.nodes?.map(({ id }) => id).sort() || [];
  const all = items.__typename === "AllDiscountItems" && items.allItems;
  const collectionScope = items.__typename === "DiscountCollections";
  const truncated = Boolean(items.collections?.pageInfo?.hasNextPage
    || items.products?.pageInfo?.hasNextPage || items.productVariants?.pageInfo?.hasNextPage);
  // The existing receiver cannot display product, minimum-spend or customer
  // restrictions yet. Send details but do not advertise these as unrestricted.
  const supported = (all || (collectionScope && collections.length > 0))
    && !truncated && !discount.minimumRequirement
    && discount.context?.__typename === "DiscountBuyerSelectionAll"
    && !(amount && value.appliesOnEachItem);
  const discountValue = percentage ? Math.round(value.percentage * 100 * 1e8) / 1e8 : Number(value.amount.amount);
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (percentage && discountValue > 100)) {
    throw new Error("Invalid confirmed Shopify discount value");
  }
  return {
    ...base,
    discountName: discount.title,
    discountType: percentage ? "percentage" : "fixed",
    discountValue,
    appliesTo: collectionScope ? "collections" : "all",
    collectionIds: collections,
    active: discount.status === "ACTIVE" && supported,
    status: discount.status,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    restrictions: {
      itemType: items.__typename,
      productIds: products,
      variantIds: variants,
      minimumRequirement: discount.minimumRequirement,
      customerSelection: discount.context.__typename,
      appliesOnEachItem: amount ? value.appliesOnEachItem : false,
      truncated,
      catalogueSupported: supported,
    },
  };
}

export async function fetchConfirmedOffer(config) {
  const token = await getValidAccessToken(config.shop);
  if (!token) throw new Error("No installed Shopify session");
  const response = await fetch(`https://${config.shop}/admin/api/2026-01/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: OFFER_QUERY, variables: { id: config.discountId } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Shopify offer query HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error("Shopify offer query failed");
  return normalizeOffer(config, result.data);
}
