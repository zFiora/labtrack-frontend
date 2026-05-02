# LabTrack — Backend API Development Guideline

> **Purpose:** Complete technical reference for building the LabTrack backend API. Derived from a full scan of the React frontend codebase. Every data model, endpoint, business rule, and authentication requirement is documented here.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack Recommendations](#2-tech-stack-recommendations)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [User Roles & Permissions](#4-user-roles--permissions)
5. [Data Models (Complete Schemas)](#5-data-models-complete-schemas)
6. [API Endpoints — Full Specification](#6-api-endpoints--full-specification)
   - [Auth Endpoints](#61-auth-endpoints)
   - [User Endpoints](#62-user-endpoints)
   - [Lab Endpoints](#63-lab-endpoints)
   - [Submission Endpoints](#64-submission-endpoints)
   - [Test Case Endpoints](#65-test-case-endpoints)
   - [Version History Endpoints](#66-version-history-endpoints)
   - [Peer Review Endpoints](#67-peer-review-endpoints)
   - [Grades Endpoints](#68-grades-endpoints)
   - [Reference Solutions Endpoints](#69-reference-solutions-endpoints)
   - [Course Endpoints](#610-course-endpoints)
   - [Analytics Endpoints](#611-analytics-endpoints)
   - [Admin Endpoints](#612-admin-endpoints)
7. [Validation Rules](#7-validation-rules)
8. [Business Logic](#8-business-logic)
9. [File Upload Specification](#9-file-upload-specification)
10. [Frontend Routes Reference](#10-frontend-routes-reference)
11. [Environment Variables](#11-environment-variables)
12. [Security Requirements](#12-security-requirements)

---

## 1. Project Overview

**LabTrack** is a university lab assignment management platform for KFUPM (King Fahd University of Petroleum and Minerals). It supports three user roles: **Student**, **Instructor**, and **Admin**.

### Core Features

| Feature | Roles |
|---------|-------|
| Lab creation and management | Instructor |
| Code submission via in-browser IDE | Student |
| Automated test case execution | Student, Instructor |
| Manual grading and feedback | Instructor |
| Peer code review | Student |
| Version history / snapshots | Student |
| Reference solutions library | Student (after deadline), Instructor |
| Plagiarism detection | Instructor |
| Analytics dashboards | Instructor, Admin |
| User/course/department management | Admin |
| System monitoring and backup | Admin |

---

## 2. Tech Stack Recommendations

### Frontend (already built)
- React 19 + Vite
- React Router DOM 7
- Tailwind CSS 4
- No API client library — uses native `fetch()`

### Backend (to build)
- **Runtime:** Node.js (Express/Fastify) or Python (FastAPI/Django)
- **Database:** PostgreSQL (primary) + Redis (sessions/caching)
- **Auth:** JWT (access + refresh tokens) or session-based
- **File Storage:** AWS S3 / MinIO / local disk for uploaded files
- **Code Execution:** Docker-based sandboxed runners (per language)
- **Email:** SMTP service (nodemailer / SendGrid) for peer review invitations
- **WebSocket:** Optional — for real-time submission status updates

### Base URL Convention
```
https://api.labtrack.kfupm.edu.sa/v1
```
Set via frontend env var: `VITE_API_BASE_URL`

---

## 3. Authentication & Authorization

### Email Domain Restriction
All users **must** have a `@kfupm.edu.sa` email. Enforce at both registration and login.

### Password Requirements
- Minimum 8 characters
- At least 1 uppercase letter (`A-Z`)
- At least 1 lowercase letter (`a-z`)
- At least 1 digit (`0-9`)

### Token Strategy (Recommended JWT)

```
POST /auth/login  →  { accessToken, refreshToken, user }
```

- **Access Token:** Short-lived (15–60 min), sent in `Authorization: Bearer <token>` header
- **Refresh Token:** Long-lived (7–30 days), stored in HttpOnly cookie or returned in body
- **Remember Me:** If `rememberMe: true` is sent, extend refresh token lifetime

### Session Storage (Frontend Behavior)
- `rememberMe: false` → data stored in `sessionStorage` (clears on tab close)
- `rememberMe: true` → data stored in `localStorage` (persists)

The backend does not need to differentiate — just issue tokens; the frontend handles persistence.

---

## 4. User Roles & Permissions

```
student     — can read own data, submit code, peer review
instructor  — can manage labs, view/grade all submissions, view analytics
admin       — full system access including user/course/system management
```

### Permission Matrix

| Action | Student | Instructor | Admin |
|--------|---------|-----------|-------|
| Register/Login | ✅ | ✅ | ✅ |
| View own profile | ✅ | ✅ | ✅ |
| View labs (active) | ✅ | ✅ | ✅ |
| Create/edit lab | ❌ | ✅ | ✅ |
| Delete lab | ❌ | ✅ | ✅ |
| Submit code | ✅ | ❌ | ❌ |
| View own submission | ✅ | ❌ | ❌ |
| View all submissions | ❌ | ✅ | ✅ |
| Grade submission | ❌ | ✅ | ✅ |
| View own grades | ✅ | ❌ | ❌ |
| Peer review | ✅ | ❌ | ❌ |
| View analytics | ❌ | ✅ | ✅ |
| Plagiarism check | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| Manage courses | ❌ | ❌ | ✅ |
| System settings | ❌ | ❌ | ✅ |
| Backup/restore | ❌ | ❌ | ✅ |

---

## 5. Data Models (Complete Schemas)

### 5.1 User

```typescript
{
  id: string                        // UUID
  fullName: string
  email: string                     // Must be @kfupm.edu.sa
  passwordHash: string              // bcrypt/argon2 — NEVER send to client
  role: 'student' | 'instructor' | 'admin'
  isActive: boolean                 // Soft-delete flag
  createdAt: string                 // ISO 8601
  updatedAt: string
}
```

**Client-safe shape (never include passwordHash):**
```typescript
{
  id: string
  fullName: string
  email: string
  role: 'student' | 'instructor' | 'admin'
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

---

### 5.2 Course

```typescript
{
  id: string                        // UUID
  courseCode: string                // e.g., "ICS 202"
  name: string                      // e.g., "Data Structures"
  department: string                // e.g., "Computer Science"
  creditHours: number               // e.g., 3
  sections: Section[]
  createdAt: string
  updatedAt: string
}

Section {
  id: string
  sectionNumber: string             // e.g., "01"
  instructorId: string              // FK → User.id (instructor)
  enrolledStudentIds: string[]      // FK[] → User.id (students)
}
```

---

### 5.3 Lab

```typescript
{
  id: string                        // UUID
  labNumber: number                 // Sequential e.g., 9, 10, 11
  title: string                     // min 5 chars
  courseCode: string                // FK → Course.courseCode
  dueDate: string                   // ISO 8601, must be ≥ 24h from createdAt
  description: string               // Full markdown instructions
  starterCode: string               // Boilerplate code string
  language: string                  // Primary language, e.g., "Python"
  languages: string[]               // All supported languages
  files: string[]                   // File names included in starter
  points: number                    // 1-200 (required to publish)
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'draft' | 'active' | 'closed'
  testCases: TestCase[]
  solutions: Solution[]
  starterFiles: FileInfo[]
  supportingFiles: FileInfo[]
  createdBy: string                 // FK → User.id (instructor)
  createdAt: string
  updatedAt: string
}
```

**Lab publish validation (PATCH /labs/:id with status: "active"):**
- `title.length >= 5`
- `dueDate` is at least 24 hours from now
- `points` is between 1 and 200
- `languages.length >= 1`
- `testCases.length >= 3`

---

### 5.4 TestCase

```typescript
{
  id: string                        // UUID
  labId: string                     // FK → Lab.id
  name: string
  description: string
  type: 'visible' | 'hidden'        // Hidden not shown to student until after grading
  expectedInput: string             // stdin input
  expectedOutput: string            // expected stdout
  points: number                    // Points earned if passing
  order: number                     // Display order
}
```

**Client-safe shape for students (hide expected data on hidden tests):**
```typescript
{
  id: string
  labId: string
  name: string
  description: string
  type: 'visible' | 'hidden'
  points: number
  order: number
  // expectedInput and expectedOutput are OMITTED for hidden tests
}
```

---

### 5.5 Submission

```typescript
{
  id: string                        // UUID
  labId: string                     // FK → Lab.id
  studentId: string                 // FK → User.id
  studentName: string               // Denormalized for quick display
  studentEmail: string              // Denormalized
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded'
  submittedAt?: string              // ISO 8601 — null if not submitted
  score?: number                    // null until graded; 0 to lab.points
  maxScore: number                  // Equals lab.points
  late: boolean                     // submittedAt > lab.dueDate
  language: string                  // Language used
  code: string                      // Final submitted code (or current draft)
  files: {                          // All files in the submission
    [filename: string]: string      // filename → file content
  }
  testResults: TestResult[]
  instructorNote: string            // Private note from instructor
  gradedAt?: string                 // ISO 8601 — null until graded
  gradedBy?: string                 // FK → User.id (instructor)
}

TestResult {
  testCaseId: string                // FK → TestCase.id
  description: string
  status: 'pass' | 'fail' | 'pending'
  points: number                    // Max points for this test
  earned: number                    // Points actually earned
}
```

---

### 5.6 Version (Snapshot)

```typescript
{
  id: string                        // UUID
  labId: string                     // FK → Lab.id
  studentId: string                 // FK → User.id
  description: string               // User-provided snapshot label
  files: {
    [filename: string]: string      // Snapshot of all file contents
  }
  testsPassed: number               // Number of tests passing at snapshot time
  testsTotal: number
  createdAt: string                 // ISO 8601
}
```

**Limit:** Maximum 50 versions per student per lab. If at limit, return 400 or auto-delete oldest.

---

### 5.7 PeerReview

```typescript
{
  id: string                        // UUID
  labId: string                     // FK → Lab.id
  labTitle: string                  // Denormalized
  ownerStudentId: string            // FK → User.id — whose code is being reviewed
  ownerName: string                 // Denormalized
  reviewerEmail: string             // Email of invited reviewer (must be @kfupm.edu.sa)
  reviewerStudentId?: string        // FK → User.id — resolved when reviewer logs in
  files: string[]                   // File names in the shared snapshot
  fileContents: {                   // Code contents at time of share
    [filename: string]: string
  }
  testsPassed: string               // e.g., "3/5" — string from the snapshot
  sharedAt: string                  // ISO 8601
  dueDate: string                   // ISO 8601 — review deadline
  status: 'pending' | 'completed'
  review?: Review                   // Null until submitted
}

Review {
  readability: number               // 1-5 (integer)
  efficiency: number                // 1-5 (integer)
  comments: number                  // 1-5 (integer) — documentation quality rating
  strengths: string                 // min 10 chars
  improvements: string             // min 10 chars
  overallComment: string            // min 10 chars
  lineComments: {
    [lineIndex: string]: string     // key = "filename:lineNumber", value = comment text
  }
  submittedAt: string               // ISO 8601
}
```

---

### 5.8 Solution (Reference Solution)

```typescript
{
  id: string                        // UUID
  labId: string                     // FK → Lab.id
  type: 'instructor' | 'top_student'
  authorId?: string                 // FK → User.id (null for anonymized student solutions)
  title: string                     // e.g., "Instructor Solution", "Top Solution #1"
  language: string
  files: {
    [filename: string]: string
  }
  explanation?: string              // Instructor annotation/explanation
  unlockedAt: string                // ISO 8601 — when this becomes visible (default: lab.dueDate + 2 days)
  createdAt: string
}
```

**Access control:** Students can only access solutions where `unlockedAt <= now`.

---

### 5.9 FileInfo (Metadata Only)

```typescript
{
  name: string                      // Filename
  size: number                      // Bytes
  fileType: string                  // MIME type or extension
  url?: string                      // S3/CDN URL to download
}
```

---

## 6. API Endpoints — Full Specification

All endpoints are prefixed with `/v1`. All responses follow this envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Error response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

---

### 6.1 Auth Endpoints

#### `POST /auth/register`
Register a new user.

**Request body:**
```json
{
  "fullName": "Ahmed Al-Ghamdi",
  "email": "s201234567@kfupm.edu.sa",
  "password": "SecurePass1",
  "role": "student"
}
```

**Response `201`:**
```json
{
  "user": { ...UserSafeShape },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:**
- `400` — email not @kfupm.edu.sa, password too weak, missing fields
- `409` — email already registered

---

#### `POST /auth/login`
Authenticate user and get tokens.

**Request body:**
```json
{
  "email": "s201234567@kfupm.edu.sa",
  "password": "SecurePass1",
  "rememberMe": false
}
```

**Response `200`:**
```json
{
  "user": { ...UserSafeShape },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:**
- `401` — invalid credentials
- `403` — account deactivated

---

#### `POST /auth/refresh`
Get a new access token using refresh token.

**Request body:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

---

#### `POST /auth/logout`
Invalidate the refresh token.

**Request headers:** `Authorization: Bearer <accessToken>`

**Response `204`:** No content.

---

#### `GET /auth/me`
Get the currently authenticated user.

**Request headers:** `Authorization: Bearer <accessToken>`

**Response `200`:**
```json
{
  "user": { ...UserSafeShape }
}
```

---

### 6.2 User Endpoints

#### `GET /users` *(Admin only)*
List all users with optional filters.

**Query params:**
```
?role=student|instructor|admin
&isActive=true|false
&search=<string>         (searches fullName and email)
&page=1
&limit=20
```

**Response `200`:**
```json
{
  "users": [ ...UserSafeShape[] ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

#### `GET /users/:id` *(Admin or self)*

**Response `200`:**
```json
{
  "user": { ...UserSafeShape }
}
```

---

#### `PATCH /users/:id` *(Admin only)*
Update user details (role, isActive, fullName).

**Request body (all fields optional):**
```json
{
  "fullName": "Ahmed Al-Ghamdi",
  "role": "instructor",
  "isActive": false
}
```

**Response `200`:**
```json
{
  "user": { ...UserSafeShape }
}
```

---

#### `DELETE /users/:id` *(Admin only)*
Soft-delete a user (`isActive: false`). Do not hard-delete to preserve submission history.

**Response `200`:**
```json
{
  "message": "User deactivated successfully"
}
```

---

#### `PATCH /users/:id/password` *(Self only)*
Change own password.

**Request body:**
```json
{
  "currentPassword": "OldPass1",
  "newPassword": "NewPass2"
}
```

**Response `200`:**
```json
{
  "message": "Password updated successfully"
}
```

---

### 6.3 Lab Endpoints

#### `GET /labs`
List labs. Students see only active labs for their enrolled courses. Instructors see all their labs.

**Query params:**
```
?status=draft|active|closed
&courseCode=ICS202
&page=1
&limit=20
```

**Response `200`:**
```json
{
  "labs": [
    {
      "id": "uuid",
      "labNumber": 9,
      "title": "Binary Trees",
      "courseCode": "ICS 202",
      "dueDate": "2026-04-30T23:59:00Z",
      "description": "...",
      "language": "Python",
      "languages": ["Python"],
      "points": 100,
      "difficulty": "medium",
      "status": "active",
      "testCasesCount": 5,
      "createdAt": "2026-04-01T00:00:00Z",
      "updatedAt": "2026-04-01T00:00:00Z",
      "createdBy": "instructor-uuid"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

#### `GET /labs/:id`
Get a single lab. Students see the lab with starter code but without hidden test case expected I/O.

**Response `200`:**
```json
{
  "lab": {
    "id": "uuid",
    "labNumber": 9,
    "title": "Binary Trees",
    "courseCode": "ICS 202",
    "dueDate": "2026-04-30T23:59:00Z",
    "description": "Full markdown...",
    "starterCode": "def solution():\n    pass",
    "language": "Python",
    "languages": ["Python"],
    "files": ["main.py", "utils.py"],
    "points": 100,
    "difficulty": "medium",
    "status": "active",
    "testCases": [ ...TestCaseClientShape[] ],
    "starterFiles": [ ...FileInfo[] ],
    "supportingFiles": [ ...FileInfo[] ],
    "createdBy": "instructor-uuid",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

#### `POST /labs` *(Instructor only)*
Create a new lab (starts as draft).

**Request body:**
```json
{
  "labNumber": 9,
  "title": "Binary Trees",
  "courseCode": "ICS 202",
  "dueDate": "2026-04-30T23:59:00Z",
  "description": "Implement a binary tree...",
  "starterCode": "class Node:\n    pass",
  "language": "Python",
  "languages": ["Python"],
  "files": ["main.py"],
  "points": 100,
  "difficulty": "medium"
}
```

**Response `201`:**
```json
{
  "lab": { ...LabShape }
}
```

---

#### `PATCH /labs/:id` *(Instructor — lab owner — only)*
Update lab metadata or change status.

**Request body (all fields optional):**
```json
{
  "title": "Updated Title",
  "dueDate": "2026-05-01T23:59:00Z",
  "status": "active",
  "points": 120,
  "difficulty": "hard"
}
```

**Business rule:** When setting `status: "active"`, validate publish requirements (see §7).

**Response `200`:**
```json
{
  "lab": { ...LabShape }
}
```

---

#### `DELETE /labs/:id` *(Instructor — lab owner — only)*
Delete a lab. Only allowed if `status === 'draft'` or instructor explicitly confirms deletion of active lab.

**Response `200`:**
```json
{
  "message": "Lab deleted successfully"
}
```

---

### 6.4 Submission Endpoints

#### `GET /labs/:labId/submissions` *(Instructor only)*
List all submissions for a lab.

**Query params:**
```
?status=not_started|in_progress|submitted|graded
&minScore=0
&maxScore=100
&late=true|false
&sortBy=name|score|submittedAt
&sortDir=asc|desc
&page=1
&limit=20
```

**Response `200`:**
```json
{
  "submissions": [ ...SubmissionShape[] ],
  "total": 12,
  "stats": {
    "submitted": 5,
    "inProgress": 1,
    "notStarted": 5,
    "graded": 1,
    "averageScore": 74.5,
    "passRate": 0.6
  }
}
```

---

#### `GET /labs/:labId/submissions/me` *(Student only)*
Get the authenticated student's submission for a lab.

**Response `200`:**
```json
{
  "submission": { ...SubmissionShape }
}
```

Returns `404` if no submission exists yet (student hasn't started).

---

#### `GET /labs/:labId/submissions/:submissionId` *(Instructor, or submission owner)*

**Response `200`:**
```json
{
  "submission": { ...SubmissionShape }
}
```

---

#### `POST /labs/:labId/submissions` *(Student only)*
Create or update a draft submission (saves progress). Also handles initial "start lab" action.

**Request body:**
```json
{
  "language": "Python",
  "code": "def solution():\n    return []",
  "files": {
    "main.py": "def solution():\n    return []",
    "utils.py": "# helpers"
  },
  "status": "in_progress"
}
```

**Response `200`/`201`:**
```json
{
  "submission": { ...SubmissionShape }
}
```

---

#### `POST /labs/:labId/submissions/submit` *(Student only)*
Finalize and submit the lab. Triggers automated test execution.

**Request body:**
```json
{
  "language": "Python",
  "code": "def solution():\n    return []",
  "files": {
    "main.py": "def solution():\n    return []"
  }
}
```

**Response `200`:**
```json
{
  "submission": {
    ...SubmissionShape,
    "status": "submitted",
    "submittedAt": "2026-04-27T12:00:00Z",
    "late": false,
    "testResults": [ ...TestResult[] ]
  }
}
```

---

#### `POST /labs/:labId/submissions/run` *(Student only)*
Run tests against current code WITHOUT submitting. Returns test results only.

**Request body:**
```json
{
  "language": "Python",
  "code": "def solution():\n    pass",
  "files": {
    "main.py": "def solution():\n    pass"
  }
}
```

**Response `200`:**
```json
{
  "testResults": [
    {
      "testCaseId": "uuid",
      "description": "Test empty input",
      "status": "pass",
      "points": 10,
      "earned": 10
    }
  ],
  "passed": 2,
  "total": 5,
  "executionTimeMs": 340
}
```

**Security:** Execute code inside a Docker container with strict resource limits:
- CPU: 0.5 cores max
- Memory: 128 MB max
- Timeout: 10 seconds
- No network access inside container
- No filesystem writes outside `/tmp`

---

#### `PATCH /labs/:labId/submissions/:submissionId/grade` *(Instructor only)*
Grade or update the grade of a submission.

**Request body:**
```json
{
  "score": 85,
  "instructorNote": "Good work, but the tree traversal could be more efficient."
}
```

**Response `200`:**
```json
{
  "submission": { ...SubmissionShape, "status": "graded", "gradedAt": "..." }
}
```

---

#### `POST /labs/:labId/submissions/bulk-grade` *(Instructor only)*
Bulk grade multiple submissions.

**Request body:**
```json
{
  "grades": [
    { "submissionId": "uuid1", "score": 80, "instructorNote": "Well done" },
    { "submissionId": "uuid2", "score": 60, "instructorNote": "Needs work" }
  ]
}
```

**Response `200`:**
```json
{
  "updated": 2,
  "failed": []
}
```

---

### 6.5 Test Case Endpoints

#### `GET /labs/:labId/test-cases` *(Instructor only — full version)*

Returns all test cases including hidden expectedInput/expectedOutput.

**Response `200`:**
```json
{
  "testCases": [ ...TestCaseFullShape[] ]
}
```

---

#### `POST /labs/:labId/test-cases` *(Instructor only)*

**Request body:**
```json
{
  "name": "Test empty input",
  "description": "Should handle empty input gracefully",
  "type": "visible",
  "expectedInput": "",
  "expectedOutput": "[]",
  "points": 10,
  "order": 1
}
```

**Response `201`:**
```json
{
  "testCase": { ...TestCaseShape }
}
```

---

#### `PATCH /labs/:labId/test-cases/:testCaseId` *(Instructor only)*

**Request body (all fields optional):**
```json
{
  "name": "Updated test name",
  "points": 15,
  "type": "hidden"
}
```

**Response `200`:**
```json
{
  "testCase": { ...TestCaseShape }
}
```

---

#### `DELETE /labs/:labId/test-cases/:testCaseId` *(Instructor only)*

**Response `200`:**
```json
{
  "message": "Test case deleted"
}
```

---

#### `PATCH /labs/:labId/test-cases/reorder` *(Instructor only)*

**Request body:**
```json
{
  "order": ["uuid3", "uuid1", "uuid2"]
}
```

**Response `200`:**
```json
{
  "testCases": [ ...TestCaseShape[] ]
}
```

---

### 6.6 Version History Endpoints

#### `GET /labs/:labId/versions` *(Student — own versions only)*

**Response `200`:**
```json
{
  "versions": [
    {
      "id": "uuid",
      "labId": "uuid",
      "studentId": "uuid",
      "description": "Fixed null pointer issue",
      "testsPassed": 3,
      "testsTotal": 5,
      "createdAt": "2026-04-20T10:00:00Z"
    }
  ],
  "total": 12
}
```

Note: File contents are NOT included in list response for performance. Use GET by ID.

---

#### `GET /labs/:labId/versions/:versionId` *(Student — own version only)*

**Response `200`:**
```json
{
  "version": {
    "id": "uuid",
    "labId": "uuid",
    "studentId": "uuid",
    "description": "Fixed null pointer issue",
    "files": {
      "main.py": "class Node:\n    ..."
    },
    "testsPassed": 3,
    "testsTotal": 5,
    "createdAt": "2026-04-20T10:00:00Z"
  }
}
```

---

#### `POST /labs/:labId/versions` *(Student only)*
Save a new version snapshot.

**Request body:**
```json
{
  "description": "Fixed null pointer issue",
  "files": {
    "main.py": "class Node:\n    ...",
    "utils.py": "# helpers"
  },
  "testsPassed": 3,
  "testsTotal": 5
}
```

**Response `201`:**
```json
{
  "version": { ...VersionShape }
}
```

**Error `400`:** If student already has 50 versions for this lab.

---

#### `DELETE /labs/:labId/versions/:versionId` *(Student — own version only)*

**Response `200`:**
```json
{
  "message": "Version deleted"
}
```

---

### 6.7 Peer Review Endpoints

#### `GET /peer-reviews` *(Student only)*
Get all peer reviews involving the authenticated student (both as owner and as reviewer).

**Response `200`:**
```json
{
  "assigned": [
    {
      "id": "uuid",
      "labId": "uuid",
      "labTitle": "Binary Trees",
      "ownerName": "Khalid Al-Rashidi",
      "sharedAt": "2026-04-25T10:00:00Z",
      "dueDate": "2026-04-27T23:59:00Z",
      "status": "pending"
    }
  ],
  "received": [
    {
      "id": "uuid",
      "labId": "uuid",
      "labTitle": "Binary Trees",
      "reviewerEmail": "s201234568@kfupm.edu.sa",
      "status": "completed",
      "review": { ...ReviewShape }
    }
  ]
}
```

---

#### `GET /peer-reviews/:reviewId` *(Review owner or reviewer)*
Get the full peer review including file contents.

**Response `200`:**
```json
{
  "review": { ...PeerReviewShape }
}
```

---

#### `POST /peer-reviews` *(Student only)*
Share code for peer review (send invite).

**Request body:**
```json
{
  "labId": "uuid",
  "reviewerEmail": "s201234568@kfupm.edu.sa",
  "files": ["main.py", "utils.py"],
  "fileContents": {
    "main.py": "class Node:\n    ...",
    "utils.py": "# helpers"
  },
  "testsPassed": "3/5",
  "dueDate": "2026-04-30T23:59:00Z"
}
```

**Business rules:**
- `reviewerEmail` must be `@kfupm.edu.sa`
- Cannot review own code
- Trigger email notification to reviewer

**Response `201`:**
```json
{
  "peerReview": { ...PeerReviewShape }
}
```

---

#### `POST /peer-reviews/:reviewId/submit` *(Reviewer only)*
Submit a peer review.

**Request body:**
```json
{
  "readability": 4,
  "efficiency": 3,
  "comments": 5,
  "strengths": "Clean variable naming and good use of recursion.",
  "improvements": "The edge case for empty trees is not handled.",
  "overallComment": "Overall solid implementation with minor gaps.",
  "lineComments": {
    "main.py:12": "This condition could use a comment",
    "main.py:25": "Consider using a deque here for O(1) pops"
  }
}
```

**Validation:**
- `readability`, `efficiency`, `comments`: integer 1-5
- `strengths`, `improvements`, `overallComment`: min 10 chars each
- `lineComments`: optional, keys are `"filename:lineNumber"`

**Response `200`:**
```json
{
  "peerReview": { ...PeerReviewShape, "status": "completed" }
}
```

---

### 6.8 Grades Endpoints

#### `GET /grades` *(Student only)*
Get all grades for the authenticated student, optionally filtered by course.

**Query params:**
```
?courseCode=ICS202
```

**Response `200`:**
```json
{
  "summary": {
    "overallGrade": "B+",
    "averageScore": 82.4,
    "bestScore": 98,
    "totalLabs": 10,
    "gradedLabs": 7,
    "trend": [
      { "labNumber": 1, "score": 75 },
      { "labNumber": 2, "score": 80 }
    ]
  },
  "grades": [
    {
      "labId": "uuid",
      "labNumber": 9,
      "labTitle": "Binary Trees",
      "courseCode": "ICS 202",
      "score": 85,
      "maxScore": 100,
      "testsPassed": 4,
      "testsTotal": 5,
      "status": "graded",
      "late": false,
      "submittedAt": "2026-04-25T10:00:00Z",
      "gradedAt": "2026-04-26T08:00:00Z",
      "instructorNote": "Good work overall."
    }
  ]
}
```

---

### 6.9 Reference Solutions Endpoints

#### `GET /labs/:labId/solutions` *(Student — after unlock, Instructor — always)*

**Response `200`:**
```json
{
  "solutions": [
    {
      "id": "uuid",
      "labId": "uuid",
      "type": "instructor",
      "title": "Instructor Solution",
      "language": "Python",
      "files": {
        "main.py": "class Node:\n    def __init__(self, val):\n        self.val = val"
      },
      "explanation": "We use inorder traversal...",
      "unlockedAt": "2026-05-02T23:59:00Z"
    }
  ],
  "studentSolution": {
    "files": { ... },
    "submittedAt": "..."
  }
}
```

**Access rule:** If `solution.unlockedAt > now`, return `403 Forbidden` for students.

---

#### `POST /labs/:labId/solutions` *(Instructor only)*
Add a reference solution.

**Request body:**
```json
{
  "type": "instructor",
  "title": "Instructor Solution",
  "language": "Python",
  "files": {
    "main.py": "class Node:\n    ..."
  },
  "explanation": "This approach uses...",
  "unlockedAt": "2026-05-02T23:59:00Z"
}
```

**Response `201`:**
```json
{
  "solution": { ...SolutionShape }
}
```

---

#### `DELETE /labs/:labId/solutions/:solutionId` *(Instructor only)*

**Response `200`:**
```json
{
  "message": "Solution deleted"
}
```

---

### 6.10 Course Endpoints

#### `GET /courses` *(Admin only)*
List all courses.

**Query params:**
```
?department=ComputerScience
&search=ICS
&page=1
&limit=20
```

**Response `200`:**
```json
{
  "courses": [ ...CourseShape[] ],
  "total": 30
}
```

---

#### `GET /courses/:id`

**Response `200`:**
```json
{
  "course": { ...CourseShape }
}
```

---

#### `POST /courses` *(Admin only)*

**Request body:**
```json
{
  "courseCode": "ICS 202",
  "name": "Data Structures",
  "department": "Computer Science",
  "creditHours": 3
}
```

**Response `201`:**
```json
{
  "course": { ...CourseShape }
}
```

---

#### `PATCH /courses/:id` *(Admin only)*

**Response `200`:**
```json
{
  "course": { ...CourseShape }
}
```

---

#### `DELETE /courses/:id` *(Admin only)*

**Response `200`:**
```json
{
  "message": "Course deleted"
}
```

---

#### `POST /courses/:id/sections/:sectionId/enroll` *(Admin only)*
Enroll a student in a course section.

**Request body:**
```json
{
  "studentId": "uuid"
}
```

**Response `200`:**
```json
{
  "message": "Student enrolled successfully"
}
```

---

#### `DELETE /courses/:id/sections/:sectionId/enroll/:studentId` *(Admin only)*
Unenroll a student.

**Response `200`:**
```json
{
  "message": "Student unenrolled"
}
```

---

### 6.11 Analytics Endpoints

#### `GET /analytics/instructor` *(Instructor only)*
Lab-level analytics for the authenticated instructor.

**Query params:**
```
?labId=uuid          (optional — filter to one lab)
&courseCode=ICS202
```

**Response `200`:**
```json
{
  "labs": [
    {
      "labId": "uuid",
      "labTitle": "Binary Trees",
      "totalStudents": 30,
      "submitted": 25,
      "graded": 20,
      "averageScore": 76.4,
      "passRate": 0.72,
      "completionRate": 0.83,
      "scoreDistribution": {
        "0-20": 1,
        "21-40": 2,
        "41-60": 4,
        "61-80": 10,
        "81-100": 8
      }
    }
  ]
}
```

---

#### `GET /analytics/admin` *(Admin only)*
System-wide analytics.

**Response `200`:**
```json
{
  "totalUsers": 1250,
  "activeUsers": 1100,
  "usersByRole": {
    "student": 1200,
    "instructor": 45,
    "admin": 5
  },
  "totalLabs": 120,
  "totalSubmissions": 8500,
  "submissionsByStatus": {
    "graded": 6000,
    "submitted": 1200,
    "in_progress": 800,
    "not_started": 500
  },
  "systemLoad": {
    "cpu": 0.34,
    "memory": 0.61,
    "storage": 0.42
  }
}
```

---

#### `GET /analytics/plagiarism/:labId` *(Instructor only)*
Run or fetch plagiarism detection results for a lab.

**Response `200`:**
```json
{
  "labId": "uuid",
  "analyzedAt": "2026-04-27T10:00:00Z",
  "results": [
    {
      "studentA": { "id": "uuid", "name": "Ahmed", "email": "..." },
      "studentB": { "id": "uuid", "name": "Khalid", "email": "..." },
      "similarityScore": 0.87,
      "matchedBlocks": [
        {
          "startLineA": 12,
          "endLineA": 25,
          "startLineB": 8,
          "endLineB": 21
        }
      ]
    }
  ]
}
```

---

### 6.12 Admin Endpoints

#### `GET /admin/system/monitor`
System health metrics.

**Response `200`:**
```json
{
  "status": "healthy",
  "uptime": 864000,
  "cpu": { "usage": 0.34, "cores": 8 },
  "memory": { "used": 6144, "total": 16384, "unit": "MB" },
  "storage": { "used": 512, "total": 2048, "unit": "GB" },
  "activeConnections": 84,
  "requestsPerMinute": 340,
  "errorRate": 0.002
}
```

---

#### `GET /admin/settings`
Get system settings.

**Response `200`:**
```json
{
  "settings": {
    "maxVersionsPerLab": 50,
    "codeExecutionTimeoutSeconds": 10,
    "peerReviewDefaultDueDays": 7,
    "solutionUnlockDaysAfterDeadline": 2,
    "maintenanceMode": false,
    "allowedEmailDomain": "kfupm.edu.sa"
  }
}
```

---

#### `PATCH /admin/settings`
Update system settings.

**Request body:** any subset of the settings object above.

**Response `200`:**
```json
{
  "settings": { ...updated settings }
}
```

---

#### `GET /admin/departments`
List all departments.

**Response `200`:**
```json
{
  "departments": [
    {
      "id": "uuid",
      "name": "Computer Science",
      "courseCount": 24,
      "instructorCount": 12
    }
  ]
}
```

---

#### `POST /admin/backup`
Trigger a database backup.

**Response `202`:**
```json
{
  "backupId": "uuid",
  "status": "in_progress",
  "startedAt": "2026-04-27T12:00:00Z"
}
```

---

#### `GET /admin/backup`
List available backups.

**Response `200`:**
```json
{
  "backups": [
    {
      "id": "uuid",
      "createdAt": "2026-04-27T12:00:00Z",
      "sizeBytes": 524288000,
      "status": "completed"
    }
  ]
}
```

---

#### `POST /admin/backup/:backupId/restore`
Restore from a backup. **Highly destructive — require confirmation field.**

**Request body:**
```json
{
  "confirm": "RESTORE"
}
```

**Response `202`:**
```json
{
  "message": "Restore initiated",
  "estimatedMinutes": 5
}
```

---

#### `GET /admin/security`
Security/access log.

**Response `200`:**
```json
{
  "recentLogins": [
    {
      "userId": "uuid",
      "email": "...",
      "role": "student",
      "ip": "10.0.0.1",
      "loginAt": "2026-04-27T10:00:00Z",
      "success": true
    }
  ],
  "failedLoginAttempts": 12,
  "blockedIps": []
}
```

---

## 7. Validation Rules

### Email
```regex
/^[^\s@]+@kfupm\.edu\.sa$/
```

### Password
```
min length: 8
must contain: [A-Z], [a-z], [0-9]
```

### Lab (on publish — status change to "active")
```
title.length >= 5
dueDate >= now + 24 hours
points: 1–200 (integer)
languages.length >= 1
testCases.length >= 3
```

### File Upload
```
max total size: 50 MB
```

### Grading
```
score: 0 to lab.points (integer)
```

### Peer Review Ratings
```
readability, efficiency, comments: integer 1–5
strengths, improvements, overallComment: min 10 chars
```

### Version Snapshots
```
max 50 versions per student per lab
```

### Peer Review
```
reviewerEmail must be @kfupm.edu.sa
reviewer cannot be same as code owner
```

---

## 8. Business Logic

### Lab Status Machine
```
draft → active   (publish — validates all requirements)
active → closed  (instructor closes or deadline passes)
closed → active  (re-open, only if no submissions yet, or with warning)
draft  → deleted (soft delete allowed from draft)
```

### Submission Lateness
```
late = submission.submittedAt > lab.dueDate
```
Flag on submit. Do not prevent late submission — instructors handle grading policy.

### Score Calculation (Automated)
```
score = sum(testResult.earned for testResult in testResults)
```
Instructor can override the final `score` field at any time.

### Reference Solution Unlock
```
unlockedAt = lab.dueDate + 2 days   (configurable in admin settings)
```
Students can only view solutions where `unlockedAt <= now`.

### Version Limit
```
if versions.count >= 50: return 400 "Maximum version limit reached"
```

### Peer Review Sharing Rules
1. Student must have an active submission (at least `in_progress`) to share
2. Reviewer email must be @kfupm.edu.sa
3. Reviewer cannot be the code owner
4. Trigger email to reviewer when review is created
5. Review is linked to reviewer's User account when they log in

### Auto-refresh for Instructor Submissions Page
The frontend polls `GET /labs/:labId/submissions` every 30 seconds when auto-refresh is enabled. The backend does not need to do anything special — this is client-controlled polling.

### Dashboard Data (Student)
The student dashboard needs:
- Labs with `dueDate` within 72 hours of now and `status: "active"` → shown as "upcoming" (max 3)
- Enrolled courses with completion percentage (graded/total labs)
- Average score across all graded submissions
- Recent activity feed (last 5-10 submission events)

---

## 9. File Upload Specification

### Starter & Supporting Files
Files are uploaded as multipart form data when creating/editing a lab.

#### `POST /labs/:labId/files`
**Content-Type:** `multipart/form-data`

**Form fields:**
```
type: "starter" | "supporting"
files: <binary>[]
```

**Response `201`:**
```json
{
  "files": [
    {
      "name": "main.py",
      "size": 1024,
      "fileType": "text/x-python",
      "url": "https://storage.labtrack.../main.py"
    }
  ]
}
```

#### `DELETE /labs/:labId/files/:filename`
Remove an uploaded file.

**Response `200`:**
```json
{
  "message": "File removed"
}
```

---

## 10. Frontend Routes Reference

| Frontend Route | Page | Primary Data Needed |
|----------------|------|---------------------|
| `/` | LoginPage | `POST /auth/login` |
| `/dashboard` | DashboardPage | `GET /labs`, `GET /grades`, enrolled courses |
| `/labs` | LabsPage | `GET /labs` |
| `/labs/:labId` | LabWorkspacePage | `GET /labs/:id`, `GET /labs/:labId/submissions/me`, `GET /labs/:labId/versions` |
| `/history` | HistoryPage | `GET /labs` (submitted labs) |
| `/history/:labId` | HistoryLabPage | `GET /labs/:labId/versions` |
| `/peer-review` | PeerReviewsPage | `GET /peer-reviews` |
| `/peer-reviews/assigned/:reviewId` | AssignedReviewPage | `GET /peer-reviews/:reviewId` |
| `/peer-reviews/received/:reviewId` | ReceivedReviewPage | `GET /peer-reviews/:reviewId` |
| `/grades` | GradesPage | `GET /grades` |
| `/solutions` | ReferenceSolutionsPage | `GET /labs`, `GET /labs/:labId/solutions` |
| `/instructor/labs` | LabsManagementPage | `GET /labs` |
| `/instructor/labs/create` | CreateLabPage | `POST /labs` |
| `/instructor/labs/:labId/edit` | CreateLabPage | `GET /labs/:id`, `PATCH /labs/:id` |
| `/instructor/labs/:labId/submissions` | SubmissionsPage | `GET /labs/:labId/submissions` |
| `/instructor/labs/:labId/submissions/:subId/grade` | GradingPage | `GET /labs/:labId/submissions/:subId`, `PATCH .../grade` |
| `/instructor/analytics` | AnalyticsPage | `GET /analytics/instructor` |
| `/instructor/labs/:labId/plagiarism` | PlagiarismPage | `GET /analytics/plagiarism/:labId` |
| `/admin/users` | UserManagementPage | `GET /users` |
| `/admin/courses` | CourseManagementPage | `GET /courses` |
| `/admin/departments` | DepartmentSettingsPage | `GET /admin/departments` |
| `/admin/settings` | SystemSettingsPage | `GET /admin/settings`, `PATCH /admin/settings` |
| `/admin/monitor` | SystemMonitorPage | `GET /admin/system/monitor` |
| `/admin/analytics` | AnalyticsDashboardPage | `GET /analytics/admin` |
| `/admin/security` | SecurityAccessPage | `GET /admin/security` |
| `/admin/backup` | BackupRecoveryPage | `GET /admin/backup`, `POST /admin/backup` |

---

## 11. Environment Variables

### Frontend (add to `.env`)
```env
VITE_API_BASE_URL=https://api.labtrack.kfupm.edu.sa/v1
VITE_WS_URL=wss://api.labtrack.kfupm.edu.sa/ws       # Optional WebSocket
```

### Backend
```env
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/labtrack

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<random-256-bit-secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# File Storage
STORAGE_TYPE=s3                    # or "local"
AWS_BUCKET_NAME=labtrack-files
AWS_REGION=me-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Email
SMTP_HOST=smtp.kfupm.edu.sa
SMTP_PORT=587
SMTP_USER=labtrack@kfupm.edu.sa
SMTP_PASS=...

# Code Execution
DOCKER_HOST=unix:///var/run/docker.sock
CODE_EXEC_TIMEOUT_MS=10000
CODE_EXEC_MEMORY_MB=128

# Allowed domain
ALLOWED_EMAIL_DOMAIN=kfupm.edu.sa
```

---

## 12. Security Requirements

### Passwords
- Hash with **bcrypt** (cost factor 12+) or **Argon2id**
- Never store or log plaintext passwords
- Never return password hash in API responses

### JWT
- Sign with RS256 (asymmetric) or HS256 with a strong secret
- Include: `{ sub: userId, role, iat, exp }`
- Validate on every protected request
- Maintain a token blocklist (Redis) for logout/revocation

### Code Execution Sandbox
- Run ALL student code inside Docker containers
- Enforce: CPU ≤ 0.5 cores, Memory ≤ 128 MB, Timeout ≤ 10s
- No network access inside the container
- Mount a read-only `/code` directory; only `/tmp` writable
- Kill container forcefully after timeout

### CORS
```
Allowed origins: https://labtrack.kfupm.edu.sa
Methods: GET, POST, PATCH, DELETE, OPTIONS
Headers: Content-Type, Authorization
Credentials: true (for cookie-based refresh tokens)
```

### Rate Limiting
| Endpoint | Limit |
|----------|-------|
| `POST /auth/login` | 5 requests / 15 min / IP |
| `POST /auth/register` | 3 requests / hour / IP |
| `POST /labs/:labId/submissions/run` | 30 requests / min / user |
| All other endpoints | 200 requests / min / user |

### Input Sanitization
- Sanitize all markdown fields (description, notes) before storage to prevent XSS when rendered
- Parameterize all database queries — no string concatenation in SQL
- Validate all uploaded file types (reject executables)

### Audit Logging
Log to a tamper-evident store:
- All login attempts (success/failure + IP)
- All grade changes (who changed what, old value, new value)
- All admin actions (user changes, settings changes, backups)

---

*Generated from full scan of `labtrack-frontend` source on 2026-04-27.*
