import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  // StudyPerks does not store any personal customer data.
  // The only data stored is anonymous order IDs and totals for commission tracking.
  console.log(`customers/data_request received for ${shop} — no personal data stored`);

  return new Response();
};
