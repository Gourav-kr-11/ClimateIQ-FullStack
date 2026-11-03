import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 180 }));
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "ClimateIQ API" }));

function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || name.trim().length > 100) return res.status(400).json({ error: "Enter a name (maximum 100 characters)." });
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Password must contain at least 8 characters." });
    const [exists] = await pool.execute("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (exists.length) return res.status(409).json({ error: "An account with this email already exists." });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)", [name.trim(), email.toLowerCase(), hash]);
    const user = { id: result.insertId, name: name.trim(), email: email.toLowerCase() };
    res.status(201).json({ token: issueToken(user), user });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== "string") return res.status(400).json({ error: "Enter your email and password." });
    const [rows] = await pool.execute("SELECT id,name,email,password_hash FROM users WHERE email = ?", [email.toLowerCase()]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: "Incorrect email or password." });
    const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    res.json({ token: issueToken(user), user });
  } catch (err) { next(err); }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT id,name,email FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "Account not found." });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

app.post("/api/footprints", requireAuth, async (req, res, next) => {
  try {
    const d = req.body || {};
    const keys = ["total", "transport", "flights", "diet", "home", "consumption"];
    if (keys.some(k => !Number.isFinite(Number(d[k])) || Number(d[k]) < 0) || !d.inputs || typeof d.inputs !== "object") {
      return res.status(400).json({ error: "Invalid footprint data." });
    }
    const values = keys.map(k => Number(d[k]));
    if (values[0] > 1000) return res.status(400).json({ error: "Footprint value is outside the supported range." });
    const [result] = await pool.execute(
      `INSERT INTO footprints (user_id,total_tonnes,transport_tonnes,flights_tonnes,diet_tonnes,home_tonnes,consumption_tonnes,inputs)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.user.id, ...values, JSON.stringify(d.inputs)]
    );
    res.status(201).json({ id: result.insertId, message: "Footprint saved." });
  } catch (err) { next(err); }
});

app.get("/api/footprints", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id,total_tonnes AS total,transport_tonnes AS transport,flights_tonnes AS flights,
       diet_tonnes AS diet,home_tonnes AS home,consumption_tonnes AS consumption,inputs,created_at
       FROM footprints WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [req.user.id]
    );
    res.json({ footprints: rows.map(r => ({ ...r, inputs: typeof r.inputs === "string" ? JSON.parse(r.inputs) : r.inputs })) });
  } catch (err) { next(err); }
});

// Public data endpoint: Open-Meteo geocoding + forecast + air quality. No API key required.
app.get("/api/climate", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    if (!city || city.length > 80) return res.status(400).json({ error: "Enter a city name." });
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error("Could not reach the location service.");
    const geo = await geoRes.json();
    const place = geo.results?.[0];
    if (!place) return res.status(404).json({ error: "City not found. Try another spelling." });
    const params = `latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const airParams = `latitude=${place.latitude}&longitude=${place.longitude}&current=pm2_5,pm10,us_aqi,european_aqi`;
    const [weatherRes, airRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${params}`),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`)
    ]);
    if (!weatherRes.ok || !airRes.ok) throw new Error("Climate data is temporarily unavailable.");
    const [weather, air] = await Promise.all([weatherRes.json(), airRes.json()]);
    res.json({ place: { name: place.name, country: place.country, admin1: place.admin1 }, weather: weather.current, air: air.current, attribution: "Weather and air-quality data: Open-Meteo." });
  } catch (err) { res.status(502).json({ error: err.message || "Unable to load climate data." }); }
});

async function callAnthropic(system, messages, max_tokens = 900) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI is not configured yet. Add ANTHROPIC_API_KEY to server/.env.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514", max_tokens, system, messages })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "AI provider request failed.");
  return (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
}

app.post("/api/ai/analyze", requireAuth, async (req, res) => {
  try {
    const d = req.body || {};
    const summary = `Annual estimated footprint: ${d.total} tonnes CO2e. Transport ${d.transport}, flights ${d.flights}, diet ${d.diet}, home ${d.home}, consumption ${d.consumption}. Inputs: ${JSON.stringify(d.inputs || {})}.`;
    const system = "You are ClimateIQ, a careful climate education assistant. Explain estimates clearly, identify the largest categories, and give practical India-relevant suggestions. Do not claim precision. State that figures depend on assumptions. Return concise plain text.";
    const [explanation, actionsRaw] = await Promise.all([
      callAnthropic(system, [{ role: "user", content: `Explain this footprint in 3-5 sentences: ${summary}` }], 500),
      callAnthropic("You are a climate action planner. Return ONLY a valid JSON array of exactly 5 objects with keys title, description, saving_kg. Give conservative estimated annual savings; if not quantifiable, use 0. Never recommend impossible actions.", [{ role: "user", content: summary }], 900)
    ]);
    let actions = [];
    try {
      const cleaned = actionsRaw.replace(/```json|```/g, "").trim();
      actions = JSON.parse(cleaned);
      if (!Array.isArray(actions)) actions = [];
    } catch { actions = []; }
    res.json({ explanation, actions: actions.slice(0, 5) });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.post("/api/ai/chat", requireAuth, async (req, res) => {
  try {
    const { messages = [], footprint } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) return res.status(400).json({ error: "Send between 1 and 12 recent messages." });
    const safeMessages = messages.filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-10);
    const context = footprint ? ` The user's latest estimated annual footprint is ${footprint.total} tonnes CO2e; categories: ${JSON.stringify(footprint)}.` : "";
    const reply = await callAnthropic("You are ClimateIQ, a friendly climate education assistant focused on practical climate action and SDG 13. Be concise, factual, and transparent about uncertainty. Do not invent live AQI or weather data." + context, safeMessages, 700);
    res.json({ reply });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error. Check the backend terminal." });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`ClimateIQ API running at http://localhost:${port}`));
