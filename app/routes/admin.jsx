import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, Link, useRevalidator } from "@remix-run/react";
import React from "react";
import db from "../db.server";
import { getSession, commitSession } from "../lib/adminSession.server";
import { getShopDisplayName } from "../lib/shopName.server";

const COMMISSION_RATE = 0.05;

function playCashRegisterSound(context) {
  if (!context) return;
  const ring = () => {
    const start = context.currentTime;
    [[1046.5, 0, 0.3, 0.08], [1568, 0.06, 0.38, 0.07], [2093, 0.14, 0.42, 0.045]].forEach(([frequency, delay, duration, volume]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const onset = start + delay;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, onset);
      gain.gain.setValueAtTime(0.001, onset);
      gain.gain.exponentialRampToValueAtTime(volume, onset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, onset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(onset);
      oscillator.stop(onset + duration + 0.02);
    });

    // A short, soft drawer movement under the bright register bell.
    const motor = context.createOscillator();
    const motorGain = context.createGain();
    motor.type = "triangle";
    motor.frequency.setValueAtTime(175, start + 0.04);
    motor.frequency.exponentialRampToValueAtTime(72, start + 0.28);
    motorGain.gain.setValueAtTime(0.001, start + 0.04);
    motorGain.gain.exponentialRampToValueAtTime(0.025, start + 0.07);
    motorGain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    motor.connect(motorGain);
    motorGain.connect(context.destination);
    motor.start(start + 0.04);
    motor.stop(start + 0.32);
  };

  if (context.state === "running") ring();
  else context.resume().then(ring).catch(() => {});
}

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
  const url = new URL(request.url);
  const updatesOnly = url.searchParams.get("updates") === "1";
  if (!session.get("authed")) {
    return updatesOnly
      ? json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
      : json({ authed: false });
  }

  // The admin screen polls this small, authenticated response for orders
  // recorded after the page opened. It never exposes merchant data publicly.
  if (updatesOnly) {
    const since = new Date(url.searchParams.get("since") || "");
    if (Number.isNaN(since.getTime())) {
      return json({ error: "Invalid update cursor" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const transactions = await db.affiliateTransaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, shop: true, orderId: true, orderTotal: true, createdAt: true },
    });
    return json({ transactions }, { headers: { "Cache-Control": "no-store, private" } });
  }

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

  // Sessions are created on install and deleted on the app/uninstalled webhook,
  // so this table is the live list of shops with the app currently installed —
  // including ones with zero orders so far, which byShop above would never show.
  const sessions = await db.session.findMany({
    orderBy: { createdAt: "desc" },
  });
  const seenShops = new Set();
  const uniqueSessions = [];
  for (const s of sessions) {
    if (seenShops.has(s.shop)) continue;
    seenShops.add(s.shop);
    uniqueSessions.push(s);
  }
  const installedShops = await Promise.all(
    uniqueSessions.map(async (s) => ({
      shop: s.shop,
      displayName: await getShopDisplayName(s.shop, s.shopName),
      installedAt: s.createdAt,
    })),
  );

  return json({ authed: true, transactions, byShop, totalOrders, totalRevenue, totalCommission, installedShops });
};

const s = {
  page: { fontFamily: "system-ui, sans-serif", background: "#f5f3ff", minHeight: "100vh", padding: "40px 20px" },
  container: { maxWidth: "900px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" },
  alertControls: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" },
  soundButton: { background: "#e7f2a2", color: "#263000", border: "1px solid #c8df52", borderRadius: "9px", padding: "9px 12px", fontSize: "13px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap" },
  bellArea: { position: "relative" },
  bellButton: { position: "relative", display: "grid", placeItems: "center", width: "42px", height: "42px", border: "1px solid #e5e7eb", borderRadius: "50%", background: "#fff", color: "#1e1b4b", cursor: "pointer" },
  notificationCount: { position: "absolute", top: "-5px", right: "-6px", minWidth: "19px", height: "19px", padding: "0 4px", boxSizing: "border-box", display: "grid", placeItems: "center", borderRadius: "12px", background: "#dc2626", color: "#fff", border: "2px solid #f5f3ff", fontSize: "10px", lineHeight: 1, fontWeight: "700" },
  notificationPanel: { position: "absolute", zIndex: 20, top: "50px", right: 0, width: "min(350px, calc(100vw - 40px))", padding: "14px", boxSizing: "border-box", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)" },
  notificationHeading: { display: "block", color: "#1e1b4b", fontSize: "14px", marginBottom: "8px" },
  notificationEmpty: { color: "#6b7280", fontSize: "13px", lineHeight: 1.5, margin: "8px 0 2px" },
  notificationItem: { display: "flex", alignItems: "flex-start", gap: "9px", padding: "10px 0", borderTop: "1px solid #f3f4f6", fontSize: "12px" },
  notificationDot: { width: "8px", height: "8px", flex: "0 0 8px", borderRadius: "50%", background: "#84a900", marginTop: "4px" },
  notificationShop: { display: "block", color: "#374151", fontWeight: "650", overflowWrap: "anywhere" },
  notificationOrder: { display: "block", color: "#6b7280", marginTop: "3px" },
  notificationTime: { marginLeft: "auto", color: "#9ca3af", whiteSpace: "nowrap" },
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
  link: { color: "#5b21b6", fontWeight: "600", textDecoration: "none" },
  back: { color: "#5b21b6", fontSize: "13px", textDecoration: "none", marginBottom: "16px", display: "inline-block" },
  input: { width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", marginBottom: "12px", boxSizing: "border-box" },
  btn: { background: "#5b21b6", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "15px", fontWeight: "600", cursor: "pointer", width: "100%" },
  err: { color: "#dc2626", marginBottom: "10px", fontSize: "14px" },
  sectionTitle: { fontSize: "16px", fontWeight: "600", color: "#1e1b4b", marginBottom: "16px", marginTop: 0 },
};

export default function Admin() {
  const data = useLoaderData();
  const { revalidate } = useRevalidator();
  const [notifications, setNotifications] = React.useState([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);
  const [soundReady, setSoundReady] = React.useState(false);
  const audioContextRef = React.useRef(null);
  const soundOnRef = React.useRef(true);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem("studyperks_admin_sound") === "off") {
        soundOnRef.current = false;
        setSoundOn(false);
      }
    } catch { /* Storage can be disabled; sound remains on for this visit. */ }
  }, []);

  React.useEffect(() => {
    if (!data.authed) return undefined;

    const initial = data.transactions || [];
    const seen = new Set(initial.map((transaction) => transaction.id));
    let newestTimestamp = initial.reduce((latest, transaction) => (
      Math.max(latest, new Date(transaction.createdAt).getTime())
    ), 0);
    if (!newestTimestamp) newestTimestamp = Date.now();

    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      const since = new Date(Math.max(0, newestTimestamp - 1000)).toISOString();
      try {
        const response = await fetch(`/admin?updates=1&since=${encodeURIComponent(since)}`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = await response.json();
        const fresh = (payload.transactions || []).filter((transaction) => !seen.has(transaction.id));
        if (!fresh.length) return;

        for (const transaction of fresh) {
          seen.add(transaction.id);
          newestTimestamp = Math.max(newestTimestamp, new Date(transaction.createdAt).getTime());
        }
        setNotifications((current) => [...fresh.reverse(), ...current].slice(0, 20));
        setUnreadCount((count) => count + fresh.length);
        if (soundOnRef.current) playCashRegisterSound(audioContextRef.current);
        // Refresh the totals and recent-orders table after raising the alert.
        revalidate();
      } catch {
        // A temporary connection failure is harmless; the next poll retries.
      } finally {
        polling = false;
      }
    };

    void poll();
    const timer = window.setInterval(poll, 15000);
    const onFocus = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [data.authed, data.transactions, revalidate]);

  async function handleSoundClick() {
    if (!soundOn || !soundReady) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const context = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = context;
        try { await context.resume(); } catch { /* The sound control remains available to retry. */ }
        if (context.state === "running") {
          setSoundReady(true);
          setSoundOn(true);
          soundOnRef.current = true;
          try { window.localStorage.setItem("studyperks_admin_sound", "on"); } catch { /* Ignore unavailable storage. */ }
          playCashRegisterSound(context);
          return;
        }
      }
      setSoundReady(false);
      return;
    }

    setSoundOn(false);
    soundOnRef.current = false;
    try { window.localStorage.setItem("studyperks_admin_sound", "off"); } catch { /* Ignore unavailable storage. */ }
  }

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

  const { transactions, byShop, totalOrders, totalRevenue, totalCommission, installedShops } = data;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <img src="/StudyPerksLogo.png" alt="StudyPerks" style={s.logo} />
          <div>
            <p style={s.title}>StudyPerks Admin</p>
            <p style={s.sub}>Commission & merchant overview</p>
          </div>
          <div style={s.alertControls}>
            <button type="button" style={s.soundButton} onClick={handleSoundClick} aria-label={soundOn ? (soundReady ? "Turn transaction sound off" : "Enable transaction sound") : "Turn transaction sound on"}>
              {soundOn ? (soundReady ? "🔔 Sound on" : "🔔 Enable sound") : "🔕 Sound off"}
            </button>
            <div style={s.bellArea}>
              <button
                type="button"
                style={s.bellButton}
                onClick={() => { setBellOpen((open) => !open); setUnreadCount(0); }}
                aria-label={unreadCount ? `${unreadCount} new transaction notifications` : "Transaction notifications"}
                aria-expanded={bellOpen}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unreadCount > 0 && <span style={s.notificationCount}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>
              {bellOpen && (
                <div style={s.notificationPanel}>
                  <strong style={s.notificationHeading}>New transactions</strong>
                  {notifications.length === 0
                    ? <p style={s.notificationEmpty}>You’re all caught up. I’ll let you know when a sale is recorded.</p>
                    : notifications.slice(0, 8).map((transaction) => (
                      <div key={transaction.id} style={s.notificationItem}>
                        <span style={s.notificationDot} />
                        <span>
                          <span style={s.notificationShop}>{transaction.shop}</span>
                          <span style={s.notificationOrder}>Order #{transaction.orderId}</span>
                        </span>
                        <time style={s.notificationTime}>{new Date(transaction.createdAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</time>
                      </div>
                    ))}
                </div>
              )}
            </div>
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

        {/* Installed merchants — includes shops with zero orders so far */}
        <div style={s.card}>
          <p style={s.sectionTitle}>Installed Merchants ({installedShops.length})</p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Shop</th>
                <th style={s.th}>Installed</th>
                <th style={s.th}>Orders</th>
              </tr>
            </thead>
            <tbody>
              {installedShops.map(({ shop, displayName, installedAt }) => (
                <tr key={shop}>
                  <td style={s.td}>
                    <Link to={`/admin/merchant/${encodeURIComponent(shop)}`} style={s.link}>{displayName || shop}</Link>
                    {displayName && <div style={{ fontSize: "11px", color: "#9ca3af" }}>{shop}</div>}
                  </td>
                  <td style={s.td}>{new Date(installedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td style={s.td}>
                    {byShop[shop]
                      ? <span style={s.badge}>{byShop[shop].orders}</span>
                      : <span style={{ color: "#9ca3af" }}>No orders yet</span>}
                  </td>
                </tr>
              ))}
              {installedShops.length === 0 && (
                <tr><td style={s.td} colSpan={3}>No installs yet.</td></tr>
              )}
            </tbody>
          </table>
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
                  <td style={s.td}>
                    <Link to={`/admin/merchant/${encodeURIComponent(shop)}`} style={s.link}>{shop}</Link>
                  </td>
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
