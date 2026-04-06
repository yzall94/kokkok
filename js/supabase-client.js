const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = {
  async callFunction(name, body) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  async sendVerification(phone) {
    return this.callFunction("send-verification", { phone });
  },
  async verifyCode(phone, code) {
    return this.callFunction("verify-code", { phone, code });
  },
  async submitKokkok(senderName, senderPhone, targetPhone, hintText, verificationToken) {
    return this.callFunction("submit-kokkok", {
      sender_name: senderName,
      sender_phone: senderPhone,
      target_phone: targetPhone,
      hint_text: hintText || null,
      verification_token: verificationToken,
    });
  },
  async getReveal(token) {
    return this.callFunction("get-reveal", { token });
  },
};
