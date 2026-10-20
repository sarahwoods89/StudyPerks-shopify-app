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
import { brand } from "../lib/brand";

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


const STUDYPERKS_ADDRESS = "9S7pJak91ds6kiGFkgGNmBQDr187XFYpKPPKpqmHwKUb";
const COLLECTION_NAME = "StudyPerks Student";
const NETWORK = "Solana";
const SOLSCAN_URL = `https://solscan.io/account/${STUDYPERKS_ADDRESS}`;

export default function Index() {
  const { totalOrders, totalRevenue, config } = useLoaderData();
  const isActive = !!config;

  return (
    <Page>
      <TitleBar title="StudyPerks" />
      <BlockStack gap="500">

        {/* ── Header ── */}
        <div style={{
          background: brand.black,
          borderRadius: "14px",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          gap: "22px",
        }}>
          <img
            src="/studyperks-logo-black-lime.png"
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
                background: brand.lime,
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
                <Text as="p" variant="bodyMd"><strong>2.</strong> Student verifies their student status with StudyPerks.</Text>
                <Text as="p" variant="bodyMd"><strong>3.</strong> A one-time discount code starting with SP- is generated and applied automatically at checkout.</Text>
              </BlockStack>
              <Text as="p" variant="bodyMd">
                Student purchases are tracked in your dashboard above. You can also identify them in your Shopify orders and analytics by their SP- discount codes.
              </Text>
            </BlockStack>

            {/* Collection details */}
            <div style={{
              background: brand.offWhite,
              border: "1px solid #ded9ce",
              borderRadius: "10px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: brand.black, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  StudyPerks on Solana
                </span>
                <span style={{
                  background: brand.lime,
                  color: brand.black,
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "11px",
                  fontWeight: "600",
                }}>{NETWORK}</span>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>Name</div>
                <div style={{ fontWeight: "600", fontSize: "14px", color: "#111" }}>{COLLECTION_NAME}</div>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>StudyPerks address</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <code style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: brand.black,
                    background: "#fff",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                  }}>
                    {STUDYPERKS_ADDRESS}
                  </code>
                  <a
                    href={SOLSCAN_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "11px", color: brand.blue, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    View on Solscan ↗
                  </a>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #ded9ce", paddingTop: "10px" }}>
                <div style={{ fontSize: "11px", color: "#111", marginBottom: "2px" }}>Student verification</div>
                <div style={{ fontSize: "12px", color: "#111" }}>
                  Managed by StudyPerks. Only verified students receive a student discount code.
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
              the <strong>StudyPerks Badge</strong> block to your theme
              via <strong>Online Store &gt; Themes &gt; Customize</strong>. Place it
              on product pages.
            </Text>
            <div style={{
              background: brand.lime,
              color: brand.black,
              border: `1px solid ${brand.lime}`,
              borderRadius: "8px",
              padding: "12px 16px",
            }}>
              <Text as="p" variant="bodySm">
                ✓ The discount is applied automatically after successful student verification. No extra steps for you.
              </Text>
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
