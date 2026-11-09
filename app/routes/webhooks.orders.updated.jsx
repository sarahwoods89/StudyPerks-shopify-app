import { authenticate } from "../shopify.server";
import { recordAffiliateOrder } from "../lib/affiliateOrder.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);
  await recordAffiliateOrder(shop, payload);
  return new Response();
};
