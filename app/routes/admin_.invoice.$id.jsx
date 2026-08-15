import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import db from "../db.server";
import { getSession } from "../lib/adminSession.server";

export const loader = async ({ request, params }) => {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) return redirect("/admin");

  const invoice = await db.invoice.findUnique({ where: { id: params.id } });
  if (!invoice) throw new Response("Invoice not found", { status: 404 });

  const orders = await db.affiliateTransaction.findMany({
    where: { invoiceId: invoice.id },
    orderBy: { createdAt: "asc" },
  });

  return json({ invoice, orders });
};

const s = {
  page: { fontFamily: "system-ui, sans-serif", background: "#f5f3ff", minHeight: "100vh", padding: "40px 20px" },
  container: { maxWidth: "800px", margin: "0 auto" },
  back: { color: "#5b21b6", fontSize: "13px", textDecoration: "none", marginBottom: "16px", display: "inline-block" },
  printBtn: { background: "#5b21b6", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "14px", fontWeight: "600", cursor: "pointer", marginBottom: "20px" },
  sheet: { background: "#fff", borderRadius: "12px", padding: "48px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" },
  logo: { width: "48px", height: "48px", borderRadius: "10px", marginBottom: "8px" },
  brand: { fontSize: "20px", fontWeight: "700", color: "#1e1b4b", margin: 0 },
  invoiceTitle: { fontSize: "28px", fontWeight: "700", color: "#1e1b4b", margin: 0, textAlign: "right" },
  invoiceMeta: { fontSize: "13px", color: "#6b7280", textAlign: "right", margin: "4px 0 0" },
  billTo: { fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" },
  billShop: { fontSize: "16px", fontWeight: "600", color: "#1e1b4b", margin: 0 },
  periodRow: { display: "flex", gap: "40px", marginBottom: "32px", marginTop: "24px" },
  metaLabel: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" },
  metaValue: { fontSize: "14px", color: "#1e1b4b", fontWeight: "600", margin: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "24px" },
  th: { textAlign: "left", padding: "10px 0", borderBottom: "2px solid #ede9fe", color: "#5b21b6", fontWeight: "600", fontSize: "12px", textTransform: "uppercase" },
  td: { padding: "10px 0", borderBottom: "1px solid #f3f4f6", color: "#374151" },
  totalsBlock: { marginLeft: "auto", width: "260px" },
  totalRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "14px", color: "#374151" },
  dueRow: { display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #1e1b4b", marginTop: "8px", fontSize: "18px", fontWeight: "700", color: "#1e1b4b" },
};

export default function InvoiceView() {
  const { invoice, orders } = useLoaderData();

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={s.page} className="invoice-page">
      <div style={s.container}>
        <div className="no-print">
          <Link to={`/admin/merchant/${encodeURIComponent(invoice.shop)}`} style={s.back}>&larr; Back to {invoice.shop}</Link>
          <br />
          <button style={s.printBtn} onClick={() => window.print()}>Print / Save as PDF</button>
        </div>

        <div style={s.sheet} className="invoice-sheet">
          <div style={s.topRow}>
            <div>
              <img src="/StudyPerksLogo.png" alt="StudyPerks" style={s.logo} />
              <p style={s.brand}>StudyPerks</p>
            </div>
            <div>
              <p style={s.invoiceTitle}>INVOICE</p>
              <p style={s.invoiceMeta}>{invoice.invoiceNumber}</p>
              <p style={s.invoiceMeta}>Issued {fmtDate(invoice.createdAt)}</p>
            </div>
          </div>

          <p style={s.billTo}>Bill to</p>
          <p style={s.billShop}>{invoice.shop}</p>

          <div style={s.periodRow}>
            <div>
              <p style={s.metaLabel}>Period covered</p>
              <p style={s.metaValue}>{fmtDate(invoice.periodStart)} – {fmtDate(invoice.periodEnd)}</p>
            </div>
            <div>
              <p style={s.metaLabel}>Orders</p>
              <p style={s.metaValue}>{invoice.orderCount}</p>
            </div>
            <div>
              <p style={s.metaLabel}>Revenue driven</p>
              <p style={s.metaValue}>£{invoice.revenueTotal.toFixed(2)}</p>
            </div>
          </div>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Order ID</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Order Total</th>
                <th style={s.th}>Commission (5%)</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={s.td}>{o.orderId}</td>
                  <td style={s.td}>{fmtDate(o.createdAt)}</td>
                  <td style={s.td}>£{o.orderTotal.toFixed(2)}</td>
                  <td style={s.td}>£{(o.orderTotal * 0.05).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={s.totalsBlock}>
            <div style={s.totalRow}>
              <span>Revenue driven</span>
              <span>£{invoice.revenueTotal.toFixed(2)}</span>
            </div>
            <div style={s.totalRow}>
              <span>Commission rate</span>
              <span>5%</span>
            </div>
            <div style={s.dueRow}>
              <span>Amount due</span>
              <span>£{invoice.commissionTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          .invoice-page { background: #fff !important; padding: 0 !important; }
          .invoice-sheet { box-shadow: none !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
}
