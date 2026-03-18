import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  // StudyPerks does not store any personal customer data.
  // No redaction needed — we only store anonymous order IDs and totals.
  console.log(`customers/redact received for ${shop} — no personal data to redact`);

  return new Response();
};
