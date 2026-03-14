import { useState } from "react";
import {
  Card,
  Page,
  Button,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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
  const saved = data.data.shop.metafield
    ? JSON.parse(data.data.shop.metafield.value)
    : null;

  return json({ saved });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { name, type, value } = body;

  const shopRes = await admin.graphql(`query { shop { id } }`);
  const shopData = await shopRes.json();
  const shopId = shopData.data.shop.id;

  await admin.graphql(
    `mutation Save($value: String!, $ownerId: ID!) {
      metafieldsSet(metafields: [{
        namespace: "studyperks",
        key: "discount",
        type: "json",
        value: $value,
        ownerId: $ownerId
      }]) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        value: JSON.stringify({ name, type, value: Number(value) }),
        ownerId: shopId,
      },
    }
  );

  const discountValue =
    type === "percentage"
      ? `{ percentage: ${Number(value) / 100} }`
      : `{ discountAmount: { amount: "${value}", appliesOnEachItem: false } }`;

  const discountRes = await admin.graphql(`
    mutation {
      discountCodeBasicCreate(basicCodeDiscount: {
        title: "${name}",
        code: "STUDYPERKS",
        startsAt: "${new Date().toISOString()}",
        customerSelection: { all: true },
        customerGets: {
          value: ${discountValue},
          items: { all: true }
        }
      }) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }
  `);

  const discountData = await discountRes.json();
  const errors = discountData?.data?.discountCodeBasicCreate?.userErrors ?? [];
  const realErrors = errors.filter(
    (e) => !e.message.toLowerCase().includes("already been used")
  );

  if (realErrors.length > 0) {
    return json({ success: false, error: realErrors[0].message });
  }

  return json({ success: true });
};

const purple = "#5B21B6";
const purpleLight = "#EDE9FE";

export default function Index() {
  const fetcher = useFetcher();

  const [discountName, setDiscountName] = useState("Student Discount");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("10");

  const isSaving = fetcher.state !== "idle";
  const saveResult = fetcher.data;
  const isActive = saveResult?.success;

  return (
    <Page>
      <TitleBar title="StudyPerks" />
      <BlockStack gap="500">

        {/* Brand header */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <img
            src="/StudyPerksLogo.png"
            alt="StudyPerks"
            style={{ width: "52px", height: "52px", borderRadius: "10px" }}
          />
          <div>
            <Text variant="headingLg" as="h1">StudyPerks</Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Verified student discounts powered by Solana
            </Text>
          </div>
        </div>

        {/* How it works */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">How it works</Text>
              {isActive ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="attention">Not configured</Badge>
              )}
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodyMd">
              StudyPerks issues soulbound NFTs to verified students. When a
              student connects their wallet on your store, the StudyPerks app
              checks for a valid token and automatically applies your discount
              at checkout — no code entry needed.
            </Text>
            <div
              style={{
                background: purpleLight,
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <Text as="p" variant="bodySm">
                <strong style={{ color: purple }}>Token authority:</strong>{" "}
                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                  StudyPerks Mint Authority (fixed — managed by StudyPerks)
                </span>
              </Text>
            </div>
          </BlockStack>
        </Card>

        {/* Discount configuration */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Configure Your Student Discount</Text>
            <Text as="p" tone="subdued" variant="bodyMd">
              This discount is automatically applied when a student with a valid
              StudyPerks token connects their wallet on your storefront.
            </Text>

            {saveResult?.success ? (
              <Banner tone="success" title="Discount activated!">
                Students with a verified StudyPerks token will now receive this
                discount automatically.
              </Banner>
            ) : null}

            {saveResult?.error ? (
              <Banner tone="critical" title="Could not create discount">
                {saveResult.error}
              </Banner>
            ) : null}

            <TextField
              label="Discount name"
              helpText="Shown in your Shopify Discounts list"
              value={discountName}
              onChange={setDiscountName}
              placeholder="e.g. Student Discount"
              autoComplete="off"
            />

            <Select
              label="Discount type"
              options={[
                { label: "Percentage off", value: "percentage" },
                { label: "Fixed amount off", value: "fixed" },
              ]}
              value={discountType}
              onChange={setDiscountType}
            />

            <TextField
              label={
                discountType === "percentage"
                  ? "Percentage (e.g. 10 = 10% off)"
                  : "Amount off (e.g. 5 = $5 off)"
              }
              type="number"
              value={discountValue}
              onChange={setDiscountValue}
              autoComplete="off"
            />

            <Text as="p" tone="subdued" variant="bodySm">
              Applies to: all products
            </Text>

            <button
              onClick={() =>
                fetcher.submit(
                  { name: discountName, type: discountType, value: discountValue },
                  { method: "post", encType: "application/json" }
                )
              }
              disabled={isSaving}
              style={{
                background: purple,
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: isSaving ? "not-allowed" : "pointer",
                fontWeight: "600",
                fontSize: "14px",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : "Save & Activate Discount"}
            </button>
          </BlockStack>
        </Card>

        {/* Theme extension reminder */}
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">Storefront Setup</Text>
            <Text as="p" tone="subdued" variant="bodyMd">
              To show the StudyPerks wallet connect button on your store, add
              the <strong>StudyPerks Wallet Connect</strong> block to your theme
              via <strong>Online Store → Themes → Customize</strong>. Place it
              on product pages or the cart page.
            </Text>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
