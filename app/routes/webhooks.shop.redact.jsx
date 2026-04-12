import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  // Delete all data associated with this shop
  await Promise.all([
    db.affiliateTransaction.deleteMany({ where: { shop } }),
    db.discountConfig.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  console.log(`shop/redact received — deleted all data for ${shop}`);

  return new Response();
};
