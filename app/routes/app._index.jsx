import { useState } from "react";
import {
  Card,
  Page,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  InlineGrid,
  Select,
  TextField,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Form, useLoaderData, useNavigation, useActionData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, totalOrders, transactions] = await Promise.all([
    db.discountConfig.findUnique({ where: { shop } }),
    db.affiliateTransaction.count({ where: { shop } }),
    db.affiliateTransaction.findMany({ where: { shop } }),
  ]);

  const totalRevenue = transactions.reduce((sum, t) => sum + t.orderTotal, 0);
  return json({ config, totalOrders, totalRevenue });
};

export const action = async ({ request }) => {
  try {
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
  } catch (err) {
    console.error("Action error:", err);
    return json({ success: false, error: err?.message ?? String(err) });
  }
};

const purple = "#5B21B6";
const purpleLight = "#EDE9FE";

export default function Index() {
  const { totalOrders, totalRevenue, config } = useLoaderData();
  const navigation = useNavigation();
  const actionData = useActionData();

  const [discountName, setDiscountName] = useState(config?.discountName ?? "Student Discount");
  const [discountType, setDiscountType] = useState(config?.discountType ?? "percentage");
  const [discountValue, setDiscountValue] = useState(String(config?.discountValue ?? "10"));

  const isSaving = navigation.state !== "idle";
  const isActive = actionData?.success ?? !!config;

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

        {/* Stats */}
        <InlineGrid columns={2} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Student Orders</Text>
              <Text variant="heading2xl" as="p">{totalOrders}</Text>
              <Text as="p" tone="subdued" variant="bodySm">Verified student purchases</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Revenue Driven</Text>
              <Text variant="heading2xl" as="p">£{totalRevenue.toFixed(2)}</Text>
              <Text as="p" tone="subdued" variant="bodySm">From student discount orders</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

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

            {actionData?.success ? (
              <Banner tone="success" title="Discount activated!">
                Students with a verified StudyPerks token will now receive this
                discount automatically.
              </Banner>
            ) : null}

            {actionData?.error ? (
              <Banner tone="critical" title="Could not create discount">
                {actionData.error}
              </Banner>
            ) : null}

            <Form method="post">
              <BlockStack gap="400">
                <TextField
                  label="Discount name"
                  helpText="Shown in your Shopify Discounts list"
                  name="name"
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
                  name="type"
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
                  name="value"
                  value={discountValue}
                  onChange={setDiscountValue}
                  autoComplete="off"
                />

                <Text as="p" tone="subdued" variant="bodySm">
                  Applies to: all products
                </Text>

                <button
                  type="submit"
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
            </Form>
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
