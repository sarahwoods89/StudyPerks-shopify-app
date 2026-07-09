document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("studyperks-wallet-connect");
  const tooltip = document.getElementById("studyperks-tooltip");
  const emailPrompt = document.getElementById("studyperks-email-prompt");
  const emailInput = document.getElementById("studyperks-email-input");
  const emailSubmit = document.getElementById("studyperks-email-submit");
  if (!btn) return;

  let verified = false;

  // Hide tooltip while silently verifying — no flash of wrong state
  if (tooltip) tooltip.style.visibility = "hidden";

  function setAppliedState() {
    verified = true;
    btn.classList.add("studyperks-badge--applied");
    btn.disabled = true;
    btn.setAttribute("aria-label", "StudyPerks — student discount applied");
    if (tooltip) {
      tooltip.classList.add("studyperks-tooltip--hidden");
      tooltip.style.visibility = "";
    }
    hideEmailPrompt();
  }

  function clearState() {
    localStorage.removeItem("studyperks_applied");
    localStorage.removeItem("studyperks_wallet");
    localStorage.removeItem("studyperks_expiry");
    btn.classList.remove("studyperks-badge--applied");
    btn.disabled = false;
    if (tooltip) {
      tooltip.style.visibility = "";
      tooltip.classList.remove("studyperks-tooltip--hidden");
      tooltip.textContent = "Student discount — click to claim";
    }
  }

  // Called by Phantom disconnect/accountChanged — always clears regardless of verified state
  function resetState() {
    verified = false;
    clearState();
  }

  function showEmailPrompt() {
    if (emailPrompt) {
      emailPrompt.classList.add("studyperks-email-prompt--visible");
      btn.closest(".studyperks-wrapper")?.classList.add("studyperks-prompt-open");
      emailInput?.focus();
    }
  }

  function hideEmailPrompt() {
    if (emailPrompt) emailPrompt.classList.remove("studyperks-email-prompt--visible");
    btn.closest(".studyperks-wrapper")?.classList.remove("studyperks-prompt-open");
  }

  // Checks eligibility without redirecting — used for silent re-verification on load
  async function silentlyVerify(walletAddress) {
    try {
      const res = await fetch("https://www.studyperks.me/api/check-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });
      const data = await res.json();
      return data.eligible;
    } catch {
      return false;
    }
  }

  // First-time verification — confirms eligibility then applies discount via redirect
  async function checkTokenAndApply(walletAddress) {
    const eligible = await silentlyVerify(walletAddress);
    if (eligible) {
      localStorage.setItem("studyperks_applied", "true");
      localStorage.setItem("studyperks_wallet", walletAddress);
      window.location.href = `/discount/STUDYPERKS?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return true;
    }
    return false;
  }

  async function checkByEmail(email) {
    emailSubmit.textContent = "...";
    emailSubmit.disabled = true;
    emailInput.disabled = true;

    try {
      const res = await fetch("https://www.studyperks.me/api/check-token-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.eligible) {
        localStorage.setItem("studyperks_applied", "true");
        // Email sessions expire after 7 days and require re-verification
        localStorage.setItem("studyperks_expiry", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
        window.location.href = `/discount/STUDYPERKS?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      } else {
        emailInput.value = "";
        emailInput.placeholder = "No account — verify at studyperks.me";
        emailSubmit.textContent = "→";
        emailSubmit.disabled = false;
        emailInput.disabled = false;
        setTimeout(() => {
          emailInput.placeholder = "your@student.email";
        }, 4000);
      }
    } catch (err) {
      console.error("StudyPerks email check error:", err);
      emailSubmit.textContent = "→";
      emailSubmit.disabled = false;
      emailInput.disabled = false;
    }
  }

  // ── Silent verification on every page load ───────────────────────────────────
  // After 3 seconds with no wallet confirmation, fall back to email expiry or clear.
  // This prevents a permanently-ticked badge from persisting on wrong/removed wallets.
  const verifyTimeout = setTimeout(() => {
    if (verified) return;
    const expiry = localStorage.getItem("studyperks_expiry");
    if (expiry && Date.now() < parseInt(expiry, 10)) {
      setAppliedState();
    } else {
      clearState();
    }
  }, 3000);

  // Session bridge: fires if the student is logged into studyperks.me
  window.addEventListener("message", async (event) => {
    if (event.origin !== "https://www.studyperks.me") return;
    if (!event.data || event.data.type !== "studyperks_session") return;
    if (verified) return;
    clearTimeout(verifyTimeout);
    if (event.data.wallet) {
      const eligible = await silentlyVerify(event.data.wallet);
      if (eligible) {
        localStorage.setItem("studyperks_wallet", event.data.wallet);
        localStorage.setItem("studyperks_applied", "true");
        setAppliedState();
      } else {
        clearState();
      }
    } else {
      // Bridge responded but no wallet — honour email expiry if present
      const expiry = localStorage.getItem("studyperks_expiry");
      if (expiry && Date.now() < parseInt(expiry, 10)) {
        setAppliedState();
      } else {
        clearState();
      }
    }
  });

  // Silently re-verify wallet on load.
  // Prefer the live Phantom public key; fall back to the stored address so
  // verification works even when Phantom is installed but not actively connected.
  const walletToCheck = window.solana?.publicKey?.toString()
    || localStorage.getItem("studyperks_wallet");
  if (walletToCheck) {
    silentlyVerify(walletToCheck).then((eligible) => {
      if (verified) return;
      clearTimeout(verifyTimeout);
      if (eligible) {
        localStorage.setItem("studyperks_wallet", walletToCheck);
        localStorage.setItem("studyperks_applied", "true");
        setAppliedState();
      } else {
        clearState();
      }
    });
  }

  // Phantom disconnect/account switch → always reset
  if (window.solana) {
    window.solana.on("disconnect", resetState);
    window.solana.on("accountChanged", resetState);
  }

  // Close email prompt on outside click
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !emailPrompt?.contains(e.target)) {
      hideEmailPrompt();
    }
  });

  // Email handlers
  emailSubmit?.addEventListener("click", () => {
    const email = emailInput?.value?.trim();
    if (email) checkByEmail(email);
  });

  emailInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const email = emailInput.value.trim();
      if (email) checkByEmail(email);
    }
  });

  // Badge click
  btn.addEventListener("click", async () => {
    if (window.solana?.isPhantom) {
      btn.disabled = true;
      if (tooltip) { tooltip.style.visibility = ""; tooltip.textContent = "Connecting..."; }
      try {
        const resp = await window.solana.connect();
        const walletAddress = resp.publicKey.toString();
        if (tooltip) tooltip.textContent = "Verifying...";
        const eligible = await checkTokenAndApply(walletAddress);
        if (!eligible) {
          if (tooltip) tooltip.textContent = "No StudyPerks token found";
          setTimeout(() => {
            if (tooltip) tooltip.textContent = "Student discount — click to claim";
            btn.disabled = false;
          }, 3000);
        }
      } catch (err) {
        console.error("StudyPerks error:", err);
        if (tooltip) tooltip.textContent = "Student discount — click to claim";
        btn.disabled = false;
      }
      return;
    }

    showEmailPrompt();
  });
});
