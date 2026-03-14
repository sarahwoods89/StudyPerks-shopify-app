import { useState } from "react";
import { Card, Page, Button, Text, Banner } from "@shopify/polaris";

const STUDYPERKS_API = "https://www.studyperks.me/api/check-token";

export default function Index() {
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState("");
  const [tokenOwned, setTokenOwned] = useState(false);

  async function connectWallet() {
    if (!window.solana) {
      setStatus("Please install Phantom Wallet to continue.");
      return;
    }

    try {
      const resp = await window.solana.connect();
      const walletAddress = resp.publicKey.toString();
      setWallet(walletAddress);
      setStatus(`Connected: ${walletAddress}`);
      checkToken(walletAddress);
    } catch (err) {
      setStatus("Failed to connect wallet.");
    }
  }

  async function checkToken(walletAddress) {
    setStatus("Checking for StudyPerks token...");
    try {
      const response = await fetch(STUDYPERKS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });

      const data = await response.json();

      if (data.eligible) {
        setTokenOwned(true);
        setStatus("StudyPerks token detected! Discount eligible.");
      } else {
        setStatus("No StudyPerks token found in this wallet.");
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <Page title="StudyPerks Token Checker">
      <Card sectioned>
        <Text variant="headingMd" as="h2">
          Verify Your Student Token
        </Text>

        <div style={{ margin: "1rem 0" }}>
          <Button onClick={connectWallet} primary>
            {wallet ? "Reconnect Wallet" : "Connect Solana Wallet"}
          </Button>
        </div>

        <Text as="p" tone="subdued" variant="bodyMd">
          {status}
        </Text>

        {tokenOwned && (
          <Banner title="Discount Applied!" tone="success">
            You hold a valid StudyPerks token 🎓 Your discount is active.
          </Banner>
        )}
      </Card>
    </Page>
  );
}
