import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  // Delete all affiliate transaction records for this shop
  await db.affiliateTransaction.deleteMany({ where: { shop } });

  console.log(`shop/redact received — deleted all transaction records for ${shop}`);

  return new Response();
};
