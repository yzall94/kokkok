# KokKok Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA anonymous confession service where users send "someone likes you" SMS to a target phone number, with mutual matching that reveals both parties.

**Architecture:** GitHub Pages serves static PWA frontend (index.html for sender flow, reveal.html for receiver). Supabase provides PostgreSQL DB and Edge Functions (Deno/TypeScript) for verification, submission, matching, and reveal. Twilio sends SMS.

**Tech Stack:** HTML/CSS/JS (vanilla), Supabase JS SDK, Supabase Edge Functions (Deno/TS), PostgreSQL + pgcrypto, Twilio SMS API, PWA (manifest + service worker)

---

## File Structure

```
kokkok/
├── index.html              — sender flow (splash → name → phone verify → target → done)
├── reveal.html             — receiver landing + match reveal page
├── css/
│   └── style.css           — design system, all components, animations
├── js/
│   ├── app.js              — sender flow logic, step transitions, form validation
│   ├── supabase-client.js  — Supabase init + API wrapper functions
│   └── reveal.js           — reveal page logic
├── manifest.json           — PWA manifest
├── sw.js                   — service worker (cache static assets)
├── icons/
│   ├── icon-192.png        — PWA icon 192x192
│   └── icon-512.png        — PWA icon 512x512
├── supabase/
│   ├── migrations/
│   │   └── 001_init.sql    — DB schema + RLS policies + pgcrypto
│   └── functions/
│       ├── send-verification/index.ts  — SMS verification code sender
│       ├── verify-code/index.ts        — verification code checker
│       ├── submit-kokkok/index.ts      — kokkok submission + matching
│       └── get-reveal/index.ts         — reveal page data provider
└── docs/
    └── superpowers/
        ├── specs/2026-04-06-kokkok-redesign.md
        └── plans/2026-04-06-kokkok-implementation.md (this file)
```

---

### Task 1: Supabase Project Setup + DB Schema

**Files:**
- Create: `supabase/migrations/001_init.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com/dashboard and create a new project:
- Project name: `kokkok`
- Region: Northeast Asia (Seoul) if available, otherwise Singapore
- Database password: generate a strong one and save it

Note the following from Project Settings → API:
- `SUPABASE_URL` (e.g. `https://xxxx.supabase.co`)
- `SUPABASE_ANON_KEY` (public anon key)
- `SUPABASE_SERVICE_ROLE_KEY` (secret, for Edge Functions only)

- [ ] **Step 2: Write the DB migration**

Create `supabase/migrations/001_init.sql`:

```sql
-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- kokkok_entries: stores each kokkok submission
CREATE TABLE kokkok_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name_encrypted TEXT NOT NULL,
  sender_phone_hash TEXT NOT NULL,
  sender_phone_encrypted TEXT NOT NULL,
  target_phone_hash TEXT NOT NULL,
  hint_text TEXT,
  matched BOOLEAN DEFAULT FALSE,
  match_id UUID REFERENCES kokkok_entries(id),
  reveal_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- verification_codes: SMS verification codes
CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

-- Indexes for fast lookups
CREATE INDEX idx_entries_sender_hash ON kokkok_entries(sender_phone_hash);
CREATE INDEX idx_entries_target_hash ON kokkok_entries(target_phone_hash);
CREATE INDEX idx_entries_reveal_token ON kokkok_entries(reveal_token);
CREATE INDEX idx_verification_phone ON verification_codes(phone_hash);

-- RLS: block all direct access from anon key
ALTER TABLE kokkok_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon role
-- All access goes through Edge Functions using service_role key
```

- [ ] **Step 3: Run migration in Supabase**

Go to Supabase Dashboard → SQL Editor → paste the contents of `001_init.sql` → Run.

Verify: go to Table Editor → confirm `kokkok_entries` and `verification_codes` tables exist with correct columns.

- [ ] **Step 4: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add supabase/migrations/001_init.sql
git commit -m "feat: add DB schema migration with RLS"
```

---

### Task 2: Supabase Edge Function — send-verification

**Files:**
- Create: `supabase/functions/send-verification/index.ts`

- [ ] **Step 1: Set Supabase secrets for Twilio**

In Supabase Dashboard → Edge Functions → Secrets, add:
- `TWILIO_ACCOUNT_SID` — from Twilio console
- `TWILIO_AUTH_TOKEN` — from Twilio console
- `TWILIO_PHONE_NUMBER` — your Twilio phone number (e.g. +1234567890)
- `ENCRYPTION_KEY` — 32-byte hex string for AES (generate: `openssl rand -hex 32`)

- [ ] **Step 2: Write send-verification function**

Create `supabase/functions/send-verification/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone || !/^01[016789]\d{7,8}$/.test(phone.replace(/-/g, ""))) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = phone.replace(/-/g, "");

    // Hash phone for storage
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(cleanPhone));
    const phoneHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Init Supabase with service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit: max 5 codes per phone per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("verification_codes")
      .select("*", { count: "exact", head: true })
      .eq("phone_hash", phoneHash)
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Store code
    await supabase.from("verification_codes").insert({
      phone_hash: phoneHash,
      code,
    });

    // Send SMS via Twilio
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const twilioBody = new URLSearchParams({
      To: `+82${cleanPhone.slice(1)}`,
      From: twilioPhone,
      Body: `[콕콕] 인증번호: ${code}`,
    });

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioBody,
    });

    if (!twilioRes.ok) {
      const err = await twilioRes.text();
      console.error("Twilio error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
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
```

- [ ] **Step 3: Deploy to Supabase**

In Supabase Dashboard → Edge Functions → Deploy New Function → paste the code or use Supabase CLI:

```bash
npx supabase functions deploy send-verification --project-ref <your-project-ref>
```

Test with curl:
```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/send-verification \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678"}'
```

Expected: `{"success": true}` and SMS received on the phone.

- [ ] **Step 4: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add supabase/functions/send-verification/index.ts
git commit -m "feat: add send-verification edge function with Twilio SMS"
```

---

### Task 3: Supabase Edge Function — verify-code

**Files:**
- Create: `supabase/functions/verify-code/index.ts`

- [ ] **Step 1: Write verify-code function**

Create `supabase/functions/verify-code/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, code } = await req.json();
    const cleanPhone = phone.replace(/-/g, "");

    // Hash phone
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(cleanPhone));
    const phoneHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find latest unexpired code for this phone
    const { data: codes } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("phone_hash", phoneHash)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (!codes || codes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No verification code found or expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const record = codes[0];

    // Check attempts
    if (record.attempts >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Request a new code." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment attempts
    await supabase
      .from("verification_codes")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    // Compare code
    if (record.code !== code) {
      return new Response(
        JSON.stringify({ error: "Invalid code", attemptsLeft: 4 - record.attempts }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate JWT token (valid 30 minutes)
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(Deno.env.get("ENCRYPTION_KEY")!.slice(0, 32)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        phone_hash: phoneHash,
        phone: cleanPhone,
        exp: getNumericDate(30 * 60), // 30 minutes
      },
      key
    );

    // Clean up used code
    await supabase
      .from("verification_codes")
      .delete()
      .eq("id", record.id);

    return new Response(
      JSON.stringify({ verified: true, token }),
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
```

- [ ] **Step 2: Deploy and test**

```bash
npx supabase functions deploy verify-code --project-ref <your-project-ref>
```

Test (after sending a real verification code):
```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/verify-code \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678", "code": "123456"}'
```

Expected: `{"verified": true, "token": "eyJ..."}` — a JWT string.

- [ ] **Step 3: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add supabase/functions/verify-code/index.ts
git commit -m "feat: add verify-code edge function with JWT token"
```

---

### Task 4: Supabase Edge Function — submit-kokkok

**Files:**
- Create: `supabase/functions/submit-kokkok/index.ts`

- [ ] **Step 1: Write submit-kokkok function**

Create `supabase/functions/submit-kokkok/index.ts`:

```typescript
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

function encryptAES(plaintext: string, key: string): string {
  // Using pgcrypto on DB side instead — pass plaintext to DB function
  // For edge function, we base64-encode and let pgcrypto handle it
  // Actually, we'll encrypt client-side-style using Web Crypto
  // For simplicity and security, we'll use pgcrypto via SQL
  return plaintext; // placeholder — actual encryption in SQL below
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

    // Verify JWT
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

    // Verify token matches sender phone
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

    // Insert new entry with pgcrypto encryption
    const { data: newEntry, error: insertErr } = await supabase.rpc("insert_kokkok", {
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

    const entryId = newEntry;

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

      // Update both entries as matched
      await supabase
        .from("kokkok_entries")
        .update({ matched: true, match_id: matchEntry.id })
        .eq("id", entryId);

      await supabase
        .from("kokkok_entries")
        .update({ matched: true, match_id: entryId })
        .eq("id", matchEntry.id);

      // Get reveal tokens for both
      const { data: newEntryData } = await supabase
        .from("kokkok_entries")
        .select("reveal_token")
        .eq("id", entryId)
        .single();

      // Send match SMS to both parties
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
```

- [ ] **Step 2: Add pgcrypto SQL function for encrypted insert**

Run this in Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION insert_kokkok(
  p_sender_name TEXT,
  p_sender_phone TEXT,
  p_sender_phone_hash TEXT,
  p_target_phone_hash TEXT,
  p_hint_text TEXT,
  p_encryption_key TEXT
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO kokkok_entries (
    sender_name_encrypted,
    sender_phone_hash,
    sender_phone_encrypted,
    target_phone_hash,
    hint_text
  ) VALUES (
    encode(pgp_sym_encrypt(p_sender_name, p_encryption_key), 'base64'),
    p_sender_phone_hash,
    encode(pgp_sym_encrypt(p_sender_phone, p_encryption_key), 'base64'),
    p_target_phone_hash,
    p_hint_text
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: Deploy and test**

```bash
npx supabase functions deploy submit-kokkok --project-ref <your-project-ref>
```

Also set the SITE_URL secret in Supabase Dashboard:
- `SITE_URL` = `https://yzall94.github.io/kokkok`

- [ ] **Step 4: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add supabase/functions/submit-kokkok/index.ts
git commit -m "feat: add submit-kokkok edge function with matching + SMS"
```

---

### Task 5: Supabase Edge Function — get-reveal

**Files:**
- Create: `supabase/functions/get-reveal/index.ts`

- [ ] **Step 1: Add decrypt SQL function**

Run in Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION get_reveal_data(
  p_reveal_token TEXT,
  p_encryption_key TEXT
) RETURNS JSON AS $$
DECLARE
  entry RECORD;
  match_entry RECORD;
  result JSON;
BEGIN
  -- Find entry by reveal token
  SELECT * INTO entry FROM kokkok_entries WHERE reveal_token = p_reveal_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF entry.matched AND entry.match_id IS NOT NULL THEN
    -- Get matched partner's data
    SELECT * INTO match_entry FROM kokkok_entries WHERE id = entry.match_id;

    result := json_build_object(
      'matched', true,
      'partner_name', pgp_sym_decrypt(decode(match_entry.sender_name_encrypted, 'base64'), p_encryption_key),
      'partner_phone', pgp_sym_decrypt(decode(match_entry.sender_phone_encrypted, 'base64'), p_encryption_key),
      'hint_text', entry.hint_text
    );
  ELSE
    result := json_build_object(
      'matched', false,
      'hint_text', entry.hint_text
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Write get-reveal function**

Create `supabase/functions/get-reveal/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encryptionKey = Deno.env.get("ENCRYPTION_KEY")!;

    const { data, error } = await supabase.rpc("get_reveal_data", {
      p_reveal_token: token,
      p_encryption_key: encryptionKey,
    });

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (data.error === "not_found") {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
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
```

- [ ] **Step 3: Deploy and test**

```bash
npx supabase functions deploy get-reveal --project-ref <your-project-ref>
```

- [ ] **Step 4: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add supabase/functions/get-reveal/index.ts
git commit -m "feat: add get-reveal edge function with decrypt"
```

---

### Task 6: Frontend — Design System (CSS)

**Files:**
- Create: `css/style.css`

- [ ] **Step 1: Write the design system CSS**

Create `css/style.css`:

```css
/* ===== RESET & BASE ===== */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg: #0A0A1A;
  --surface: #14142B;
  --primary: #FF6B8A;
  --primary-light: #FF8FA3;
  --text: #FFFFFF;
  --text-secondary: #8888AA;
  --glow: rgba(255, 107, 138, 0.3);
  --glow-strong: rgba(255, 107, 138, 0.5);
  --error: #FF4444;
  --success: #44DD88;
  --radius: 16px;
  --transition: 300ms ease-out;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: 'Pretendard', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

/* ===== APP CONTAINER ===== */
.app {
  max-width: 430px;
  margin: 0 auto;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* ===== STEP SCREENS ===== */
.step {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 32px 24px;
  opacity: 0;
  transform: translateY(30px);
  pointer-events: none;
  transition: opacity var(--transition), transform var(--transition);
}

.step.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* ===== TYPOGRAPHY ===== */
.title {
  font-size: 40px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}

.tagline {
  font-size: 16px;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 12px;
}

.question {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 32px;
  line-height: 1.3;
}

.caption {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

/* ===== INPUTS ===== */
.input-group {
  width: 100%;
  margin-bottom: 20px;
}

.input-field {
  width: 100%;
  background: var(--surface);
  border: 2px solid transparent;
  border-radius: var(--radius);
  padding: 16px 20px;
  font-size: 18px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.input-field::placeholder {
  color: var(--text-secondary);
}

.input-field:focus {
  border-color: var(--primary);
  box-shadow: 0 0 20px var(--glow);
}

.input-field.error {
  border-color: var(--error);
}

.input-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  margin-left: 4px;
}

.hint-field {
  width: 100%;
  background: var(--surface);
  border: 1px dashed var(--text-secondary);
  border-radius: var(--radius);
  padding: 16px 20px;
  font-size: 16px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  resize: none;
  min-height: 60px;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.hint-field::placeholder {
  color: var(--text-secondary);
  font-style: italic;
}

.hint-field:focus {
  border-color: var(--primary);
  box-shadow: 0 0 20px var(--glow);
}

/* ===== BUTTONS ===== */
.btn-primary {
  width: 100%;
  padding: 18px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  font-family: inherit;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: box-shadow var(--transition), transform 150ms ease;
  margin-top: 12px;
}

.btn-primary:hover {
  box-shadow: 0 0 30px var(--glow-strong);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  background: transparent;
  border: 2px solid var(--primary);
  color: var(--primary);
  width: 100%;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition), box-shadow var(--transition);
  margin-top: 12px;
}

.btn-secondary:hover {
  background: rgba(255, 107, 138, 0.1);
  box-shadow: 0 0 20px var(--glow);
}

.btn-inline {
  background: var(--surface);
  border: 2px solid var(--primary);
  color: var(--primary);
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition);
  white-space: nowrap;
}

.btn-inline:hover {
  background: rgba(255, 107, 138, 0.1);
}

.btn-inline:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ===== VERIFICATION ROW ===== */
.verify-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.verify-row .input-field {
  flex: 1;
}

/* ===== CODE INPUT ===== */
.code-input {
  letter-spacing: 12px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
}

/* ===== HEART ANIMATION ===== */
.heart-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
}

.heart {
  font-size: 80px;
  animation: heartPulse 1.2s ease-in-out infinite;
}

@keyframes heartPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

/* ===== HEART PARTICLES ===== */
.particle {
  position: fixed;
  font-size: 20px;
  pointer-events: none;
  animation: floatUp 3s ease-out forwards;
  z-index: 100;
}

@keyframes floatUp {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-400px) scale(0.3);
  }
}

/* ===== STATUS MESSAGES ===== */
.status-msg {
  font-size: 14px;
  text-align: center;
  margin-top: 8px;
  min-height: 20px;
}

.status-msg.error {
  color: var(--error);
}

.status-msg.success {
  color: var(--success);
}

/* ===== LOADING SPINNER ===== */
.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== REVEAL PAGE ===== */
.reveal-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 40px 28px;
  text-align: center;
  width: 100%;
  box-shadow: 0 0 40px var(--glow);
}

.reveal-message {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.5;
  margin: 20px 0;
}

.reveal-hint {
  font-size: 16px;
  color: var(--text-secondary);
  font-style: italic;
  margin: 16px 0;
  padding: 16px;
  background: rgba(255, 107, 138, 0.05);
  border-radius: 12px;
  border: 1px dashed rgba(255, 107, 138, 0.2);
}

.reveal-partner {
  margin: 24px 0;
}

.reveal-partner .name {
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.reveal-partner .phone {
  font-size: 20px;
  color: var(--text-secondary);
  margin-top: 8px;
}

/* ===== FONTS ===== */
@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add css/style.css
git commit -m "feat: add design system CSS — dark theme, pink gradient, mobile-first"
```

---

### Task 7: Frontend — Sender Flow (index.html + app.js)

**Files:**
- Create: `index.html`
- Create: `js/supabase-client.js`
- Create: `js/app.js`

- [ ] **Step 1: Write supabase-client.js**

Create `js/supabase-client.js`:

```javascript
// Supabase client wrapper
// Replace these with your actual Supabase project values
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

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
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
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
```

- [ ] **Step 2: Write index.html**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#FF6B8A">
  <title>콕콕 — 좋아하는 마음, 살짝 찔러보기</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
</head>
<body>
  <div class="app">

    <!-- Step 0: Splash -->
    <div class="step active" data-step="0">
      <div class="title">콕콕</div>
      <p class="tagline">좋아하는 마음, 살짝 찔러보기</p>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="goStep(1)">시작하기</button>
    </div>

    <!-- Step 1: My Name -->
    <div class="step" data-step="1">
      <p class="question">당신의 이름은?</p>
      <div class="input-group">
        <input type="text" class="input-field" id="senderName"
               placeholder="이름을 입력하세요" maxlength="20" autocomplete="name">
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" id="btnToStep2" disabled onclick="goStep(2)">다음</button>
    </div>

    <!-- Step 2: My Phone + Verification -->
    <div class="step" data-step="2">
      <p class="question">전화번호를<br>알려주세요</p>
      <div class="input-group">
        <div class="verify-row">
          <input type="tel" class="input-field" id="senderPhone"
                 placeholder="010-0000-0000" maxlength="13" autocomplete="tel">
          <button class="btn-inline" id="btnSendCode" disabled onclick="sendVerification()">인증번호 받기</button>
        </div>
      </div>
      <div class="input-group" id="codeGroup" style="display:none">
        <input type="text" class="input-field code-input" id="verifyCode"
               placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
        <p class="status-msg" id="codeStatus"></p>
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" id="btnToStep3" disabled onclick="goStep(3)">다음</button>
    </div>

    <!-- Step 3: Target Phone + Hint -->
    <div class="step" data-step="3">
      <p class="question">그 사람의<br>번호는?</p>
      <div class="input-group">
        <input type="tel" class="input-field" id="targetPhone"
               placeholder="010-0000-0000" maxlength="13" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">힌트를 남길까요? (선택)</label>
        <textarea class="hint-field" id="hintText"
                  placeholder="같은 반 안경 쓴 사람..." maxlength="100" rows="2"></textarea>
        <p class="caption" style="margin-top:8px; text-align:right">
          <span id="hintCount">0</span>/100
        </p>
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" id="btnSubmit" disabled onclick="submitKokkok()">
        콕! 💗
      </button>
      <p class="status-msg" id="submitStatus"></p>
    </div>

    <!-- Step 4: Complete -->
    <div class="step" data-step="4">
      <div class="heart-container">
        <div class="heart">💗</div>
      </div>
      <p class="question">콕!<br>전달했어요</p>
      <p class="tagline" id="completeMsg">상대방에게 메시지가 전달됐어요</p>
      <div style="flex:1"></div>
      <button class="btn-secondary" onclick="resetApp()">한 번 더 콕콕</button>
    </div>

  </div>

  <script src="js/supabase-client.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write app.js**

Create `js/app.js`:

```javascript
// === STATE ===
let currentStep = 0;
let verificationToken = null;

// === STEP NAVIGATION ===
function goStep(step) {
  document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove("active");
  currentStep = step;
  const next = document.querySelector(`.step[data-step="${step}"]`);
  next.classList.add("active");

  // Auto-focus first input in step
  const input = next.querySelector("input");
  if (input) setTimeout(() => input.focus(), 350);
}

// === PHONE FORMATTING ===
function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// === VALIDATION ===
function isValidPhone(phone) {
  return /^01[016789]-?\d{3,4}-?\d{4}$/.test(phone);
}

// === SEND VERIFICATION ===
async function sendVerification() {
  const btn = document.getElementById("btnSendCode");
  const phone = document.getElementById("senderPhone").value;
  btn.disabled = true;
  btn.textContent = "전송 중...";

  try {
    await supabaseClient.sendVerification(phone.replace(/-/g, ""));
    document.getElementById("codeGroup").style.display = "block";
    document.getElementById("verifyCode").focus();
    btn.textContent = "재전송";
    btn.disabled = false;
  } catch (err) {
    document.getElementById("codeStatus").textContent = err.message;
    document.getElementById("codeStatus").className = "status-msg error";
    btn.textContent = "인증번호 받기";
    btn.disabled = false;
  }
}

// === VERIFY CODE ===
async function verifyCode() {
  const phone = document.getElementById("senderPhone").value;
  const code = document.getElementById("verifyCode").value;
  const status = document.getElementById("codeStatus");

  if (code.length !== 6) return;

  status.textContent = "확인 중...";
  status.className = "status-msg";

  try {
    const result = await supabaseClient.verifyCode(phone.replace(/-/g, ""), code);
    verificationToken = result.token;
    status.textContent = "인증 완료!";
    status.className = "status-msg success";
    document.getElementById("btnToStep3").disabled = false;
    document.getElementById("verifyCode").disabled = true;
    document.getElementById("btnSendCode").disabled = true;
    document.getElementById("senderPhone").disabled = true;
  } catch (err) {
    status.textContent = err.message;
    status.className = "status-msg error";
  }
}

// === SUBMIT KOKKOK ===
async function submitKokkok() {
  const btn = document.getElementById("btnSubmit");
  const status = document.getElementById("submitStatus");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>전달 중...';

  try {
    const result = await supabaseClient.submitKokkok(
      document.getElementById("senderName").value,
      document.getElementById("senderPhone").value.replace(/-/g, ""),
      document.getElementById("targetPhone").value.replace(/-/g, ""),
      document.getElementById("hintText").value,
      verificationToken
    );

    if (result.matched) {
      document.getElementById("completeMsg").textContent =
        "서로 같은 마음이에요! 상대방에게도 알림이 갔어요.";
    }

    goStep(4);
    spawnHeartParticles();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status-msg error";
    btn.disabled = false;
    btn.textContent = "콕! 💗";
  }
}

// === HEART PARTICLES ===
function spawnHeartParticles() {
  const hearts = ["💗", "💕", "💖", "💘", "❤️"];
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const el = document.createElement("div");
      el.className = "particle";
      el.textContent = hearts[Math.floor(Math.random() * hearts.length)];
      el.style.left = `${20 + Math.random() * 60}%`;
      el.style.bottom = "0";
      el.style.fontSize = `${16 + Math.random() * 20}px`;
      el.style.animationDuration = `${2 + Math.random() * 2}s`;
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    }, i * 150);
  }
}

// === RESET ===
function resetApp() {
  verificationToken = null;
  document.getElementById("senderName").value = "";
  document.getElementById("senderPhone").value = "";
  document.getElementById("senderPhone").disabled = false;
  document.getElementById("verifyCode").value = "";
  document.getElementById("verifyCode").disabled = false;
  document.getElementById("codeGroup").style.display = "none";
  document.getElementById("codeStatus").textContent = "";
  document.getElementById("targetPhone").value = "";
  document.getElementById("hintText").value = "";
  document.getElementById("hintCount").textContent = "0";
  document.getElementById("submitStatus").textContent = "";
  document.getElementById("btnSendCode").disabled = true;
  document.getElementById("btnSendCode").textContent = "인증번호 받기";
  document.getElementById("btnToStep2").disabled = true;
  document.getElementById("btnToStep3").disabled = true;
  document.getElementById("btnSubmit").disabled = true;
  document.getElementById("btnSubmit").textContent = "콕! 💗";
  goStep(0);
}

// === EVENT LISTENERS ===
document.addEventListener("DOMContentLoaded", () => {
  // Step 1: name validation
  const nameInput = document.getElementById("senderName");
  nameInput.addEventListener("input", () => {
    document.getElementById("btnToStep2").disabled = nameInput.value.trim().length === 0;
  });

  // Step 2: phone formatting + validation
  const phoneInput = document.getElementById("senderPhone");
  phoneInput.addEventListener("input", () => {
    phoneInput.value = formatPhone(phoneInput.value);
    document.getElementById("btnSendCode").disabled = !isValidPhone(phoneInput.value);
  });

  // Step 2: code auto-verify on 6 digits
  const codeInput = document.getElementById("verifyCode");
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    if (codeInput.value.length === 6) {
      verifyCode();
    }
  });

  // Step 3: target phone formatting + validation
  const targetInput = document.getElementById("targetPhone");
  targetInput.addEventListener("input", () => {
    targetInput.value = formatPhone(targetInput.value);
    document.getElementById("btnSubmit").disabled = !isValidPhone(targetInput.value);
  });

  // Step 3: hint character count
  const hintInput = document.getElementById("hintText");
  hintInput.addEventListener("input", () => {
    document.getElementById("hintCount").textContent = hintInput.value.length;
  });
});
```

- [ ] **Step 4: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add index.html js/supabase-client.js js/app.js
git commit -m "feat: add sender flow — splash, name, phone verify, target, complete"
```

---

### Task 8: Frontend — Reveal Page (reveal.html + reveal.js)

**Files:**
- Create: `reveal.html`
- Create: `js/reveal.js`

- [ ] **Step 1: Write reveal.html**

Create `reveal.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#FF6B8A">
  <title>콕콕 — 누군가 당신을 좋아하고 있어요</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
</head>
<body>
  <div class="app">

    <!-- Loading -->
    <div class="step active" id="revealLoading">
      <div class="heart-container">
        <div class="heart">💗</div>
      </div>
      <p class="tagline">불러오는 중...</p>
    </div>

    <!-- Not Matched: someone likes you -->
    <div class="step" id="revealMessage">
      <div class="reveal-card">
        <div style="font-size:60px; margin-bottom:16px">💗</div>
        <p class="reveal-message">누군가<br>당신을 좋아하고 있어요</p>
        <div id="revealHint"></div>
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="location.href='index.html'">나도 콕콕 해보기</button>
      <p class="caption" style="margin-top:16px">당신도 좋아하는 사람이 있다면,<br>콕콕 찔러보세요</p>
    </div>

    <!-- Matched: mutual reveal -->
    <div class="step" id="revealMatch">
      <div class="reveal-card">
        <div style="font-size:60px; margin-bottom:16px">💗</div>
        <p class="reveal-message">서로 같은<br>마음이에요!</p>
        <div class="reveal-partner">
          <p class="name" id="partnerName"></p>
          <p class="phone" id="partnerPhone"></p>
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="btn-secondary" onclick="location.href='index.html'">콕콕 더 해보기</button>
    </div>

    <!-- Error -->
    <div class="step" id="revealError">
      <div style="font-size:60px; margin-bottom:24px">😢</div>
      <p class="question">페이지를 찾을 수 없어요</p>
      <p class="tagline">링크가 만료되었거나 잘못되었어요</p>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="location.href='index.html'">콕콕 해보기</button>
    </div>

  </div>

  <script src="js/supabase-client.js"></script>
  <script src="js/reveal.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write reveal.js**

Create `js/reveal.js`:

```javascript
function showScreen(id) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function formatPhoneDisplay(phone) {
  if (phone.length === 11) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

async function loadReveal() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");

  if (!token) {
    showScreen("revealError");
    return;
  }

  try {
    const data = await supabaseClient.getReveal(token);

    if (data.matched) {
      document.getElementById("partnerName").textContent = data.partner_name;
      document.getElementById("partnerPhone").textContent = formatPhoneDisplay(data.partner_phone);
      showScreen("revealMatch");
    } else {
      if (data.hint_text) {
        document.getElementById("revealHint").innerHTML =
          `<div class="reveal-hint">"${data.hint_text}"</div>`;
      }
      showScreen("revealMessage");
    }
  } catch {
    showScreen("revealError");
  }
}

document.addEventListener("DOMContentLoaded", loadReveal);
```

- [ ] **Step 3: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add reveal.html js/reveal.js
git commit -m "feat: add reveal page — kokkok message + match reveal"
```

---

### Task 9: PWA — manifest.json + Service Worker + Icons

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon-192.png` (generated)
- Create: `icons/icon-512.png` (generated)

- [ ] **Step 1: Write manifest.json**

Create `manifest.json`:

```json
{
  "name": "콕콕",
  "short_name": "콕콕",
  "description": "좋아하는 마음, 살짝 찔러보기",
  "start_url": "/kokkok/",
  "scope": "/kokkok/",
  "display": "standalone",
  "background_color": "#0A0A1A",
  "theme_color": "#FF6B8A",
  "orientation": "portrait",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Write sw.js**

Create `sw.js`:

```javascript
const CACHE_NAME = "kokkok-v1";
const STATIC_ASSETS = [
  "/kokkok/",
  "/kokkok/index.html",
  "/kokkok/reveal.html",
  "/kokkok/css/style.css",
  "/kokkok/js/app.js",
  "/kokkok/js/supabase-client.js",
  "/kokkok/js/reveal.js",
  "/kokkok/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for API calls, cache-first for static assets
  if (event.request.url.includes("supabase.co")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 3: Generate PWA icons**

Use Python to generate simple placeholder icons (pink heart on dark background):

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
mkdir -p icons
python -c "
from PIL import Image, ImageDraw, ImageFont
for size in [192, 512]:
    img = Image.new('RGB', (size, size), '#0A0A1A')
    draw = ImageDraw.Draw(img)
    fs = size // 2
    try:
        font = ImageFont.truetype('seguiemj.ttf', fs)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0,0), '💗', font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    draw.text(((size-tw)//2, (size-th)//2), '💗', font=font, fill='#FF6B8A')
    img.save(f'icons/icon-{size}.png')
print('Icons generated')
"
```

If PIL is not available, create simple pink circles as fallback:

```bash
python -c "
import struct, zlib
def make_png(size, color_rgb):
    width = height = size
    r, g, b = color_rgb
    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            cx, cy = width/2, height/2
            if ((x-cx)**2 + (y-cy)**2) < (width*0.35)**2:
                raw += bytes([r, g, b, 255])
            else:
                raw += bytes([10, 10, 26, 255])
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
for s in [192, 512]:
    with open(f'icons/icon-{s}.png', 'wb') as f:
        f.write(make_png(s, (255, 107, 138)))
print('Icons generated')
"
```

- [ ] **Step 4: Register service worker in index.html and reveal.html**

Add before closing `</body>` in both `index.html` and `reveal.html`:

```html
<script>
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
</script>
```

- [ ] **Step 5: Commit**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add manifest.json sw.js icons/ index.html reveal.html
git commit -m "feat: add PWA support — manifest, service worker, icons"
```

---

### Task 10: Deploy to GitHub Pages + Final Config

**Files:**
- Modify: `js/supabase-client.js` (add real keys)

- [ ] **Step 1: Update supabase-client.js with real credentials**

Replace the placeholder values in `js/supabase-client.js`:

```javascript
const SUPABASE_URL = "https://YOUR_ACTUAL_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ACTUAL_ANON_KEY";
```

- [ ] **Step 2: Enable GitHub Pages**

Go to https://github.com/yzall94/kokkok/settings/pages:
- Source: Deploy from branch
- Branch: `master` / `/ (root)`
- Save

Wait 1-2 minutes. Site will be live at: `https://yzall94.github.io/kokkok/`

- [ ] **Step 3: Update SITE_URL in Supabase**

In Supabase Dashboard → Edge Functions → Secrets:
- `SITE_URL` = `https://yzall94.github.io/kokkok`

- [ ] **Step 4: Push all code and verify**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git push origin master
```

Visit `https://yzall94.github.io/kokkok/` and test the full flow:
1. Splash screen loads with "콕콕" title
2. Enter name → next
3. Enter phone → receive SMS code → verify
4. Enter target phone + optional hint → submit
5. Target receives SMS with link
6. Link opens reveal page with message

- [ ] **Step 5: Commit any final fixes**

```bash
cd "D:/dk.park/CLAUDE CODE/kokkok"
git add -A
git commit -m "chore: configure Supabase credentials and deploy"
git push origin master
```
