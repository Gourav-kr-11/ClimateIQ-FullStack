import React, { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler } from "chart.js";
import { Activity, ArrowDownRight, ArrowRight, Award, BarChart3, Bot, Check, ChevronRight, CloudSun, Footprints, Home, Leaf, LogOut, Menu, MessageCircle, Plus, Recycle, Send, ShieldCheck, Sparkles, Target, TrendingDown, UserRound, Wind, X } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const emptyInputs = { city: "Lucknow", mode: "motorbike", km: 70, shortFlights: 0, longFlights: 0, diet: "vegetarian", waste: "medium", kwh: 120, household: 4, lpg: 1, clothes: "1-2", electronics: "sometimes" };
const factors = {
  transport: { walk_cycle: 0, public: 0.075, car_petrol: 0.192, car_diesel: 0.171, car_electric: 0.055, motorbike: 0.11 },
  diet: { vegan: 1.5, vegetarian: 1.8, flexitarian: 2.6, omnivore: 3.4, meat_heavy: 4.6 },
  waste: { low: 0.04, medium: 0.18, high: 0.38 },
  clothes: { "0": 0, "1-2": 0.18, "3-5": 0.42, "6+": 0.85 },
  electronics: { rarely: 0.08, sometimes: 0.22, often: 0.5 }
};
const challenges = [
  { id: "transit", title: "Choose shared or public transport", detail: "Replace one solo trip with a bus, metro, carpool or walk.", points: 30 },
  { id: "food", title: "Plan meals to avoid food waste", detail: "Use leftovers and plan portions for the next three days.", points: 20 },
  { id: "power", title: "Switch off standby devices", detail: "Unplug chargers and devices that are not in use.", points: 15 },
  { id: "reuse", title: "Reuse before buying new", detail: "Repair, borrow or reuse one item instead of buying it new.", points: 25 }
];

async function request(path, options = {}, token) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function calculate(inputs) {
  const annualKm = Math.max(0, Number(inputs.km) || 0) * 52;
  const transport = annualKm * factors.transport[inputs.mode] / 1000;
  const flights = Math.max(0, Number(inputs.shortFlights) || 0) * 0.25 + Math.max(0, Number(inputs.longFlights) || 0) * 1.55;
  const diet = factors.diet[inputs.diet] + factors.waste[inputs.waste];
  // Starter grid factor: 0.70 kg CO2e/kWh. Replace with a current official factor for a formal inventory.
  const gridFactor = 0.70;
  const home = ((Math.max(0, Number(inputs.kwh) || 0) * 12 * gridFactor) / 1000 + Math.max(0, Number(inputs.lpg) || 0) * 0.12 * 12) / Math.max(1, Number(inputs.household) || 1);
  const consumption = factors.clothes[inputs.clothes] + factors.electronics[inputs.electronics];
  const round = n => Math.round(n * 100) / 100;
  return { total: round(transport + flights + diet + home + consumption), transport: round(transport), flights: round(flights), diet: round(diet), home: round(home), consumption: round(consumption), inputs: { ...inputs, km: Number(inputs.km), kwh: Number(inputs.kwh) } };
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = e => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const data = await request(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      onAuth(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-shell"><div className="auth-art"><div className="brand light"><span className="brand-mark"><Leaf size={20}/></span> ClimateIQ</div><div className="auth-copy"><span className="eyebrow light-text">CLIMATE ACTION STARTS WITH YOU</span><h1>Small choices.<br/><em>Lasting impact.</em></h1><p>Understand your footprint, discover practical ways to reduce it, and keep track of the change you make.</p><div className="auth-stat"><strong>SDG 13</strong><span>Climate Action</span></div></div><div className="orbit orbit-one"/><div className="orbit orbit-two"/></div><div className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand brand"><span className="brand-mark"><Leaf size={20}/></span> ClimateIQ</div><span className="eyebrow">YOUR PERSONAL CLIMATE COMPANION</span><h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2><p className="muted">{mode === "login" ? "Sign in to continue your climate journey." : "Start tracking your environmental impact."}</p><form onSubmit={submit} className="auth-form">{mode === "register" && <label>Full name<input name="name" value={form.name} onChange={update} placeholder="Your name" required/></label>}<label>Email address<input name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required/></label><label>Password<input name="password" type="password" minLength="8" value={form.password} onChange={update} placeholder="At least 8 characters" required/></label>{error && <div className="error">{error}</div>}<button className="btn primary full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={17}/></button></form><p className="switch-auth">{mode === "login" ? "New to ClimateIQ?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create account" : "Sign in"}</button></p><p className="tiny muted"><ShieldCheck size={13}/> Your password is securely hashed on the server.</p></div></div></div>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("climateiq_token") || "");
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [inputs, setInputs] = useState(emptyInputs);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState("Lucknow");
  const [climate, setClimate] = useState(null);
  const [climateBusy, setClimateBusy] = useState(false);
  const [chat, setChat] = useState([{ role: "assistant", content: "Hi! I'm your ClimateIQ advisor. Ask me about your footprint, climate science, or practical ways to reduce emissions." }]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [doneChallenges, setDoneChallenges] = useState(() => JSON.parse(localStorage.getItem("climateiq_challenges") || "[]"));

  useEffect(() => {
    if (!token) return;
    request("/auth/me", {}, token).then(d => setUser(d.user)).catch(() => logout());
    loadHistory();
  }, [token]);

  function logout() { localStorage.removeItem("climateiq_token"); setToken(""); setUser(null); setHistory([]); setResult(null); }
  function onAuth(data) { localStorage.setItem("climateiq_token", data.token); setToken(data.token); setUser(data.user); }
  async function loadHistory() {
    try { const d = await request("/footprints", {}, token); setHistory(d.footprints || []); } catch (e) { setError(e.message); }
  }
  const latest = result || history[0] || null;
  const score = latest ? Math.max(0, Math.min(100, Math.round(100 - latest.total * 12))) : null;
  const completedPoints = challenges.filter(c => doneChallenges.includes(c.id)).reduce((s, c) => s + c.points, 0);
  const maxCategory = latest ? ["transport", "flights", "diet", "home", "consumption"].sort((a,b) => latest[b] - latest[a])[0] : null;

  async function runCalculator(e) {
    e?.preventDefault(); setError("");
    const numeric = ["km", "shortFlights", "longFlights", "kwh", "household", "lpg"];
    if (numeric.some(k => Number(inputs[k]) < 0) || Number(inputs.household) < 1) { setError("Please enter valid non-negative values and at least one household member."); return; }
    setCalculating(true);
    try {
      const computed = calculate(inputs);
      setResult(computed); setAnalysis(null);
      const saved = await request("/footprints", { method: "POST", body: JSON.stringify(computed) }, token);
      await loadHistory();
      try { const ai = await request("/ai/analyze", { method: "POST", body: JSON.stringify(computed) }, token); setAnalysis(ai); }
      catch (aiErr) { setAnalysis({ explanation: aiErr.message, actions: [] }); }
      setPage("overview");
    } catch (err) { setError(err.message); setResult(calculate(inputs)); setPage("overview"); }
    finally { setCalculating(false); }
  }

  async function fetchClimate(e) {
    e?.preventDefault(); setClimateBusy(true); setError("");
    try { setClimate(await request(`/climate?city=${encodeURIComponent(city)}`)); }
    catch (err) { setError(err.message); setClimate(null); }
    finally { setClimateBusy(false); }
  }

  async function sendChat(e) {
    e?.preventDefault(); if (!chatText.trim() || chatBusy) return;
    const next = [...chat, { role: "user", content: chatText.trim() }];
    setChat(next); setChatText(""); setChatBusy(true);
    try {
      const data = await request("/ai/chat", { method: "POST", body: JSON.stringify({ messages: next.slice(-10), footprint: latest }) }, token);
      setChat([...next, { role: "assistant", content: data.reply }]);
    } catch (err) { setChat([...next, { role: "assistant", content: err.message }]); }
    finally { setChatBusy(false); }
  }

  function toggleChallenge(id) {
    const next = doneChallenges.includes(id) ? doneChallenges.filter(x => x !== id) : [...doneChallenges, id];
    setDoneChallenges(next); localStorage.setItem("climateiq_challenges", JSON.stringify(next));
  }

  const navItems = [{ id: "overview", label: "Overview", icon: Home }, { id: "calculator", label: "Footprint calculator", icon: Footprints }, { id: "climate", label: "City climate", icon: CloudSun }, { id: "advisor", label: "AI climate advisor", icon: Bot }, { id: "challenges", label: "Challenges", icon: Target }];
  if (!token || !user) return token ? <div className="loading-screen"><div className="loader"/><p>Loading your ClimateIQ workspace…</p></div> : <AuthScreen onAuth={onAuth}/>;

  const categoryLabels = { transport: "Transport", flights: "Flights", diet: "Diet & food", home: "Home energy", consumption: "Consumption" };
  const chartData = latest ? { labels: Object.values(categoryLabels), datasets: [{ data: ["transport","flights","diet","home","consumption"].map(k => latest[k]), backgroundColor: ["#1d6b52","#6aa58d","#c5a66b","#7c94ad","#a7b6a8"], borderWidth: 0, hoverOffset: 5 }] } : null;
  const trendData = history.length ? { labels: [...history].reverse().map((h,i) => `Check ${i+1}`), datasets: [{ label: "Annual footprint (t CO₂e)", data: [...history].reverse().map(h => h.total), borderColor: "#1d6b52", backgroundColor: "rgba(29,107,82,.10)", fill: true, tension: .35 }] } : null;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><Leaf size={20}/></span> ClimateIQ</div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => { setPage(item.id); setMobileNav(false); }}><Icon size={18}/>{item.label}{page === item.id && <ChevronRight size={15} className="nav-chevron"/>}</button>; })}</nav>
      <div className="sidebar-bottom"><div className="sdg-card"><div className="sdg-icon"><Leaf size={18}/></div><strong>SDG 13</strong><span>Climate Action</span><p>Take urgent action to combat climate change and its impacts.</p></div><div className="user-card"><div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div><div className="user-meta"><strong>{user.name}</strong><span>{user.email}</span></div><button className="icon-btn" title="Sign out" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb">ClimateIQ <ChevronRight size={14}/> <strong>{navItems.find(n => n.id === page)?.label}</strong></div><div className="topbar-right"><span className="status-pill"><span/> Personal workspace</span><div className="avatar small">{user.name?.[0]?.toUpperCase()}</div></div></header>
      <div className="page-content">
        {error && <div className="notice error-notice">{error}<button onClick={() => setError("")}><X size={15}/></button></div>}

        {page === "overview" && <><div className="page-heading"><div><span className="eyebrow">YOUR CLIMATE SNAPSHOT</span><h1>Good to see you, {user.name.split(" ")[0]} <span className="wave">✳</span></h1><p>Here’s where your climate journey stands today.</p></div><button className="btn primary" onClick={() => setPage("calculator")}><Plus size={17}/> New assessment</button></div>
          <div className="welcome-banner"><div><span className="banner-kicker"><Sparkles size={14}/> YOUR IMPACT, MADE VISIBLE</span><h2>Every action moves us<br/>towards a <em>lighter footprint.</em></h2><p>Measure what matters. Make changes that count.</p><button className="banner-link" onClick={() => setPage("calculator")}>Calculate your footprint <ArrowRight size={16}/></button></div><div className="banner-art"><div className="sun"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="plant plant-one">♣</div><div className="plant plant-two">♣</div></div></div>
          <div className="metric-grid">
            <div className="metric-card"><div className="metric-top"><span>Annual footprint</span><span className="metric-icon green"><Footprints size={17}/></span></div><div className="metric-value">{latest ? `${latest.total.toFixed(2)} <small>t CO₂e</small>` : "—"}</div><div className="metric-foot">{latest ? "Estimated yearly emissions" : "Complete your first assessment"}</div></div>
            <div className="metric-card"><div className="metric-top"><span>Climate score</span><span className="metric-icon gold"><Award size={17}/></span></div><div className="metric-value">{score ?? "—"}<small>/100</small></div><div className="metric-foot">Illustrative awareness score</div></div>
            <div className="metric-card"><div className="metric-top"><span>Assessments</span><span className="metric-icon blue"><BarChart3 size={17}/></span></div><div className="metric-value">{history.length}</div><div className="metric-foot">Saved in your account</div></div>
            <div className="metric-card"><div className="metric-top"><span>Challenge points</span><span className="metric-icon purple"><Target size={17}/></span></div><div className="metric-value">{completedPoints}<small> pts</small></div><div className="metric-foot">{doneChallenges.length} of {challenges.length} challenges completed</div></div>
          </div>
          <div className="content-grid"><section className="panel wide"><div className="panel-heading"><div><h3>Emission breakdown</h3><p>Where your estimated impact comes from</p></div><span className="subtle-tag">Latest assessment</span></div>{latest ? <div className="chart-layout"><div className="doughnut-wrap"><Doughnut data={chartData} options={{ cutout: "72%", plugins: { legend: { display: false } }, maintainAspectRatio: false }}/><div className="doughnut-center"><strong>{latest.total.toFixed(1)}</strong><span>tonnes / year</span></div></div><div className="legend-list">{Object.entries(categoryLabels).map(([key,label],i) => <div className="legend-row" key={key}><span className={`legend-dot dot-${i}`}/><span>{label}</span><strong>{latest[key].toFixed(2)} t</strong></div>)}</div></div> : <EmptyState text="Your category breakdown will appear after your first assessment." action="Calculate footprint" onClick={() => setPage("calculator")}/>}</section>
            <section className="panel"><div className="panel-heading"><div><h3>Focus area</h3><p>Your biggest estimated source</p></div><Activity size={18} className="muted-icon"/></div>{latest ? <div className="focus-card"><div className="focus-symbol"><TrendingDown size={22}/></div><span className="eyebrow">HIGHEST CATEGORY</span><h2>{categoryLabels[maxCategory]}</h2><strong>{latest[maxCategory].toFixed(2)} t CO₂e</strong><p>Start here for the biggest opportunity to review your habits. Your actual reduction depends on the changes you make.</p><button className="text-link" onClick={() => setPage("advisor")}>Get suggestions <ArrowRight size={15}/></button></div> : <EmptyState text="Complete an assessment to identify your highest-impact category." action="Get started" onClick={() => setPage("calculator")}/>}</section>
            <section className="panel wide"><div className="panel-heading"><div><h3>Your footprint history</h3><p>Track how your estimates change over time</p></div><span className="subtle-tag">{history.length} records</span></div>{trendData ? <div className="line-chart"><Line data={trendData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#edf0eb" } }, x: { grid: { display: false } } } }}/></div> : <EmptyState text="Your progress chart will appear after you save multiple assessments." action="Take first assessment" onClick={() => setPage("calculator")}/>}</section>
            <section className="panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Keep your momentum going</p></div></div><div className="quick-actions"><button onClick={() => setPage("climate")}><span className="quick-icon"><Wind size={18}/></span><span><strong>Check city air quality</strong><small>Explore local conditions</small></span><ChevronRight size={16}/></button><button onClick={() => setPage("challenges")}><span className="quick-icon"><Target size={18}/></span><span><strong>Try a climate challenge</strong><small>Build greener habits</small></span><ChevronRight size={16}/></button><button onClick={() => setPage("advisor")}><span className="quick-icon"><MessageCircle size={18}/></span><span><strong>Ask the AI advisor</strong><small>Get practical guidance</small></span><ChevronRight size={16}/></button></div></section>
          </div>
          {latest && <div className="report-strip"><div><strong>Need a copy of your results?</strong><span>Print a clean summary or save it as a PDF.</span></div><button className="btn secondary" onClick={() => window.print()}>Print report <ArrowRight size={15}/></button></div>}
        </>}

        {page === "calculator" && <><div className="page-heading"><div><span className="eyebrow">MEASURE YOUR IMPACT</span><h1>Carbon footprint calculator</h1><p>A practical estimate based on your lifestyle and household inputs.</p></div><span className="subtle-tag">About 3 minutes</span></div><div className="method-note"><ShieldCheck size={18}/><span><strong>Transparent estimate.</strong> Values use simplified starter factors and assumptions, not a certified inventory. Enter electricity usage in kWh if available for a more useful estimate.</span></div><form className="calculator-form" onSubmit={runCalculator}>
          <div className="form-panel"><div className="form-panel-title"><span className="form-icon"><Footprints size={19}/></span><div><h3>Transport & travel</h3><p>Your usual weekly movement and flights</p></div></div><div className="form-grid"><Field label="Primary travel mode"><select value={inputs.mode} onChange={e=>setInputs({...inputs,mode:e.target.value})}><option value="walk_cycle">Walk / cycle</option><option value="public">Bus / train / metro</option><option value="motorbike">Motorbike / scooter</option><option value="car_petrol">Petrol car</option><option value="car_diesel">Diesel car</option><option value="car_electric">Electric car</option></select></Field><Field label="Distance travelled per week" suffix="km"><input type="number" min="0" value={inputs.km} onChange={e=>setInputs({...inputs,km:e.target.value})}/></Field><Field label="Short-haul flights per year"><input type="number" min="0" value={inputs.shortFlights} onChange={e=>setInputs({...inputs,shortFlights:e.target.value})}/></Field><Field label="Long-haul flights per year"><input type="number" min="0" value={inputs.longFlights} onChange={e=>setInputs({...inputs,longFlights:e.target.value})}/></Field></div></div>
          <div className="form-panel"><div className="form-panel-title"><span className="form-icon peach"><Leaf size={19}/></span><div><h3>Food & diet</h3><p>Diet pattern and household food waste</p></div></div><div className="form-grid"><Field label="Diet type"><select value={inputs.diet} onChange={e=>setInputs({...inputs,diet:e.target.value})}><option value="vegan">Vegan</option><option value="vegetarian">Vegetarian</option><option value="flexitarian">Flexitarian</option><option value="omnivore">Omnivore</option><option value="meat_heavy">Meat-heavy</option></select></Field><Field label="Food waste"><select value={inputs.waste} onChange={e=>setInputs({...inputs,waste:e.target.value})}><option value="low">Very little</option><option value="medium">Some leftovers wasted</option><option value="high">Often waste food</option></select></Field></div></div>
          <div className="form-panel"><div className="form-panel-title"><span className="form-icon blue-bg"><Home size={19}/></span><div><h3>Home energy</h3><p>Electricity, LPG and household size</p></div></div><div className="form-grid"><Field label="Monthly electricity use" suffix="kWh"><input type="number" min="0" value={inputs.kwh} onChange={e=>setInputs({...inputs,kwh:e.target.value})}/></Field><Field label="LPG cylinders used monthly" suffix="cylinders"><input type="number" min="0" step="0.1" value={inputs.lpg} onChange={e=>setInputs({...inputs,lpg:e.target.value})}/></Field><Field label="People in household"><input type="number" min="1" max="30" value={inputs.household} onChange={e=>setInputs({...inputs,household:e.target.value})}/></Field></div><p className="field-hint">Home energy is divided across household members. LPG is a simplified estimate based on a standard domestic cylinder.</p></div>
          <div className="form-panel"><div className="form-panel-title"><span className="form-icon purple-bg"><Recycle size={19}/></span><div><h3>Shopping & consumption</h3><p>Clothing and electronics purchasing habits</p></div></div><div className="form-grid"><Field label="New clothing items per month"><select value={inputs.clothes} onChange={e=>setInputs({...inputs,clothes:e.target.value})}><option value="0">Almost none</option><option value="1-2">1–2 items</option><option value="3-5">3–5 items</option><option value="6+">6 or more</option></select></Field><Field label="Electronics upgrades"><select value={inputs.electronics} onChange={e=>setInputs({...inputs,electronics:e.target.value})}><option value="rarely">Rarely / use for years</option><option value="sometimes">Every 2–3 years</option><option value="often">Frequently</option></select></Field></div></div>
          <button className="btn primary large full" disabled={calculating}>{calculating ? "Calculating and saving…" : "Calculate & save my footprint"} <ArrowRight size={17}/></button>
        </form></>}

        {page === "climate" && <><div className="page-heading"><div><span className="eyebrow">YOUR LOCAL ENVIRONMENT</span><h1>City climate intelligence</h1><p>Explore current weather and air-quality readings for a city.</p></div><span className="subtle-tag">Live data</span></div><form className="city-search" onSubmit={fetchClimate}><div className="search-input"><Wind size={18}/><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Search a city, e.g. Lucknow"/></div><button className="btn primary" disabled={climateBusy}>{climateBusy ? "Searching…" : "Explore city"} <ArrowRight size={16}/></button></form>{climate && <><div className="climate-location"><div><span className="eyebrow">CURRENT CONDITIONS</span><h2>{climate.place.name}{climate.place.admin1 ? `, ${climate.place.admin1}` : ""}</h2><p>{climate.place.country} · Local time {climate.weather.time?.replace("T"," ")}</p></div><CloudSun size={36}/></div><div className="metric-grid climate-metrics"><div className="metric-card"><div className="metric-top"><span>Temperature</span><span className="metric-icon gold"><CloudSun size={17}/></span></div><div className="metric-value">{climate.weather.temperature_2m}°<small>C</small></div><div className="metric-foot">Feels like {climate.weather.apparent_temperature}°C</div></div><div className="metric-card"><div className="metric-top"><span>US AQI</span><span className="metric-icon green"><Wind size={17}/></span></div><div className="metric-value">{climate.air.us_aqi ?? "—"}</div><div className="metric-foot">Air Quality Index</div></div><div className="metric-card"><div className="metric-top"><span>PM2.5</span><span className="metric-icon blue"><Activity size={17}/></span></div><div className="metric-value">{climate.air.pm2_5 ?? "—"}<small> µg/m³</small></div><div className="metric-foot">Fine particulate matter</div></div><div className="metric-card"><div className="metric-top"><span>Humidity</span><span className="metric-icon purple"><CloudSun size={17}/></span></div><div className="metric-value">{climate.weather.relative_humidity_2m}<small>%</small></div><div className="metric-foot">Relative humidity</div></div></div><div className="panel climate-note"><h3>Reading your local data</h3><p>US AQI is a standardized index; lower values generally indicate cleaner air. PM2.5 refers to fine particles that can penetrate deep into the lungs. Check local official advisories for health decisions, especially during severe pollution episodes.</p><small>{climate.attribution} Values can differ from local monitoring stations.</small></div></>}{!climate && <div className="panel climate-empty"><div className="empty-illustration"><CloudSun size={38}/></div><h3>What is happening in your city?</h3><p>Search a city to see current temperature, humidity, PM2.5 and AQI readings.</p><button className="btn secondary" onClick={fetchClimate}>Load {city} data <ArrowRight size={15}/></button></div>}</>}

        {page === "advisor" && <><div className="page-heading"><div><span className="eyebrow">PERSONALIZED CLIMATE GUIDANCE</span><h1>AI climate advisor</h1><p>Ask questions and turn your footprint data into practical next steps.</p></div><span className="ai-status"><span/> AI assistant</span></div><div className="advisor-layout"><div className="chat-panel"><div className="chat-head"><div className="bot-avatar"><Bot size={20}/></div><div><strong>ClimateIQ Assistant</strong><span>Climate education · SDG 13</span></div><span className="online-dot"/></div><div className="chat-messages">{chat.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><div className="chat-bubble">{m.content}</div></div>)}{chatBusy && <div className="chat-message assistant"><div className="chat-bubble typing">Thinking…</div></div>}</div><form className="chat-compose" onSubmit={sendChat}><input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Ask about emissions, energy, transport…"/><button className="send-button" disabled={chatBusy || !chatText.trim()}><Send size={17}/></button></form></div><div className="advisor-side"><div className="panel"><div className="panel-heading"><div><h3>Suggested questions</h3><p>Get started with a prompt</p></div><Sparkles size={17}/></div>{["How can I reduce my biggest emission source?","Explain my carbon footprint in simple terms.","Suggest low-cost climate actions for a student.","How can my household save electricity?"].map(q=><button className="prompt-button" key={q} onClick={()=>setChatText(q)}>{q}<ArrowDownRight size={15}/></button>)}</div><div className="panel"><div className="panel-heading"><div><h3>My latest footprint</h3><p>Context available to the advisor</p></div></div>{latest ? <><div className="advisor-total">{latest.total.toFixed(2)} <small>t CO₂e / year</small></div><div className="mini-breakdown">{Object.entries(categoryLabels).map(([k,v])=><div key={k}><span>{v}</span><strong>{latest[k].toFixed(2)} t</strong></div>)}</div></> : <p className="muted small-copy">Complete the calculator to give the advisor your footprint context.</p>}</div></div></div></>}

        {page === "challenges" && <><div className="page-heading"><div><span className="eyebrow">SMALL STEPS, REAL HABITS</span><h1>Climate challenges</h1><p>Choose practical actions and mark them complete as you go.</p></div><div className="points-badge"><Award size={18}/><strong>{completedPoints}</strong><span>points earned</span></div></div><div className="challenge-progress panel"><div><span className="eyebrow">YOUR WEEKLY PROGRESS</span><h2>{doneChallenges.length} of {challenges.length} actions completed</h2><p>Every completed action is a small step towards more mindful habits.</p></div><div className="progress-ring" style={{"--progress":`${doneChallenges.length/challenges.length*100}%`}}><strong>{Math.round(doneChallenges.length/challenges.length*100)}%</strong></div></div><div className="challenge-list">{challenges.map((c,i)=><div className={`challenge-card ${doneChallenges.includes(c.id) ? "completed" : ""}`} key={c.id}><div className="challenge-number">0{i+1}</div><div className="challenge-copy"><h3>{c.title}</h3><p>{c.detail}</p><span className="points-label"><Sparkles size={13}/> {c.points} points</span></div><button className={doneChallenges.includes(c.id) ? "btn completed-btn" : "btn secondary"} onClick={()=>toggleChallenge(c.id)}>{doneChallenges.includes(c.id) ? <><Check size={16}/> Completed</> : "Mark complete"}</button></div>)}</div><p className="field-hint">Challenge completion is stored in this browser on this device. It is not yet synced across devices or verified.</p></>}

        <footer className="footer"><span>© 2026 ClimateIQ</span><span>Built for awareness · Aligned with UN SDG 13</span><button onClick={() => window.print()}>Print / Save PDF</button></footer>
      </div>
    </main>
  </div>;
}

function Field({ label, suffix, children }) { return <label className="field"><span>{label}</span><div className="field-control">{children}{suffix && <small>{suffix}</small>}</div></label>; }
function EmptyState({ text, action, onClick }) { return <div className="empty-state"><div className="empty-leaf"><Leaf size={22}/></div><p>{text}</p>{action && <button className="text-link" onClick={onClick}>{action} <ArrowRight size={15}/></button>}</div>; }

export default App;
