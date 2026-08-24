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
import { randomCode, getDiscountId } from "../lib/discountCodes.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const config = await db.discountConfig.findUnique({ where: { shop } });

  // Resolve saved collection IDs to titles for display — the form only
  // stores IDs, so the picker needs names to show something readable.
  let selectedCollections = [];
  if (config?.discountCollections?.length) {
    const res = await admin.graphql(
      `#graphql
      query GetCollectionTitles($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Collection { id title }
        }
      }`,
      { variables: { ids: config.discountCollections } }
    );
    const data = await res.json();
    selectedCollections = (data?.data?.nodes ?? []).filter(Boolean);
  }

  return json({ config, selectedCollections });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.formData();
  const name = body.get("name");
  const type = body.get("type");
  const value = body.get("value");
  const scope = body.get("scope") || "all";
  let collectionIds = [];
  try {
    collectionIds = JSON.parse(body.get("collectionIds") || "[]");
  } catch {
    collectionIds = [];
  }
  if (scope !== "collections") collectionIds = [];

  await db.discountConfig.upsert({
    where: { shop },
    update: { discountName: name, discountType: type, discountValue: Number(value), discountCollections: collectionIds },
    create: { shop, discountName: name, discountType: type, discountValue: Number(value), discountCollections: collectionIds },
  });

  const items =
    scope === "collections" && collectionIds.length > 0
      ? { collections: { add: collectionIds } }
      : { all: true };

  const customerGets = {
    value:
      type === "percentage"
        ? { percentage: Number(value) / 100 }
        : { discountAmount: { amount: String(value), appliesOnEachItem: false } },
    items,
  };

  try {
    // Look up this shop's discount by its cached/discoverable ID rather than
    // by a fixed code string — a merchant saving Settings twice used to
    // always attempt a fresh discountCodeBasicCreate, relying on Shopify
    // rejecting a duplicate "STUDYPERKS" code to detect "this already
    // exists, update it instead." Once the seed code became random per
    // save (see 2026-08-24 security fix), that duplicate-code error would
    // basically never fire again, so every re-save would silently create a
    // brand new, separate discount instead of updating the existing one.
    const existingId = await getDiscountId(shop, session.accessToken);

    if (existingId) {
      const updateRes = await admin.graphql(
        `#graphql
        mutation UpdateStudyPerksDiscount($id: ID!, $discount: DiscountCodeBasicInput!) {
          discountCodeBasicUpdate(id: $id, basicCodeDiscount: $discount) {
            codeDiscountNode { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: existingId, discount: { title: name, customerGets } } }
      );
      const updateData = await updateRes.json();
      console.log("discountCodeBasicUpdate response:", JSON.stringify(updateData));
      const updateErrors = updateData?.data?.discountCodeBasicUpdate?.userErrors ?? [];
      if (updateErrors.length > 0) {
        return json({ error: `Could not update discount: ${updateErrors[0].message}` }, { status: 400 });
      }
    } else {
      const discountInput = {
        title: name,
        // discountCodeBasicCreate requires a seed code, but this one is never
        // handed out to a real customer — actual redemptions use the unique
        // single-use SP-XXXXXXXXXX pool (discountCodes.server.js), issued
        // only after server-side verification. usageLimit caps how many
        // TOTAL redemptions this one seed code allows across every
        // customer combined (Shopify-wide meaning, not "per email" or
        // "per store") — set to 1 since nobody should ever redeem it at all.
        code: randomCode(),
        startsAt: new Date().toISOString(),
        customerSelection: { all: true },
        usageLimit: 1,
        customerGets,
      };

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
      if (errors.length > 0) {
        return json({ error: `Could not create discount: ${errors[0].message}` }, { status: 400 });
      }
      const newId = discountData?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
      if (newId) {
        await db.discountConfig.updateMany({ where: { shop }, data: { discountId: newId } });
      }
    }
  } catch (err) {
    if (err instanceof Response) {
      const body = await err.text().catch(() => "(unreadable)");
      console.error("Shopify discount sync error — status:", err.status, "body:", body);
      return json({ error: `Shopify error ${err.status}: ${body}` }, { status: 400 });
    }
    console.error("Shopify discount sync error:", err);
    return json({ error: `Unexpected error: ${err?.message || String(err)}` }, { status: 500 });
  }

  return json({ success: true });
};

export default function Settings() {
  const { config, selectedCollections: initialCollections } = useLoaderData();
  const navigation = useNavigation();
  const actionData = useActionData();

  const [name, setName] = useState(config?.discountName ?? "Student Discount");
  const [type, setType] = useState(config?.discountType ?? "percentage");
  const [value, setValue] = useState(String(config?.discountValue ?? "10"));
  const [scope, setScope] = useState(
    config?.discountCollections?.length ? "collections" : "all"
  );
  const [collections, setCollections] = useState(initialCollections ?? []);

  const isSaving = navigation.state !== "idle";

  async function pickCollections() {
    const picked = await window.shopify.resourcePicker({
      type: "collection",
      multiple: true,
      selectionIds: collections.map((c) => ({ id: c.id })),
    });
    if (picked) {
      setCollections(picked.map((c) => ({ id: c.id, title: c.title })));
    }
  }

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
                options={[
                  { label: "All products", value: "all" },
                  { label: "Specific collections", value: "collections" },
                ]}
                value={scope}
                onChange={setScope}
                helpText={
                  scope === "all"
                    ? "Discount applies to all products in your store."
                    : "Choose which collections the discount applies to — e.g. everything except your Sale collection."
                }
              />

              {scope === "collections" && (
                <BlockStack gap="200">
                  <Button onClick={pickCollections}>Choose collections</Button>
                  {collections.length > 0 && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Applies to: {collections.map((c) => c.title).join(", ")}
                    </Text>
                  )}
                </BlockStack>
              )}

              <input type="hidden" name="scope" value={scope} />
              <input
                type="hidden"
                name="collectionIds"
                value={JSON.stringify(collections.map((c) => c.id))}
              />

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
