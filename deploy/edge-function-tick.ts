// supabase/functions/tick/index.ts
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
function toOpenAiMessages(system, messages) {
  return [
    { role: "system", content: system },
    ...messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map((b) => b.type === "image" ? { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } } : { type: "text", text: String(b.text ?? "") })
    }))
  ];
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
var RETRYABLE = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var UpstreamError = class extends Error {
  constructor(status, body, message) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "UpstreamError";
  }
  status;
  body;
};
function friendlyError(status, body, model) {
  const lower = body.toLowerCase();
  if (status === 429) return "The AI service is rate limited right now. Wait a minute and try again \u2014 or check your usage limits in Google AI Studio.";
  if (RETRYABLE.has(status)) return "The AI service is busy right now. That is temporary \u2014 try again in a few seconds.";
  if (status === 401 || status === 403) return "Your AI key was rejected. Check GEMINI_API_KEY in the Supabase function secrets.";
  if (status === 404 || lower.includes("not found") || lower.includes("is not supported")) {
    return `The model "${model}" is not available on your key. Set an AI_MODEL secret to a model you can use, for example gemini-3.7-flash.`;
  }
  if (lower.includes("api key")) return "Your AI key was not accepted. Check GEMINI_API_KEY in the Supabase function secrets.";
  if (status === 400) return `The AI rejected the request (400). ${body.slice(0, 160)}`;
  return `AI request failed (${status}). Try again shortly.`;
}
async function fetchWithRetry(url, init, model, attempts = 3) {
  let status = 0, body = "";
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      status = 0;
      body = String(e);
      if (i === attempts - 1) throw new UpstreamError(0, body, "Could not reach the AI service. Check the connection and try again.");
      await sleep(600 * 2 ** i);
      continue;
    }
    if (res.ok) return res;
    status = res.status;
    body = await res.text().catch(() => "");
    if (!RETRYABLE.has(status) || i === attempts - 1) break;
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1e3, 8e3) : 700 * 2 ** i + Math.random() * 400);
  }
  throw new UpstreamError(status, body, friendlyError(status, body, model));
}
async function gemini(key, o) {
  const model = env("AI_MODEL") || "gemini-3.8-flash";
  const generationConfig = { maxOutputTokens: Math.max((o.max_tokens ?? 1500) * 4, 4096), temperature: o.temperature ?? (o.tool ? 0.2 : 0.6) };
  if (o.tool) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = toGeminiSchema(o.tool.input_schema);
  }
  const init = {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: o.system }] }, contents: toGeminiContents(o.messages), generationConfig })
  };
  const url = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
  let res;
  try {
    res = await fetchWithRetry(url(model), init, model);
  } catch (e) {
    const alt = env("AI_MODEL_FALLBACK");
    if (!alt || alt === model || !(e instanceof UpstreamError) || !RETRYABLE.has(e.status)) throw e;
    res = await fetchWithRetry(url(alt), init, alt, 2);
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
  if (!text) throw new Error(`AI returned no answer (${cand?.finishReason || data.promptFeedback?.blockReason || "empty response"})`);
  return o.tool ? parseJson(text) : text;
}
async function anthropic(key, o) {
  const body = { model: env("AI_MODEL") || "claude-sonnet-5-5", max_tokens: o.max_tokens ?? 1500, system: o.system, messages: o.messages, temperature: o.temperature ?? 1 };
  if (o.tool) {
    body.tools = [o.tool];
    body.tool_choice = { type: "tool", name: o.tool.name };
  }
  const res = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) },
    String(body.model)
  );
  const data = await res.json();
  if (o.tool) {
    const block = data.content?.find((b) => b.type === "tool_use");
    if (!block) throw new Error("AI returned no structured result");
    return block.input;
  }
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
async function openaiCompatible(o) {
  const base = (env("OPENAI_BASE_URL") || "").replace(/\/$/, "");
  if (!base) throw new Error("OPENAI_BASE_URL is not set. Point it at your provider, e.g. https://openrouter.ai/api/v1 or http://localhost:11434/v1");
  const model = env("AI_MODEL_OPENAI") || env("AI_MODEL") || "qwen3-vl";
  const key = env("OPENAI_API_KEY") || "not-needed";
  const system = o.tool ? `${o.system}

Reply with a single JSON object and nothing else \u2014 no markdown fence, no commentary. It must match this JSON Schema exactly:
${JSON.stringify(o.tool.input_schema)}` : o.system;
  const body = {
    model,
    messages: toOpenAiMessages(system, o.messages),
    max_tokens: o.max_tokens ?? 1500,
    temperature: o.temperature ?? (o.tool ? 0.2 : 0.6)
  };
  if (o.tool) body.response_format = { type: "json_object" };
  const res = await fetchWithRetry(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  }, model);
  const data = await res.json();
  const text = String(data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error(`AI returned no answer (${data.choices?.[0]?.finish_reason || "empty response"})`);
  return o.tool ? parseJson(text) : text;
}
function pickProvider() {
  const named = (env("AI_PROVIDER") || "").toLowerCase();
  if (named === "gemini" || named === "anthropic" || named === "openai") return named;
  if (env("GEMINI_API_KEY")) return "gemini";
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("OPENAI_BASE_URL")) return "openai";
  throw new Error("No AI provider configured. Set GEMINI_API_KEY, or ANTHROPIC_API_KEY, or OPENAI_BASE_URL (+ OPENAI_API_KEY) in the Supabase function secrets.");
}
function callProvider(p, o) {
  if (p === "openai") return openaiCompatible(o);
  if (p === "anthropic") {
    const k2 = env("ANTHROPIC_API_KEY");
    if (!k2) throw new Error("ANTHROPIC_API_KEY is not set");
    return anthropic(k2, o);
  }
  const k = env("GEMINI_API_KEY");
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return gemini(k, o);
}
async function ai(o) {
  const primary = pickProvider();
  try {
    return await callProvider(primary, o);
  } catch (e) {
    const fb = (env("AI_FALLBACK_PROVIDER") || "").toLowerCase();
    const usable = (fb === "gemini" || fb === "anthropic" || fb === "openai") && fb !== primary;
    if (!usable || !(e instanceof UpstreamError) || !RETRYABLE.has(e.status)) throw e;
    return callProvider(fb, o);
  }
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
function localMinutes(d, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  }
  const g = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}
function weekdayIndex(d, tz) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
}
function localWeekday(d, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
}
function addDays(date, n) {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekStart(date) {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  return addDays(date, -((d.getUTCDay() + 6) % 7));
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

// supabase/functions/tick/index.ts
function envKey(...names) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v.split(",")[0].trim();
  }
  return "";
}
var SERVICE_KEY = () => envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
var WINDOW_MIN = 20;
var COPY = {
  hydration: { title: "Hydration \u{1F4A7}", body: "Time for a glass of water." },
  breakfast: { title: "Breakfast time \u{1F373}", body: "Take a photo of your breakfast to log it." },
  mid_morning: { title: "Mid-morning snack \u{1F34E}", body: "Time for your snack. Snap a photo to log it." },
  lunch: { title: "Lunch time \u{1F35B}", body: "Take a photo of your lunch to log it." },
  evening_snack: { title: "Evening snack \u{1F95C}", body: "Time for your snack. Snap a photo to log it." },
  dinner: { title: "Dinner time \u{1F37D}\uFE0F", body: "Take a photo of your dinner to log it." },
  review: { title: "Your daily report is ready \u{1F4CA}", body: "See how today went and get three ideas for tomorrow." }
};
function copyFor(r) {
  if (r.kind === "meal") return COPY[r.slot ?? ""] ?? { title: r.label, body: "Tap to log this meal." };
  if (r.kind === "hydration") return { title: `${r.label} \u{1F4A7}`, body: COPY.hydration.body };
  if (r.kind === "weight") return { title: `${r.label} \u2696\uFE0F`, body: "Log your weight so the weekly trend stays accurate." };
  return COPY[r.kind] ?? { title: r.label, body: "Tap to open NutriTrack." };
}
Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
  const sb = createClient(Deno.env.get("SUPABASE_URL"), SERVICE_KEY());
  const vapid = vapidFromEnv((k) => Deno.env.get(k));
  const now = /* @__PURE__ */ new Date();
  const stats = { pushed: 0, snoozed: 0, reports: 0, removed: 0, errors: [] };
  async function push(uid, payload) {
    if (!vapid) {
      stats.errors.push("VAPID keys missing");
      return;
    }
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", uid).is("deleted_at", null);
    for (const s of subs ?? []) {
      try {
        const status = await sendPush(s, payload, vapid);
        if (status === 404 || status === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          stats.removed++;
        } else if (status >= 200 && status < 300) stats.pushed++;
        else stats.errors.push(`push ${status}`);
      } catch (e) {
        stats.errors.push(String(e));
      }
    }
  }
  try {
    const [{ data: profiles }, { data: reminders }] = await Promise.all([
      sb.from("profiles").select("id, timezone").is("deleted_at", null),
      sb.from("reminders").select("*").eq("enabled", true).is("deleted_at", null)
    ]);
    const tzOf = new Map((profiles ?? []).map((p) => [p.id, p.timezone || "UTC"]));
    for (const r of reminders ?? []) {
      const tz = tzOf.get(r.user_id);
      if (!tz) continue;
      const [h, m] = String(r.time).split(":").map(Number);
      const late = localMinutes(now, tz) - (h * 60 + m);
      if (late < 0 || late > WINDOW_MIN) continue;
      if (r.weekday !== null && r.weekday !== void 0 && r.weekday !== weekdayIndex(now, tz)) continue;
      const date = localDate(now, tz);
      const id = await stableId(`rev:${r.id}:${date}`);
      const { data: ev } = await sb.from("reminder_events").select("*").eq("id", id).maybeSingle();
      if (ev && (ev.pushed_at || ev.status !== "sent")) continue;
      if (r.kind === "meal") {
        const { data: done } = await sb.from("meals").select("id").eq("user_id", r.user_id).eq("local_date", date).eq("slot", r.slot).in("status", ["logged", "skipped"]).is("deleted_at", null).limit(1);
        if (done?.length) {
          await sb.from("reminder_events").upsert({ id, user_id: r.user_id, reminder_id: r.id, local_date: date, status: "completed", pushed_at: now.toISOString() });
          continue;
        }
      }
      const { error } = await sb.from("reminder_events").upsert({ id, user_id: r.user_id, reminder_id: r.id, local_date: date, status: "sent", pushed_at: now.toISOString() });
      if (error) {
        stats.errors.push(error.message);
        continue;
      }
      const copy = copyFor(r);
      let url = `/remind/${r.id}/${date}`;
      if (r.kind === "review") {
        try {
          await generateDaily(sb, r.user_id, date);
          stats.reports++;
          if (localWeekday(now, tz) === "Sun") {
            await generateWeekly(sb, r.user_id, weekStart(date));
            stats.reports++;
          }
        } catch (e) {
          stats.errors.push(`report: ${e}`);
        }
        url = `/report/${date}`;
      }
      await push(r.user_id, {
        title: copy.title,
        body: copy.body,
        url,
        tag: `r-${r.id}`,
        actions: r.kind === "meal" ? [{ action: "snooze10", title: "Snooze 10 min" }, { action: "snooze15", title: "Snooze 15 min" }] : []
      });
    }
    const { data: snoozed } = await sb.from("reminder_events").select("*, reminders(*)").eq("status", "snoozed").lte("snoozed_until", now.toISOString()).is("deleted_at", null);
    for (const ev of snoozed ?? []) {
      const r = ev.reminders;
      if (!r) continue;
      await sb.from("reminder_events").update({ status: "sent", snoozed_until: null, pushed_at: now.toISOString() }).eq("id", ev.id);
      const copy = copyFor(r);
      await push(ev.user_id, {
        title: copy.title,
        body: `Snoozed reminder. ${copy.body}`,
        url: `/remind/${r.id}/${ev.local_date}`,
        tag: `r-${r.id}`,
        actions: [{ action: "snooze10", title: "Snooze 10 min" }, { action: "snooze15", title: "Snooze 15 min" }]
      });
      stats.snoozed++;
    }
  } catch (e) {
    stats.errors.push(String(e));
  }
  return json(stats);
});
