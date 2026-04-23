# Fusion Learning — Full LMS Platform
### Auth · Dashboard · Courses · Students · AI Generate · Publish

> **Platform AI · Fusion · ABA Technology**
> Developed by **Meryem Ghanem** & **Hafida Belayd**

A modern, fully-featured Single Page Application serving as a shell for an E-Learning platform. It integrates a complete authentication system, role-aware dashboards, course management, student tracking, and an AI-powered course generation and publishing pipeline — all wired together through a lightweight Node.js proxy gateway.

---

## ✨ Features

- **Authentication System** — Login, signup, and logout with session persistence via `localStorage`. Includes password visibility toggle, email validation, and role-based post-login routing.
- **Role-Based Views** — Dynamic UI rendered based on user role (`student` vs `teacher`), fetched from `users_profile` via Supabase on every login.
- **Teacher Dashboard** — Live KPI cards (total courses, students, active enrollments, completion rate, AI-generated courses, published courses) backed by real-time Supabase queries. Includes bar charts for enrollments by month and courses by category.
- **Course Management** — Full courses table with status, category, level, and source filters. Includes a **Course Detail Modal** with collapsible accordion modules and nested lessons fetched from `course_modules` and `lessons` tables.
- **Student Management** — Paginated student list with status and enrollment metadata pulled directly from Supabase.
- **AI Course Generation (Fusion AI)** — Teachers fill a form (topic, audience, level, objectives) which triggers a Fusion AI workflow via `/generate-course`. The generated curriculum is reviewed in an interactive preview modal before being saved to the database via `/publish-course`.
- **Light/Dark Theme** — Automatic via `prefers-color-scheme` CSS media query with a full set of CSS custom properties.
- **Proxy Gateway (`proxy.js`)** — A custom Node.js server that handles CORS, routes `/direct-*` calls straight to Supabase REST, and forwards AI/auth calls to Fusion Webhooks with a 120-second timeout.

---

## 🏗 Architecture Overview

```
┌────────────────────────────────────────────┐
│           auth-page.html (SPA)             │
│  Auth · Dashboard · Courses · Students     │
│  Generate · Publish · Charts · Modals      │
└──────────────────┬─────────────────────────┘
                   │ HTTP (localhost:8787)
┌──────────────────▼─────────────────────────┐
│              proxy.js (Node.js)            │
│  /direct-* ──► Supabase REST API           │
│  /auth, /generate-course, etc. ──► Fusion  │
└──────────┬────────────────────┬────────────┘
           │                    │
┌──────────▼────────┐  ┌────────▼──────────────┐
│  Supabase DB       │  │  Fusion AI Webhooks    │
│  courses           │  │  /auth                 │
│  course_modules    │  │  /dashboard-summary    │
│  lessons           │  │  /courses              │
│  students          │  │  /students             │
│  enrollments       │  │  /generate-course      │
│  users_profile     │  │  /publish-course       │
└────────────────────┘  └───────────────────────┘
```

---

## 📁 File Reference

| File | Purpose |
|---|---|
| `auth-page.html` | Core SPA — all UI markup, CSS variables, and frontend JavaScript (33 functions, ~65KB) |
| `proxy.js` | Lightweight proxy server — Supabase direct routes + Fusion webhook forwarding |
| `supabase_elearning_schema.sql` | Foundational DB tables: `courses`, `course_modules`, `lessons`, `enrollments` |
| `supabase_roles_setup.sql` | `public.roles` mappings and `users_profile` view |

---

## 🔄 Fusion Workflow — Node Map

The exported workflow (`LMS - Full Platform`) contains **86 nodes** across **6 independent webhook-triggered pipelines**. Each trigger ID maps to a proxy route:

| Route | Trigger ID | Nodes | Pipeline Contents |
|---|---|---|---|
| `/auth` | `b75f6bc3` | 21 | Trigger → 15 actions → 2 utilities → 3 display nodes |
| `/dashboard-summary` | `93eef455` | 10 | Trigger → 7 actions → 2 display nodes |
| `/courses` | `57fd7078` | 18 | Trigger → 12 actions → 4 utilities → 1 display node |
| `/students` | `c1be214c` | 12 | Trigger → 8 actions → 2 utilities → 1 display node |
| `/generate-course` | `e5641837` | 13 | Trigger → 9 actions → 1 **AI agent** → 2 display nodes |
| `/publish-course` | `2d2909ed` | 11 | Trigger → 9 actions → 1 display node |

> **Note:** The `/generate-course` pipeline is the only one containing an `agent` + `agent-llm` node pair, which handles the structured AI course generation step.

**Node type breakdown across the full workflow:**

| Type | Count |
|---|---|
| `action` | 60 |
| `utility` | 8 |
| `display` | 10 |
| `trigger` | 6 |
| `agent` | 1 |
| `agent-llm` | 1 |
| **Total** | **86** |

---

## 🖥 Frontend — JavaScript Functions

The SPA exposes 33 functions organized by concern:

**Auth & Session**
`fetchUserProfile` · `handleLogin` · `handleLoginDirect` · `handleSignup` · `handleLogout` · `isAuthAccepted` · `backToLogin` · `showSignupSuccessPage`

**UI Helpers**
`switchTab` · `togglePw` · `showAlert` · `hideAlert` · `setLoading` · `showAppShell` · `hideAppShell` · `escapeHtml` · `isValidEmail` · `postJSON`

**Dashboard & Data**
`loadDashboard` · `buildFallbackDashboardData` · `loadCourses` · `loadStudents`

**Rendering**
`renderCoursesTable` · `renderStudentsTable` · `renderEnrollmentsChart` · `renderCoursesChart` · `renderSimpleBars`

**Course Detail**
`openCourseDetail` · `closeCourseDetail` · `toggleModule`

**AI Generation**
`openGenerateCourseModal` · `closeGenerateCourseModal` · `generateCourse` · `publishGeneratedCourse`

---

## 🛠 Running Locally

### Prerequisites
- Node.js ≥ 18
- Python 3 (for serving the frontend)

### 1. Start the Proxy Server
```bash
node proxy.js
# Proxy running at http://localhost:8787
```

### 2. Serve the Frontend
```bash
python3 -m http.server 8080
```

### 3. Open the App
```
http://localhost:8080/auth-page.html
```

### Environment Variable Overrides
Each Fusion webhook URL can be overridden without editing `proxy.js`:

```bash
export FUSION_WEBHOOK_AUTH="https://your-domain/webhooks/.../auth"
export FUSION_WEBHOOK_DASHBOARD="https://your-domain/webhooks/.../dashboard-summary"
export FUSION_WEBHOOK_COURSES="https://your-domain/webhooks/.../courses"
export FUSION_WEBHOOK_STUDENTS="https://your-domain/webhooks/.../students"
export FUSION_WEBHOOK_GENERATE="https://your-domain/webhooks/.../generate-course"
export FUSION_WEBHOOK_PUBLISH="https://your-domain/webhooks/.../publish-course"
```

---

## 📡 API Endpoint Reference

### Direct Supabase Routes (no Fusion needed)

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/direct-dashboard` | KPI metrics, chart data, recent courses & students |
| `GET/POST` | `/direct-courses` | Full course list |
| `GET/POST` | `/direct-students` | Full student list |
| `GET` | `/direct-course-detail?id=<id>` | Course curriculum with modules and lessons |
| `GET` | `/direct-user?email=<email>` | Fetch user profile and role from `users_profile` |
| `POST` | `/direct-log-login` | Log a successful login event to `auth_logs` |

### Fusion Webhook Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth` | Login, signup, and logout via Fusion |
| `POST` | `/dashboard-summary` | Dashboard data via Fusion pipeline |
| `POST` | `/courses` | Course list via Fusion pipeline |
| `POST` | `/students` | Student list via Fusion pipeline |
| `POST` | `/generate-course` | Triggers AI agent to generate a full course curriculum |
| `POST` | `/publish-course` | Persists a generated course into the database |

---

## 🗄 Database Setup (Supabase)

Run the following SQL scripts in your Supabase SQL Editor in order:

1. **`supabase_roles_setup.sql`** — Creates `public.roles`, `users_profile` view, and role-assignment helpers.
2. **`supabase_elearning_schema.sql`** — Creates the core tables: `courses`, `course_modules`, `lessons`, `students`, `enrollments`, `auth_logs`.

**Tables used by the application:**

| Table | Used By |
|---|---|
| `users_profile` | Auth — role lookup on login |
| `auth_logs` | Auth — login event recording |
| `courses` | Dashboard, Courses, Course Detail |
| `course_modules` | Course Detail modal |
| `lessons` | Course Detail modal (nested in modules) |
| `students` | Students page |
| `enrollments` | Dashboard KPIs and charts |

---

## 🎨 Design System

The UI uses a CSS custom property system with full dark/light mode support:

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0b1020` | `#f4f7ff` |
| `--surface` | `#131c33` | `#ffffff` |
| `--accent` | `#4f8ef7` | `#3a78f5` |
| `--accent-2` | `#6b7cff` | `#5f64f5` |
| `--text` | `#edf2ff` | `#111a2f` |
| `--success` | `#4fdc9a` | *(same)* |
| `--error` | `#f76f6f` | *(same)* |

