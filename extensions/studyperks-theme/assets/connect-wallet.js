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
  const phantomLink = document.getElementById("studyperks-phantom-link");
  const accountMenu = document.getElementById("studyperks-account-menu");
  const disconnectBtn = document.getElementById("studyperks-disconnect");
  const toast = document.getElementById("studyperks-toast");
  let applied = localStorage.getItem("studyperks_applied") === "true"
    && localStorage.getItem("studyperks_security_version") === "3";
  let busy = false;

  const shop = wrapper?.dataset.shop;
  const defaultTooltipText = () => tooltip?.dataset.defaultText || "Student discount — click to claim";

  function positionFloating(element, width = 240) {
    if (!element) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    element.style.top = `${Math.round(rect.bottom + 8)}px`;
    element.style.left = `${Math.round(left)}px`;
  }
  function hideEmailPrompt() {
    emailPrompt?.classList.remove("studyperks-email-prompt--visible");
    wrapper?.classList.remove("studyperks-prompt-open");
  }
  function showEmailPrompt(message) {
    positionFloating(emailPrompt);
    emailPrompt?.classList.add("studyperks-email-prompt--visible");
    wrapper?.classList.add("studyperks-prompt-open");
    if (message && emailMessage) {
      emailMessage.textContent = message;
      emailMessage.classList.add("studyperks-email-prompt__message--visible");
    }
    emailInput?.focus();
  }
  function setAppliedState() {
    applied = true;
    busy = false;
    localStorage.setItem("studyperks_applied", "true");
    localStorage.setItem("studyperks_security_version", "3");
    btn.disabled = false;
    btn.classList.add("studyperks-badge--applied");
    btn.setAttribute("aria-label", "StudyPerks — student discount applied, click to manage");
    hideEmailPrompt();
    if (tooltip) tooltip.classList.add("studyperks-tooltip--hidden");
    if (toast && !sessionStorage.getItem("studyperks_toast_shown")) {
      sessionStorage.setItem("studyperks_toast_shown", "true");
      toast.classList.add("studyperks-toast--visible");
      setTimeout(() => toast.classList.remove("studyperks-toast--visible"), 5000);
    }
  }
  function clearState() {
    applied = false;
    busy = false;
    localStorage.removeItem("studyperks_applied");
    localStorage.removeItem("studyperks_security_version");
    localStorage.removeItem("studyperks_wallet");
    btn.disabled = false;
    btn.classList.remove("studyperks-badge--applied");
    accountMenu?.classList.remove("studyperks-account-menu--visible");
    if (tooltip) {
      tooltip.classList.remove("studyperks-tooltip--hidden");
      tooltip.textContent = defaultTooltipText();
    }
  }

  async function claimDiscountCode(authorization) {
    if (!shop || !authorization) return null;
    const response = await fetch("https://app.studyperks.me/discount-code", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ shop, authorization }),
    });
    if (!response.ok) return null;
    return (await response.json()).code || null;
  }
  async function applyAuthorization(authorization) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    if (tooltip) tooltip.textContent = "Applying discount...";
    const code = await claimDiscountCode(authorization);
    if (!code) {
      clearState();
      showEmailPrompt("We couldn't verify this request. Please try again.");
      return;
    }
    setAppliedState();
    window.location.href = `/discount/${code}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  async function createPhantomAuthorization() {
    if (!window.solana?.isPhantom || !window.solana.signMessage) return null;
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
    return (await verifyResponse.json()).session || null;
  }

  async function openStudyPerks(email = "") {
    if (busy || !shop) return;
    busy = true;
    // Open synchronously on the click so browser popup protection does not
    // block the secure first-party Privy window.
    const width = 390;
    const height = 300;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open("about:blank", "studyperks-connect", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      busy = false;
      showEmailPrompt("Please allow the StudyPerks sign-in window to continue.");
      return;
    }
    try {
      const response = await fetch("https://app.studyperks.me/redemption-start", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ shop, origin: window.location.origin }),
      });
      if (!response.ok) throw new Error("start failed");
      const data = await response.json();
      const url = new URL(data.url);
      if (email) url.searchParams.set("email", email);
      popup.location.replace(url.toString());
      hideEmailPrompt();
    } catch {
      popup.close();
      busy = false;
      showEmailPrompt("StudyPerks could not start securely. Please try again.");
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== "https://www.studyperks.me") return;
    if (event.data?.type !== "studyperks_redemption_authorization") return;
    if (typeof event.data.authorization !== "string") return;
    applyAuthorization(event.data.authorization);
  });

  emailSubmit?.addEventListener("click", () => openStudyPerks(emailInput?.value?.trim()));
  if (phantomLink && window.solana?.isPhantom) phantomLink.style.display = "block";
  phantomLink?.addEventListener("click", async () => {
    busy = true;
    try {
      const authorization = await createPhantomAuthorization();
      if (authorization) await applyAuthorization(authorization);
      else { busy = false; showEmailPrompt("Phantom connection was not completed."); }
    } catch { busy = false; showEmailPrompt("Phantom connection was not completed."); }
  });
  emailInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openStudyPerks(emailInput.value.trim());
  });
  verifyLink?.addEventListener("click", (event) => {
    event.preventDefault();
    openStudyPerks(emailInput?.value?.trim());
  });
  disconnectBtn?.addEventListener("click", () => clearState());
  document.addEventListener("click", (event) => {
    if (!btn.contains(event.target) && !emailPrompt?.contains(event.target)) hideEmailPrompt();
    if (!btn.contains(event.target) && !accountMenu?.contains(event.target)) accountMenu?.classList.remove("studyperks-account-menu--visible");
  });
  wrapper?.addEventListener("mouseenter", () => positionFloating(tooltip));

  if (applied) setAppliedState();
  else clearState();

  btn.addEventListener("click", async () => {
    if (applied) {
      positionFloating(accountMenu, 220);
      accountMenu?.classList.add("studyperks-account-menu--visible");
      return;
    }
    // Start with the small inline prompt so students understand what is
    // happening. Submitting it opens the secure StudyPerks window. The server
    // still requires a Privy session or Phantom signature; email alone never
    // grants a discount.
    showEmailPrompt("We’ll securely check your student pass.");
  });
});
