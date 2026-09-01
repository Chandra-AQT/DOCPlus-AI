# DOCPlus AI⁺ — Deployment Guide

## Backend → Railway | Frontend → Vercel

---

## PART 1: Deploy Backend on Railway

### Step 1 — Create Railway Account
Go to https://railway.app → Sign up with GitHub

### Step 2 — New Project from GitHub
1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose `Chandra-AQT/DOCPlus-AI`
4. Set **Root Directory** → `backend`
5. Railway auto-detects Python and installs `requirements.txt`

### Step 3 — Set Environment Variables in Railway
Go to your service → **Variables** tab → Add:

```
SECRET_KEY          = <generate with: python -c "import secrets; print(secrets.token_hex(32))">
FRONTEND_URL        = https://your-app.vercel.app   ← update after Vercel deploy
ADMIN_EMAIL         = chandra.paidimukkala@aquarient.com
UPLOAD_DIR          = /tmp/uploads
LOG_LEVEL           = INFO

# LandingAI (or set via Admin Panel after deploy)
LANDINGAI_API_KEY   = <your key>
LANDINGAI_BASE_URL  = production

# Optional: Email notifications
MS_TENANT_ID        = 
MS_CLIENT_ID        = 
MS_CLIENT_SECRET    = 
MS_SENDER_EMAIL     = 
```

### Step 4 — Add Volume (Persistent Storage)
On Railway free tier, `/tmp` is ephemeral (files lost on restart).
For persistent uploads:
1. Go to service → **Volumes** → **Add Volume**
2. Mount path: `/app/uploads`
3. Update env var: `UPLOAD_DIR=/app/uploads`

### Step 5 — Deploy
Railway auto-deploys on every push to `main`.
The start command is: `python migrate_db.py && uvicorn main:app --host 0.0.0.0 --port $PORT`

### Step 6 — Get Your Backend URL
After deploy: copy the Railway URL, e.g. `https://docplus-ai-production.railway.app`

---

## PART 2: Deploy Frontend on Vercel

### Step 1 — Create Vercel Account
Go to https://vercel.com → Sign up with GitHub

### Step 2 — New Project
1. Click **Add New → Project**
2. Import `Chandra-AQT/DOCPlus-AI`
3. Set **Root Directory** → `frontend`
4. Framework: **Vite** (auto-detected)

### Step 3 — Set Environment Variables in Vercel
Go to project → **Settings → Environment Variables** → Add:

```
VITE_API_URL = https://docplus-ai-production.railway.app
```
(Use your actual Railway URL from Step 6 above)

### Step 4 — Deploy
Click **Deploy**. Vercel builds `npm run build` and serves `dist/`.

### Step 5 — Get Your Frontend URL
After deploy: copy the Vercel URL, e.g. `https://docplus-ai.vercel.app`

---

## PART 3: Connect Backend ↔ Frontend

### Update Railway FRONTEND_URL
1. Go to Railway → Variables
2. Update `FRONTEND_URL` = your Vercel URL (e.g. `https://docplus-ai.vercel.app`)
3. Railway auto-redeploys

### Test the Connection
1. Open `https://docplus-ai.vercel.app`
2. The landing page should load
3. Click "Go to Dashboard" → Admin login should work
4. Health check: `https://docplus-ai-production.railway.app/health`

---

## PART 4: Post-Deploy Admin Setup

### First Login
1. Open your Vercel URL
2. Navigate to `/admin-login`
3. Email: `chandra.paidimukkala@aquarient.com`
4. Password: `Admin@2024!`
5. **Change password immediately** in Admin Panel → Security

### Configure LandingAI
1. Admin Panel → AI Config → LandingAI for Guests
2. Enter your API key(s) in slots 1-5
3. Click "Save Key Pool"

### Set Default Guest Schema
1. Admin Panel → AI Config → Default Guest Schema
2. Upload your schema JSON or select from existing schemas
3. Guests will use this schema by default

### Upload Sample PDF
1. Admin Panel → AI Config → Sample PDF for Guests
2. Upload a PDF that guests can try for free (no quota used)

---

## Important Notes

### SQLite on Railway
Railway uses SQLite by default (stored in `/tmp` = ephemeral).
**For production**: Add a PostgreSQL database:
1. Railway → New → Database → PostgreSQL
2. Railway auto-sets `DATABASE_URL` 
3. Update `backend/app/core/database.py` to use PostgreSQL

### File Storage
Uploaded PDFs stored in `UPLOAD_DIR`.
On Railway free tier: ephemeral (lost on restart).
**Solution**: Add Railway Volume mounted at `/app/uploads`

### Custom Domain
- Vercel: Settings → Domains → Add your domain
- Railway: Settings → Domains → Add custom domain

---

## Environment Variables Summary

### Railway (Backend)
| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | JWT signing secret (32+ chars) |
| `FRONTEND_URL` | ✅ | Your Vercel URL for CORS |
| `ADMIN_EMAIL` | ✅ | Admin login email |
| `UPLOAD_DIR` | ✅ | `/tmp/uploads` or volume path |
| `LANDINGAI_API_KEY` | Optional | Or set via Admin Panel |
| `MS_TENANT_ID` | Optional | For email notifications |
| `SMTP_HOST` | Optional | SMTP fallback email |

### Vercel (Frontend)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Your Railway backend URL |
