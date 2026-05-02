# LabTrack Frontend - How To Use

This guide covers local setup, deployment, and common checks for the React/Vite frontend.

## 1. Install

```bash
npm install
```

## 2. Configure Environment

Create `.env` in the frontend repo.

For local backend:

```env
VITE_API_URL=http://localhost:5000/api
```

For deployed backend:

```env
VITE_API_URL=https://labtrack-backend-pjbq.onrender.com/api
```

Vite reads `VITE_API_URL` at build time. If this value changes in Vercel, redeploy the frontend.

## 3. Run Locally

```bash
npm run dev
```

Open:

```txt
http://localhost:5173
```

## 4. Build

```bash
npm run build
```

The output goes to:

```txt
dist/
```

## 5. Deploy To Vercel

Use these project settings:

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Add this environment variable before the production build:

```env
VITE_API_URL=https://labtrack-backend-pjbq.onrender.com/api
```

If the variable was added after the first deploy:

1. Go to Vercel project `Settings`.
2. Open `Environment Variables`.
3. Add `VITE_API_URL` for `Production`.
4. Go to `Deployments`.
5. Redeploy the latest deployment without build cache.

## 6. Backend URL Update

After Vercel gives the final frontend URL, update the backend Render env:

```env
FRONTEND_URL=https://labtrack-frontend-pearl.vercel.app
```

Redeploy the backend. This keeps CORS and password reset links aligned with the deployed frontend.

## 7. Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@kfupm.edu.sa` | `LabTrack123` |
| Instructor | `instructor@kfupm.edu.sa` | `LabTrack123` |
| Student | `student1@kfupm.edu.sa` | `LabTrack123` |
| Student | `student2@kfupm.edu.sa` | `LabTrack123` |

## 8. Git Workflow

The project has historically used branch-based work:

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

Before pushing:

```bash
npm run build
git status
```

Use clear commit messages and avoid committing `.env`, `dist/`, or `node_modules/`.

## 9. Troubleshooting

If the app opens but login fails:

- Confirm `VITE_API_URL` is set in Vercel.
- Confirm the frontend was redeployed after adding `VITE_API_URL`.
- Confirm the backend health check works: `https://labtrack-backend-pjbq.onrender.com/api/health`.

If a direct URL refresh shows 404:

- Confirm `vercel.json` is deployed.

If forgot-password links point to localhost:

- Update Render `FRONTEND_URL`.
- Redeploy the backend.

If lab test execution fails:

- Confirm backend JDoodle credentials are set on Render.
