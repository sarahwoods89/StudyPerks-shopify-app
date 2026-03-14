import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  Select,
  TextField,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export async function loader({ request }) {
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
    : { name: "Student Discount", type: "percentage", value: 10 };

  return json({ saved });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { name, type, value } = body;

  // Get shop GID
  const shopRes = await admin.graphql(`query { shop { id } }`);
  const shopData = await shopRes.json();
  const shopId = shopData.data.shop.id;

  // Save config to metafield
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

  // Create/update discount code in Shopify
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
}

export default function Settings() {
  const { saved } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [name, setName] = useState(saved.name ?? "Student Discount");
  const [type, setType] = useState(saved.type ?? "percentage");
  const [value, setValue] = useState(String(saved.value ?? 10));

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data;

  return (
    <Page>
      <TitleBar title="Discount Settings">
        <button onClick={() => navigate("/app")}>Back</button>
      </TitleBar>

      <Card>
        <BlockStack gap="400">
          {result?.success && (
            <Banner tone="success" title="Saved!">
              Your discount is live. Students with a StudyPerks token will receive it automatically.
            </Banner>
          )}
          {result?.error && (
            <Banner tone="critical" title="Could not create discount code">
              {result.error}
            </Banner>
          )}

          <Text variant="headingMd" as="h2">
            Configure Your Student Discount
          </Text>

          <Text as="p" tone="subdued" variant="bodyMd">
            This discount will be automatically applied when a customer connects
            a verified StudyPerks wallet at checkout.
          </Text>

          <TextField
            label="Discount name (shown in your Shopify Discounts list)"
            value={name}
            onChange={setName}
            placeholder="e.g. Student Discount"
            autoComplete="off"
          />

          <Select
            label="Discount type"
            options={[
              { label: "Percentage off", value: "percentage" },
              { label: "Fixed amount off", value: "fixed" },
            ]}
            value={type}
            onChange={setType}
          />

          <TextField
            label={
              type === "percentage"
                ? "Percentage (e.g. 10 = 10% off)"
                : "Amount off (e.g. 5 = $5 off)"
            }
            type="number"
            value={value}
            onChange={setValue}
            autoComplete="off"
          />

          <Text as="p" tone="subdued" variant="bodyMd">
            Applies to: all products
          </Text>

          <InlineStack>
            <Button
              primary
              loading={isLoading}
              onClick={() =>
                fetcher.submit(
                  { name, type, value },
                  { method: "post", encType: "application/json" }
                )
              }
            >
              Save &amp; Activate Discount
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
