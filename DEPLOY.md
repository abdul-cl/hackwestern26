# Deploying CareScout

CareScout is two parts, deployed separately:

| Part | Where | Why |
|---|---|---|
| Website (`frontend/`) | **Cloudflare Workers** (static assets) | Static React site. Free, builds from GitHub on every push (teammates don't need a Cloudflare seat), custom domains. |
| API (`backend/`) | **Railway** (or Render) | Needs a long-running Python server: live scans stream for minutes, and the Watchdog keeps a database. A static-site host can't do either. |

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
   | `CARESCOUT_ADMIN_KEY` | a long random string (keeps the feedback comments private; keep it secret) |
   | `DISABLE_DOCS` | `1` |
   | `ALLOWED_ORIGINS` | fill in after step 2, e.g. `https://carescout.yourname.workers.dev` |
   | `DATA_DIR` | `/data` (see the volume step below) |
   | `REFRESH_INTERVAL_MIN` | `180` (re-check out-of-date clinics every 3 hours; `0` = off) |
   | `REFRESH_ALLOW_AGENT` | `0` to keep the background job to quick page reads only (no TinyFish agent credits) |
   | `MAX_STATUS_AGE_DAYS` | optional, default `7`: older availability shows as "Needs a re-check" |
   | `RESEND_API_KEY` | optional: real opening alerts by email ([resend.com](https://resend.com), free tier). Without a verified domain, Resend only delivers to your own Resend email |
   | `ALERT_FROM_EMAIL` | optional: sender, e.g. `CareScout <alerts@your-domain.com>` (a domain verified in Resend) |
   | `SITE_URL` | optional: the website's address, for the "stop watching" link in alert emails |
   | `TRUSTED_PROXY_HOPS` | optional, default `1` (right for Railway and Render): which `X-Forwarded-For` entry is the visitor's real address for the rate limit |

4. **Add a volume** so the clinic database survives redeploys: right-click the service (or the canvas) → **Volume** → attach it to the service with mount path **`/data`** (matches `DATA_DIR`). The database starts empty and fills as people search (TinyFish finds each city's clinics on its first search).
5. **Settings** → **Networking** → **Generate Domain**. You get something like `https://carescout-api.up.railway.app`.
6. Check it: open `https://<your-api-domain>/health` → `{"status":"ok","public_demo":false,"apply":true}`. The site works exactly like a local run (Demo mode toggle, live searches, your own email for watchlists). Only set `PUBLIC_DEMO=1` (+ `CARESCOUT_ADMIN_KEY`) if you ever want the locked-down, saved-results-only version.

**Render instead?** Render → **New** → **Blueprint** → pick this repo; it reads `render.yaml`. Type in the two API keys and `ALLOWED_ORIGINS` when asked. Render's free plan sleeps after ~15 minutes idle (the first request then takes about a minute), so open `/health` a few minutes before you present.

## 2. Website on Cloudflare (Workers, free)

The website is plain files after `npm run build`, served by Cloudflare. `frontend/wrangler.jsonc` holds the settings (the
`carescout` name, the `dist` folder, and "single-page-application" so `/find`, `/watchdog` etc. work when refreshed).
Cloudflare builds from GitHub on every push, so **teammates only need access to the GitHub repo**, not to Cloudflare.

1. dash.cloudflare.com (free account) → **Workers & Pages** → **Create application** → **Import a repository** / connect
   **GitHub** → authorize the Cloudflare GitHub app for this repo → pick the repo.
2. Settings for the build:

   | Setting | Value |
   |---|---|
   | Project / Worker name | `carescout` (must match `"name"` in `frontend/wrangler.jsonc`, or the build fails) |
   | Git branch (production) | the branch you deploy from, e.g. `main` |
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` (the default) |
   | Build variables | `VITE_API_URL` = your API URL from step 1 (no trailing slash) |

   `VITE_API_URL` must be a **build** variable (Settings → Build → Build variables and secrets), not a runtime one:
   Vite writes it into the site's code during the build. Node 22 is used (`frontend/.node-version`).
3. **Save and Deploy**. The site is at `https://carescout.<your-subdomain>.workers.dev` (shown on the Worker's page).
4. Back in Railway, set `ALLOWED_ORIGINS` to that address (comma-separate several, e.g. add your custom domain).
   Railway redeploys on its own.
   - Want preview builds of other branches to reach the API too? Also set `ALLOWED_ORIGIN_REGEX` =
     `https://([a-z0-9-]+-)?carescout\.<your-subdomain>\.workers\.dev`.
5. Changing `VITE_API_URL` later? Update the build variable and re-run the latest build (Deployments → retry), or push a commit.

Your teammate: give them access to the **GitHub repo**. Their pushes to the production branch deploy like yours.
To let them see builds and logs in Cloudflare too: Manage account → **Members** → Invite.

Try the Cloudflare version locally: `cd frontend && npm run cf:preview` (http://localhost:8787, uses Wrangler,
no Cloudflare login needed). `npm run deploy` deploys from your laptop (asks you to log in to Cloudflare once).

### Custom domain
Cloudflare → the `carescout` Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain** (the domain
must be on your Cloudflare account; you can buy one in Cloudflare). Then add `https://your-domain.com` to the API's
`ALLOWED_ORIGINS`.

### The old Vercel site
The website used to be on Vercel. Delete that project in Vercel (Project -> Settings -> General -> Delete Project) and
remove its address from Railway's `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_REGEX`.

## 3. Check it works
- Open the site → **Find a doctor**: the search bar has the **Demo mode**, **Re-check every clinic** and **Watch TinyFish check each clinic** toggles, like a local run.
- A new city is searched live by TinyFish and saved; the next search of it is instant from the database.
- Type your email in the search form (or "Want an alert when it opens?") to watch full clinics with your own email.
- **Feedback comments:** `GET /api/feedback` with header `X-Admin-Key: <CARESCOUT_ADMIN_KEY>` (they're stored in `clinics.db`, so keep `DATA_DIR=/data` on a volume or they're lost on redeploy).

## Optional: a locked-down public demo
Not used right now. Setting `PUBLIC_DEMO=1` on Railway turns the site into a saved-results-only demo that strangers
can't spend credits on: no Demo mode / Re-check toggles, watchlists only for the shared `demo@carescout.ca` account,
Verify Doctor and Check All Now off, rate limits on everything (see `PUBLIC_*` settings in CLAUDE.md). You can still
run live agents from your own browser: F12 → **Console** →
`localStorage.setItem("carescout_admin_key", "<your CARESCOUT_ADMIN_KEY>")`, then reload
(`localStorage.removeItem("carescout_admin_key")` to lock it again). Delete `PUBLIC_DEMO` to go back to normal.

## Good to know
- **Saved results:** Demo mode shows the clinic database (filled by real searches; a city nobody has searched yet is searched live by TinyFish on the spot), and "Watch a demo search" replays `backend/demo_mission.json`, a real live search recorded with `python backend/record_demo.py` (run it locally with both keys, commit the file, redeploy). Re-record it on judging day: replayed results age like any saved result. `backend/fallback_cache.json` is only the last-resort backup.
- **Watchdog data** (`clinics.db`) starts empty on the server and may reset on redeploy unless you add a Railway volume mounted at `/app/backend` (Render: a persistent disk). Fine for a demo.
- **Costs:** the site is open, so anyone using it runs live TinyFish agents and Gemini calls on your keys (searches of new cities, Re-check, Watch mode, Auto-Fill, Verify Doctor). Watch your TinyFish / Gemini usage; `PUBLIC_DEMO=1` is the off switch.
- **Never** put `CARESCOUT_ADMIN_KEY`, `TINYFISH_API_KEY` or `GEMINI_API_KEY` in a `VITE_` variable: everything starting with `VITE_` ends up in the public website code.
- **Backup plan without hosting:** run the backend on your laptop and expose it with a free tunnel (`cloudflared tunnel --url http://localhost:8000`), then set Cloudflare's `VITE_API_URL` build variable to the tunnel URL and re-run the build.
