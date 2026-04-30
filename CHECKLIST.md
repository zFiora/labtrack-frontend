# LabTrack — Frontend ↔ Backend Integration Checklist

> Work through this top-to-bottom. Foundation tasks must be done first — every
> page depends on them. Mark each item `[x]` when complete.

---

## CRITICAL THINGS TO KNOW BEFORE STARTING

### Token / Storage key change
The backend stores the user as `{ id, fullName, email, role, token }`.
The frontend currently uses the key `"currentUser"` in storage.
**The backend guide says the key should be `"user"`.** We will update
`authStorage.js` to use `"user"` as the storage key and expose the token
from `user.token`.

### Response envelope
Every backend response is:
```
Success → { success: true,  data: <payload> }
Error   → { success: false, message: "..." }
```
Always read `response.data` for the actual payload.

### MongoDB `_id` vs `id`
Mongoose returns `_id` (string). Our `api.js` utility will normalize
every response object so that `_id` is copied to `id` before anything
uses it. This prevents 37 pages from each doing it manually.

### What is currently localStorage-only (will be replaced)
- `users` array → replaced by `POST /api/auth/register` + `POST /api/auth/login`
- `labtrack_instructor_labs` → replaced by `/api/instructor/labs` + `/api/student/labs`
- `labtrack_student_progress` → replaced by `/api/progress`
- `labtrack_submissions` → replaced by `/api/student/submissions` + `/api/instructor/labs/:labId/submissions`
- `labtrack_versions` → replaced by `/api/student/labs/:labId/versions`
- `labtrack_peer_reviews` → replaced by `/api/peer-reviews`
- `labtrack_courses` → replaced by `/api/admin/courses` + `/api/student/courses`

---

## PHASE 1 — FOUNDATION  *(do these before touching any page)*

- [x] **1.1 — Create `.env`**
  - Add file at project root: `VITE_API_URL=http://localhost:5000/api`
  - Vite exposes this as `import.meta.env.VITE_API_URL`

- [x] **1.2 — Create `src/utils/api.js`** (shared HTTP utility)
  - Base URL from `import.meta.env.VITE_API_URL`
  - Reads user from `sessionStorage` or `localStorage` under key `"user"`
  - Extracts `user.token` for the `Authorization: Bearer` header
  - Exports `api.get(path)`, `api.post(path, body)`, `api.patch(path, body)`, `api.delete(path)`
  - Each method throws on non-2xx or `success: false`
  - Normalizes every response object: copies `_id` → `id` recursively
  - Returns `response.data` directly (not the full envelope)
  - Example shape:
    ```js
    const BASE = import.meta.env.VITE_API_URL;
    function getToken() {
      const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
      return raw ? JSON.parse(raw)?.token : null;
    }
    async function request(method, path, body) {
      const token = getToken();
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Request failed");
      return normalize(json.data); // normalize _id → id
    }
    export const api = {
      get:    (path)        => request("GET",    path),
      post:   (path, body)  => request("POST",   path, body),
      patch:  (path, body)  => request("PATCH",  path, body),
      delete: (path)        => request("DELETE", path),
    };
    ```

- [x] **1.3 — Update `src/utils/authStorage.js`**
  - Change storage key from `"currentUser"` → `"user"` to match backend guide
  - The stored object shape changes from `{ fullName, email, password, role }`
    to `{ id, fullName, email, role, token }` (no password, adds token)
  - `getCurrentUser()` — no logic change, just key
  - `setCurrentUser(user, rememberMe)` — no logic change, just key
  - `clearCurrentUser()` — no logic change, just key

- [ ] **1.4 — Verify backend health**
  - Quick sanity check: `GET http://localhost:5000/api/health`
  - Should return `{ success: true, message: "LabTrack API is running" }`
  - If this fails, fix backend/network before anything else

---

## PHASE 2 — AUTHENTICATION

### File: `src/pages/auth/LoginPage.jsx`

- [x] **2.1 — Wire Sign In to `POST /api/auth/login`**
  - Remove the `localStorage.getItem("users")` lookup
  - Remove the plaintext password comparison
  - Call `api.post("/auth/login", { email, password })` (no `rememberMe` in body)
  - On success: call `setCurrentUser(data, rememberMe)` where `data` is `{ id, fullName, email, role, token }`
  - Navigate by role same as now
  - Map 401 → "Invalid email or password.", 403 → "Your account has been deactivated."

- [x] **2.2 — Wire Register to `POST /api/auth/register`**
  - Remove the `localStorage.getItem("users")` / `localStorage.setItem("users", ...)` logic
  - Call `api.post("/auth/register", { fullName, email, password, role })`
  - On success: show success message and switch to sign-in tab (same as current behavior)
  - Map 409 → "An account with this email already exists."
  - Remove `confirmPassword` from the body sent to the API (it's frontend-only validation)

- [x] **2.3 — Remove password from stored user object**
  - The `password` field must never be saved to storage
  - Backend does not return it; `data` only has `{ id, fullName, email, role, token }`

---

## PHASE 3 — STUDENT PAGES

### File: `src/pages/student/DashboardPage.jsx`

- [x] **3.1 — Replace localStorage lab data**
  - Remove all `localStorage.getItem("labtrack_instructor_labs")` calls
  - Call `api.get("/student/labs?status=active")` to get labs
  - Upcoming labs = labs where `dueDate` is within 72 hours and status is active (same filter logic)

- [x] **3.2 — Replace localStorage progress data**
  - Remove all `localStorage.getItem("labtrack_student_progress")` calls
  - Call `api.get("/progress")` to get `{ [labId]: { status, submittedAt, score } }`
  - Use this to compute per-lab status and overall completion

- [x] **3.3 — Replace localStorage grades data**
  - Call `api.get("/student/grades")` for average score and graded lab count
  - Note: `submissionStatus` and `score` are now on each lab item from `/student/labs`

- [x] **3.4 — Replace localStorage courses data**
  - Call `api.get("/student/courses?enrolled=true")` for enrolled courses
  - Use to build the course completion summary

---

### File: `src/pages/student/LabsPage.jsx`

- [x] **3.5 — Replace localStorage with API**
  - Remove all `localStorage.getItem("labtrack_instructor_labs")` calls
  - Call `api.get("/student/labs?status=active")`
  - The response already includes `submissionStatus` and `submittedAt` per student
  - Remove all `localStorage.getItem("labtrack_student_progress")` calls

---

### File: `src/pages/student/LabWorkspacePage.jsx`

- [ ] **3.6 — Load lab data from API**
  - Remove seed/localStorage lab lookup
  - Call `api.get("/student/labs/:labId")` on mount to get lab details

- [ ] **3.7 — Load existing submission/progress**
  - Call `api.get("/student/submissions/:labId")` on mount
  - If 404 → student hasn't started, use starter code as initial editor content
  - If found → populate editor with `submission.code` / `submission.files`
  - Also call `api.get("/progress")` or `api.get("/student/submissions/:labId")`
    to restore draft status

- [ ] **3.8 — Wire "Run" button to `POST /api/compile`**
  - Body: `{ code, language, input: "" }`
  - Returns: `{ output, error, statusCode }`
  - Show output in the terminal panel
  - This is for ad-hoc "run", NOT the test runner

- [ ] **3.9 — Wire "Submit" button to `POST /api/student/submissions/:labId`**
  - Body: `{ code, language }`
  - Returns submission with `testResults` array
  - Show test results in UI
  - Update progress state to `submitted`

- [ ] **3.10 — Wire "Save Draft" / auto-save to `PATCH /api/progress/:labId`**
  - Body: `{ status: "in_progress", code }`
  - Call on explicit save or debounced auto-save

- [ ] **3.11 — Wire version save to `POST /api/student/labs/:labId/versions`**
  - Body: `{ code, description }`
  - Handle 400 (no changes) gracefully — show "No changes since last version"

- [ ] **3.12 — Wire peer review share to `POST /api/peer-reviews/share`**
  - Body: `{ labId, reviewerEmail, fileContents, files }`
  - Remove localStorage peer review logic

---

### File: `src/pages/student/HistoryPage.jsx`

- [x] **3.13 — Replace localStorage with API**
  - Call `api.get("/student/labs")` to get all labs
  - Call `api.get("/progress")` to know which ones have been submitted
  - Filter to show labs with `status !== "not_started"`

---

### File: `src/pages/student/HistoryLabPage.jsx`

- [ ] **3.14 — Replace localStorage with API**
  - Call `api.get("/student/labs/:labId/versions")`
  - Each version has `{ version, code, timestamp, description }`
  - Remove all `localStorage.getItem("labtrack_versions")` calls

---

### File: `src/pages/student/GradesPage.jsx`

- [x] **3.15 — Replace localStorage with API**
  - Call `api.get("/student/grades")`
  - Returns: `[ { id, lab, score, testsPassed, testsTotal, grade, feedback, status, submittedAt } ]`
  - `lab` is a nested object with lab details — read `lab.title`, `lab.courseCode`, etc.
  - Remove all `localStorage.getItem("labtrack_student_progress")` and course calls

---

### File: `src/pages/student/PeerReviewsPage.jsx`

- [ ] **3.16 — Replace localStorage with API**
  - Call `api.get("/peer-reviews")`
  - Response: array of reviews — some you sent (you are owner), some assigned to you (you are reviewer)
  - Distinguish: if `reviewerEmail` matches current user's email → it's "assigned to you"
  - Remove all `localStorage.getItem("labtrack_peer_reviews")` calls

---

### File: `src/pages/student/AssignedReviewPage.jsx`

- [ ] **3.17 — Load review from API**
  - Call `api.get("/peer-reviews/:reviewId")` on mount
  - Returns full review with `fileContents`, `files`, `testsPassed`

- [ ] **3.18 — Submit review to API**
  - Call `api.post("/peer-reviews/:reviewId/submit", { readability, efficiency, comments, strengths, improvements, overallComment, lineComments, submittedAt })`
  - Remove localStorage write logic

---

### File: `src/pages/student/ReceivedReviewPage.jsx`

- [ ] **3.19 — Load review from API**
  - Call `api.get("/peer-reviews/:reviewId")` on mount
  - OR call `api.get("/peer-reviews/received/:labId")` if navigating by labId
  - Display `review.lineComments` as inline annotations on the code view
  - Remove localStorage read logic

---

### File: `src/pages/student/ReferenceSolutionsPage.jsx`

- [ ] **3.20 — Replace localStorage with API**
  - Call `api.get("/student/labs")` to get lab list
  - For each lab, call `api.get("/student/labs/:labId")` — solutions are in `lab.solutions` array
  - The backend enforces the "unlocked 2 days after deadline" rule — just render whatever is returned

---

## PHASE 4 — INSTRUCTOR PAGES

### File: `src/pages/instructor/LabsManagementPage.jsx`

- [ ] **4.1 — Replace localStorage with API**
  - Call `api.get("/instructor/labs")` on mount
  - Support filter by status with `?status=draft|active|closed`
  - Remove all `localStorage.getItem("labtrack_instructor_labs")` calls

---

### File: `src/pages/instructor/CreateLabPage.jsx`

- [ ] **4.2 — Create lab via API**
  - Call `api.post("/instructor/labs", { courseId, labNumber, title, instructions, dueDate, points, difficulty, languages, starterCode, testCases, solutions })`
  - Note: field name is `instructions` in backend (not `description`)
  - Lab is created as `"draft"` automatically

- [ ] **4.3 — Edit lab via API**
  - Load existing lab: `api.get("/instructor/labs/:labId")` (via `/instructor/labs` list)
  - Save edits: `api.patch("/instructor/labs/:labId", { ...changedFields })`

- [ ] **4.4 — Publish lab via API**
  - Call `api.patch("/instructor/labs/:labId/publish", { status: "active" })`
  - On 400 → display the list of validation failures from the response message
  - Remove localStorage save logic

---

### File: `src/pages/instructor/SubmissionsPage.jsx`

- [ ] **4.5 — Load submissions from API**
  - Call `api.get("/instructor/labs/:labId/submissions")`
  - Returns array of submissions with full student details
  - Remove the 12-student mock seed logic
  - Remove `localStorage.getItem("labtrack_submissions")` calls
  - The auto-refresh (every 30s) can stay — just re-call the same endpoint

---

### File: `src/pages/instructor/GradingPage.jsx`

- [ ] **4.6 — Load submission from API**
  - Get `subId` from route params
  - Call `api.get("/instructor/labs/:labId/submissions")` and find by subId
    OR keep a state-passing approach from SubmissionsPage (navigation state)

- [ ] **4.7 — Submit grade via API**
  - Call `api.patch("/instructor/submissions/:subId/grade", { score, rubric: { comments, style, efficiency }, inlineComments, overallFeedback, status: "graded" })`
  - Remove localStorage grade write logic

---

### File: `src/pages/instructor/BulkGradePanel.jsx`

- [ ] **4.8 — Wire bulk grade to API**
  - Call `api.post("/instructor/submissions/bulk-grade", { updates: [ { subId, score, feedback } ] })`
  - Remove localStorage logic

---

### File: `src/pages/instructor/AnalyticsPage.jsx`

- [ ] **4.9 — Load analytics from API**
  - Call `api.get("/instructor/labs/:labId/analytics")`
  - Returns: `{ stats, distribution, timeline, topSubmitters }`
  - Remove localStorage computation logic

---

### File: `src/pages/instructor/PlagiarismPage.jsx`

- [ ] **4.10 — Trigger plagiarism check**
  - Call `api.post("/instructor/labs/:labId/check-plagiarism")` to run analysis
  - Call `api.get("/instructor/labs/:labId/plagiarism")` to load existing results

- [ ] **4.11 — Update flagged pairs**
  - Call `api.patch("/instructor/labs/:labId/plagiarism/:pairKey", { flagged: true|false })`

---

### Files: `src/pages/instructor/SolutionsTab.jsx`, `src/pages/instructor/TestCasesTab.jsx`

- [ ] **4.12 — These are sub-components of CreateLabPage**
  - Wire test cases to be saved as part of `POST /api/instructor/labs` body
  - Wire solutions similarly — they are part of the lab creation payload
  - No separate endpoints — they are embedded in the lab object

---

## PHASE 5 — ADMIN PAGES

### File: `src/pages/admin/UserManagementPage.jsx`

- [ ] **5.1 — Replace mock/localStorage with API**
  - Load: `api.get("/admin/users")`
  - Create: `api.post("/admin/users", { fullName, email, password, role, department, studentId })`
  - Edit role/status: `api.patch("/admin/users/:userId", { role, department, status })`
  - Deactivate: `api.delete("/admin/users/:userId")` (soft delete)

---

### File: `src/pages/admin/CourseManagementPage.jsx`

- [ ] **5.2 — Replace mock/localStorage with API**
  - Load: `api.get("/admin/courses")`
  - Create: `api.post("/admin/courses", { courseCode, name, department, creditHours, semester, sections })`
  - Edit: `api.patch("/admin/courses/:courseId", { ...fields })`
  - Delete: `api.delete("/admin/courses/:courseId")`

---

### File: `src/pages/admin/DepartmentSettingsPage.jsx`

- [ ] **5.3 — Replace mock with API**
  - Load: `api.get("/admin/departments")`
  - Create: `api.post("/admin/departments", { code, name, headId, contactEmail, policies })`
  - Edit: `api.patch("/admin/departments/:deptId", { ...fields })`

---

### File: `src/pages/admin/SystemSettingsPage.jsx`

- [ ] **5.4 — Wire to API**
  - Load: `api.get("/admin/system/settings")`
  - Save: `api.patch("/admin/system/settings", { ...changedSettings })`
  - Also: `api.get("/admin/system/maintenance")` + `api.patch("/admin/system/maintenance")`

---

### File: `src/pages/admin/SystemMonitorPage.jsx`

- [ ] **5.5 — Wire to API**
  - Load logs: `api.get("/admin/system/logs")`
  - Resolve log: `api.patch("/admin/system/logs/:logId", { resolved: true })`
  - Clear logs: `api.delete("/admin/system/logs")`

---

### File: `src/pages/admin/AnalyticsDashboardPage.jsx`

- [ ] **5.6 — Wire to API**
  - Load: `api.get("/admin/analytics")`
  - Generate report: `api.post("/admin/analytics/reports", { name, type, filters })`
  - Load reports: `api.get("/admin/analytics/reports")`

---

### File: `src/pages/admin/SecurityAccessPage.jsx`

- [ ] **5.7 — Wire to API**
  - Load security settings: `api.get("/admin/security/settings")`
  - Update: `api.patch("/admin/security/settings", { ...fields })`
  - Load audit logs: `api.get("/admin/audit-logs")`
  - Clear audit logs: `api.delete("/admin/audit-logs")`

---

### File: `src/pages/admin/BackupRecoveryPage.jsx`

- [ ] **5.8 — Wire to API**
  - Load backups: `api.get("/admin/system/backups")`
  - Trigger backup: `api.post("/admin/system/backups/trigger", { scope })`
  - Load schedule: `api.get("/admin/system/backup-schedule")`
  - Update schedule: `api.patch("/admin/system/backup-schedule", { ...fields })`

---

## PHASE 6 — CLEANUP

- [ ] **6.1 — Remove all `localStorage.getItem("users")` / `localStorage.setItem("users", ...)` calls**
  - Only place this existed: `LoginPage.jsx` → already replaced in Phase 2

- [ ] **6.2 — Remove all `localStorage.getItem("labtrack_*")` / `setItem("labtrack_*")` calls**
  - Do a global search for `labtrack_` in src/ and remove each remaining usage

- [ ] **6.3 — Remove all inline mock/seed data arrays**
  - Search for large hardcoded arrays (mock students, mock labs, etc.) in each page
  - Delete seed functions like `seedDemoProgress()`, `seedMockStudents()`, etc.

- [ ] **6.4 — Error handling**
  - Add a consistent error display pattern across pages (toast or inline error banner)
  - All `api.*` calls should be in `try/catch`, showing the error message to the user
  - 401 errors → redirect to `/` (token expired or invalid)

- [ ] **6.5 — Loading states**
  - Every page that makes an API call should show a loading spinner while fetching
  - This prevents the UI from rendering with empty data

---

## QUICK REFERENCE — Endpoint Map

| Page | Method | Endpoint |
|------|--------|----------|
| LoginPage (sign in) | POST | `/auth/login` |
| LoginPage (register) | POST | `/auth/register` |
| DashboardPage | GET | `/student/labs?status=active` |
| DashboardPage | GET | `/progress` |
| DashboardPage | GET | `/student/grades` |
| DashboardPage | GET | `/student/courses?enrolled=true` |
| LabsPage | GET | `/student/labs?status=active` |
| LabWorkspacePage | GET | `/student/labs/:labId` |
| LabWorkspacePage | GET | `/student/submissions/:labId` |
| LabWorkspacePage | POST | `/student/submissions/:labId` (submit) |
| LabWorkspacePage | PATCH | `/progress/:labId` (save draft) |
| LabWorkspacePage | POST | `/compile` (run code) |
| LabWorkspacePage | GET | `/student/labs/:labId/versions` |
| LabWorkspacePage | POST | `/student/labs/:labId/versions` |
| LabWorkspacePage | POST | `/peer-reviews/share` |
| HistoryPage | GET | `/student/labs` + `/progress` |
| HistoryLabPage | GET | `/student/labs/:labId/versions` |
| GradesPage | GET | `/student/grades` |
| PeerReviewsPage | GET | `/peer-reviews` |
| AssignedReviewPage | GET | `/peer-reviews/:reviewId` |
| AssignedReviewPage | POST | `/peer-reviews/:reviewId/submit` |
| ReceivedReviewPage | GET | `/peer-reviews/:reviewId` |
| ReferenceSolutionsPage | GET | `/student/labs` (solutions embedded) |
| LabsManagementPage | GET | `/instructor/labs` |
| CreateLabPage (create) | POST | `/instructor/labs` |
| CreateLabPage (edit) | PATCH | `/instructor/labs/:labId` |
| CreateLabPage (publish) | PATCH | `/instructor/labs/:labId/publish` |
| SubmissionsPage | GET | `/instructor/labs/:labId/submissions` |
| GradingPage | PATCH | `/instructor/submissions/:subId/grade` |
| BulkGradePanel | POST | `/instructor/submissions/bulk-grade` |
| AnalyticsPage | GET | `/instructor/labs/:labId/analytics` |
| PlagiarismPage | POST | `/instructor/labs/:labId/check-plagiarism` |
| PlagiarismPage | GET | `/instructor/labs/:labId/plagiarism` |
| PlagiarismPage | PATCH | `/instructor/labs/:labId/plagiarism/:pairKey` |
| UserManagementPage | GET/POST/PATCH/DELETE | `/admin/users(/:userId)` |
| CourseManagementPage | GET/POST/PATCH/DELETE | `/admin/courses(/:courseId)` |
| DepartmentSettingsPage | GET/POST/PATCH | `/admin/departments(/:deptId)` |
| SystemSettingsPage | GET/PATCH | `/admin/system/settings` |
| SystemMonitorPage | GET/PATCH/DELETE | `/admin/system/logs(/:logId)` |
| AnalyticsDashboardPage | GET/POST | `/admin/analytics(/reports)` |
| SecurityAccessPage | GET/PATCH | `/admin/security/settings` |
| SecurityAccessPage | GET/DELETE | `/admin/audit-logs` |
| BackupRecoveryPage | GET/POST | `/admin/system/backups(/trigger)` |
| BackupRecoveryPage | GET/PATCH | `/admin/system/backup-schedule` |
