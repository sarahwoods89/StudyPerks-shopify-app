import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

async function getStudyPerksDiscount(admin) {
  const response = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "studyperks", key: "discount") {
          value
        }
      }
    }
  `);
  const data = await response.json();
  const raw = data?.data?.shop?.metafield?.value;
  return raw ? JSON.parse(raw) : null;
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const discount = await getStudyPerksDiscount(admin);

  if (!discount) {
    return json(
      { error: "No StudyPerks discount configured. Please set it in Settings first." },
      { status: 400 }
    );
  }

  const customerGetsValue =
    discount.type === "percentage"
      ? `{ percentage: ${discount.value / 100} }`
      : `{ discountAmount: { amount: "${discount.value}", appliesOnEachItem: false } }`;

  const response = await admin.graphql(`
    mutation {
      discountCodeBasicCreate(basicCodeDiscount: {
        title: "StudyPerks Student Discount",
        code: "STUDYPERKS",
        startsAt: "${new Date().toISOString()}",
        customerSelection: { all: true },
        customerGets: {
          value: ${customerGetsValue},
          items: { all: true }
        }
      }) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }
  `);

  const result = await response.json();
  const errors = result?.data?.discountCodeBasicCreate?.userErrors ?? [];
  const realErrors = errors.filter((e) => !e.message.toLowerCase().includes("already been used"));

  if (realErrors.length > 0) {
    return json({ error: realErrors[0].message }, { status: 400 });
  }

  return json({ code: "STUDYPERKS", success: true });
}
