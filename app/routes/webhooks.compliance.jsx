import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      console.log(`customers/data_request for ${shop} — no personal data stored`);
      break;
    case "CUSTOMERS_REDACT":
      console.log(`customers/redact for ${shop} — no personal data to redact`);
      break;
    case "SHOP_REDACT":
      await Promise.all([
        db.affiliateTransaction.deleteMany({ where: { shop } }),
        db.discountConfig.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      console.log(`shop/redact — deleted all data for ${shop}`);
      break;
  }

  return new Response(null, { status: 200 });
};
