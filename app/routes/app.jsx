import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Outlet, useLoaderData } from "@remix-run/react";
import { Link } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
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
