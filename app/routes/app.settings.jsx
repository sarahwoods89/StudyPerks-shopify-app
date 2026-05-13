import { useState } from "react";
import {
  Page,
  Card,
  Select,
  TextField,
  BlockStack,
  Text,
  Banner,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Form, useLoaderData, useNavigation, useActionData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const config = await db.discountConfig.findUnique({ where: { shop } });
  return json({ config });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.formData();
  const name = body.get("name");
  const type = body.get("type");
  const value = body.get("value");

  await db.discountConfig.upsert({
    where: { shop },
    update: { discountName: name, discountType: type, discountValue: Number(value) },
    create: { shop, discountName: name, discountType: type, discountValue: Number(value) },
  });

  const discountInput = {
    title: name,
    code: "STUDYPERKS",
    startsAt: new Date().toISOString(),
    customerSelection: { all: true },
    customerGets: {
      value:
        type === "percentage"
          ? { percentage: Number(value) / 100 }
          : { discountAmount: { amount: String(value), appliesOnEachItem: false } },
      items: { all: true },
    },
  };

  try {
    const discountRes = await admin.graphql(
      `#graphql
      mutation CreateStudyPerksDiscount($discount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $discount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      { variables: { discount: discountInput } }
    );

    const discountData = await discountRes.json();
    console.log("discountCodeBasicCreate response:", JSON.stringify(discountData));

    const errors = discountData?.data?.discountCodeBasicCreate?.userErrors ?? [];
    const isAlreadyExists = errors.some(
      (e) =>
        e.message.toLowerCase().includes("must be unique") ||
        e.message.toLowerCase().includes("already been taken") ||
        e.message.toLowerCase().includes("already exists")
    );

    if (isAlreadyExists) {
      const lookupRes = await admin.graphql(
        `#graphql
        query GetStudyPerksDiscount {
          codeDiscountNodeByCode(code: "STUDYPERKS") { id }
        }`
      );
      const lookupData = await lookupRes.json();
      console.log("codeDiscountNodeByCode lookup:", JSON.stringify(lookupData));
      const existingId = lookupData?.data?.codeDiscountNodeByCode?.id;

      if (existingId) {
        const updateRes = await admin.graphql(
          `#graphql
          mutation UpdateStudyPerksDiscount($id: ID!, $discount: DiscountCodeBasicInput!) {
            discountCodeBasicUpdate(id: $id, basicCodeDiscount: $discount) {
              codeDiscountNode { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: existingId,
              discount: {
                title: name,
                customerGets: discountInput.customerGets,
              },
            },
          }
        );
        const updateData = await updateRes.json();
        console.log("discountCodeBasicUpdate response:", JSON.stringify(updateData));
        const updateErrors = updateData?.data?.discountCodeBasicUpdate?.userErrors ?? [];
        if (updateErrors.length > 0) {
          return json({ error: `Could not update discount: ${updateErrors[0].message}` }, { status: 400 });
        }
      } else {
        return json({ error: "Discount code already exists but could not be found to update." }, { status: 400 });
      }
    } else if (errors.length > 0) {
      console.error("discountCodeBasicCreate userErrors:", JSON.stringify(errors));
      return json({ error: `Could not create discount: ${errors[0].message}` }, { status: 400 });
    }
  } catch (err) {
    console.error("Shopify discount sync error:", err);
    const status = err instanceof Response ? err.status : null;
    if (status === 403) {
      return json({ error: "Permission denied (403). The app needs to be reinstalled on this store to grant discount permissions. Please uninstall and reinstall StudyPerks from the Shopify App Store." }, { status: 400 });
    }
    return json({ error: `Unexpected error: ${err?.message || String(err)}` }, { status: 500 });
  }

  return json({ success: true });
};

export default function Settings() {
  const { config } = useLoaderData();
  const navigation = useNavigation();
  const actionData = useActionData();

  const [name, setName] = useState(config?.discountName ?? "Student Discount");
  const [type, setType] = useState(config?.discountType ?? "percentage");
  const [value, setValue] = useState(String(config?.discountValue ?? "10"));
  const [scope, setScope] = useState("all");

  const isSaving = navigation.state !== "idle";

  return (
    <Page>
      <TitleBar title="Settings" />
      <BlockStack gap="500">

        {actionData?.success && (
          <Banner tone="success" title="Discount saved and activated">
            Verified students will now receive this discount automatically at checkout.
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical" title="Could not save discount">
            {actionData.error}
          </Banner>
        )}

        <Card>
          <Form method="post">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Student Discount</Text>
              <Text as="p" variant="bodyMd">
                This discount is applied automatically when a verified student connects their StudyPerks account on your storefront.
              </Text>

              <TextField
                label="Discount name"
                helpText="Shown in your Shopify Discounts list"
                name="name"
                value={name}
                onChange={setName}
                placeholder="e.g. Student Discount"
                autoComplete="off"
              />

              <Select
                label="Discount type"
                name="type"
                options={[
                  { label: "Percentage off", value: "percentage" },
                  { label: "Fixed amount off", value: "fixed" },
                ]}
                value={type}
                onChange={setType}
              />

              <TextField
                label={type === "percentage" ? "Percentage (e.g. 10 = 10% off)" : "Amount off (e.g. 5 = £5 off)"}
                type="number"
                name="value"
                value={value}
                onChange={setValue}
                autoComplete="off"
              />

              <Select
                label="Applies to"
                name="scope"
                options={[
                  { label: "All products", value: "all" },
                ]}
                value={scope}
                onChange={setScope}
                helpText="Discount applies to all products in your store."
              />

              <input type="hidden" name="scope" value={scope} />

              <InlineStack>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    background: isSaving ? "#9CA3AF" : "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
                    color: "#000",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "14px",
                  }}
                >
                  {isSaving ? "Saving..." : "Save & Activate Discount"}
                </button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Card>

      </BlockStack>
    </Page>
  );
}
