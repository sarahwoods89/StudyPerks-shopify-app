import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueueOfferSync } from "../lib/offerQueue.server";

export async function action({ request }) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  if (!["DISCOUNTS_CREATE", "DISCOUNTS_UPDATE", "DISCOUNTS_DELETE"].includes(topic)) return new Response();
  const config = await db.discountConfig.findUnique({ where: { shop } });
  // Never infer ownership from a title or SP- prefix. Only the exact parent
  // discount saved for this merchant is relevant; redemption-code topics
  // and unrelated merchant discounts cannot trigger catalogue updates.
  if (!config?.discountId || payload.admin_graphql_api_id !== config.discountId) return new Response();
  await enqueueOfferSync(shop);
  return new Response();
}
