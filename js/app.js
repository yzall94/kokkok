/* ============================================
   KokKok — app.js (login + admin)
   ============================================ */

(function () {
  "use strict";

  const DEMO = !window.supabaseClient ||
    supabaseClient.SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    location.search.includes("demo");

  const SESSION_KEY = "kokkok_session";
  const SESSION_TTL = 14 * 24 * 60 * 60 * 1000; // 2 weeks

  // --- Session ---
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() > s.expires) { localStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch { return null; }
  }

  function saveSession(name, phone, token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name, phone, token,
      expires: Date.now() + SESSION_TTL,
    }));
  }

  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  // --- DOM refs ---
  const steps = {};
  ["login", "0", "1", "2", "admin"].forEach((id) => {
    steps[id] = document.getElementById("step-" + id);
  });

  // Login
  const loginName = document.getElementById("login-name");
  const loginPhone = document.getElementById("login-phone");
  const loginSendCode = document.getElementById("login-send-code");
  const loginPhoneStatus = document.getElementById("login-phone-status");
  const loginCodeGroup = document.getElementById("login-code-group");
  const loginCode = document.getElementById("login-code");
  const loginCodeStatus = document.getElementById("login-code-status");

  // Sender flow
  const inputTarget = document.getElementById("input-target");
  const inputHint = document.getElementById("input-hint");
  const hintCount = document.getElementById("hint-count");
  const btnSubmit = document.getElementById("btn-submit");
  const splashOrb = document.getElementById("splash-orb");
  const btnReset = document.getElementById("btn-reset");
  const btnAdmin = document.getElementById("btn-admin");

  // Admin
  const adminPhone = document.getElementById("admin-phone");
  const receivedList = document.getElementById("received-list");
  const receivedEmpty = document.getElementById("received-empty");
  const sentList = document.getElementById("sent-list");
  const sentEmpty = document.getElementById("sent-empty");

  // --- Navigation ---
  function goStep(id) {
    Object.values(steps).forEach((el) => el.classList.remove("active"));
    steps[id].classList.add("active");
    setTimeout(() => {
      const firstInput = steps[id].querySelector("input:not(:disabled), textarea:not(:disabled)");
      if (firstInput) firstInput.focus();
    }, 400);
  }

  // --- Phone helpers ---
  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }

  function displayPhone(digits) {
    if (digits.length === 11) return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
    if (digits.length === 10) return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
    return digits;
  }

  function maskPhone(digits) {
    if (digits.length >= 11) return digits.slice(0, 3) + "-****-" + digits.slice(7);
    return digits.slice(0, 3) + "-***-" + digits.slice(6);
  }

  function isValidPhone(phone) {
    return /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ""));
  }

  // --- Status ---
  function showStatus(el, msg, type) { el.textContent = msg; el.className = "status-msg show " + type; }
  function hideStatus(el) { el.className = "status-msg"; }

  // --- Login: Send Code ---
  async function loginSendVerification() {
    const name = loginName.value.trim();
    if (!name) { loginName.focus(); return; }

    const phone = loginPhone.value.replace(/\D/g, "");
    if (!isValidPhone(phone)) {
      showStatus(loginPhoneStatus, "올바�� 전화번호를 입력해주세���.", "error");
      return;
    }

    loginSendCode.disabled = true;
    loginSendCode.innerHTML = '<span class="spinner"></span>';
    hideStatus(loginPhoneStatus);

    if (DEMO) {
      await new Promise((r) => setTimeout(r, 800));
      loginCodeGroup.classList.add("show");
      showStatus(loginPhoneStatus, "[DEMO] 인증번호: 000000", "success");
      loginSendCode.disabled = false;
      loginSendCode.textContent = "재전송";
      loginCode.focus();
      return;
    }

    try {
      await supabaseClient.sendVerification(phone);
      loginCodeGroup.classList.add("show");
      showStatus(loginPhoneStatus, "인증번호가 전송되었어요!", "success");
      loginCode.focus();
    } catch (err) {
      showStatus(loginPhoneStatus, err.message || "전송에 실패했어요.", "error");
    } finally {
      loginSendCode.disabled = false;
      loginSendCode.textContent = "재전송";
    }
  }

  // --- Login: Verify Code ---
  async function loginVerifyCode() {
    const name = loginName.value.trim();
    const phone = loginPhone.value.replace(/\D/g, "");
    const code = loginCode.value.trim();
    if (code.length !== 6) return;

    loginCode.disabled = true;
    hideStatus(loginCodeStatus);

    if (DEMO) {
      await new Promise((r) => setTimeout(r, 500));
      saveSession(name, phone, "demo-token");
      showStatus(loginCodeStatus, "[DEMO] 인증 완료!", "success");
      setTimeout(() => goStep("0"), 600);
      return;
    }

    try {
      const result = await supabaseClient.verifyCode(phone, code);
      saveSession(name, phone, result.token);
      showStatus(loginCodeStatus, "인증 완료!", "success");
      setTimeout(() => goStep("0"), 600);
    } catch (err) {
      showStatus(loginCodeStatus, err.message || "인증번호가 일치하지 않아요.", "error");
      loginCode.disabled = false;
      loginCode.value = "";
      loginCode.focus();
    }
  }

  // --- Submit KokKok ---
  async function submitKokkok() {
    const session = getSession();
    if (!session) { goStep("login"); return; }

    const targetPhone = inputTarget.value.replace(/\D/g, "");
    const hintText = inputHint.value.trim();

    if (!isValidPhone(targetPhone)) return;
    if (session.phone === targetPhone) {
      alert("자기 자신에게는 콕 할 수 없어요!");
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span>';

    if (DEMO) {
      await new Promise((r) => setTimeout(r, 1000));
      const demoSent = JSON.parse(localStorage.getItem("kokkok_demo_sent") || "[]");
      demoSent.push({ target_phone: targetPhone, hint: hintText || null, date: new Date().toISOString(), matched: false });
      localStorage.setItem("kokkok_demo_sent", JSON.stringify(demoSent));
      btnSubmit.disabled = false;
      btnSubmit.textContent = "콕!";
      goStep("2");
      spawnParticles();
      return;
    }

    try {
      await supabaseClient.submitKokkok(session.name, session.phone, targetPhone, hintText, session.token);
      goStep("2");
      spawnParticles();
    } catch (err) {
      alert(err.message || "전송��� 실패했어요.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "콕!";
    }
  }

  // --- Admin ---
  async function loadAdminData() {
    const session = getSession();
    if (!session) return;
    adminPhone.textContent = displayPhone(session.phone);

    if (DEMO) {
      const demoSent = JSON.parse(localStorage.getItem("kokkok_demo_sent") || "[]");
      const demoReceived = [
        { hint: "같은 반 안경 쓴 사람", date: "2026-04-05T14:30:00Z", matched: false },
        { hint: null, date: "2026-04-03T09:15:00Z", matched: true, partner_name: "김민수", partner_phone: "01012345678" },
      ];
      renderReceivedList(demoReceived);
      renderSentList(demoSent);
      return;
    }

    try {
      const data = await supabaseClient.callFunction("get-my-kokkok", { phone: session.phone, token: session.token });
      renderReceivedList(data.received || []);
      renderSentList(data.sent || []);
    } catch {
      receivedEmpty.textContent = "데이터를 불러��지 못했어요";
      sentEmpty.textContent = "데이터를 불러���지 못했어요";
    }
  }

  function renderReceivedList(items) {
    receivedList.innerHTML = "";
    if (!items.length) { receivedEmpty.style.display = "block"; return; }
    receivedEmpty.style.display = "none";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      const date = new Date(item.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
      const badge = item.matched ? '<span class="badge badge-matched">매칭됨</span>' : '<span class="badge badge-waiting">대기 중</span>';
      let html = `<div class="admin-card-header"><span class="admin-card-label">익���의 누군가</span><span class="admin-card-date">${date}</span></div><div style="margin-top:4px">${badge}</div>`;
      if (item.hint) html += `<div class="admin-card-hint">"${item.hint}"</div>`;
      if (item.matched && item.partner_name) {
        html += `<div style="margin-top:12px;padding:10px 14px;background:rgba(107,255,184,0.06);border-radius:10px;border:1px solid rgba(107,255,184,0.12)"><div style="font-weight:700;color:#7BFFB8">${item.partner_name}</div><div style="font-size:13px;color:var(--text-dim);margin-top:4px">${displayPhone(item.partner_phone)}</div></div>`;
      }
      card.innerHTML = html;
      receivedList.appendChild(card);
    });
  }

  function renderSentList(items) {
    sentList.innerHTML = "";
    if (!items.length) { sentEmpty.style.display = "block"; return; }
    sentEmpty.style.display = "none";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      const date = new Date(item.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
      const badge = item.matched ? '<span class="badge badge-matched">매칭됨</span>' : '<span class="badge badge-waiting">대기 중</span>';
      let html = `<div class="admin-card-header"><span class="admin-card-phone">${maskPhone(item.target_phone)}</span><span class="admin-card-date">${date}</span></div><div style="margin-top:4px">${badge}</div>`;
      if (item.hint) html += `<div class="admin-card-hint">"${item.hint}"</div>`;
      card.innerHTML = html;
      sentList.appendChild(card);
    });
  }

  // --- Particles ---
  function spawnParticles() {
    const colors = ["rgba(255,92,138,0.8)", "rgba(255,138,175,0.7)", "rgba(255,122,110,0.6)", "rgba(255,184,108,0.5)", "rgba(255,200,200,0.4)"];
    for (let i = 0; i < 20; i++) {
      const el = document.createElement("div");
      el.className = "particle";
      const size = 4 + Math.random() * 12;
      const color = colors[Math.floor(Math.random() * colors.length)];
      el.style.cssText = `left:${15 + Math.random() * 70}%;bottom:${10 + Math.random() * 20}%;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size * 2}px ${color};animation-duration:${2 + Math.random() * 3}s;animation-delay:${Math.random() * 1.5}s;`;
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    }
  }

  function createRipple(x, y) {
    const r = document.createElement("div");
    r.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:4px;height:4px;border-radius:50%;background:transparent;border:2px solid rgba(255,92,138,0.6);transform:translate(-50%,-50%);pointer-events:none;z-index:50;animation:rippleOut 800ms ease-out forwards;`;
    document.body.appendChild(r);
    r.addEventListener("animationend", () => r.remove());
  }

  // --- Reset ---
  function resetSender() {
    inputTarget.value = "";
    inputHint.value = "";
    hintCount.textContent = "0";
    btnSubmit.disabled = true;
    btnSubmit.textContent = "콕!";
    goStep("0");
  }

  // --- Init ---
  document.addEventListener("DOMContentLoaded", function () {
    if (DEMO) console.log("%c[KokKok] DEMO MODE", "color:#FF5C8A;font-weight:bold");

    goStep(getSession() ? "0" : "login");

    // Login
    loginPhone.addEventListener("input", () => { loginPhone.value = formatPhone(loginPhone.value); });
    loginSendCode.addEventListener("click", loginSendVerification);
    loginCode.addEventListener("input", () => {
      loginCode.value = loginCode.value.replace(/\D/g, "").slice(0, 6);
      if (loginCode.value.length === 6) loginVerifyCode();
    });

    // Splash
    splashOrb.addEventListener("click", (e) => { createRipple(e.clientX, e.clientY); setTimeout(() => goStep("1"), 400); });
    splashOrb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goStep("1"); } });

    btnAdmin.addEventListener("click", () => { loadAdminData(); goStep("admin"); });

    // Back
    document.getElementById("back-1").addEventListener("click", () => goStep("0"));
    document.getElementById("back-admin").addEventListener("click", () => goStep("0"));

    // Target
    inputTarget.addEventListener("input", () => { inputTarget.value = formatPhone(inputTarget.value); btnSubmit.disabled = !isValidPhone(inputTarget.value); });
    inputHint.addEventListener("input", () => { hintCount.textContent = inputHint.value.length; });
    btnSubmit.addEventListener("click", submitKokkok);

    // Complete
    btnReset.addEventListener("click", resetSender);

    // Admin tabs
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-received").style.display = tab.dataset.tab === "received" ? "block" : "none";
        document.getElementById("tab-sent").style.display = tab.dataset.tab === "sent" ? "block" : "none";
      });
    });

    // Logout
    document.getElementById("btn-logout").addEventListener("click", () => {
      clearSession();
      loginName.value = "";
      loginPhone.value = "";
      loginCode.value = "";
      loginCode.disabled = false;
      loginSendCode.disabled = false;
      loginSendCode.textContent = "인증번호 받기";
      loginCodeGroup.classList.remove("show");
      hideStatus(loginPhoneStatus);
      hideStatus(loginCodeStatus);
      goStep("login");
    });
  });
})();
