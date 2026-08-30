import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }) {
  let state, shop, origin;
  try {
    ({ state, shop, origin } = await request.json());
  } catch {
    return json({ valid: false }, { status: 400 });
  }
  const result = await db.redemptionFlow.updateMany({
    where: { state, shop, origin, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return json({ valid: result.count === 1 });
}

export async function loader() {
  return new Response(null, { status: 405 });
}
