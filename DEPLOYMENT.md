# Air Quality Dashboard — Deployment Guide

## Overview

This guide covers:
1. Downloading Python wheels for offline install
2. Which files to copy to the work computer
3. Running and testing locally before Apache
4. Final Apache deployment

---

## Part 1 — Download Python Wheels (do this on your current machine)

Wheels are platform-specific. Run the right command for your work computer's OS.

### Work computer is Linux (most common for Apache)
```bash
cd /Users/shohruz/Desktop/Air-Quality-Analysis-1

pip3 download \
  -r backend/requirements.txt \
  -d wheels/ \
  --platform manylinux2014_x86_64 \
  --python-version 39 \
  --only-binary :all:
```

### Work computer is also macOS
```bash
pip3 download -r backend/requirements.txt -d wheels/
```

### Work computer is Windows
```bash
pip3 download \
  -r backend/requirements.txt \
  -d wheels/ \
  --platform win_amd64 \
  --python-version 39 \
  --only-binary :all:
```

> **Note:** If any packages fail with `--only-binary :all:`, remove that flag and they will
> download as source (.tar.gz). They will compile on install — requires gcc/build tools on
> the work computer.

Verify the folder was populated:
```bash
ls wheels/
# Should see .whl files for fastapi, uvicorn, pandas, numpy, pyarrow, pydantic, scipy, etc.
```

---

## Part 2 — Files to Copy

Copy this exact folder structure. Everything not listed here can be left behind.

```
Air-Quality-Analysis-1/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── data/
│   └── processed/
│       └── measurements.parquet        ← the dataset
├── frontend/
│   ├── src/                            ← all source files
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── eslint.config.js
├── new-york-city-boroughs.geojson      ← map boundaries
└── wheels/                             ← Python wheels from Part 1
```

### Do NOT copy these (leave them behind):
| Folder/File | Reason |
|---|---|
| `frontend/node_modules/` | Too large; npm install recreates it |
| `frontend/dist/` | Rebuilt on work computer |
| `backend/__pycache__/` | Auto-generated |
| `.git/` | Not needed |
| `analysis/`, `notebooks/` | Dev only |
| `api/`, `vercel.json`, `Dockerfile` | Vercel/Docker only |
| `fetch_data.py`, `app.py`, `src/` | Data pipeline only |

### Quickest way to copy (USB drive or network share)

On your current machine, zip only what's needed:
```bash
cd /Users/shohruz/Desktop

zip -r AirQuality-Deploy.zip Air-Quality-Analysis-1 \
  --exclude "*/node_modules/*" \
  --exclude "*/.git/*" \
  --exclude "*/__pycache__/*" \
  --exclude "*/dist/*" \
  --exclude "*/analysis/*" \
  --exclude "*/notebooks/*" \
  --exclude "*/api/*" \
  --exclude "*/.venv/*"
```

Transfer `AirQuality-Deploy.zip` to the work computer and unzip it.

---

## Part 3 — Set Up on the Work Computer

### 3a. Install Python dependencies from wheels

```bash
cd Air-Quality-Analysis-1

pip3 install --no-index --find-links=wheels/ -r backend/requirements.txt
```

If any packages are missing from the wheels folder (source packages that need compiling):
```bash
# Install missing ones with internet if available, or install build tools first
pip3 install -r backend/requirements.txt
```

Verify:
```bash
python3 -c "import fastapi, uvicorn, pandas, pyarrow, scipy; print('All good')"
```

### 3b. Install Node dependencies and build frontend

Requires Node.js 18+ and npm on the work computer.

Check versions:
```bash
node --version   # need 18+
npm --version
```

Install and build:
```bash
cd Air-Quality-Analysis-1/frontend
npm install
```

---

## Part 4 — Run and Test Locally

Run backend and frontend in two separate terminals.

### Terminal 1 — Backend
```bash
cd Air-Quality-Analysis-1/backend
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Expected output:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Smoke test the backend:
```bash
curl http://localhost:8000/api/data/metadata
# Should return JSON with total_records, date_range, pollutants, boroughs
```

### Terminal 2 — Frontend dev server
```bash
cd Air-Quality-Analysis-1/frontend
VITE_API_URL=http://localhost:8000 npm run dev
```

Open browser: **http://localhost:3000**

### What to test before Apache

Work through this checklist:

- [ ] Dashboard loads (no blank screen)
- [ ] Map tab — borough choropleth renders
- [ ] Map tab — select one borough from filters, map still shows
- [ ] Time Series tab — heatmap and chart load
- [ ] Comparison tab — select 2+ boroughs or pollutants, chart renders
- [ ] Analysis → Trends — cards load, Year-over-Year chart works
- [ ] Analysis → Correlation — matrix renders with correct colors
- [ ] Analysis → AQI — data loads
- [ ] Analysis → Seasonal — patterns load
- [ ] Analysis → Export — download works
- [ ] Filters — change date range, pollutant, borough — no blank screen
- [ ] Dark mode toggle — persists after page refresh
- [ ] Tab selection — persists after page refresh

---

## Part 5 — Build for Apache

Once local testing passes, build the production frontend:

```bash
cd Air-Quality-Analysis-1/frontend
VITE_API_URL="" npm run build
# VITE_API_URL="" = browser calls same origin, Apache routes /api/* to uvicorn
```

Output is in `frontend/dist/`. Copy it to your Apache web root:

```bash
cp -r dist/* /var/www/html/airquality/
# or wherever your DocumentRoot points
```

Then follow the Apache + systemd setup in the Apache Deployment Guide section below.

---

## Part 6 — Apache + systemd Setup

### systemd service (`/etc/systemd/system/airquality.service`)

```ini
[Unit]
Description=Air Quality FastAPI Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/airquality/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
Environment="ALLOWED_ORIGINS=http://yourserver.internal"

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable airquality
systemctl start airquality
systemctl status airquality   # confirm it's running
```

### Apache httpd.conf VirtualHost

```apache
<VirtualHost *:80>
    ServerName yourserver.internal

    DocumentRoot /var/www/html/airquality
    <Directory /var/www/html/airquality>
        Options -Indexes
        AllowOverride None
        Require all granted

        # React Router — route all non-file requests to index.html
        RewriteEngine On
        RewriteBase /
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [L]
    </Directory>

    # Proxy /api/* to uvicorn (Python backend)
    ProxyPreserveHost On
    ProxyPass        /api/ http://127.0.0.1:8000/api/
    ProxyPassReverse /api/ http://127.0.0.1:8000/api/

</VirtualHost>
```

Enable modules and restart:
```bash
a2enmod proxy proxy_http rewrite
apachectl configtest              # must say "Syntax OK"
systemctl restart apache2
```

### Verify Apache deployment
```bash
curl http://yourserver.internal/api/data/metadata
# Should return JSON (going through Apache proxy to uvicorn)

curl http://yourserver.internal/
# Should return HTML (React index.html)
```

---

## Updating the App Later

```bash
# 1. Copy new files to server (overwrite backend/main.py, frontend files, etc.)

# 2. Rebuild frontend
cd /opt/airquality/frontend
VITE_API_URL="" npm run build
cp -r dist/* /var/www/html/airquality/

# 3. Restart backend if main.py changed
systemctl restart airquality
```

---

## Troubleshooting

| Problem | Check |
|---|---|
| Backend won't start | `systemctl status airquality` — check for missing packages |
| Map doesn't load | Confirm `new-york-city-boroughs.geojson` is in the project root |
| API calls fail in browser | Check `ALLOWED_ORIGINS` env var matches your server hostname |
| Blank screen on load | Open browser devtools Console — look for 404 or CORS errors |
| `npm run build` fails | Run `npm install` first; ensure Node 18+ is installed |
| Wheel install fails | Package needs compilation — install `python3-dev` and `gcc` on the server |
