import db from "../db.server.js";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh proactively if expiring within 5 minutes

// Returns a working offline access token for a shop, transparently refreshing
// it first if it's expired or close to it — using the refresh token Shopify
// already issued, so no merchant reinstall is ever needed unless the refresh
// token itself has gone stale (90-day lifetime, renewed on every use).
export async function getValidAccessToken(shop) {
  const session = await db.session.findFirst({ where: { shop, isOnline: false } });
  if (!session) return null;

  const expiresAt = session.expires ? session.expires.getTime() : 0;
  const needsRefresh = expiresAt - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return session.accessToken;
  }

  const refreshExpiresAt = session.refreshTokenExpires ? session.refreshTokenExpires.getTime() : 0;
  if (!session.refreshToken || refreshExpiresAt < Date.now()) {
    console.error(`No usable refresh token for ${shop} — a real reinstall is needed.`);
    return session.accessToken; // stale, but returning it lets the caller see the real 401 rather than a different error
  }

  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
    });

    if (!res.ok) {
      console.error(`Token refresh failed for ${shop}: HTTP ${res.status} — ${await res.text()}`);
      return session.accessToken;
    }

    const data = await res.json();

    await db.session.update({
      where: { id: session.id },
      data: {
        accessToken: data.access_token,
        expires: new Date(Date.now() + data.expires_in * 1000),
        refreshToken: data.refresh_token,
        refreshTokenExpires: new Date(Date.now() + data.refresh_token_expires_in * 1000),
      },
    });

    console.log(`Refreshed access token for ${shop}, valid until ${new Date(Date.now() + data.expires_in * 1000).toISOString()}`);
    return data.access_token;
  } catch (err) {
    console.error(`Token refresh error for ${shop}:`, err);
    return session.accessToken;
  }
}
