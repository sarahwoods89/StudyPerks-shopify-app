import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Outlet } from "@remix-run/react";
import { Link } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function App() {
  return (
    <ShopifyAppProvider>
      <PolarisAppProvider i18n={enTranslations}>
        <NavMenu>
          <Link to="/app" rel="home">
            Token Checker
          </Link>
          <Link to="/app/settings">Settings</Link>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}
