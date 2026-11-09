document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".studyperks-wrapper").forEach((wrapper) => {
  const btn = wrapper.querySelector("#studyperks-wallet-connect");
  if (!btn) return;
  const tooltip = wrapper.querySelector("#studyperks-tooltip");
  const emailPrompt = wrapper.querySelector("#studyperks-email-prompt");
  const emailInput = wrapper.querySelector("#studyperks-email-input");
  const emailSubmit = wrapper.querySelector("#studyperks-email-submit");
  const emailMessage = wrapper.querySelector("#studyperks-email-message");
  const verifyLink = wrapper.querySelector("#studyperks-verify-link");
  const accountMenu = wrapper.querySelector("#studyperks-account-menu");
  const disconnectBtn = wrapper.querySelector("#studyperks-disconnect");
  const inlineDisconnectBtn = wrapper.querySelector("#studyperks-disconnect-inline");
  const toast = wrapper.querySelector("#studyperks-toast");
  // Keep interactive panels outside transformed or clipped theme sections.
  [emailPrompt, accountMenu, toast, tooltip].forEach((element) => {
    if (element) document.body.appendChild(element);
  });
  let applied = localStorage.getItem("studyperks_applied") === "true"
    && localStorage.getItem("studyperks_security_version") === "3";
  let busy = false;

  const shop = wrapper?.dataset.shop;
  const defaultTooltipText = () => tooltip?.dataset.defaultText || "Student discount — click to claim";

  function positionFloating(element, width = 240) {
    if (!element) return;
    const rect = btn.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const x = viewport?.offsetLeft ?? 0;
    const y = viewport?.offsetTop ?? 0;
    const panel = element === emailPrompt || element === accountMenu;
    if (panel) {
      element.style.maxWidth = `${Math.max(0, viewportWidth - 16)}px`;
      element.style.maxHeight = `${Math.max(0, viewportHeight - 16)}px`;
    }
    const bounds = element.getBoundingClientRect();
    const actualWidth = bounds.width || width;
    const mobile = panel && window.innerWidth <= 600;
    const left = mobile
      ? x + (viewportWidth - actualWidth) / 2
      : Math.max(x + 8, Math.min(rect.left, x + viewportWidth - actualWidth - 8));
    const top = mobile
      ? y + (viewportHeight - bounds.height) / 2
      : Math.max(y + 8, Math.min(rect.bottom + 8, y + viewportHeight - bounds.height - 8));
    element.style.top = `${Math.round(top)}px`;
    element.style.left = `${Math.round(left)}px`;
  }
  function hideEmailPrompt() {
    emailPrompt?.classList.remove("studyperks-email-prompt--visible");
    wrapper?.classList.remove("studyperks-prompt-open");
  }
  function hideTooltip() {
    tooltip?.classList.remove("studyperks-tooltip--visible");
  }
  function showTooltip() {
    if (applied || emailPrompt?.classList.contains("studyperks-email-prompt--visible")) return;
    tooltip?.classList.add("studyperks-tooltip--visible");
    positionFloating(tooltip);
  }
  function showEmailPrompt(message) {
    hideTooltip();
    emailPrompt?.classList.add("studyperks-email-prompt--visible");
    wrapper?.classList.add("studyperks-prompt-open");
    if (message && emailMessage) {
      emailMessage.textContent = message;
      emailMessage.classList.add("studyperks-email-prompt__message--visible");
    }
    verifyLink?.classList.add("studyperks-email-prompt__link--visible");
    positionFloating(emailPrompt, 300);
    emailInput?.focus({ preventScroll: true });
  }
  function setAppliedState(broadcast = true) {
    applied = true;
    busy = false;
    localStorage.setItem("studyperks_applied", "true");
    localStorage.setItem("studyperks_security_version", "3");
    btn.disabled = false;
    btn.classList.add("studyperks-badge--applied");
    wrapper?.classList.add("studyperks-wrapper--applied");
    btn.setAttribute("aria-label", "StudyPerks — student discount applied, click to manage");
    hideEmailPrompt();
    if (tooltip) tooltip.classList.add("studyperks-tooltip--hidden");
    if (toast && !sessionStorage.getItem("studyperks_toast_shown")) {
      sessionStorage.setItem("studyperks_toast_shown", "true");
      toast.classList.add("studyperks-toast--visible");
      setTimeout(() => toast.classList.remove("studyperks-toast--visible"), 9000);
    }
    if (broadcast) window.dispatchEvent(new CustomEvent("studyperks:badge-state", { detail: { applied: true } }));
  }
  function clearState(broadcast = false) {
    applied = false;
    busy = false;
    localStorage.removeItem("studyperks_applied");
    localStorage.removeItem("studyperks_security_version");
    localStorage.removeItem("studyperks_wallet");
    btn.disabled = false;
    btn.classList.remove("studyperks-badge--applied");
    wrapper?.classList.remove("studyperks-wrapper--applied");
    accountMenu?.classList.remove("studyperks-account-menu--visible");
    if (tooltip) {
      tooltip.classList.remove("studyperks-tooltip--hidden");
      tooltip.textContent = defaultTooltipText();
    }
    if (broadcast) window.dispatchEvent(new CustomEvent("studyperks:badge-state", { detail: { applied: false } }));
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
  async function applyDiscountToCart(code) {
    const cartRoot = window.Shopify?.routes?.root || "/";
    try {
      const response = await fetch(`${cartRoot}cart/update.js`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ discount: code }),
      });
      if (!response.ok) return false;
      const cart = await response.json();
      return Boolean(cart && typeof cart === "object" && !cart.status);
    } catch {
      return false;
    }
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
    const appliedWithoutReload = await applyDiscountToCart(code);
    if (!appliedWithoutReload) {
      window.location.href = `/discount/${code}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    setAppliedState();
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
    window.__studyPerksActiveAuthorizationHandler = (authorization) => {
      busy = false;
      applyAuthorization(authorization);
    };
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
      window.__studyPerksActiveAuthorizationHandler = null;
      popup.close();
      busy = false;
      showEmailPrompt("StudyPerks could not start securely. Please try again.");
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== "https://www.studyperks.me") return;
    if (event.data?.type !== "studyperks_redemption_authorization") return;
    if (typeof event.data.authorization !== "string") return;
    // Route the one-use grant only to the badge that opened the popup. Multiple
    // badge placements must not race to redeem the same authorization.
    const handler = window.__studyPerksActiveAuthorizationHandler;
    if (typeof handler !== "function") return;
    window.__studyPerksActiveAuthorizationHandler = null;
    handler(event.data.authorization);
  });

  window.addEventListener("studyperks:badge-state", (event) => {
    if (event.detail?.applied) setAppliedState(false);
    else if (event.detail?.applied === false) clearState(false);
  });

  emailSubmit?.addEventListener("click", () => openStudyPerks(emailInput?.value?.trim()));
  emailInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openStudyPerks(emailInput.value.trim());
  });
  disconnectBtn?.addEventListener("click", () => clearState(true));
  inlineDisconnectBtn?.addEventListener("click", () => clearState(true));
  document.addEventListener("click", (event) => {
    if (!btn.contains(event.target) && !emailPrompt?.contains(event.target)) hideEmailPrompt();
    if (!btn.contains(event.target) && !accountMenu?.contains(event.target)) accountMenu?.classList.remove("studyperks-account-menu--visible");
  });
  btn.addEventListener("mouseenter", showTooltip);
  btn.addEventListener("mouseleave", hideTooltip);
  btn.addEventListener("focus", showTooltip);
  btn.addEventListener("blur", hideTooltip);
  function repositionPanels() {
    if (tooltip?.classList.contains("studyperks-tooltip--visible")) positionFloating(tooltip);
    if (emailPrompt?.classList.contains("studyperks-email-prompt--visible")) positionFloating(emailPrompt, 300);
    if (accountMenu?.classList.contains("studyperks-account-menu--visible")) positionFloating(accountMenu, 220);
  }
  window.addEventListener("resize", repositionPanels);
  window.addEventListener("scroll", repositionPanels, { passive: true });
  window.visualViewport?.addEventListener("resize", repositionPanels);
  window.visualViewport?.addEventListener("scroll", repositionPanels);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
      hideEmailPrompt();
      accountMenu?.classList.remove("studyperks-account-menu--visible");
    }
  });

  if (applied) setAppliedState();
  else clearState();

  btn.addEventListener("click", async () => {
    if (applied) {
      accountMenu?.classList.add("studyperks-account-menu--visible");
      positionFloating(accountMenu, 220);
      return;
    }
    // Start with the small inline prompt so students understand what is
    // happening. Submitting it opens the secure StudyPerks window. The server
    // still requires a verified StudyPerks session; email alone never
    // grants a discount.
    showEmailPrompt("Enter your student email to receive your student discount.");
  });
  });
});
