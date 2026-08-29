document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("studyperks-wallet-connect");
  if (!btn) return;

  const wrapper = btn.closest(".studyperks-wrapper");
  const tooltip = document.getElementById("studyperks-tooltip");
  const emailPrompt = document.getElementById("studyperks-email-prompt");
  const emailInput = document.getElementById("studyperks-email-input");
  const emailSubmit = document.getElementById("studyperks-email-submit");
  const emailMessage = document.getElementById("studyperks-email-message");
  const verifyLink = document.getElementById("studyperks-verify-link");
  const accountMenu = document.getElementById("studyperks-account-menu");
  const disconnectBtn = document.getElementById("studyperks-disconnect");
  const toast = document.getElementById("studyperks-toast");
  const sessionBridge = document.getElementById("studyperks-session-bridge");
  const verificationModal = document.getElementById("studyperks-verification-modal");
  const verificationFrame = document.getElementById("studyperks-verification-frame");
  const verificationClose = document.getElementById("studyperks-verification-close");
  const verificationBackdrop = document.getElementById("studyperks-verification-backdrop");

  let redemptionSession = null;
  let bridgePoll = null;
  let claiming = false;
  let applied = localStorage.getItem("studyperks_applied") === "true"
    && localStorage.getItem("studyperks_security_version") === "2";

  const defaultTooltipText = () =>
    tooltip?.dataset.defaultText || "Student discount — click to claim";

  function positionFloating(element, widthEstimate = 240) {
    if (!element) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(rect.left, Math.max(margin, window.innerWidth - widthEstimate - margin));
    element.style.top = `${Math.round(rect.bottom + 8)}px`;
    element.style.left = `${Math.round(left)}px`;
  }

  function hideEmailPrompt() {
    emailPrompt?.classList.remove("studyperks-email-prompt--visible");
    wrapper?.classList.remove("studyperks-prompt-open");
  }

  function showEmailPrompt(message) {
    if (!emailPrompt) return;
    positionFloating(emailPrompt, 240);
    emailPrompt.classList.add("studyperks-email-prompt--visible");
    wrapper?.classList.add("studyperks-prompt-open");
    if (message && emailMessage) {
      emailMessage.textContent = message;
      emailMessage.classList.add("studyperks-email-prompt__message--visible");
      verifyLink?.classList.add("studyperks-email-prompt__link--visible");
    }
    emailInput?.focus();
  }

  function hideAccountMenu() {
    accountMenu?.classList.remove("studyperks-account-menu--visible");
  }

  function setAppliedState() {
    applied = true;
    localStorage.setItem("studyperks_applied", "true");
    localStorage.setItem("studyperks_security_version", "2");
    btn.classList.add("studyperks-badge--applied");
    btn.setAttribute("aria-label", "StudyPerks — student discount applied, click to manage");
    hideEmailPrompt();
    if (tooltip) {
      tooltip.classList.add("studyperks-tooltip--hidden");
      tooltip.style.visibility = "";
    }
    if (toast && !sessionStorage.getItem("studyperks_toast_shown")) {
      sessionStorage.setItem("studyperks_toast_shown", "true");
      toast.classList.add("studyperks-toast--visible");
      setTimeout(() => toast.classList.remove("studyperks-toast--visible"), 5000);
    }
  }

  function clearState() {
    applied = false;
    redemptionSession = null;
    localStorage.removeItem("studyperks_applied");
    localStorage.removeItem("studyperks_wallet");
    localStorage.removeItem("studyperks_expiry");
    localStorage.removeItem("studyperks_security_version");
    btn.classList.remove("studyperks-badge--applied");
    btn.disabled = false;
    hideAccountMenu();
    if (tooltip) {
      tooltip.style.visibility = "";
      tooltip.classList.remove("studyperks-tooltip--hidden");
      tooltip.textContent = defaultTooltipText();
    }
  }

  async function claimDiscountCode(session) {
    const shop = wrapper?.dataset.shop;
    if (!shop || !session) return null;
    try {
      const response = await fetch("https://app.studyperks.me/discount-code", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ shop, session }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.code || null;
    } catch {
      return null;
    }
  }

  async function applyAuthenticatedDiscount(session) {
    if (claiming) return false;
    claiming = true;
    btn.disabled = true;
    if (tooltip) {
      tooltip.style.visibility = "";
      tooltip.textContent = "Verifying...";
    }
    const code = await claimDiscountCode(session);
    if (!code) {
      claiming = false;
      clearState();
      showEmailPrompt("Your login has expired. Verify your student email again to claim the discount.");
      return false;
    }
    setAppliedState();
    window.location.href = `/discount/${code}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return true;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  async function createWalletSession() {
    if (!window.solana?.isPhantom || !window.solana.signMessage) return null;
    const shop = wrapper?.dataset.shop;
    const connection = await window.solana.connect();
    const wallet = connection.publicKey.toString();
    const challengeResponse = await fetch("https://www.studyperks.me/api/wallet-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, shop }),
    });
    if (!challengeResponse.ok) return null;
    const { message, challenge } = await challengeResponse.json();
    const signed = await window.solana.signMessage(new TextEncoder().encode(message), "utf8");
    const verifyResponse = await fetch("https://www.studyperks.me/api/wallet-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, shop, challenge, signature: bytesToBase64(signed.signature) }),
    });
    if (!verifyResponse.ok) return null;
    const result = await verifyResponse.json();
    return result.verified === true ? result.session : null;
  }

  // The iframe sends the signed 30-minute credential produced after Privy OTP
  // verification. The wallet/email beside it is deliberately ignored.
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://www.studyperks.me") return;
    if (event.data?.type === "studyperks_verification_complete"
      && verificationFrame && event.source === verificationFrame.contentWindow) {
      refreshSessionBridge();
      return;
    }
    if (sessionBridge && event.source !== sessionBridge.contentWindow) return;
    if (!event.data || event.data.type !== "studyperks_session") return;
    redemptionSession = typeof event.data.session === "string" ? event.data.session : null;
    if (applied) setAppliedState();
    if (redemptionSession && verificationModal?.classList.contains("studyperks-verification-modal--visible")) {
      closeVerificationModal();
      applyAuthenticatedDiscount(redemptionSession);
    }
  });

  // The bridge may have loaded before the student completed OTP in the new
  // tab. Refresh it when they return so it can deliver the new session.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sessionBridge && !redemptionSession) {
      sessionBridge.src = `https://www.studyperks.me/session-bridge?t=${Date.now()}`;
    }
  });

  function refreshSessionBridge() {
    if (sessionBridge) sessionBridge.src = `https://www.studyperks.me/session-bridge?t=${Date.now()}`;
  }

  function closeVerificationModal() {
    verificationModal?.classList.remove("studyperks-verification-modal--visible");
    verificationModal?.setAttribute("aria-hidden", "true");
    document.documentElement.style.removeProperty("overflow");
    if (bridgePoll) clearInterval(bridgePoll);
    bridgePoll = null;
  }

  function startEmailVerification() {
    const email = emailInput?.value?.trim();
    const url = new URL(verificationFrame?.dataset.src || "https://www.studyperks.me/get-Verified?embed=shopify");
    if (email) url.searchParams.set("email", email);
    if (emailMessage) {
      emailMessage.textContent = "You must receive and enter the Privy code before a discount can be issued.";
      emailMessage.classList.add("studyperks-email-prompt__message--visible");
    }
    verifyLink?.classList.add("studyperks-email-prompt__link--visible");
    hideEmailPrompt();
    if (!verificationFrame || !verificationModal) return;
    verificationFrame.src = url.toString();
    verificationModal.classList.add("studyperks-verification-modal--visible");
    verificationModal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    verificationClose?.focus();
    if (bridgePoll) clearInterval(bridgePoll);
    bridgePoll = setInterval(refreshSessionBridge, 1500);
  }

  emailSubmit?.addEventListener("click", startEmailVerification);
  verifyLink?.addEventListener("click", (event) => {
    event.preventDefault();
    startEmailVerification();
  });
  emailInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startEmailVerification();
  });
  verificationClose?.addEventListener("click", closeVerificationModal);
  verificationBackdrop?.addEventListener("click", closeVerificationModal);

  disconnectBtn?.addEventListener("click", async () => {
    try { await window.solana?.disconnect?.(); } catch { /* local state still clears */ }
    clearState();
  });
  window.solana?.on?.("disconnect", clearState);
  window.solana?.on?.("accountChanged", clearState);

  document.addEventListener("click", (event) => {
    if (!btn.contains(event.target) && !emailPrompt?.contains(event.target)) hideEmailPrompt();
    if (!btn.contains(event.target) && !accountMenu?.contains(event.target)) hideAccountMenu();
  });
  wrapper?.addEventListener("mouseenter", () => positionFloating(tooltip));

  if (applied) setAppliedState();
  else {
    clearState();
    if (tooltip) tooltip.style.visibility = "";
  }

  btn.addEventListener("click", async () => {
    if (applied) {
      positionFloating(accountMenu, 220);
      accountMenu?.classList.add("studyperks-account-menu--visible");
      return;
    }
    if (redemptionSession) {
      await applyAuthenticatedDiscount(redemptionSession);
      return;
    }
    if (window.solana?.isPhantom) {
      btn.disabled = true;
      try {
        redemptionSession = await createWalletSession();
        if (redemptionSession) {
          await applyAuthenticatedDiscount(redemptionSession);
          return;
        }
      } catch (error) {
        console.error("StudyPerks wallet verification failed:", error);
      }
      btn.disabled = false;
    }
    showEmailPrompt("Verify your student email with Privy, then return here to claim your discount.");
  });
});
