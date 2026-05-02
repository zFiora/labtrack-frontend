# LabTrack Frontend

React + Vite frontend for LabTrack, a programming lab management platform for KFUPM courses.

The frontend is connected to the LabTrack backend API. It is no longer a frontend-only prototype: authentication, courses, labs, submissions, grades, analytics, peer reviews, and password reset flows are backed by the deployed Express API.

## Live Services

| Service | URL |
| --- | --- |
| Frontend | `https://labtrack-frontend-pearl.vercel.app` |
| Backend API | `https://labtrack-backend-pjbq.onrender.com/api` |
| Backend health | `https://labtrack-backend-pjbq.onrender.com/api/health` |

## Team

| Name | ID |
| --- | --- |
| Saif Alsadah | 202257480 |
| Haidar Aldahan | 202256620 |
| Hassan Al Henedi | 202276380 |
| Muhannad Almelaifi | 202253960 |

## Tech Stack

- React
- Vite
- React Router DOM
- Tailwind CSS
- Vercel for frontend hosting

## Features

- Sign in, registration, remembered sessions, and forgot-password flow
- Role-based routing for student, instructor, and admin users
- Student dashboard, labs, lab workspace, code execution results, submissions, grades, history, peer review, and reference solutions
- Instructor lab management, course sections, students, submissions, grading, analytics, plagiarism review, and settings
- Admin user, course, department, system, security, analytics, and backup pages
- API-backed data through `VITE_API_URL`

## Demo Accounts

Use the deployed app at:

```txt
https://labtrack-frontend-pearl.vercel.app
```

Known demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@kfupm.edu.sa` | `LabTrack123` |
| Instructor | `instructor@kfupm.edu.sa` | `LabTrack123` |
| Student | `student1@kfupm.edu.sa` | `LabTrack123` |
| Student | `student2@kfupm.edu.sa` | `LabTrack123` |

Manually created accounts may have different passwords. Use forgot password when email delivery is configured.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A running LabTrack backend

### Install

```bash
npm install
```

### Environment

Create `.env` locally:

```env
VITE_API_URL=http://localhost:5000/api
```

For the deployed backend:

```env
VITE_API_URL=https://labtrack-backend-pjbq.onrender.com/api
```

Do not commit `.env`.

### Run Locally

```bash
npm run dev
```

Vite usually starts on:

```txt
http://localhost:5173
```

### Build

```bash
npm run build
```

The production build is written to `dist/`.

### Preview Production Build

```bash
npm run preview
```

## Deployment

The frontend is deployed on Vercel.

Vercel settings:

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Required Vercel environment variable:

```env
VITE_API_URL=https://labtrack-backend-pjbq.onrender.com/api
```

`vercel.json` rewrites all routes to `/` so React Router paths such as `/reset-password/:token` work on refresh and direct email-link visits.

After deployment, update the backend `FRONTEND_URL` on Render to the final Vercel URL:

```env
FRONTEND_URL=https://labtrack-frontend-pearl.vercel.app
```

Then redeploy the backend so CORS and password reset links point to the deployed frontend.

## Project Structure

```txt
src/
  components/
    layout/
  pages/
    admin/
    auth/
    instructor/
    student/
  router/
  styles/
  utils/
```

## Authentication Storage

The frontend stores the signed-in user and JWT in browser storage:

- `sessionStorage` when "Remember me" is off
- `localStorage` when "Remember me" is on

API calls attach the JWT as:

```txt
Authorization: Bearer <token>
```

## Troubleshooting

- If login fails immediately, confirm `VITE_API_URL` was set before the Vercel build and redeploy without build cache.
- If refresh or reset-password links 404, confirm `vercel.json` is deployed.
- If API calls fail with CORS errors, confirm Render `FRONTEND_URL` matches the deployed Vercel URL exactly.
- If code execution fails, confirm the backend has valid JDoodle credentials.

## Related Docs

See [HOW_TO_USE.md](./HOW_TO_USE.md) for local workflow and deployment commands.
