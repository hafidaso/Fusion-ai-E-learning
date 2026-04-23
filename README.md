# Fusion Learning Auth + LMS Shell

> **Platform AI · Fusion · ABA Technology**  
> Developed by **Meryem Ghanem** & **Hafida Belayd**

A modern, fully-featured Web Application interface that serves as a shell for an E-Learning platform. This platform elegantly integrates Authentication, a responsive Student/Teacher Dashboard, and AI-powered Course Generation workflows.

## 🚀 Features

- **Authentication System:** Complete login, signup, and logout functionality with local session state persistence.
- **Role Management:** Dynamic views based on user roles (`student` vs `teacher`).
- **Student & Teacher Dashboards:** 
  - Dynamic KPI cards and statistical charts (e.g., Learning Activity).
  - Modern HTML/CSS layout resembling premium SaaS platforms.
  - Data populated from a centralized database.
- **AI Course Generation (Fusion AI):** 
  - Teachers can generate entire courses using AI by specifying topics, target audiences, and levels.
  - AI-generated content can be reviewed in a stunning, interactive Accordion popup before publishing.
- **Proxy Gateway (`proxy.js`):** A custom Node.js server that acts as a secure middleware connecting the frontend directly to **Supabase** and **Fusion Workflows**.

## 🏗 Project Architecture

- `auth-page.html`: The core Single Page Application containing all UI markup, CSS variables, and frontend Javascript logic.
- `proxy.js`: A lightweight proxy server that handles CORS headers, routes API calls directly to Supabase (`/direct-*`), and forwards requests to Fusion Webhooks.
- `supabase_elearning_schema.sql` / `supabase_roles_setup.sql`: Database schemas and table structures for Supabase to support courses, modules, lessons, and users.

## 🛠 Running the Application Locally

1. **Start the Proxy Server:**
   From the project directory, launch the Node.js proxy to enable communication between the frontend and the backend.
   ```bash
   node proxy.js
   ```

2. **Serve the Frontend Application:**
   In a separate terminal, start a local HTTP server to serve the frontend interface.
   ```bash
   python3 -m http.server 8080
   ```

3. **Access the Platform:**
   Open your browser and navigate to: [http://localhost:8080/auth-page.html](http://localhost:8080/auth-page.html)

## 📡 API Endpoints & Webhooks

The frontend utilizes the following endpoints via the proxy gateway:

**Authentication & Roles:**
- `POST /auth` (Login, Signup, Logout)

**Dashboard & Data Views:**
- `POST /direct-dashboard` (Dashboard KPI metrics and recent activity)
- `POST /direct-courses` (Retrieves full list of generated and published courses)
- `POST /direct-students` (Retrieves list of active students)
- `GET /direct-course-detail?id=<id>` (Retrieves deep course curriculum and modules)

**AI Integrations:**
- `POST /generate-course` (Calls Fusion AI webhook to structurally generate a course)
- `POST /publish-course` (Saves an AI-generated course into the permanent database)

## 🗄️ Database Setup (Supabase)

To enable data persistence, run the following SQL scripts in your Supabase SQL Editor:
1. Ensure your core authentication tables match `supabase_roles_setup.sql` to manage `public.roles` mappings.
2. Execute `supabase_elearning_schema.sql` to generate the foundational tables (`courses`, `course_modules`, `lessons`, `enrollments`, etc).

---
*Built with ❤️ for ABA Technology*
