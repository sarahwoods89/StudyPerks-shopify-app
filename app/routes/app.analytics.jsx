import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  DataTable,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const transactions = await db.affiliateTransaction.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totalOrders = transactions.length;
  const totalRevenue = transactions.reduce((sum, t) => sum + t.orderTotal, 0);

  let currency = "USD";
  try {
    const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
    const currencyData = await currencyRes.json();
    currency = currencyData?.data?.shop?.currencyCode ?? "USD";
  } catch (_) {
    // fall back to USD if GraphQL fails
  }

  return json({ transactions, totalOrders, totalRevenue, currency });
};

export default function Analytics() {
  const { transactions, totalOrders, totalRevenue, currency } = useLoaderData();

  const fmt = (amount) => new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);

  const rows = transactions.map((t) => [
    t.orderId,
    fmt(t.orderTotal),
    new Date(t.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    <Badge tone="success">Verified student</Badge>,
  ]);

  return (
    <Page>
      <TitleBar title="Student Analytics" />
      <BlockStack gap="500">

        <InlineGrid columns={2} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Student Orders</Text>
              <Text variant="heading2xl" as="p">{totalOrders}</Text>
              <Text as="p"  variant="bodySm">
                Orders placed using STUDYPERKS discount
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Total Revenue</Text>
              <Text variant="heading2xl" as="p">{fmt(totalRevenue)}</Text>
              <Text as="p"  variant="bodySm">
                Driven by verified student purchases
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Recent Student Orders</Text>
            {rows.length === 0 ? (
              <Text as="p" >
                No student orders yet. Once a student uses the STUDYPERKS discount
                code at checkout, their order will appear here.
              </Text>
            ) : (
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text"]}
                headings={["Order ID", "Total", "Date", "Status"]}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
