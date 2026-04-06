/* ============================================
   KokKok — Sender Flow (app.js)
   ============================================ */

(function () {
  "use strict";

  // --- State ---
  let currentStep = 0;
  let verificationToken = null;

  // --- DOM refs ---
  const steps = document.querySelectorAll(".step");
  const inputName = document.getElementById("input-name");
  const btnNameNext = document.getElementById("btn-name-next");
  const inputPhone = document.getElementById("input-phone");
  const btnSendCode = document.getElementById("btn-send-code");
  const phoneStatus = document.getElementById("phone-status");
  const codeGroup = document.getElementById("code-group");
  const inputCode = document.getElementById("input-code");
  const codeStatus = document.getElementById("code-status");
  const btnPhoneNext = document.getElementById("btn-phone-next");
  const inputTarget = document.getElementById("input-target");
  const inputHint = document.getElementById("input-hint");
  const hintCount = document.getElementById("hint-count");
  const btnSubmit = document.getElementById("btn-submit");
  const splashOrb = document.getElementById("splash-orb");
  const btnReset = document.getElementById("btn-reset");

  // --- Step Navigation ---
  function goStep(step) {
    steps.forEach((el) => el.classList.remove("active"));
    steps[step].classList.add("active");
    currentStep = step;

    // Auto-focus first input after transition
    setTimeout(() => {
      const firstInput = steps[step].querySelector("input, textarea");
      if (firstInput) firstInput.focus();
    }, 400);
  }

  // --- Phone Formatting ---
  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, "");
    return /^01[016789]\d{7,8}$/.test(digits);
  }

  // --- Status Message Helpers ---
  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = "status-msg show " + type;
  }

  function hideStatus(el) {
    el.className = "status-msg";
  }

  // --- Send Verification ---
  async function sendVerification() {
    const phone = inputPhone.value.replace(/\D/g, "");
    if (!isValidPhone(phone)) {
      showStatus(phoneStatus, "올바른 전화번호를 입력해주세요.", "error");
      return;
    }

    btnSendCode.disabled = true;
    btnSendCode.innerHTML = '<span class="spinner"></span>';
    hideStatus(phoneStatus);

    try {
      await supabaseClient.sendVerification(phone);
      codeGroup.classList.add("show");
      showStatus(phoneStatus, "인증번호가 전송되었어요!", "success");
      inputCode.focus();
    } catch (err) {
      showStatus(phoneStatus, err.message || "전송에 실패했어요. 다시 시도해주세요.", "error");
    } finally {
      btnSendCode.disabled = false;
      btnSendCode.textContent = "재전송";
    }
  }

  // --- Verify Code ---
  async function verifyCode() {
    const phone = inputPhone.value.replace(/\D/g, "");
    const code = inputCode.value.trim();
    if (code.length !== 6) return;

    inputCode.disabled = true;
    hideStatus(codeStatus);

    try {
      const result = await supabaseClient.verifyCode(phone, code);
      verificationToken = result.token;
      showStatus(codeStatus, "인증 완료!", "success");
      btnPhoneNext.disabled = false;
      inputPhone.disabled = true;
      btnSendCode.disabled = true;
      inputCode.disabled = true;
    } catch (err) {
      showStatus(codeStatus, err.message || "인증번호가 일치하지 않아요.", "error");
      inputCode.disabled = false;
      inputCode.value = "";
      inputCode.focus();
    }
  }

  // --- Submit KokKok ---
  async function submitKokkok() {
    const senderName = inputName.value.trim();
    const senderPhone = inputPhone.value.replace(/\D/g, "");
    const targetPhone = inputTarget.value.replace(/\D/g, "");
    const hintText = inputHint.value.trim();

    if (!isValidPhone(targetPhone)) return;

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span>';

    try {
      await supabaseClient.submitKokkok(
        senderName,
        senderPhone,
        targetPhone,
        hintText,
        verificationToken
      );
      goStep(4);
      spawnParticles();
    } catch (err) {
      alert(err.message || "전송에 실패했어요. 다시 시도해주세요.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "콕!";
    }
  }

  // --- Completion Particles (glowing orbs, not emoji) ---
  function spawnParticles() {
    const colors = [
      "rgba(255, 92, 138, 0.8)",
      "rgba(255, 138, 175, 0.7)",
      "rgba(255, 122, 110, 0.6)",
      "rgba(255, 184, 108, 0.5)",
      "rgba(255, 200, 200, 0.4)",
    ];

    for (let i = 0; i < 20; i++) {
      const el = document.createElement("div");
      el.className = "particle";
      const size = 4 + Math.random() * 12;
      const color = colors[Math.floor(Math.random() * colors.length)];
      el.style.cssText = `
        left: ${15 + Math.random() * 70}%;
        bottom: ${10 + Math.random() * 20}%;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        box-shadow: 0 0 ${size * 2}px ${color};
        animation-duration: ${2 + Math.random() * 3}s;
        animation-delay: ${Math.random() * 1.5}s;
      `;
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    }
  }

  // --- Orb ripple on touch ---
  function createRipple(x, y) {
    const ripple = document.createElement("div");
    ripple.style.cssText = `
      position: fixed;
      left: ${x}px; top: ${y}px;
      width: 4px; height: 4px;
      border-radius: 50%;
      background: transparent;
      border: 2px solid rgba(255, 92, 138, 0.6);
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 50;
      animation: rippleOut 800ms ease-out forwards;
    `;
    document.body.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  // --- Reset ---
  function resetApp() {
    inputName.value = "";
    inputPhone.value = "";
    inputPhone.disabled = false;
    inputCode.value = "";
    inputCode.disabled = false;
    inputTarget.value = "";
    inputHint.value = "";
    hintCount.textContent = "0";
    btnNameNext.disabled = true;
    btnSendCode.disabled = false;
    btnSendCode.textContent = "인증번호 받기";
    btnPhoneNext.disabled = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = "콕!";
    codeGroup.classList.remove("show");
    hideStatus(phoneStatus);
    hideStatus(codeStatus);
    verificationToken = null;
    goStep(0);
  }

  // --- Event Listeners ---
  document.addEventListener("DOMContentLoaded", function () {
    // Splash orb click → start
    splashOrb.addEventListener("click", (e) => {
      createRipple(e.clientX, e.clientY);
      setTimeout(() => goStep(1), 400);
    });
    splashOrb.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goStep(1);
      }
    });

    // Back buttons
    document.getElementById("back-1").addEventListener("click", () => goStep(0));
    document.getElementById("back-2").addEventListener("click", () => goStep(1));
    document.getElementById("back-3").addEventListener("click", () => goStep(2));

    // Step 1: Name input
    inputName.addEventListener("input", () => {
      btnNameNext.disabled = inputName.value.trim().length === 0;
    });
    btnNameNext.addEventListener("click", () => goStep(2));

    // Step 2: Phone verification
    inputPhone.addEventListener("input", () => {
      inputPhone.value = formatPhone(inputPhone.value);
    });
    btnSendCode.addEventListener("click", sendVerification);

    inputCode.addEventListener("input", () => {
      inputCode.value = inputCode.value.replace(/\D/g, "").slice(0, 6);
      if (inputCode.value.length === 6) {
        verifyCode();
      }
    });

    btnPhoneNext.addEventListener("click", () => goStep(3));

    // Step 3: Target phone + hint
    inputTarget.addEventListener("input", () => {
      inputTarget.value = formatPhone(inputTarget.value);
      btnSubmit.disabled = !isValidPhone(inputTarget.value);
    });

    inputHint.addEventListener("input", () => {
      hintCount.textContent = inputHint.value.length;
    });

    btnSubmit.addEventListener("click", submitKokkok);

    // Step 4: Reset
    btnReset.addEventListener("click", resetApp);
  });
})();
