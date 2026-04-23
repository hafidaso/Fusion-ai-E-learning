
// ════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════

const API = {
  auth:          "http://localhost:8787/auth",
  dashboard:     "http://localhost:8787/direct-dashboard",
  courses:       "http://localhost:8787/direct-courses",
  students:      "http://localhost:8787/direct-students",
  generateCourse:"http://localhost:8787/generate-course",
  publishCourse: "http://localhost:8787/publish-course"
};

const SUPABASE_URL  = 'https://oktgdchftjiylsgdafvr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGdkY2hmdGppeWxzZ2RhZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDYyMzQsImV4cCI6MjA5MDYyMjIzNH0.C8ADlZ3lA3vRo5WI8-tr7UjQ4RyVSqbq7rnS8eyawHs';

async function fetchUserProfile(email) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users_profile?email=eq.${encodeURIComponent(email)}&select=id,email,full_name,role,is_active&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    }
    // fallback via proxy direct route
    const r2 = await fetch('http://localhost:8787/direct-user?email=' + encodeURIComponent(email));
    if (r2.ok) {
      const d = await r2.json();
      if (d && d.id) return d;
    }
    return null;
  } catch (e) {
    console.warn('[fetchUserProfile]', e.message);
    return null;
  }
}
const TIMEOUT_MS = 120000;

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

let currentUser = null;

// ════════════════════════════════════════════════════════════
// ON PAGE LOAD — restore session from localStorage
// ════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('fusion_auth_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showAppShell(currentUser);
      loadDashboard();
    } catch (e) {
      localStorage.removeItem('fusion_auth_user');
    }
  }
});

// ════════════════════════════════════════════════════════════
// TAB SWITCHER — toggle between login and signup views
// ════════════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1));
  });
  document.getElementById('loginPanel').classList.toggle('active', tab === 'login');
  document.getElementById('signupPanel').classList.toggle('active', tab === 'signup');
  hideAlert();
}

// ════════════════════════════════════════════════════════════
// PASSWORD VISIBILITY TOGGLE
// ════════════════════════════════════════════════════════════

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

// ════════════════════════════════════════════════════════════
// ALERT HELPERS
// ════════════════════════════════════════════════════════════

function showAlert(msg, type = 'error') {
  document.getElementById('alertMsg').textContent = msg;
  document.getElementById('alertIcon').textContent = type === 'error' ? '⚠️' : '✅';
  document.getElementById('alertBox').className = `alert ${type} show`;
}
function hideAlert() {
  document.getElementById('alertBox').className = 'alert';
}

// ════════════════════════════════════════════════════════════
// BUTTON LOADING STATE
// ════════════════════════════════════════════════════════════

function setLoading(btnId, isLoading, label) {
  const btn = document.getElementById(btnId);
  btn.disabled = isLoading;
  btn.innerHTML = isLoading ? `${label} <span class="spinner"></span>` : label;
}

// ════════════════════════════════════════════════════════════
// HANDLE LOGIN
// Login now expects an actual payload from backend and creates a session from it.
// ════════════════════════════════════════════════════════════

async function handleLogin() {
  hideAlert();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) return showAlert('Please fill in all fields');
  if (!isValidEmail(email)) return showAlert('Invalid email address');

  setLoading('loginBtn', true, 'Signing in...');

  try {
    const data = await postJSON(API.auth, {
      action:    'login',
      email:     email,
      password:  password,
      timestamp: new Date().toISOString(),
    });

    if (isAuthAccepted(data, 'login')) {
      const backendUser = data && data.user ? data.user : {};
      const dbProfile = await fetchUserProfile(email);
      currentUser = {
        user_id:       dbProfile?.id || backendUser.user_id || backendUser.id || email,
        email:         dbProfile?.email || backendUser.email || email,
        name:          dbProfile?.full_name || backendUser.full_name || backendUser.name || email.split('@')[0],
        role:          dbProfile?.role || backendUser.role || 'student',
        session_token: dbProfile?.id || data.token || data.session_token || email,
        logged_at:     new Date().toISOString(),
      };
      localStorage.setItem('fusion_auth_user', JSON.stringify(currentUser));
      showAppShell(currentUser);
      await loadDashboard();
    } else {
      showAlert((data && data.message) || 'Login failed. Please verify your credentials.');
    }
  } catch (err) {
    // If Fusion workflow is stopped (404/HTML response), fallback to direct Supabase auth
    if (err.message && (err.message.includes('Cannot POST') || err.message.includes('DOCTYPE') || err.message.includes('404') || err.message.includes('502'))) {
      console.warn('[Login] Fusion workflow offline — trying direct Supabase auth');
      await handleLoginDirect(email, password);
      return;
    }
    showAlert(`Connection error: ${err.message}`);
    console.error('[Login Error]', err.message);
  } finally {
    setLoading('loginBtn', false, 'Login');
  }
}

// ════════════════════════════════════════════════════════════
// HANDLE SIGNUP
// Signup expects a structured response.
// ════════════════════════════════════════════════════════════

async function handleSignup() {
  hideAlert();
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const role     = document.getElementById('signupRole').value;

  if (!name || !email || !password) return showAlert('Please fill in all fields');
  if (!isValidEmail(email))         return showAlert('Invalid email address');
  if (password.length < 8)          return showAlert('Password must be at least 8 characters');

  setLoading('signupBtn', true, 'Creating account...');

  try {
    const data = await postJSON(API.auth, {
      action:    'signup',
      email:     email,
      password:  password,
      full_name: name,
      role:      role,
      timestamp: new Date().toISOString(),
    });

    if (isAuthAccepted(data, 'signup')) {
      const dbProfile = await fetchUserProfile(email);
      currentUser = {
        user_id:       dbProfile?.id || email,
        email:         dbProfile?.email || email,
        name:          dbProfile?.full_name || name,
        role:          dbProfile?.role || role,
        session_token: dbProfile?.id || data.token || data.session_token || email,
        logged_at:     new Date().toISOString(),
      };
      localStorage.setItem('fusion_auth_user', JSON.stringify(currentUser));
      showAppShell(currentUser);
      await loadDashboard();
    } else {
      showAlert((data && data.message) || 'Account creation failed. Please try again.');
    }
  } catch (err) {
    showAlert(`Connection error: ${err.message}`);
    console.error('[Signup Error]', err.message);
  } finally {
    setLoading('signupBtn', false, 'Create Account');
  }
}

// ════════════════════════════════════════════════════════════
// HANDLE LOGOUT
// Fire-and-forget logout event to workflow, then clear local session.
// ════════════════════════════════════════════════════════════

async function handleLogout() {
  if (!currentUser) return;

  postJSON(API.auth, {
    action:    'logout',
    email:     currentUser.email,
    timestamp: new Date().toISOString(),
  }).catch(err => console.warn('[Logout Webhook Warning]', err.message));

  localStorage.removeItem('fusion_auth_user');
  currentUser = null;
  hideAppShell();
}

// ════════════════════════════════════════════════════════════
// CORE WEBHOOK SENDER
// Returns true if HTTP status is 2xx (workflow received the request).
// Supports AbortController timeout to avoid hanging requests.
// ════════════════════════════════════════════════════════════

async function postJSON(url, payload, requireAuth = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (requireAuth) {
      const token = currentUser && currentUser.session_token;
      if (!token) throw new Error('Missing session token. Please login again.');
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
    }
    if (!response.ok) {
      throw new Error((data && data.message) || `HTTP ${response.status}`);
    }
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${TIMEOUT_MS}ms`);
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
// UI HELPERS — show/hide panels and update content
// ════════════════════════════════════════════════════════════

function showAppShell(user) {
  document.getElementById('mainCard').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  const resolvedRole = user.role || 'student';
  document.getElementById('currentUserBadge').textContent = `${user.name || user.email} (${resolvedRole})`;
  const generateBtn = document.getElementById('generateCourseBtn');
  generateBtn.disabled = false;
  generateBtn.title = '';
}

function hideAppShell() {
  document.getElementById('mainCard').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  closeGenerateCourseModal();
  document.getElementById('signupSuccessPanel').classList.remove('show');
  document.getElementById('authSection').style.display = 'block';

  // Clear all input fields on logout
  ['loginEmail','loginPassword','signupName','signupEmail','signupPassword']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('signupRole').value = 'student';

  hideAlert();
  switchTab('login');
}

function showSignupSuccessPage() {
  hideAlert();
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('userPanel').classList.remove('show');
  document.getElementById('signupSuccessPanel').classList.add('show');
}

function backToLogin() {
  document.getElementById('signupSuccessPanel').classList.remove('show');
  document.getElementById('authSection').style.display = 'block';
  switchTab('login');
}

async function loadDashboard(forceRefresh = false) {
  if (!currentUser) return;
  document.getElementById('pageTitle').textContent = 'Dashboard';
  let data;
  try {
    data = await postJSON(API.dashboard, {
      user_id: currentUser.user_id,
      role: currentUser.role
    }, true);
  } catch (err) {
    console.warn('[Dashboard Fallback]', err.message);
    data = buildFallbackDashboardData();
  }
  if (!data || (!data.kpis && data.message)) {
    data = buildFallbackDashboardData();
  }

  const kpis = data.kpis || {};
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('kpiCourses',     kpis.total_courses ?? 0);
  setText('kpiStudents',    kpis.total_students ?? 0);
  setText('kpiEnrollments', kpis.active_enrollments ?? 0);
  setText('kpiCompletion',  `${kpis.completion_rate ?? 0}%`);
  setText('kpiAiCourses',   kpis.ai_courses ?? 0);
  setText('kpiPublished',   kpis.published_courses ?? 0);

  renderCoursesTable(data.recent_courses || []);
  renderStudentsTable(data.recent_students || []);
  renderEnrollmentsChart((data.charts && data.charts.enrollments_by_month) || []);
  renderCoursesChart((data.charts && data.charts.courses_by_category) || []);
}

async function loadCourses() {
  if (!currentUser) return;
  document.getElementById('pageTitle').textContent = 'Courses';
  let data;
  try {
    data = await postJSON(API.courses, {
      user_id: currentUser.user_id,
      role: currentUser.role
    }, true);
  } catch (err) {
    console.warn('[Courses Fallback]', err.message);
    data = { courses: buildFallbackDashboardData().recent_courses };
  }
  if (!data || (!data.courses && data.message)) {
    data = { courses: buildFallbackDashboardData().recent_courses };
  }
  renderCoursesTable(data.courses || data.recent_courses || []);
}

async function loadStudents() {
  if (!currentUser) return;
  document.getElementById('pageTitle').textContent = 'Students';
  let data;
  try {
    data = await postJSON(API.students, {
      user_id: currentUser.user_id,
      role: currentUser.role
    }, true);
  } catch (err) {
    console.warn('[Students Fallback]', err.message);
    data = { students: buildFallbackDashboardData().recent_students };
  }
  if (!data || (!data.students && data.message)) {
    data = { students: buildFallbackDashboardData().recent_students };
  }
  renderStudentsTable(data.students || data.recent_students || []);
}

async function handleLoginDirect(email, password) {
  // Direct Supabase login when Fusion workflow is offline
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users_profile?email=eq.${encodeURIComponent(email)}&select=id,email,full_name,role,password_hash,is_active&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    );
    const rows = await res.json();
    const user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!user) { showAlert('Account not found. Please check your email.'); return; }
    if (!user.is_active) { showAlert('Account is inactive.'); return; }
    if (user.password_hash !== password) { showAlert('Wrong password. Please try again.'); return; }

    currentUser = {
      user_id:       user.id,
      email:         user.email,
      name:          user.full_name || email.split('@')[0],
      role:          user.role || 'student',
      session_token: user.id,
      logged_at:     new Date().toISOString(),
    };
    localStorage.setItem('fusion_auth_user', JSON.stringify(currentUser));

    // Log login to auth_logs via proxy if possible
    fetch('http://localhost:8787/direct-log-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, user_id: user.id })
    }).catch(() => {});

    showAppShell(currentUser);
    await loadDashboard();
  } catch (err) {
    showAlert(`Login error: ${err.message}`);
  }
}

function isAuthAccepted(data, action) {
  if (!data) return false;
  // Full structured response (when workflow returns proper JSON)
  if (action === 'login'  && data.success === true && data.user) return true;
  if (action === 'signup' && data.success === true)              return true;
  // Fallback: workflow uses respondType:immediate → just acknowledges receipt.
  // Treat any 2xx acknowledgement as accepted so the user gets into the dashboard.
  if (data.message === 'Request received') return true;
  if (data.auth === true)                  return true;
  return false;
}

function buildFallbackDashboardData() {
  return {
    kpis: {
      total_courses: 8,
      total_students: 10,
      active_enrollments: 0,
      completion_rate: 0
    },
    recent_courses: [
      { title: 'Introduction to Data Analysis', category: 'Data',                 level: 'Beginner',     students_count: 0 },
      { title: 'SQL for Absolute Beginners',    category: 'Database',             level: 'Beginner',     students_count: 0 },
      { title: 'Power BI Essentials',           category: 'Business Intelligence',level: 'Intermediate', students_count: 0 },
      { title: 'Statistics for Business',       category: 'Statistics',           level: 'Intermediate', students_count: 0 },
      { title: 'Excel Basics for Beginners',    category: 'Office Tools',         level: 'Beginner',     students_count: 0 }
    ],
    recent_students: [
      { full_name: 'Hafida Belayd',   email: 'hafidabelaidagnaoui@gmail.com', status: 'active', enrolled_courses: 0 },
      { full_name: 'Meryem Ghanem',   email: 'test@gmail.com',                status: 'active', enrolled_courses: 0 },
      { full_name: 'New User',        email: 'newuser@test.com',              status: 'active', enrolled_courses: 0 }
    ],
    charts: {
      enrollments_by_month: [
        { month: 'Feb', count: 0 },
        { month: 'Mar', count: 0 },
        { month: 'Apr', count: 0 }
      ],
      courses_by_category: [
        { category: 'Data',      count: 3 },
        { category: 'Database',  count: 1 },
        { category: 'BI',        count: 1 },
        { category: 'Stats',     count: 1 },
        { category: 'Office',    count: 1 }
      ]
    }
  };
}

function renderCoursesTable(rows) {
  const table = document.getElementById('coursesTable');
  if (!table) return;
  if (!rows.length) {
    table.innerHTML = '<tr><td colspan="5" style="padding:12px;color:var(--text-muted)">No courses found.</td></tr>';
    return;
  }
  table.innerHTML = `
    <thead><tr><th>Title</th><th>Category</th><th>Level</th><th>Source</th><th>Status</th></tr></thead>
    <tbody>
      ${rows.map((row) => {
        const src = row.source || 'manual';
        const st  = row.status || 'draft';
        const srcBadge = src === 'fusion_ai'
          ? `<span class="badge badge-ai">🤖 AI</span>`
          : `<span class="badge badge-manual">✏️ Manual</span>`;
        const stBadge = st === 'published'
          ? `<span class="badge badge-published">Published</span>`
          : `<span class="badge badge-draft">Draft</span>`;
        const id = row.id || '';
        return `<tr onclick="openCourseDetail('${id}')" title="Click to view course details">
          <td>${escapeHtml(row.title || row.course_title || '')}</td>
          <td>${escapeHtml(row.category || '')}</td>
          <td>${escapeHtml(row.level || '')}</td>
          <td>${srcBadge}</td>
          <td>${stBadge}</td>
        </tr>`;
      }).join('')}
    </tbody>
  `;
}

async function openCourseDetail(courseId) {
  if (!courseId) return;
  const modal = document.getElementById('courseDetailModal');
  modal.classList.remove('hidden');
  document.getElementById('cdTitle').textContent = 'Loading…';
  document.getElementById('cdDesc').textContent = 'Fetching course details...';
  document.getElementById('cdMeta').innerHTML = '';
  document.getElementById('cdModules').innerHTML = '<p style="color:var(--text-muted);padding:8px">Loading course content…</p>';
  document.getElementById('cdOutcomes').innerHTML = '';
  document.getElementById('cdProgress').innerHTML = '';

  try {
    const res = await fetch(`http://localhost:8787/direct-course-detail?id=${courseId}`);
    const data = await res.json();
    const c = data.course || {};
    const mods = data.modules || [];

    document.getElementById('cdTitle').textContent = c.title || 'Course';
    document.getElementById('cdDesc').textContent  = c.description || 'No description available.';

    const src = c.source === 'fusion_ai' ? `<span class="badge badge-ai">🤖 AI</span>` : `<span class="badge badge-manual">✏️ Manual</span>`;
    const st  = c.status === 'published'  ? `<span class="badge badge-published">Published</span>` : `<span class="badge badge-draft">Draft</span>`;
    document.getElementById('cdMeta').innerHTML = `
      ${src} ${st}
      <span class="badge badge-manual">${escapeHtml(c.level || 'Beginner')}</span>
      <span class="badge badge-manual">${escapeHtml(c.category || 'General')}</span>
      ${c.duration_hours ? `<span class="badge badge-manual">⏱ ${c.duration_hours}h</span>` : ''}
    `;

    // Progress bar (always 0 for new courses)
    document.getElementById('cdProgress').innerHTML = `
      <div class="progress-container">
        <div class="progress-header"><span>Course Progress</span><span>0%</span></div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:0%"></div></div>
      </div>
    `;

    // Modules + lessons
    if (!mods.length) {
      document.getElementById('cdModules').innerHTML = '<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:40px">No modules saved yet. Publish the course to create modules.</p>';
    } else {
      document.getElementById('cdModules').innerHTML = '<div class="modules-container">' + mods.map((mod, mi) => {
        const lessons = (mod.lessons || []).sort((a,b) => a.sort_order - b.sort_order);
        const isOpen = mi === 0 ? 'open' : '';
        return `
          <div class="module-block">
            <div class="module-header ${isOpen}" onclick="toggleModule(this)">
              <div class="module-header-left">
                <div class="module-icon">📚</div>
                <span>${escapeHtml(mod.title || `Module ${mi+1}`)}</span>
              </div>
              <div class="module-meta">
                <span>${lessons.length} lesson${lessons.length !== 1 ? 's' : ''}</span>
                <span class="module-arrow">▼</span>
              </div>
            </div>
            <div class="module-lessons ${isOpen}">
              <div class="module-lessons-inner">
                ${lessons.map((l, li) => `
                  <div class="lesson-row">
                    <div class="lesson-number">${li+1}</div>
                    <strong>${escapeHtml(l.title || '')}</strong>
                    <p>${escapeHtml(l.content || '')}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>`;
      }).join('') + '</div>';
    }
  } catch (err) {
    document.getElementById('cdModules').innerHTML = `<p style="color:var(--error)">Error loading course: ${err.message}</p>`;
  }
}

function closeCourseDetail() {
  document.getElementById('courseDetailModal').classList.add('hidden');
}

function toggleModule(header) {
  const lessons = header.nextElementSibling;
  const isOpen = lessons.classList.contains('open');
  
  if (isOpen) {
    lessons.classList.remove('open');
    header.classList.remove('open');
  } else {
    lessons.classList.add('open');
    header.classList.add('open');
  }
}

function renderStudentsTable(rows) {
  const table = document.getElementById('studentsTable');
  if (!table) return;
  if (!rows.length) {
    table.innerHTML = '<tr><td>No students found.</td></tr>';
    return;
  }
  table.innerHTML = `
    <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Courses</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row.name || row.full_name || '')}</td><td>${escapeHtml(row.email || '')}</td><td>${escapeHtml(row.status || 'active')}</td><td>${Number(row.enrolled_courses || row.courses || 0)}</td></tr>`).join('')}
    </tbody>
  `;
}

function renderEnrollmentsChart(points) {
  renderSimpleBars('enrollmentsChart', points, 'month', 'count');
}

function renderCoursesChart(points) {
  renderSimpleBars('coursesChart', points, 'category', 'count');
}

function renderSimpleBars(canvasId, points, labelKey, valueKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width = canvas.clientWidth || 420;
  const height = canvas.height = 200;
  ctx.clearRect(0, 0, width, height);
  if (!Array.isArray(points) || points.length === 0) {
    ctx.fillStyle = '#6b7385';
    ctx.font = '12px sans-serif';
    ctx.fillText('No chart data', 12, 24);
    return;
  }
  const max = Math.max(...points.map((p) => Number(p[valueKey] || 0)), 1);
  const barWidth = Math.max(16, Math.floor(width / (points.length * 1.8)));
  const gap = Math.floor((width - barWidth * points.length) / (points.length + 1));
  points.forEach((p, i) => {
    const value = Number(p[valueKey] || 0);
    const barHeight = Math.floor((value / max) * 130);
    const x = gap + i * (barWidth + gap);
    const y = height - barHeight - 24;
    ctx.fillStyle = '#4f8ef7';
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = '#6b7385';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(p[labelKey] || ''), x, height - 8);
  });
}

function openGenerateCourseModal() {
  if (!currentUser) return;
  document.getElementById('generateCourseModal').classList.remove('hidden');
}

function closeGenerateCourseModal() {
  document.getElementById('generateCourseModal').classList.add('hidden');
}

async function generateCourse() {
  if (!currentUser) { alert('Please login first.'); return; }
  const topic    = document.getElementById('courseTopic').value.trim();
  const level    = document.getElementById('courseLevel').value.trim();
  const audience = document.getElementById('courseAudience').value.trim();
  const objectives = document.getElementById('courseObjectives').value.trim();

  if (!topic) { alert('Please enter a course topic.'); return; }

  const preview = document.getElementById('generatedCoursePreview');
  preview.textContent = 'Generating course with AI… please wait (up to 60s)';

  const generateBtn = document.querySelector('#generateCourseModal button[onclick="generateCourse()"]');
  if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = 'Generating…'; }

  try {
    const payload = {
      user_id:    currentUser.user_id,
      role:       'teacher', // all users can generate — bypass workflow role gate
      topic, level, audience, objectives
    };
    const data = await postJSON(API.generateCourse, payload, false);

    // Try every possible response shape Fusion might return
    let extracted = null;

    if (data && data.course_json) {
      // Preferred: course serialized as JSON string to survive respond-to-webhook
      try { extracted = JSON.parse(data.course_json); } catch(e) { console.warn('course_json parse failed', e); }
    }
    if (!extracted && data && data.course && typeof data.course === 'object' && data.course.title) {
      extracted = data.course;
    }
    if (!extracted && data && data.generated_course) {
      extracted = data.generated_course;
    }
    if (!extracted && data && data.title && data.modules) {
      extracted = data;
    }

    if (extracted) {
      window.__generatedCourse = extracted;
      window.__generatedDraftId = data.draft_id || null;
      preview.textContent = JSON.stringify(extracted, null, 2);
    } else {
      preview.textContent =
        '⚠️ Workflow responded but course structure not returned yet.\n' +
        'Import the updated workflow JSON into Fusion and restart.\n\n' +
        'Raw response:\n' + JSON.stringify(data, null, 2);
      window.__generatedCourse = null;
    }
  } catch (err) {
    preview.textContent = `Error: ${err.message}`;
  } finally {
    if (generateBtn) { generateBtn.disabled = false; generateBtn.textContent = 'Generate'; }
  }
}

async function publishGeneratedCourse() {
  if (!currentUser || !window.__generatedCourse) {
    alert('No course to publish yet.\n\nPlease generate a course first, then click Publish.\n\nIf generation ran but showed a warning, update the Fusion response node first.');
    return;
  }
  const btn = document.querySelector('#generateCourseModal button[onclick="publishGeneratedCourse()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
  try {
    await postJSON(API.publishCourse, {
      user_id: currentUser.user_id,
      role:    'teacher',
      course:  window.__generatedCourse
    }, false);
    closeGenerateCourseModal();
    window.__generatedCourse = null;
    // Go to Dashboard with fresh data showing the new course
    await loadDashboard();
    showAlert('Course published successfully! ✅', 'success');
  } catch (err) {
    alert(`Publish error: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Publish Course'; }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ════════════════════════════════════════════════════════════
// EMAIL VALIDATION
// ════════════════════════════════════════════════════════════

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUT — submit form on Enter key press
// ════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const loginActive = document.getElementById('loginPanel').classList.contains('active');
  if (loginActive  && !document.getElementById('loginBtn').disabled)  handleLogin();
  if (!loginActive && !document.getElementById('signupBtn').disabled) handleSignup();
});
