document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("studyperks-wallet-connect");
  const tooltip = document.getElementById("studyperks-tooltip");
  const emailPrompt = document.getElementById("studyperks-email-prompt");
  const emailInput = document.getElementById("studyperks-email-input");
  const emailSubmit = document.getElementById("studyperks-email-submit");
  const emailMessage = document.getElementById("studyperks-email-message");
  const verifyLink = document.getElementById("studyperks-verify-link");
  const toast = document.getElementById("studyperks-toast");
  const wrapper = btn.closest(".studyperks-wrapper");
  if (!btn) return;

  const defaultTooltipText = () =>
    (tooltip && tooltip.dataset.defaultText) || "Student discount — click to claim";

  // Claims a fresh, single-use discount code for this shop instead of using
  // a shared guessable word — see 2026-08-03 security fix. Returns null on
  // any failure so callers can show an error rather than silently falling
  // back to something insecure.
  // identifier is { wallet } or { email } — the server independently
  // re-verifies eligibility with it rather than trusting this call alone,
  // since this endpoint can be reached directly, bypassing the widget
  // entirely — see 2026-08-04 fix.
  async function claimDiscountCode(identifier) {
    const shop = wrapper?.dataset.shop;
    if (!shop) return null;
    try {
      // text/plain avoids a CORS preflight (OPTIONS) round-trip — Remix's dev
      // server intercepts OPTIONS before it reaches our route handler, so a
      // "simple" request that skips preflight entirely is the reliable fix.
      // The server still parses the body as JSON regardless of this header.
      const res = await fetch("https://app.studyperks.me/discount-code", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ shop, ...identifier }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.code || null;
    } catch {
      return null;
    }
  }

  // Fixed-position popups need their coordinates computed from the button's
  // actual screen position — themes with a sticky header often clip
  // absolutely-positioned overflow, which cut these off before.
  // widthEstimate keeps the popup fully on-screen when the icon sits near
  // the right edge (e.g. a header with icons on the right on mobile) —
  // without this the box, and the tappable arrow inside it, run off-screen.
  function positionFloating(el, widthEstimate = 240) {
    if (!el) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - widthEstimate - margin;
    const left = Math.min(rect.left, Math.max(margin, maxLeft));
    el.style.top = `${Math.round(rect.bottom + 8)}px`;
    el.style.left = `${Math.round(left)}px`;
  }

  let verified = false;

  // Hide tooltip while silently verifying — no flash of wrong state
  if (tooltip) tooltip.style.visibility = "hidden";

  // Shows the "you're verified" confirmation once per browser session,
  // so it reassures without nagging on every page load.
  function showVerifiedToast() {
    if (!toast || sessionStorage.getItem("studyperks_toast_shown")) return;
    sessionStorage.setItem("studyperks_toast_shown", "true");
    toast.classList.add("studyperks-toast--visible");
    setTimeout(() => toast.classList.remove("studyperks-toast--visible"), 5000);
  }

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
    showVerifiedToast();
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
      tooltip.textContent = defaultTooltipText();
    }
  }

  // Called by Phantom disconnect/accountChanged — always clears regardless of verified state
  function resetState() {
    verified = false;
    clearState();
  }

  function showEmailPrompt() {
    if (emailPrompt) {
      positionFloating(emailPrompt, 220);
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

  // First-time verification — confirms eligibility, claims a fresh single-use
  // code, then applies it via redirect
  async function checkTokenAndApply(walletAddress) {
    const eligible = await silentlyVerify(walletAddress);
    if (!eligible) return false;

    const code = await claimDiscountCode({ wallet: walletAddress });
    if (!code) {
      if (tooltip) tooltip.textContent = "Something went wrong — please try again";
      return "code_error";
    }

    localStorage.setItem("studyperks_applied", "true");
    localStorage.setItem("studyperks_wallet", walletAddress);
    window.location.href = `/discount/${code}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return true;
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
        const code = await claimDiscountCode({ email });
        if (!code) {
          emailSubmit.textContent = "→";
          emailSubmit.disabled = false;
          emailInput.disabled = false;
          if (emailMessage) {
            emailMessage.textContent = "Something went wrong — please try again.";
            emailMessage.classList.add("studyperks-email-prompt__message--visible");
            setTimeout(() => {
              emailMessage.classList.remove("studyperks-email-prompt__message--visible");
            }, 5000);
          }
          return;
        }

        localStorage.setItem("studyperks_applied", "true");
        // Email sessions expire after 7 days and require re-verification
        localStorage.setItem("studyperks_expiry", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
        window.location.href = `/discount/${code}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      } else {
        emailInput.value = "";
        emailSubmit.textContent = "→";
        emailSubmit.disabled = false;
        emailInput.disabled = false;
        if (emailMessage) {
          // Stays visible until the prompt itself is closed (outside click) or
          // resubmitted — a 5s auto-hide didn't leave enough time to read the
          // message and click the verify link.
          emailMessage.textContent =
            emailMessage.dataset.notEligibleText ||
            "Go to StudyPerks to verify your student status — takes 30 seconds.";
          emailMessage.classList.add("studyperks-email-prompt__message--visible");
          verifyLink?.classList.add("studyperks-email-prompt__link--visible");
        }
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

  // Recompute the tooltip's fixed position right before it becomes visible via CSS :hover
  btn.closest(".studyperks-wrapper")?.addEventListener("mouseenter", () => positionFloating(tooltip));

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
        if (eligible === false) {
          if (tooltip) tooltip.textContent = "No StudyPerks token found";
          setTimeout(() => {
            if (tooltip) tooltip.textContent = defaultTooltipText();
            btn.disabled = false;
          }, 3000);
        } else if (eligible === "code_error") {
          // Tooltip text already set inside checkTokenAndApply
          setTimeout(() => {
            if (tooltip) tooltip.textContent = defaultTooltipText();
            btn.disabled = false;
          }, 3000);
        }
      } catch (err) {
        console.error("StudyPerks error:", err);
        if (tooltip) tooltip.textContent = defaultTooltipText();
        btn.disabled = false;
      }
      return;
    }

    showEmailPrompt();
  });
});
