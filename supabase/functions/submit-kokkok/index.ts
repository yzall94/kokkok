import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://yzall94.github.io/kokkok";

async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(phone));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendSMS(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const from = Deno.env.get("TWILIO_PHONE_NUMBER")!;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `+82${to.slice(1)}`,
        From: from,
        Body: body,
      }),
    }
  );
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sender_name, sender_phone, target_phone, hint_text, verification_token } =
      await req.json();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(Deno.env.get("ENCRYPTION_KEY")!.slice(0, 32)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    let payload;
    try {
      payload = await verify(verification_token, key);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanSenderPhone = sender_phone.replace(/-/g, "");
    const cleanTargetPhone = target_phone.replace(/-/g, "");

    if (payload.phone !== cleanSenderPhone) {
      return new Response(
        JSON.stringify({ error: "Token does not match sender phone" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderHash = await hashPhone(cleanSenderPhone);
    const targetHash = await hashPhone(cleanTargetPhone);
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY")!;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: entryId, error: insertErr } = await supabase.rpc("insert_kokkok", {
      p_sender_name: sender_name,
      p_sender_phone: cleanSenderPhone,
      p_sender_phone_hash: senderHash,
      p_target_phone_hash: targetHash,
      p_hint_text: hint_text || null,
      p_encryption_key: encryptionKey,
    });

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for mutual match
    const { data: matches } = await supabase
      .from("kokkok_entries")
      .select("id, reveal_token")
      .eq("sender_phone_hash", targetHash)
      .eq("target_phone_hash", senderHash)
      .eq("matched", false)
      .neq("id", entryId)
      .limit(1);

    if (matches && matches.length > 0) {
      const matchEntry = matches[0];

      await supabase
        .from("kokkok_entries")
        .update({ matched: true, match_id: matchEntry.id })
        .eq("id", entryId);

      await supabase
        .from("kokkok_entries")
        .update({ matched: true, match_id: entryId })
        .eq("id", matchEntry.id);

      const { data: newEntryData } = await supabase
        .from("kokkok_entries")
        .select("reveal_token")
        .eq("id", entryId)
        .single();

      const matchMsg = (token: string) =>
        `콕콕 — 서로 같은 마음이에요! 💗 ${SITE_URL}/reveal.html?t=${token}`;

      await sendSMS(cleanSenderPhone, matchMsg(newEntryData!.reveal_token));
      await sendSMS(cleanTargetPhone, matchMsg(matchEntry.reveal_token));

      return new Response(
        JSON.stringify({ success: true, matched: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No match — send kokkok SMS to target
    const { data: entryData } = await supabase
      .from("kokkok_entries")
      .select("reveal_token")
      .eq("id", entryId)
      .single();

    await sendSMS(
      cleanTargetPhone,
      `누군가 당신을 좋아하고 있어요 💗 ${SITE_URL}/reveal.html?t=${entryData!.reveal_token}`
    );

    return new Response(
      JSON.stringify({ success: true, matched: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
