# ClimateIQ — Full-Stack AI Climate Intelligence Platform

A React + Express + MySQL starter application based on your original ClimateIQ HTML project.

## Features included
- Responsive React dashboard and navigation
- Carbon footprint estimator with transport, flights, diet, home energy and consumption categories
- Category breakdown and chart
- Registration/login using bcrypt + JWT
- Save and view previous footprint calculations
- AI explanation, climate advisor and personalized action plan through a server-side Anthropic API call
- City search with Open-Meteo geocoding, current weather and air-quality data
- Sustainability challenge checklist
- Print-friendly report (use browser Print → Save as PDF)

## Requirements
- Node.js 20+
- MySQL 8+
- Anthropic API key (optional; non-AI calculator and dashboard work without it)

## 1. Create the database
Open MySQL Workbench or your MySQL terminal and run:

```sql
SOURCE server/sql/schema.sql;
```

Or copy/paste the contents of `server/sql/schema.sql`.

## 2. Configure the backend
Copy `server/.env.example` to `server/.env` and update the values:

```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=climateiq
JWT_SECRET=replace_with_a_long_random_secret
ANTHROPIC_API_KEY=
```

Keep `ANTHROPIC_API_KEY` on the server. Never put it in React/Vite environment variables or commit `.env` to GitHub.

## 3. Install dependencies
From the project root:

```bash
npm run install:all
```

## 4. Start both applications
```bash
npm run dev
```

Frontend: http://localhost:5173  
Backend health check: http://localhost:5000/api/health

## 5. First use
- Register an account.
- Complete the calculator.
- Save the result to your account.
- Open Dashboard to view saved history.
- Add an Anthropic API key to `server/.env` to enable AI features.
- Search a city in the Climate page for current weather and air quality.

## API overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/footprints`
- `GET /api/footprints`
- `GET /api/climate?city=Lucknow`
- `POST /api/ai/analyze`
- `POST /api/ai/chat`

## Emissions methodology — important
This is an educational estimator, not a certified greenhouse-gas inventory. The included factors are transparent starter assumptions and should be reviewed against current India-specific official factors before using the result for research, reporting or policy decisions. Electricity emissions are calculated from entered kWh and a configurable grid factor. The app shows an estimate and its assumptions rather than presenting it as an exact measurement.

## Before public deployment
- Use HTTPS and a strong unique JWT secret.
- Restrict CORS to your deployed frontend origin.
- Add rate limiting, request validation, logging and password reset/email verification.
- Use a managed MySQL database and backups.
- Add privacy policy/consent and account deletion.
- Verify all emission factors and climate-data licensing/attribution.
- Never expose API keys or database credentials in frontend code.

//npm run install:all
//npm run dev