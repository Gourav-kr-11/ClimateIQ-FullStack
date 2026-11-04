import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const app = express();
const allowedOrigins = new Set([
    process.env.CLIENT_ORIGIN,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://10.147.140.42:5173",
    "http://10.147.140.42:5174"
].filter(Boolean));

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} is not allowed by CORS`));
        }
    },
    credentials: true
}));

app.use(express.json());

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createToken(userId) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured.");
    }
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email };
}

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.post("/api/auth/register", asyncRoute(async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
        return res.status(400).json({ error: "Enter a name, valid email address, and password with at least 8 characters." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );
        const user = { id: result.insertId, name, email };
        return res.status(201).json({ token: createToken(user.id), user });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "An account with this email already exists." });
        }
        throw error;
    }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
        return res.status(400).json({ error: "Enter your email address and password." });
    }

    const [rows] = await pool.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1",
        [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Email or password is incorrect." });
    }

    return res.json({ token: createToken(user.id), user: publicUser(user) });
}));

app.get("/api/auth/me", requireAuth, asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT id, name, email FROM users WHERE id = ? LIMIT 1",
        [req.user.id]
    );
    if (!rows[0]) {
        return res.status(401).json({ error: "Your account no longer exists. Please log in again." });
    }
    return res.json({ user: publicUser(rows[0]) });
}));

app.get("/api/footprints", requireAuth, asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT id, total_tonnes AS total, transport_tonnes AS transport,
                flights_tonnes AS flights, diet_tonnes AS diet,
                home_tonnes AS home, consumption_tonnes AS consumption,
                inputs, created_at
         FROM footprints WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
        [req.user.id]
    );
    return res.json({ footprints: rows });
}));

app.post("/api/footprints", requireAuth, asyncRoute(async (req, res) => {
    const values = ["total", "transport", "flights", "diet", "home", "consumption"]
        .map(key => Number(req.body[key]));
    const inputs = req.body.inputs;
    if (values.some(value => !Number.isFinite(value) || value < 0) ||
        !inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        return res.status(400).json({ error: "Provide valid non-negative footprint values and calculator inputs." });
    }

    const [result] = await pool.execute(
        `INSERT INTO footprints
            (user_id, total_tonnes, transport_tonnes, flights_tonnes,
             diet_tonnes, home_tonnes, consumption_tonnes, inputs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, ...values, JSON.stringify(inputs)]
    );
    return res.status(201).json({
        footprint: {
            id: result.insertId,
            total: values[0],
            transport: values[1],
            flights: values[2],
            diet: values[3],
            home: values[4],
            consumption: values[5],
            inputs
        }
    });
}));

app.get("/api/climate", asyncRoute(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    if (!city || city.length > 100) {
        return res.status(400).json({ error: "Enter a city name to look up." });
    }

    const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodingUrl.search = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
    const geocodingResponse = await fetch(geocodingUrl);
    if (!geocodingResponse.ok) {
        return res.status(502).json({ error: "The city search service is unavailable. Please try again later." });
    }
    const geocodingData = await geocodingResponse.json();
    const place = geocodingData.results?.[0];
    if (!place) {
        return res.status(404).json({ error: `No matching city was found for "${city}".` });
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature",
        timezone: "auto"
    });
    const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    airUrl.search = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "pm2_5,us_aqi",
        timezone: "auto"
    });
    const [weatherResponse, airResponse] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!weatherResponse.ok || !airResponse.ok) {
        return res.status(502).json({ error: "Current climate data is unavailable for this city. Please try again later." });
    }
    const [weatherData, airData] = await Promise.all([weatherResponse.json(), airResponse.json()]);
    return res.json({
        place: { name: place.name, admin1: place.admin1, country: place.country },
        weather: weatherData.current,
        air: airData.current,
        attribution: "Weather and air-quality data: Open-Meteo"
    });
}));

async function requestAnthropic(messages, system) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        const error = new Error("AI features are not configured. Add ANTHROPIC_API_KEY to server/.env.");
        error.status = 503;
        throw error;
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
            max_tokens: 800,
            system,
            messages
        })
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error?.message || "The AI service could not complete the request.");
        error.status = 502;
        throw error;
    }
    return result.content?.filter(item => item.type === "text").map(item => item.text).join("\n") || "";
}

app.post("/api/ai/analyze", requireAuth, asyncRoute(async (req, res) => {
    const footprint = req.body;
    if (!footprint || typeof footprint !== "object" || !Number.isFinite(Number(footprint.total))) {
        return res.status(400).json({ error: "Provide a valid footprint to analyze." });
    }
    const explanation = await requestAnthropic(
        [{ role: "user", content: `Explain this annual carbon footprint and suggest three practical actions: ${JSON.stringify(footprint)}` }],
        "You are a practical climate advisor. Give evidence-aware, low-cost suggestions and avoid presenting estimates as exact."
    );
    return res.json({ explanation, actions: [] });
}));

app.post("/api/ai/chat", requireAuth, asyncRoute(async (req, res) => {
    const messages = req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0 ||
        messages.some(message => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
        return res.status(400).json({ error: "Provide a valid chat message history." });
    }
    const system = `You are a practical climate advisor. Give clear, evidence-aware suggestions. User footprint context: ${JSON.stringify(req.body.footprint || null)}`;
    const reply = await requestAnthropic(messages.slice(-10), system);
    return res.json({ reply });
}));

app.use((error, _req, res, _next) => {
    console.error("API request failed:", error);
    if (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_DB_ERROR") {
        return res.status(503).json({ error: "The ClimateIQ database is not initialized. Run server/sql/schema.sql and restart the server." });
    }
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        return res.status(503).json({ error: "Cannot connect to MySQL. Check the database service and server/.env settings." });
    }
    return res.status(error.status || 500).json({
        error: error.status ? error.message : "The server could not complete the request. Check the server logs."
    });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`ClimateIQ server listening on port ${port}`);
});