# LabTrack Front-End – How to Use

This guide explains how to set up, run, and collaborate on the project.

---

## 1. Clone the Repository


git clone <YOUR_REPO_LINK>
cd labtrack-frontend

---

## 2. Install Dependencies

npm install

----

## 3. Start the Development Server

npm run dev

Open the link http://localhost:*****

---

## 4. Git Workflow (IMPORTANT)

We are using a branch-based workflow.

Main branches
main → final stable version (DO NOT work here directly)
development → main working branch

--- 

## 5. How to Work on the Project

Step 1 — Switch to development
git checkout development
git pull origin development

---
Step 2 — Create your feature branch
git checkout -b feature/your-feature-name

Examples:

feature/login-page
feature/dashboard-ui
feature/admin-panel


Step 3 — Make changes and commit
git add .
git commit -m "Describe your changes"
Step 4 — Push your branch
git push origin feature/your-feature-name
Step 5 — Merge into development

After finishing your work:

Merge your branch into development
Do NOT push directly to main

--- 

## 6. Team Rules
Do not push directly to main
Always pull latest development before starting
Each member must commit from their own account
Write clear commit messages
Work on separate feature branches

---

## 7. Authentication (Demo Behavior)

This project uses frontend-only authentication:

Registered users are stored in localStorage
Login checks against stored users
Navigation depends on role:
Student → /dashboard
Instructor → /admin/users

---

## 8. Troubleshooting

If the project does not run:

Make sure Node.js is installed
Run npm install again
Make sure you're inside the project folder

If needed:

rm -rf node_modules
npm install
