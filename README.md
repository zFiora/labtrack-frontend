# LabTrack Front-End

LabTrack is a web-based platform designed to manage and streamline programming lab work for both students and instructors. This project represents the front-end application of the system, developed using React + Vite and connected to the LabTrack backend API.

---

## Project Overview

This project was developed for the SWE363 (Web Engineering) course.

The application now supports API-backed user flows for students, instructors, and admins:

- Build a fully interactive front-end application
- Follow and implement the provided Figma design
- Demonstrate complete user flows and interactions
- Connect authentication, courses, labs, submissions, grades, analytics, peer reviews, and password reset to the backend

## Live Services

| Service | URL |
| --- | --- |
| Frontend | `https://labtrack-frontend-pearl.vercel.app` |
| Backend API | `https://labtrack-backend-pjbq.onrender.com/api` |
| Backend health | `https://labtrack-backend-pjbq.onrender.com/api/health` |

---

## Features

- Sign in, register, remember me, and forgot-password flow
- Role-based registration and navigation
- Form validation for KFUPM email and password constraints
- Interactive UI components, forms, buttons, tabs, filters, and dashboards
- Student dashboard, labs, lab workspace, test results, submissions, grades, history, peer review, and reference solutions
- Instructor lab management, course sections, students, submissions, grading, analytics, plagiarism review, and settings
- Admin user, course, department, system, security, analytics, and backup pages
- API-backed data through `VITE_API_URL`

---

## Tech Stack

- React
- Vite
- React Router DOM
- Tailwind CSS
- Vercel for frontend hosting

---

## Project Structure

```txt
labtrack-frontend/
├── public/                 # Static files served by Vite
├── src/
│   ├── components/
│   │   └── layout/         # Shared layout and navigation components
│   ├── pages/
│   │   ├── admin/          # Admin user, course, department, system, security, analytics, backup pages
│   │   ├── auth/           # Login, registration, forgot-password, reset-password pages
│   │   ├── instructor/     # Lab management, grading, courses, students, analytics, settings
│   │   └── student/        # Dashboard, labs, workspace, grades, history, peer review, solutions
│   ├── router/             # React Router route map
│   ├── styles/             # Global styling
│   ├── utils/              # API client and auth storage helpers
│   ├── App.jsx             # App shell
│   └── main.jsx            # React entry point
├── index.html              # Vite HTML entry
├── package.json            # Scripts and dependencies
└── vercel.json             # Vercel SPA rewrite configuration
```

---

## Team Members

- Haidar AlDahan
- Muhannad AlMelaifi
- Hassan Al Henedi
- Saif AlSadah

---

## Work Distribution

The work was divided among team members based on the Functional Requirements document and the provided Figma design.
Each member was responsible for implementing specific features and pages aligned with the system requirements and UI structure.

---

## Contribution Note

Backend route development:
Saif Alsadah & Muhannad Almelaifi

Connecting frontend to backend with APIs:
Haidar AlDahan & Hassan Al Henedi

## Notes

- This is a course project that has been connected to a deployed backend API.
- Browser storage is used only to keep the signed-in session token.
- Focus is on UI accuracy, interactivity, user flow, and API compatibility.

---

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

---

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

---

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

---

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

---

## License

This project was developed for academic purposes as part of SWE363.
