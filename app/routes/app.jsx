import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Outlet, useLoaderData, useRouteError, Link } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  fetchActiveSubscription,
  getPlanSelectionUrl,
  isAppPricingEnforcedForShop,
} from "../lib/shopifyAppPricing.server";

export const loader = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);

  // Keep enforcement opt-in until the Partner API credentials and plan flow
  // have been configured and tested in the deployed environment.
  if (isAppPricingEnforcedForShop(session.shop)) {
    let subscription;

    try {
      const shopResponse = await admin.graphql("query StudyPerksShopId { shop { id } }");
      const shopPayload = await shopResponse.json();
      const shopId = shopPayload?.data?.shop?.id;

      if (!shopResponse.ok || shopPayload?.errors?.length || !shopId) {
        throw new Error("Could not retrieve the authenticated shop ID");
      }

      subscription = await fetchActiveSubscription(shopId);
    } catch (error) {
      console.error("Shopify App Pricing check failed:", error.message);
      throw new Response(
        "We couldn't confirm your StudyPerks plan. Please try again shortly.",
        { status: 503 },
      );
    }

    if (!subscription) {
      return redirect(getPlanSelectionUrl(session.shop), { target: "_top" });
    }
  }

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <ShopifyAppProvider apiKey={apiKey} isEmbeddedApp>
      <PolarisAppProvider i18n={enTranslations}>
        <NavMenu>
          <Link to="/app" rel="home">
            Dashboard
          </Link>
          <Link to="/app/analytics">Analytics</Link>
          <Link to="/app/settings">Settings</Link>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
