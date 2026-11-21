# Deploying CareScout

CareScout is two parts, deployed separately:

| Part | Where | Why |
|---|---|---|
| Website (`frontend/`) | **Vercel** | Static React site. Free, fast, custom domains. |
| API (`backend/`) | **Railway** (or Render) | Needs a long-running Python server: live scans stream for minutes, and the Watchdog keeps a database. Vercel's serverless functions can't do either. |

Deploy the API first, because the website needs its URL.

## 1. API on Railway

1. railway.com → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. Click the service box → **Settings** → **Root Directory** → `/backend`. Railway's builder reads `backend/railpack.json` (start command) and `backend/.python-version` (Python 3.13).
   - If the build log says **No start command detected**: Settings → **Deploy** → **Custom Start Command** → `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, then redeploy.
   - Optional: Settings → **Config-as-code** → Railway config file `/backend/railway.json` (adds the `/health` health check). Railway reads this path from the repo root, not the Root Directory.
3. **Variables** tab → add:

   | Variable | Value |
   |---|---|
   | `TINYFISH_API_KEY` | your TinyFish key |
   | `GEMINI_API_KEY` | your Gemini key |
   | `PUBLIC_DEMO` | `1` (visitors get saved results only; protects your credits) |
   | `CARESCOUT_ADMIN_KEY` | a long random string (your personal unlock; keep it secret) |
   | `DISABLE_DOCS` | `1` |
   | `ALLOWED_ORIGINS` | fill in after step 2, e.g. `https://carescout.vercel.app` |
   | `DATA_DIR` | `/data` (see the volume step below) |
   | `REFRESH_INTERVAL_MIN` | `180` (re-check out-of-date clinics every 3 hours; `0` = off) |
   | `REFRESH_ALLOW_AGENT` | `0` to keep the background job to quick page reads only (no TinyFish agent credits) |
   | `MAX_STATUS_AGE_DAYS` | optional, default `7`: older availability shows as "Needs a re-check" |
   | `TRUSTED_PROXY_HOPS` | optional, default `1` (right for Railway and Render): which `X-Forwarded-For` entry is the visitor's real address for the rate limit |

4. **Add a volume** so the clinic database survives redeploys: right-click the service (or the canvas) → **Volume** → attach it to the service with mount path **`/data`** (matches `DATA_DIR`). On first start the database is filled from `backend/seed_clinics.json`.
5. **Settings** → **Networking** → **Generate Domain**. You get something like `https://carescout-api.up.railway.app`.
6. Check it: open `https://<your-api-domain>/health` → `{"status":"ok","public_demo":true}`.

**Render instead?** Render → **New** → **Blueprint** → pick this repo; it reads `render.yaml`. Type in the two API keys and `ALLOWED_ORIGINS` when asked. Render's free plan sleeps after ~15 minutes idle (the first request then takes about a minute), so open `/health` a few minutes before you present.

## 2. Website on Vercel

1. vercel.com → **Add New** → **Project** → import this repo.
2. **Root Directory** → `frontend`. Framework preset: **Vite** (build `npm run build`, output `dist`). `frontend/vercel.json` makes `/find`, `/watchdog`, etc. work when refreshed.
3. **Environment Variables** → `VITE_API_URL` = your API URL from step 1 (no trailing slash).
4. **Deploy**. You get `https://<project>.vercel.app`.
5. Back in Railway, set `ALLOWED_ORIGINS` to that URL (comma-separate several, e.g. add your custom domain). Railway redeploys on its own.
   - Want Vercel's preview deployments to work too? Also set `ALLOWED_ORIGIN_REGEX` = `https://<project>-[a-z0-9-]+\.vercel\.app`.

### Custom domain
Vercel → Project → **Settings** → **Domains** → add your domain and follow the DNS instructions (or buy one there). Then add `https://your-domain.com` to the API's `ALLOWED_ORIGINS`.

## 3. Check it works
- Open the site → **Watch a demo search**: five London clinics, ranked, in a few seconds.
- The search bar says it's a public demo; Auto-Fill, Verify Doctor and Check All Now explain that live agents are off.

## Running live agents on the public site (just you)
Visitors can't start paid agents, but you can, from your own browser:
1. Open the deployed site, press F12 → **Console**, run
   `localStorage.setItem("carescout_admin_key", "<your CARESCOUT_ADMIN_KEY>")`
2. Reload. The demo notice disappears and live scans, Auto-Fill, Verify Doctor and Watchdog checks work for you only.
3. To lock it again: `localStorage.removeItem("carescout_admin_key")`.

The key stays in your browser; it's never part of the website's code. Don't do this on a shared computer.

## Good to know
- **Saved results:** public visitors see the clinic database (seeded from `backend/seed_clinics.json`), and "Watch a demo search" replays `backend/demo_mission.json`, a real live search recorded with `python backend/record_demo.py` (run it locally with both keys, commit the file, redeploy). Re-record it on judging day: replayed results age like any saved result. `backend/fallback_cache.json` is only the last-resort backup.
- **Watchlists on the public demo** only work for the shared demo account (`demo@carescout.ca`), so visitors can try the Watchdog without storing their email and nobody can touch real people's watches.
- **Watchdog data** (`clinics.db`) starts empty on the server and may reset on redeploy unless you add a Railway volume mounted at `/app/backend` (Render: a persistent disk). Fine for a demo.
- **Costs:** in public mode each visitor is limited to `PUBLIC_RATE_LIMIT` requests (default 30) per 10 minutes, and only ranking calls Gemini. Live agents run only with your admin key.
- **Never** put `CARESCOUT_ADMIN_KEY`, `TINYFISH_API_KEY` or `GEMINI_API_KEY` in a `VITE_` variable: everything starting with `VITE_` ends up in the public website code.
- **Backup plan without hosting:** run the backend on your laptop and expose it with a free tunnel (`cloudflared tunnel --url http://localhost:8000`), then set Vercel's `VITE_API_URL` to the tunnel URL and redeploy.
