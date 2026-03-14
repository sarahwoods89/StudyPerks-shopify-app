document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("studyperks-wallet-connect");
  const tooltip = document.getElementById("studyperks-tooltip");
  if (!btn) return;

  function setAppliedState() {
    btn.classList.add("studyperks-badge--applied");
    btn.disabled = true;
    if (tooltip) tooltip.classList.add("studyperks-tooltip--hidden");
  }

  // Restore applied state instantly if already verified
  if (localStorage.getItem("studyperks_applied") === "true") {
    setAppliedState();
    return;
  }

  btn.addEventListener("click", async () => {
    if (!window.solana || !window.solana.isPhantom) {
      alert("Please install Phantom Wallet to claim your StudyPerks discount.");
      return;
    }

    btn.disabled = true;
    if (tooltip) tooltip.textContent = "Connecting...";

    try {
      const resp = await window.solana.connect();
      const walletAddress = resp.publicKey.toString();

      if (tooltip) tooltip.textContent = "Verifying...";

      const res = await fetch("https://www.studyperks.me/api/check-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });

      const data = await res.json();

      if (data.eligible) {
        localStorage.setItem("studyperks_applied", "true");
        setAppliedState();
        window.location.href = `/discount/STUDYPERKS?redirect=${encodeURIComponent(window.location.pathname)}`;
      } else {
        if (tooltip) tooltip.textContent = "No StudyPerks token found";
        setTimeout(() => {
          if (tooltip) tooltip.textContent = "Connect your Phantom wallet to claim your student discount";
          btn.disabled = false;
        }, 3000);
      }
    } catch (err) {
      console.error("StudyPerks error:", err);
      if (tooltip) tooltip.textContent = "Connect your Phantom wallet to claim your student discount";
      btn.disabled = false;
    }
  });
});
