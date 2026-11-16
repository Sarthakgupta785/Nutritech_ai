// supabase/functions/api/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/_shared/ai.ts
var env = (k) => globalThis.Deno?.env.get(k);
function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type") {
      const types = Array.isArray(v) ? v : [v];
      const main = types.find((t) => t !== "null") ?? "string";
      out.type = String(main).toUpperCase();
      if (types.includes("null")) out.nullable = true;
    } else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v).map(([p, d]) => [p, toGeminiSchema(d)]));
    else if (k === "items") out.items = toGeminiSchema(v);
    else if (["required", "enum", "description", "minItems", "maxItems"].includes(k)) out[k] = v;
  }
  return out;
}
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: typeof m.content === "string" ? [{ text: m.content }] : m.content.map((b) => b.type === "image" ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } } : { text: String(b.text ?? "") })
  }));
}
function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
  }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("AI returned a result that could not be read. Please try again.");
}
async function gemini(key, o) {
  const model = env("AI_MODEL") || "gemini-3.8-flash";
  const generationConfig = { maxOutputTokens: Math.max((o.max_tokens ?? 1500) * 4, 4096), temperature: o.tool ? 0.2 : 0.6 };
  if (o.tool) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = toGeminiSchema(o.tool.input_schema);
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: o.system }] }, contents: toGeminiContents(o.messages), generationConfig })
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
  if (!text) throw new Error(`AI returned no answer (${cand?.finishReason || data.promptFeedback?.blockReason || "empty response"})`);
  return o.tool ? parseJson(text) : text;
}
async function anthropic(key, o) {
  const body = { model: env("AI_MODEL") || "claude-sonnet-5-5", max_tokens: o.max_tokens ?? 1500, system: o.system, messages: o.messages };
  if (o.tool) {
    body.tools = [o.tool];
    body.tool_choice = { type: "tool", name: o.tool.name };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (o.tool) {
    const block = data.content?.find((b) => b.type === "tool_use");
    if (!block) throw new Error("AI returned no structured result");
    return block.input;
  }
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
async function ai(o) {
  const g = env("GEMINI_API_KEY"), a = env("ANTHROPIC_API_KEY");
  if (g) return gemini(g, o);
  if (a) return anthropic(a, o);
  throw new Error("No AI key is set. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to the Supabase function secrets.");
}
var PRINCIPLES = `You are the nutrition assistant inside NutriTrack AI, a personal food-tracking app used by one adult.
Ground rules, always:
- Base every statement on the user's actual records supplied in the context. If something was not logged, say it is "unlogged"; never assume it was skipped or eaten.
- All food numbers are estimates. Do not present them as exact.
- Be practical, specific, warm and non-judgmental. Never shame, scold or moralise about food. Missing a target is information, not failure.
- Never encourage crash dieting, fasting to compensate, skipping meals to "save" calories, or eating below the user's set target. If the user asks for that, explain the downside briefly and offer a steadier alternative.
- Respect the user's food preferences and avoid list exactly. Never suggest avoided foods. Respect the daily whey limit.
- Exercise calories are estimates shown separately; never add them back to the food allowance.
- You are not a doctor. For medical conditions, medication, or very low calorie targets, point to a doctor or registered dietitian in one short sentence.
- Do not promise specific weight-loss speeds or spot reduction. Daily weight changes are mostly water; talk about multi-day trends.`;

// supabase/functions/_shared/util.ts
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function localDate(d, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
function addDays(date, n) {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function stableId(text) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).slice(0, 16);
  h[6] = h[6] & 15 | 80;
  h[8] = h[8] & 63 | 128;
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// supabase/functions/_shared/context.ts
var SLOT_NAMES = { breakfast: "Breakfast", mid_morning: "Mid-morning snack", lunch: "Lunch", evening_snack: "Evening snack", dinner: "Dinner", other: "Other" };
var r1 = (n) => Math.round(n * 10) / 10;
async function loadContext(sb, uid, date, days = 7) {
  const from = addDays(date, -(days - 1));
  const q = (t2) => sb.from(t2).select("*").eq("user_id", uid).is("deleted_at", null);
  const [profile, targets, prefs, meals, water, weights, reminders, events, workouts] = await Promise.all([
    q("profiles").maybeSingle(),
    q("nutrition_targets").maybeSingle(),
    q("user_preferences").maybeSingle(),
    q("meals").gte("local_date", from).lte("local_date", date).order("eaten_at"),
    q("water_logs").gte("local_date", from).lte("local_date", date),
    q("weight_logs").gte("local_date", addDays(date, -29)).lte("local_date", date).order("local_date"),
    q("reminders").order("time"),
    q("reminder_events").gte("local_date", from).lte("local_date", date),
    q("workouts").gte("local_date", from).lte("local_date", date)
  ]);
  const mealRows = meals.data ?? [];
  const ids = mealRows.map((m) => m.id);
  const items = ids.length ? (await q("meal_items").in("meal_id", ids)).data ?? [] : [];
  const photos = ids.length ? (await q("meal_photos").in("meal_id", ids)).data ?? [] : [];
  const tz = profile.data?.timezone || "UTC";
  const time = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const mealReminders = (reminders.data ?? []).filter((r) => r.kind === "meal" && r.enabled);
  const summaries = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const dayMeals = mealRows.filter((m) => m.local_date === d);
    const logged = dayMeals.filter((m) => m.status === "logged");
    const mealOut = logged.map((m) => {
      const its = items.filter((x) => x.meal_id === m.id).sort((a, b) => a.sort - b.sort);
      const s = (k) => its.reduce((n, x) => n + Number(x[k] || 0), 0);
      return {
        name: m.name || SLOT_NAMES[m.slot] || "Meal",
        slot: m.slot,
        time: time(m.eaten_at),
        kcal: Math.round(s("kcal")),
        protein_g: r1(s("protein_g")),
        carbs_g: r1(s("carbs_g")),
        fat_g: r1(s("fat_g")),
        fibre_g: r1(s("fibre_g")),
        photo: photos.some((p2) => p2.meal_id === m.id),
        items: its.map((x) => `${x.name} ${Math.round(x.quantity)}${x.unit}${x.cooking_method ? ` (${x.cooking_method})` : ""} \u2014 ${Math.round(x.kcal)} kcal [${x.source}]`),
        fats: its.filter((x) => /\b(oil|ghee|butter|mayo|mayonnaise)\b/i.test(x.name)).reduce((n, x) => n + Number(x.kcal || 0), 0)
      };
    });
    const tot = (k) => mealOut.reduce((n, m) => n + m[k], 0);
    const dayEvents = (events.data ?? []).filter((e) => e.local_date === d);
    const slots = mealReminders.map((r) => {
      const lm = logged.find((m) => m.slot === r.slot), sk = dayMeals.find((m) => m.slot === r.slot && m.status === "skipped");
      const ev = dayEvents.find((e) => e.reminder_id === r.id);
      const status = lm ? "logged" : sk || ev?.status === "skipped" ? "skipped" : "unlogged";
      return { slot: r.slot, label: r.label, scheduled: r.time, status, ...lm ? { eaten_at: time(lm.eaten_at), kcal: mealOut.find((m) => m.slot === r.slot)?.kcal } : {} };
    });
    const w = (workouts.data ?? []).filter((x) => x.local_date === d);
    summaries.push({
      date: d,
      kcal: Math.round(tot("kcal")),
      protein_g: r1(tot("protein_g")),
      carbs_g: r1(tot("carbs_g")),
      fat_g: r1(tot("fat_g")),
      fibre_g: r1(tot("fibre_g")),
      water_ml: (water.data ?? []).filter((x) => x.local_date === d).reduce((n, x) => n + Number(x.amount_ml), 0),
      meals_logged: logged.length,
      slots,
      meals: mealOut.map(({ fats: _f, ...m }) => m),
      added_fats_kcal: Math.round(mealOut.reduce((n, m) => n + m.fats, 0)),
      reminders: { completed: slots.filter((s) => s.status === "logged").length, skipped: slots.filter((s) => s.status === "skipped").length, no_response: slots.filter((s) => s.status === "unlogged").length },
      workout: w.length ? { minutes: w.reduce((n, x) => n + Number(x.duration_min), 0), est_kcal: w.reduce((n, x) => n + Number(x.est_kcal), 0), category: w.map((x) => x.category).join(", ") } : null
    });
  }
  const p = profile.data, t = targets.data, pr = prefs.data;
  return {
    tz,
    profile: p ? { name: p.name, sex: p.sex, age: p.age, height_cm: Number(p.height_cm), weight_kg: Number(p.weight_kg), activity: p.activity, goal: p.goal } : null,
    targets: t ? { kcal: Number(t.kcal), protein_g: Number(t.protein_g), carbs_g: Number(t.carbs_g), fat_g: Number(t.fat_g), fibre_g: Number(t.fibre_g), water_ml: Number(t.water_ml) } : null,
    preferences: pr ? { diet: pr.diet, preferred_foods: pr.preferred, avoid_foods: pr.avoid, whey_max_scoops_per_day: pr.whey_max_scoops } : null,
    today: summaries[summaries.length - 1],
    history: summaries.slice(0, -1),
    weights: (weights.data ?? []).map((x) => ({ date: x.local_date, kg: Number(x.weight_kg) }))
  };
}

// supabase/functions/_shared/reports.ts
var str = { type: "string" };
var DAILY_TOOL = {
  name: "daily_report",
  description: "Structured end-of-day nutrition report",
  input_schema: {
    type: "object",
    required: ["headline", "calorie_target", "protein", "carb_fat_balance", "strongest_meal", "meal_to_improve", "schedule", "missed_meals", "oil_and_extras", "adjustments", "improve_tomorrow", "action_plan"],
    properties: {
      headline: { ...str, description: "One encouraging, honest sentence summarising the day" },
      calorie_target: { ...str, description: "Did they stay within the calorie target? Use the numbers." },
      protein: { ...str, description: "Was protein sufficient versus target?" },
      carb_fat_balance: { ...str, description: "Were carbs and fats balanced versus targets?" },
      strongest_meal: { ...str, description: "Which logged meal was strongest and why" },
      meal_to_improve: { ...str, description: "Which logged meal could be improved and one concrete tweak" },
      schedule: { ...str, description: "Did meal times follow the schedule? Compare eaten_at to scheduled." },
      missed_meals: { ...str, description: "Skipped meals (explicitly marked) and unlogged slots, kept distinct" },
      oil_and_extras: { ...str, description: "Added oil/fats/sauces/extra calories, based only on logged items" },
      adjustments: { ...str, description: "What got in the way today, phrased as neutral observations rather than faults" },
      improve_tomorrow: { ...str, description: "The main thing to do differently tomorrow" },
      action_plan: { type: "array", minItems: 3, maxItems: 3, items: str, description: "Exactly three specific, doable actions for tomorrow that fit the preferences" }
    }
  }
};
async function generateDaily(sb, uid, date) {
  const ctx = await loadContext(sb, uid, date, 7);
  const day = ctx.today;
  const nothing = day.meals_logged === 0;
  const report = await ai({
    system: `${PRINCIPLES}

Write the end-of-day report. Each field is 1\u20133 short sentences in plain language, addressed to the user as "you". ${nothing ? "No meals were logged today: say so plainly without judgment, do not analyse food that is not there, and make the action plan about making logging easy tomorrow." : ""}`,
    messages: [{ role: "user", content: `Report date: ${date}

Records (JSON):
${JSON.stringify(ctx)}` }],
    tool: DAILY_TOOL,
    max_tokens: 1400
  });
  const row = { id: await stableId(`daily:${uid}:${date}`), user_id: uid, local_date: date, summary: { day, targets: ctx.targets }, report, deleted_at: null };
  const { error } = await sb.from("daily_reports").upsert(row);
  if (error) throw new Error(error.message);
  return row;
}
var WEEKLY_TOOL = {
  name: "weekly_report",
  description: "Structured weekly progress report",
  input_schema: {
    type: "object",
    required: ["headline", "progress", "nutrition", "consistency", "weight_trend", "improvements"],
    properties: {
      headline: str,
      progress: { ...str, description: "Overall progress this week in 2\u20133 sentences" },
      nutrition: { ...str, description: "Average calories and macros versus targets" },
      consistency: { ...str, description: "Meal logging, schedule and hydration consistency; unlogged is not skipped" },
      weight_trend: { ...str, description: "Weight trend using multi-day averages only; if fewer than 4 weigh-ins say there is not enough data" },
      improvements: { type: "array", minItems: 2, maxItems: 4, items: str }
    }
  }
};
async function generateWeekly(sb, uid, start) {
  const end = addDays(start, 6);
  const ctx = await loadContext(sb, uid, end, 7);
  const days = [...ctx.history, ctx.today];
  const report = await ai({
    system: `${PRINCIPLES}

Write the weekly report for ${start} to ${end}. Only count days that have logged meals when averaging intake, and say how many days that was. Each text field is 2\u20133 short sentences.`,
    messages: [{ role: "user", content: JSON.stringify({ ...ctx, today: void 0, history: void 0, days }) }],
    tool: WEEKLY_TOOL,
    max_tokens: 1200
  });
  const row = { id: await stableId(`weekly:${uid}:${start}`), user_id: uid, week_start: start, summary: { days, targets: ctx.targets, weights: ctx.weights }, report, deleted_at: null };
  const { error } = await sb.from("weekly_reports").upsert(row);
  if (error) throw new Error(error.message);
  return row;
}

// supabase/functions/_shared/webpush.ts
var enc = new TextEncoder();
var bs = (u) => u;
var b64uDecode = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
var b64uEncode = (b) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", bs(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: bs(salt), info: bs(info) }, key, len * 8));
}
async function encryptPayload(sub, payload) {
  const uaPublic = b64uDecode(sub.p256dh), authSecret = b64uDecode(sub.auth);
  const uaKey = await crypto.subtle.importKey("raw", bs(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", bs(cek), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce) }, key, bs(concat(enc.encode(payload), new Uint8Array([2])))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}
async function vapidHeader(endpoint, v) {
  const pub = b64uDecode(v.publicKey);
  const jwk = { kty: "EC", crv: "P-256", d: v.privateKey, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1e3) + 12 * 3600, sub: v.subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bs(enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${v.publicKey}`;
}
async function sendPush(sub, payload, v, ttl = 3600) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(sub.endpoint, v), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "high" },
    body: bs(body)
  });
  await res.arrayBuffer().catch(() => null);
  return res.status;
}
function vapidFromEnv(get) {
  const publicKey = get("VAPID_PUBLIC_KEY"), privateKey = get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: get("VAPID_SUBJECT") || "mailto:admin@example.com" };
}

// supabase/functions/api/index.ts
function envKey(...names) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v.split(",")[0].trim();
  }
  return "";
}
var ANON_KEY = () => envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
var num = { type: "number" };
var str2 = { type: "string" };
var ANALYZE_TOOL = {
  name: "meal_analysis",
  description: "Foods visible in a meal photo with estimated portions and nutrition",
  input_schema: {
    type: "object",
    required: ["meal_name", "items", "questions", "assumptions", "overall_confidence"],
    properties: {
      meal_name: { ...str2, description: 'Short descriptive name, e.g. "Chicken, brown rice and eggs"' },
      items: { type: "array", items: {
        type: "object",
        required: ["name", "grams", "unit", "ref_id", "cooking_method", "kcal", "protein_g", "carbs_g", "fat_g", "fibre_g", "confidence", "portion_unclear"],
        properties: {
          name: str2,
          grams: { ...num, description: "Estimated amount in grams (or ml for liquids)" },
          unit: { type: "string", enum: ["g", "ml"] },
          ref_id: { type: ["string", "null"], description: "id from the reference list if this is clearly that food as prepared, otherwise null" },
          cooking_method: { type: ["string", "null"], description: "raw, boiled, steamed, grilled, roasted, pan-fried, deep-fried, curry, baked, or null if unknown" },
          kcal: num,
          protein_g: num,
          carbs_g: num,
          fat_g: num,
          fibre_g: num,
          confidence: { ...num, description: "0\u20131 confidence in identity AND portion together" },
          portion_unclear: { type: "boolean", description: "true when the amount cannot be judged well from the photo" },
          note: { ...str2, description: "Optional short note, e.g. what made the portion hard to judge" }
        }
      } },
      questions: {
        type: "array",
        maxItems: 3,
        items: { type: "object", required: ["question", "kind"], properties: { question: str2, kind: { type: "string", enum: ["oil", "sauce", "other"] } } },
        description: "Only questions whose answer would change the estimate materially: hidden cooking oil/ghee/butter, dressings, sauces, sugar in drinks"
      },
      assumptions: { ...str2, description: "One or two sentences on the main assumptions (plate size, cooked vs raw, oil assumed or not)" },
      overall_confidence: num
    }
  }
};
async function analyzeMeal(b) {
  if (!b.image) throw new Error("No image supplied");
  const refs = Array.isArray(b.refs) ? b.refs.slice(0, 200).map((r) => `${r.id}: ${r.name}`).join("\n") : "";
  const out = await ai({
    system: `You estimate the contents of meal photographs for a food diary. Be careful and honest about uncertainty.
- List every distinct visible food, drink, sauce, chutney and visible oil/butter separately.
- Estimate amounts in grams (ml for liquids) of the food as served, using plate, bowl, cutlery and hand size as scale cues. A photo cannot give exact weights: set portion_unclear true and lower confidence when depth, stacking or bowls hide volume.
- Nutrition values are estimates for the estimated amount. Do NOT include invisible cooking fat in a food's numbers; instead ask about it in "questions" when the dish looks pan-fried, deep-fried, saut\xE9ed or curry-based, or when a dressing/sauce may be present.
- Identify the cooking method only when visible cues support it; otherwise null.
- Set ref_id only for a confident match to the reference list. For mixed dishes not in the list use null.
- If the image contains no food, return an empty items array and explain in assumptions.
- Context only (do not let it override what you see): ${String(b.hint || "no extra context").slice(0, 300)}`,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: b.media_type || "image/jpeg", data: b.image } },
      { type: "text", text: `Reference food ids:
${refs}

Analyse this meal photo.` }
    ] }],
    tool: ANALYZE_TOOL,
    max_tokens: 2500
  });
  return { ...out, analysed_at: (/* @__PURE__ */ new Date()).toISOString() };
}
var LABEL_TOOL = {
  name: "nutrition_label",
  description: "Values read from a packaged food nutrition label",
  input_schema: {
    type: "object",
    required: ["product_name", "brand", "unit", "printed_basis", "kcal", "protein_g", "carbs_g", "fat_g", "fibre_g", "sugar_g", "serving_label", "serving_grams", "confidence", "notes", "verdict"],
    properties: {
      product_name: { ...str2, description: "Product name as printed, without the brand" },
      brand: { type: ["string", "null"] },
      unit: { type: "string", enum: ["g", "ml"], description: "ml only for drinks measured by volume" },
      printed_basis: { type: "string", enum: ["per_100", "per_serving", "both"], description: "What the label actually printed" },
      kcal: { ...num, description: "Energy per 100 g (or 100 ml). Convert if the label only gave per-serving. If only kJ is printed, divide by 4.184." },
      protein_g: { ...num, description: "Protein per 100 g/ml" },
      carbs_g: { ...num, description: "Total carbohydrate per 100 g/ml" },
      fat_g: { ...num, description: "Total fat per 100 g/ml" },
      fibre_g: { ...num, description: "Dietary fibre per 100 g/ml, 0 if not printed" },
      sugar_g: { type: ["number", "null"], description: "Of which sugars, per 100 g/ml; null if not printed" },
      serving_label: { type: ["string", "null"], description: 'Serving as described on the pack, e.g. "1 packet" or "2 biscuits"' },
      serving_grams: { type: ["number", "null"], description: "That serving in grams/ml; null if the label does not say" },
      confidence: { ...num, description: "0-1. Lower it when the label is blurred, partly cut off, or the basis was ambiguous." },
      notes: { ...str2, description: "One short line: any conversion you performed, anything unreadable, or anything the user should check" },
      verdict: { ...str2, description: "One or two sentences on how this fits the user's remaining targets today and their fat-loss goal. Concrete and non-judgmental: name the cost in calories and what it gives back in protein or fibre. If it fits fine, say so plainly. Suggest a swap only when there is an obviously better one among foods they already eat." }
    }
  }
};
async function analyzeLabel(b, ctx) {
  if (!b.image) throw new Error("No image supplied");
  const t = ctx.targets, d = ctx.today;
  const remaining = t ? `Remaining today: ${Math.round(t.kcal - d.kcal)} kcal of ${t.kcal}, ${Math.round(t.protein_g - d.protein_g)} g protein of ${t.protein_g}.` : "Targets unknown.";
  return await ai({
    system: `You read nutrition labels from photographs of packaged food for a food diary. Be literal and careful.
- Report every value per 100 g (or per 100 ml for drinks). Many labels, especially Indian ones, print only a per-serving column: in that case divide by the serving size and say so in notes.
- If energy is given only in kJ, convert to kcal by dividing by 4.184.
- Never guess a number that is not legible. Use 0 only when the label genuinely prints 0; if a value is unreadable or absent, use 0 and say which one in notes so the user can fill it in.
- Do not confuse "per serve" with "per 100 g" columns, and do not mix values from the two.
- If the photo is not a nutrition label at all, set confidence to 0 and explain in notes.
User context for the verdict only, never let it change the numbers you read: ${remaining} Goal: ${ctx.profile?.goal ?? "fat loss"}. Foods they avoid: ${(ctx.preferences?.avoid_foods ?? []).join(", ") || "none"}.`,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: b.media_type || "image/jpeg", data: b.image } },
      { type: "text", text: "Read this nutrition label." }
    ] }],
    tool: LABEL_TOOL,
    max_tokens: 1200
  });
}
async function foodSearch(q) {
  const key = Deno.env.get("FDC_API_KEY") || "DEMO_KEY";
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&pageSize=20&dataType=${encodeURIComponent("Foundation,SR Legacy")}&query=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const data = await res.json();
  const pick = (ns, ...ids) => {
    for (const id of ids) {
      const n = ns.find((x) => x.nutrientId === id);
      if (n && typeof n.value === "number") return n.value;
    }
    return null;
  };
  return (data.foods ?? []).map((f) => {
    const ns = f.foodNutrients ?? [];
    const kcal = pick(ns, 1008, 2048, 2047);
    return kcal == null ? null : { fdc_id: f.fdcId, name: f.description, kcal, protein_g: pick(ns, 1003) ?? 0, carbs_g: pick(ns, 1005) ?? 0, fat_g: pick(ns, 1004) ?? 0, fibre_g: pick(ns, 1079) ?? 0 };
  }).filter(Boolean);
}
var WORKOUT_TOOL = {
  name: "workout_feedback",
  description: "Feedback on a completed home workout",
  input_schema: {
    type: "object",
    required: ["muscles", "balance", "difficulty", "improve", "complement", "recovery"],
    properties: { muscles: str2, balance: str2, difficulty: str2, improve: str2, complement: str2, recovery: str2 }
  }
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL"), ANON_KEY(), { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "Not signed in" }, 401);
    const b = await req.json();
    const tz = (await sb.from("profiles").select("timezone").eq("id", user.id).maybeSingle()).data?.timezone || "UTC";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : localDate(/* @__PURE__ */ new Date(), tz);
    switch (b.action) {
      case "analyze_meal":
        return json({ analysis: await analyzeMeal(b) });
      case "analyze_label":
        return json({ label: await analyzeLabel(b, await loadContext(sb, user.id, date, 1)) });
      case "food_search":
        return json({ foods: await foodSearch(String(b.q || "").slice(0, 80)) });
      case "daily_report":
        return json({ report: await generateDaily(sb, user.id, date) });
      case "weekly_report":
        return json({ report: await generateWeekly(sb, user.id, b.week_start) });
      case "meal_feedback": {
        const ctx = await loadContext(sb, user.id, date, 1);
        const text = await ai({
          system: `${PRINCIPLES}

Give feedback on one meal in at most 2 short sentences: what is good about it for the user's goal, and one optional small tweak. No lists.`,
          messages: [{ role: "user", content: `Targets: ${JSON.stringify(ctx.targets)}
Preferences: ${JSON.stringify(ctx.preferences)}
Day so far: ${ctx.today.kcal} kcal, ${ctx.today.protein_g} g protein
Meal: ${JSON.stringify(b.meal)}` }],
          max_tokens: 200
        });
        return json({ feedback: text });
      }
      case "coach": {
        const ctx = await loadContext(sb, user.id, date, 7);
        const history = (Array.isArray(b.messages) ? b.messages : []).slice(-14).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 4e3) }));
        while (history.length && history[0].role !== "user") history.shift();
        if (!history.length) throw new Error("No message");
        const t = ctx.targets, d = ctx.today;
        const remaining = t ? `Remaining today versus target: ${Math.round(t.kcal - d.kcal)} kcal, ${Math.round(t.protein_g - d.protein_g)} g protein, ${Math.round(t.carbs_g - d.carbs_g)} g carbs, ${Math.round(t.fat_g - d.fat_g)} g fat.` : "";
        const text = await ai({
          system: `${PRINCIPLES}

You are chatting as the user's coach. Answer the actual question first, using their numbers. Keep replies short (under 150 words unless they ask for detail), plain text, no markdown headings. When suggesting food, give portions in grams and approximate calories and protein, and keep suggestions within what remains today.

Today is ${date}. ${remaining}

User records (JSON):
${JSON.stringify(ctx)}`,
          messages: history,
          max_tokens: 700
        });
        return json({ reply: text });
      }
      case "workout_feedback": {
        const ctx = await loadContext(sb, user.id, date, 7);
        const recent = [...ctx.history, ctx.today].filter((x) => x.workout).map((x) => ({ date: x.date, ...x.workout }));
        const out = await ai({
          system: `${PRINCIPLES}

Give feedback on an optional, equipment-free home workout by a beginner. One or two short sentences per field. "recovery" should suggest rest when they trained on several consecutive days or reported high effort. Never pressure the user to train more; workouts are optional.`,
          messages: [{ role: "user", content: `Workout: ${JSON.stringify(b.workout)}
Recent workouts: ${JSON.stringify(recent)}
Profile: ${JSON.stringify(ctx.profile)}` }],
          tool: WORKOUT_TOOL,
          max_tokens: 700
        });
        return json({ feedback: out });
      }
      case "test_push": {
        const vapid = vapidFromEnv((k) => Deno.env.get(k));
        if (!vapid) throw new Error("VAPID keys are not set in Supabase function secrets");
        const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", user.id).is("deleted_at", null);
        if (!subs?.length) throw new Error("This device has no push subscription yet");
        const results = await Promise.all(subs.map((s) => sendPush(s, { title: "NutriTrack AI", body: "Notifications are working.", url: "/", tag: "test" }, vapid)));
        return json({ sent: results.filter((s) => s >= 200 && s < 300).length, statuses: results });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
