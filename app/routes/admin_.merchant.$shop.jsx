import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import db from "../db.server";
import { getSession } from "../lib/adminSession.server";

const COMMISSION_RATE = 0.05;

export const loader = async ({ request, params }) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) return redirect("/admin");

  const shop = params.shop;

  const [transactions, invoices] = await Promise.all([
    db.affiliateTransaction.findMany({ where: { shop }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({ where: { shop }, orderBy: { createdAt: "desc" } }),
  ]);

  const totalOrders = transactions.length;
  const totalRevenue = transactions.reduce((sum, t) => sum + t.orderTotal, 0);
  const totalCommission = totalRevenue * COMMISSION_RATE;

  const uninvoiced = transactions.filter((t) => !t.invoiceId);
  const uninvoicedRevenue = uninvoiced.reduce((sum, t) => sum + t.orderTotal, 0);
  const uninvoicedCommission = uninvoicedRevenue * COMMISSION_RATE;

  return json({
    shop,
    transactions,
    invoices,
    totalOrders,
    totalRevenue,
    totalCommission,
    uninvoicedCount: uninvoiced.length,
    uninvoicedCommission,
  });
};

export const action = async ({ request, params }) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) return redirect("/admin");

  const shop = params.shop;

  const uninvoiced = await db.affiliateTransaction.findMany({
    where: { shop, invoiceId: null },
    orderBy: { createdAt: "asc" },
  });

  if (uninvoiced.length === 0) {
    return json({ error: "No new orders to invoice for this merchant." });
  }

  const revenueTotal = uninvoiced.reduce((sum, t) => sum + t.orderTotal, 0);
  const commissionTotal = revenueTotal * COMMISSION_RATE;
  const invoiceCount = await db.invoice.count();
  const invoiceNumber = `SP-${String(invoiceCount + 1).padStart(4, "0")}`;

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      shop,
      periodStart: uninvoiced[0].createdAt,
      periodEnd: uninvoiced[uninvoiced.length - 1].createdAt,
      orderCount: uninvoiced.length,
      revenueTotal,
      commissionTotal,
    },
  });

  await db.affiliateTransaction.updateMany({
    where: { id: { in: uninvoiced.map((t) => t.id) } },
    data: { invoiceId: invoice.id },
  });

  return redirect(`/admin/invoice/${invoice.id}`);
};

const s = {
  page: { fontFamily: "system-ui, sans-serif", background: "#f5f3ff", minHeight: "100vh", padding: "40px 20px" },
  container: { maxWidth: "900px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" },
  logo: { width: "44px", height: "44px", borderRadius: "10px" },
  title: { fontSize: "24px", fontWeight: "700", color: "#1e1b4b", margin: 0 },
  sub: { fontSize: "13px", color: "#6b7280", margin: 0 },
  card: { background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: "20px" },
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" },
  statLabel: { fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" },
  statValue: { fontSize: "28px", fontWeight: "700", color: "#1e1b4b" },
  statNote: { fontSize: "12px", color: "#7c3aed", marginTop: "2px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #ede9fe", color: "#5b21b6", fontWeight: "600", fontSize: "12px", textTransform: "uppercase" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" },
  badge: { background: "#ede9fe", color: "#5b21b6", borderRadius: "20px", padding: "2px 10px", fontSize: "12px", fontWeight: "600" },
  invoicedBadge: { background: "#dcfce7", color: "#166534", borderRadius: "20px", padding: "2px 10px", fontSize: "12px", fontWeight: "600" },
  sectionTitle: { fontSize: "16px", fontWeight: "600", color: "#1e1b4b", marginBottom: "16px", marginTop: 0 },
  back: { color: "#5b21b6", fontSize: "13px", textDecoration: "none", marginBottom: "16px", display: "inline-block" },
  link: { color: "#5b21b6", fontWeight: "600", textDecoration: "none" },
  btn: { background: "#5b21b6", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 24px", fontSize: "15px", fontWeight: "600", cursor: "pointer" },
  btnDisabled: { background: "#c4b5fd", cursor: "not-allowed" },
  invoiceRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  err: { color: "#dc2626", fontSize: "14px", marginBottom: "12px" },
};

export default function MerchantDetail() {
  const {
    shop,
    transactions,
    invoices,
    totalOrders,
    totalRevenue,
    totalCommission,
    uninvoicedCount,
    uninvoicedCommission,
  } = useLoaderData();
  const navigation = useNavigation();
  const isGenerating = navigation.state !== "idle";

  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/admin" style={s.back}>&larr; Back to dashboard</Link>

        <div style={s.header}>
          <img src="/StudyPerksLogo.png" alt="StudyPerks" style={s.logo} />
          <div>
            <p style={s.title}>{shop}</p>
            <p style={s.sub}>Order history & commission</p>
          </div>
        </div>

        <div style={s.statsRow}>
          <div style={s.card}>
            <p style={s.statLabel}>Student Orders</p>
            <p style={s.statValue}>{totalOrders}</p>
          </div>
          <div style={s.card}>
            <p style={s.statLabel}>Revenue Driven</p>
            <p style={s.statValue}>£{totalRevenue.toFixed(2)}</p>
          </div>
          <div style={s.card}>
            <p style={s.statLabel}>Commission Owed (5%)</p>
            <p style={s.statValue}>£{totalCommission.toFixed(2)}</p>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.invoiceRow}>
            <div>
              <p style={s.sectionTitle}>Ready to invoice</p>
              <p style={{ ...s.sub, fontSize: "14px", margin: 0 }}>
                {uninvoicedCount === 0
                  ? "No new orders since the last invoice."
                  : `${uninvoicedCount} order${uninvoicedCount === 1 ? "" : "s"} not yet invoiced — £${uninvoicedCommission.toFixed(2)} commission.`}
              </p>
            </div>
            <Form method="post">
              <button
                type="submit"
                disabled={uninvoicedCount === 0 || isGenerating}
                style={uninvoicedCount === 0 || isGenerating ? { ...s.btn, ...s.btnDisabled } : s.btn}
              >
                {isGenerating ? "Generating..." : "Generate Invoice"}
              </button>
            </Form>
          </div>
        </div>

        {invoices.length > 0 && (
          <div style={s.card}>
            <p style={s.sectionTitle}>Past Invoices</p>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Invoice</th>
                  <th style={s.th}>Period</th>
                  <th style={s.th}>Orders</th>
                  <th style={s.th}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={s.td}>
                      <Link to={`/admin/invoice/${inv.id}`} style={s.link}>{inv.invoiceNumber}</Link>
                    </td>
                    <td style={s.td}>
                      {new Date(inv.periodStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(inv.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td style={s.td}>{inv.orderCount}</td>
                    <td style={s.td}><span style={s.badge}>£{inv.commissionTotal.toFixed(2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={s.card}>
          <p style={s.sectionTitle}>Order History</p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Order ID</th>
                <th style={s.th}>Total</th>
                <th style={s.th}>Commission</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td style={s.td}>{t.orderId}</td>
                  <td style={s.td}>£{t.orderTotal.toFixed(2)}</td>
                  <td style={s.td}>
                    <span style={s.badge}>£{(t.orderTotal * COMMISSION_RATE).toFixed(2)}</span>
                  </td>
                  <td style={s.td}>{new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td style={s.td}>
                    {t.invoiceId
                      ? <span style={s.invoicedBadge}>Invoiced</span>
                      : <span style={s.badge}>Pending</span>}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td style={s.td} colSpan={5}>No orders yet for this merchant.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
