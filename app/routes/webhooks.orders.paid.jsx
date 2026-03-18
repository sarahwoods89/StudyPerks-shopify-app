import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const discountCodes = payload?.discount_codes ?? [];
  const hasStudyPerks = discountCodes.some(
    (d) => d.code?.toUpperCase() === "STUDYPERKS"
  );

  if (hasStudyPerks) {
    const orderId = String(payload.id);
    const orderTotal = parseFloat(payload.total_price ?? "0");

    await db.affiliateTransaction.upsert({
      where: { shop_orderId: { shop, orderId } },
      update: {},
      create: {
        shop,
        orderId,
        orderTotal,
        discountCode: "STUDYPERKS",
      },
    });

    console.log(`Logged StudyPerks order ${orderId} for ${shop} — £${orderTotal}`);
  }

  return new Response();
};
