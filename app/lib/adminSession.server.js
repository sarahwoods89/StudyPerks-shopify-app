import { createCookieSessionStorage } from "@remix-run/node";

export const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: "sp_admin",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.ADMIN_PASSWORD || "studyperks-secret"],
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
  },
});
