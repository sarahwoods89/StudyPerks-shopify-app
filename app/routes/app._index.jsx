import {
  Card,
  Page,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  InlineGrid,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
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


const COLLECTION_MINT = "DM8CuRPtBtHVXhRkT563d1RNAE4H3EpmiKJTxzbdMzpC";
const COLLECTION_NAME = "StudyPerks Student";
const NETWORK = "Solana Devnet";
const SOLSCAN_URL = `https://explorer.solana.com/address/${COLLECTION_MINT}?cluster=devnet`;

const purple     = "#7C3AED";
const purpleDark = "#5B21B6";
const green      = "#14F195";

export default function Index() {
  const { totalOrders, totalRevenue, config } = useLoaderData();
  const isActive = !!config;

  return (
    <Page>
      <TitleBar title="StudyPerks" />
      <BlockStack gap="500">

        {/* ── Header ── */}
        <div style={{
          background: "#12002E",
          borderRadius: "14px",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          gap: "22px",
        }}>
          <img
            src="/StudyPerksLogo.png?v=2"
            alt="StudyPerks"
            style={{ width: "80px", height: "80px", borderRadius: "16px", flexShrink: 0, display: "block" }}
          />
          <div>
            <div style={{ color: "#fff", fontWeight: "800", fontSize: "24px", letterSpacing: "-0.4px" }}>
              StudyPerks
            </div>
            <div style={{ color: "#fff", fontSize: "14px", marginTop: "4px", lineHeight: "1.5" }}>
              Verified students. Automatic discounts. Your brand gets all the credit.
            </div>
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {isActive ? (
              <span style={{
                background: "#14F195",
                color: "#000",
                borderRadius: "20px",
                padding: "6px 16px",
                fontSize: "12px",
                fontWeight: "700",
                letterSpacing: "0.3px",
              }}>● ACTIVE</span>
            ) : (
              <span style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                borderRadius: "20px",
                padding: "6px 16px",
                fontSize: "12px",
                fontWeight: "700",
              }}>NOT CONFIGURED</span>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <InlineGrid columns={2} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Student Orders</Text>
              <Text variant="heading2xl" as="p" fontWeight="bold">{totalOrders}</Text>
              <Text as="p" variant="bodySm">Verified student purchases</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Revenue Driven</Text>
              <Text variant="heading2xl" as="p" fontWeight="bold">{totalRevenue.toFixed(2)}</Text>
              <Text as="p" variant="bodySm">From student discount orders</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ── How it works + Collection info ── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">How it works</Text>
              {isActive ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="attention">Not configured</Badge>
              )}
            </InlineStack>

            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                StudyPerks connects verified students to your store in three simple steps:
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd"><strong>1.</strong> Student clicks the StudyPerks badge on your store.</Text>
                <Text as="p" variant="bodyMd"><strong>2.</strong> We validate their StudyPerks token. They never leave your store to find a code.</Text>
                <Text as="p" variant="bodyMd"><strong>3.</strong> Discount applied at checkout automatically. No drop-off. They buy, they come back.</Text>
              </BlockStack>
              <Text as="p" variant="bodyMd">
                Every verified order is tracked in your dashboard above. You get the sale, the loyalty, and a student customer who feels genuinely valued by your brand.
              </Text>
            </BlockStack>

            {/* Collection details */}
            <div style={{
              background: "#F5F0FF",
              border: "1px solid #DDD6FE",
              borderRadius: "10px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: purpleDark, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Metaplex Collection
                </span>
                <span style={{
                  background: "#EDE9FE",
                  color: purpleDark,
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "11px",
                  fontWeight: "600",
                }}>{NETWORK}</span>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>Collection name</div>
                <div style={{ fontWeight: "600", fontSize: "14px", color: "#111" }}>{COLLECTION_NAME}</div>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>Collection mint</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <code style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: purpleDark,
                    background: "#EDE9FE",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                  }}>
                    {COLLECTION_MINT}
                  </code>
                  <a
                    href={SOLSCAN_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "11px", color: purple, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    View on Solana Explorer ↗
                  </a>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #DDD6FE", paddingTop: "10px" }}>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>Token authority</div>
                <div style={{ fontSize: "12px", color: "#111" }}>
                  Managed by StudyPerks. Only verified students receive a token from this collection.
                </div>
              </div>
            </div>
          </BlockStack>
        </Card>

        {!config && (
          <Banner tone="info" title="One step to get started">
            Head to <strong>Settings</strong> to set your student discount. Once saved, it activates automatically for every verified student who shops with you.
          </Banner>
        )}

        {/* ── Storefront setup ── */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Storefront Setup</Text>
            <Text as="p" variant="bodyMd">
              To show the StudyPerks badge on your store, add
              the <strong>StudyPerks Wallet Connect</strong> block to your theme
              via <strong>Online Store &gt; Themes &gt; Customize</strong>. Place it
              on product pages.
            </Text>
            <div style={{
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: "8px",
              padding: "12px 16px",
            }}>
              <Text as="p" variant="bodySm">
                ✓ The badge updates automatically when a verified student connects. No extra steps for you.
              </Text>
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
