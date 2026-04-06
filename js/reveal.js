/* ============================================
   KokKok — Reveal Page (reveal.js)
   ============================================ */

(function () {
  "use strict";

  const screens = document.querySelectorAll(".screen");

  function showScreen(id) {
    screens.forEach((el) => el.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
  }

  function formatPhoneDisplay(phone) {
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length === 11) {
      return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
    }
    if (digits.length === 10) {
      return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
    }
    return phone;
  }

  async function loadReveal() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");

    if (!token) {
      showScreen("screen-error");
      return;
    }

    try {
      const data = await supabaseClient.getReveal(token);

      if (data.matched) {
        // Matched — show partner info
        document.getElementById("partner-name").textContent = data.partner_name;
        document.getElementById("partner-phone").textContent = formatPhoneDisplay(data.partner_phone);
        showScreen("screen-matched");
      } else {
        // Not matched — show hint if available
        if (data.hint_text) {
          const hintEl = document.getElementById("reveal-hint");
          hintEl.textContent = data.hint_text;
          hintEl.style.display = "block";
        }
        showScreen("screen-not-matched");
      }
    } catch (err) {
      console.error("Reveal error:", err);
      showScreen("screen-error");
    }
  }

  document.addEventListener("DOMContentLoaded", loadReveal);
})();
