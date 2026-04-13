document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("studyperks-wallet-connect");
  const tooltip = document.getElementById("studyperks-tooltip");
  const switchBtn = document.getElementById("studyperks-switch");
  if (!btn) return;

  function setAppliedState() {
    btn.classList.add("studyperks-badge--applied");
    btn.disabled = true;
    if (tooltip) tooltip.classList.add("studyperks-tooltip--hidden");
  }

  function resetState() {
    localStorage.removeItem("studyperks_applied");
    localStorage.removeItem("studyperks_wallet");
    btn.classList.remove("studyperks-badge--applied");
    btn.disabled = false;
    if (tooltip) {
      tooltip.classList.remove("studyperks-tooltip--hidden");
      tooltip.textContent = "Connect your Phantom wallet to claim your student discount";
    }
  }

  // On page load: restore connected state from localStorage
  if (localStorage.getItem("studyperks_applied") === "true") {
    const savedWallet = localStorage.getItem("studyperks_wallet");

    if (window.solana && savedWallet) {
      // Try silent reconnect to verify the same wallet is still connected
      window.solana.connect({ onlyIfTrusted: true })
        .then((resp) => {
          if (resp.publicKey.toString() === savedWallet) {
            setAppliedState();
          } else {
            resetState();
          }
        })
        .catch(() => {
          // Phantom can't silently reconnect — discount was already applied so keep state
          setAppliedState();
        });
    } else {
      setAppliedState();
    }
  }

  // Reset when user disconnects the site in Phantom
  if (window.solana) {
    window.solana.on("disconnect", () => {
      resetState();
    });

    // Reset when user switches to a different account
    window.solana.on("accountChanged", () => {
      resetState();
    });
  }

  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      resetState();
    });
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
        localStorage.setItem("studyperks_wallet", walletAddress);
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
