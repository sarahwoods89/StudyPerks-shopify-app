import { json, redirect, createCookieSessionStorage } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import db from "../db.server";

const COMMISSION_RATE = 0.05;

const { getSession, commitSession } = createCookieSessionStorage({
  cookie: {
    name: "sp_admin",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.ADMIN_PASSWORD || "studyperks-secret"],
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
  },
});

export const action = async ({ request }) => {
  const form = await request.formData();
  const password = form.get("password");

  if (password !== process.env.ADMIN_PASSWORD) {
    return json({ error: "Incorrect password" });
  }

  const session = await getSession(request.headers.get("Cookie"));
  session.set("authed", true);
  return redirect("/admin", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
};

export const loader = async ({ request }) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) return json({ authed: false });

  const transactions = await db.affiliateTransaction.findMany({
    orderBy: { createdAt: "desc" },
  });

  const byShop = {};
  for (const t of transactions) {
    if (!byShop[t.shop]) byShop[t.shop] = { orders: 0, revenue: 0 };
    byShop[t.shop].orders += 1;
    byShop[t.shop].revenue += t.orderTotal;
  }

  const totalOrders = transactions.length;
  const totalRevenue = transactions.reduce((sum, t) => sum + t.orderTotal, 0);
  const totalCommission = totalRevenue * COMMISSION_RATE;

  return json({ authed: true, transactions, byShop, totalOrders, totalRevenue, totalCommission });
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
  input: { width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", marginBottom: "12px", boxSizing: "border-box" },
  btn: { background: "#5b21b6", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "15px", fontWeight: "600", cursor: "pointer", width: "100%" },
  err: { color: "#dc2626", marginBottom: "10px", fontSize: "14px" },
  sectionTitle: { fontSize: "16px", fontWeight: "600", color: "#1e1b4b", marginBottom: "16px", marginTop: 0 },
};

export default function Admin() {
  const data = useLoaderData();

  if (!data.authed) {
    return (
      <div style={s.page}>
        <div style={{ ...s.container, maxWidth: "400px" }}>
          <div style={s.header}>
            <img src="/StudyPerksLogo.png" alt="StudyPerks" style={s.logo} />
            <div>
              <p style={s.title}>StudyPerks Admin</p>
              <p style={s.sub}>Owner access only</p>
            </div>
          </div>
          <div style={s.card}>
            <Form method="post">
              {data?.error && <p style={s.err}>{data.error}</p>}
              <input name="password" type="password" placeholder="Admin password" style={s.input} autoFocus />
              <button type="submit" style={s.btn}>Sign in</button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  const { transactions, byShop, totalOrders, totalRevenue, totalCommission } = data;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <img src="/StudyPerksLogo.png" alt="StudyPerks" style={s.logo} />
          <div>
            <p style={s.title}>StudyPerks Admin</p>
            <p style={s.sub}>Commission & merchant overview</p>
          </div>
        </div>

        {/* Totals */}
        <div style={s.statsRow}>
          <div style={s.card}>
            <p style={s.statLabel}>Total Student Orders</p>
            <p style={s.statValue}>{totalOrders}</p>
          </div>
          <div style={s.card}>
            <p style={s.statLabel}>Total Revenue Driven</p>
            <p style={s.statValue}>£{totalRevenue.toFixed(2)}</p>
          </div>
          <div style={s.card}>
            <p style={s.statLabel}>Your Commission (5%)</p>
            <p style={s.statValue}>£{totalCommission.toFixed(2)}</p>
            <p style={s.statNote}>Across all merchants</p>
          </div>
        </div>

        {/* Per merchant breakdown */}
        <div style={s.card}>
          <p style={s.sectionTitle}>Merchant Breakdown</p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Shop</th>
                <th style={s.th}>Orders</th>
                <th style={s.th}>Revenue</th>
                <th style={s.th}>Commission Owed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byShop).map(([shop, info]) => (
                <tr key={shop}>
                  <td style={s.td}>{shop}</td>
                  <td style={s.td}>{info.orders}</td>
                  <td style={s.td}>£{info.revenue.toFixed(2)}</td>
                  <td style={s.td}>
                    <span style={s.badge}>£{(info.revenue * COMMISSION_RATE).toFixed(2)}</span>
                  </td>
                </tr>
              ))}
              {Object.keys(byShop).length === 0 && (
                <tr><td style={s.td} colSpan={4}>No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent orders */}
        <div style={s.card}>
          <p style={s.sectionTitle}>Recent Orders</p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Shop</th>
                <th style={s.th}>Order ID</th>
                <th style={s.th}>Total</th>
                <th style={s.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 30).map((t) => (
                <tr key={t.id}>
                  <td style={s.td}>{t.shop}</td>
                  <td style={s.td}>{t.orderId}</td>
                  <td style={s.td}>£{t.orderTotal.toFixed(2)}</td>
                  <td style={s.td}>{new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td style={s.td} colSpan={4}>No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
