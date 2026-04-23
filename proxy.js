const http = require('http');

const PORT = 8787;

// ── Supabase direct config (for /direct-dashboard route) ──────────────────
const SUPABASE_URL    = 'https://oktgdchftjiylsgdafvr.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGdkY2hmdGppeWxzZ2RhZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDYyMzQsImV4cCI6MjA5MDYyMjIzNH0.C8ADlZ3lA3vRo5WI8-tr7UjQ4RyVSqbq7rnS8eyawHs';

async function sbQuery(sql) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) {
    // fallback: use postgrest for simple selects
    return null;
  }
  return r.json();
}

async function buildDashboardDirect() {
  const h = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
  const base = SUPABASE_URL + '/rest/v1';

  const [allCourses, students, enrollments, allEnrollments] = await Promise.all([
    fetch(`${base}/courses?select=id,title,category,level,status,source,duration_hours,created_at&order=created_at.desc&limit=20`, { headers: h }).then(r => r.json()),
    fetch(`${base}/students?select=id,full_name,email,status,created_at&order=created_at.desc&limit=10`, { headers: h }).then(r => r.json()),
    fetch(`${base}/enrollments?select=id,progress,completed,enrolled_at&completed=eq.false`, { headers: h }).then(r => r.json()),
    fetch(`${base}/enrollments?select=id,progress,completed,enrolled_at`, { headers: h }).then(r => r.json()),
  ]);

  const courses = Array.isArray(allCourses) ? allCourses : [];
  const totalCourses = courses.length;
  const totalStudents = Array.isArray(students) ? students.length : 0;
  const aiCourses = courses.filter(c => c.source === 'fusion_ai').length;
  const publishedCourses = courses.filter(c => c.status === 'published').length;
  const activeEnrollments = Array.isArray(enrollments) ? enrollments.length : 0;

  let completionRate = 0;
  if (Array.isArray(allEnrollments) && allEnrollments.length > 0) {
    const sum = allEnrollments.reduce((acc, e) => acc + (e.completed ? 100 : Number(e.progress || 0)), 0);
    completionRate = Math.round(sum / allEnrollments.length);
  }

  // Charts: enrollments by month
  const monthMap = {};
  if (Array.isArray(allEnrollments)) {
    allEnrollments.forEach(e => {
      if (!e.enrolled_at) return;
      const m = new Date(e.enrolled_at).toLocaleString('en', { month: 'short' });
      monthMap[m] = (monthMap[m] || 0) + 1;
    });
  }
  const enrollments_by_month = Object.entries(monthMap).map(([month, count]) => ({ month, count }));

  // Charts: courses by category
  const catMap = {};
  if (Array.isArray(courses)) {
    courses.forEach(c => { const cat = c.category || 'Other'; catMap[cat] = (catMap[cat] || 0) + 1; });
  }
  const courses_by_category = Object.entries(catMap).map(([category, count]) => ({ category, count }));

  return {
    success: true,
    source: 'supabase-direct',
    kpis: { total_courses: totalCourses, total_students: totalStudents, active_enrollments: activeEnrollments, completion_rate: completionRate, ai_courses: aiCourses, published_courses: publishedCourses },
    charts: { enrollments_by_month, courses_by_category },
    recent_courses: courses,
    recent_students: Array.isArray(students) ? students.map(s => ({ ...s, enrolled_courses: 0 })) : [],
  };
}

async function buildStudentsDirect() {
  const h = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
  const base = SUPABASE_URL + '/rest/v1';
  const students = await fetch(`${base}/students?select=id,full_name,email,status,created_at&order=created_at.desc`, { headers: h }).then(r => r.json());
  return { success: true, source: 'supabase-direct', students: Array.isArray(students) ? students : [] };
}

async function buildCourseDetailDirect(courseId) {
  const h = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
  const base = SUPABASE_URL + '/rest/v1';
  const [courseArr, modules] = await Promise.all([
    fetch(`${base}/courses?id=eq.${courseId}&select=id,title,description,category,level,duration_hours,status,source,created_at&limit=1`, { headers: h }).then(r => r.json()),
    fetch(`${base}/course_modules?course_id=eq.${courseId}&select=id,title,sort_order,lessons(id,title,content,lesson_type,sort_order)&order=sort_order.asc`, { headers: h }).then(r => r.json()),
  ]);
  const course = Array.isArray(courseArr) && courseArr.length > 0 ? courseArr[0] : null;
  return {
    success: true,
    course,
    modules: Array.isArray(modules) ? modules.sort((a,b) => a.sort_order - b.sort_order) : [],
  };
}

async function buildCoursesDirect() {
  const h = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
  const base = SUPABASE_URL + '/rest/v1';
  const courses = await fetch(`${base}/courses?select=id,title,category,level,status,source,duration_hours,created_at&order=created_at.desc`, { headers: h }).then(r => r.json());
  return { success: true, source: 'supabase-direct', courses: Array.isArray(courses) ? courses : [] };
}

// Each route forwards to its own dedicated Fusion webhook URL.
// Override any of these via environment variables if needed.
const ROUTE_MAP = {
  '/auth':
    process.env.FUSION_WEBHOOK_AUTH ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-b75f6bc3-49bf-432d-99eb-68cd9bf921c0/auth',
  '/dashboard-summary':
    process.env.FUSION_WEBHOOK_DASHBOARD ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-93eef455-a56a-46ea-8900-cbbe68774689/dashboard-summary',
  '/courses':
    process.env.FUSION_WEBHOOK_COURSES ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-57fd7078-615b-4d36-b183-72e281005bf1/courses',
  '/students':
    process.env.FUSION_WEBHOOK_STUDENTS ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-c1be214c-63ec-4471-b374-f1727df2448c/students',
  '/generate-course':
    process.env.FUSION_WEBHOOK_GENERATE ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-e5641837-87d3-47db-b312-1e472a2659c9/generate-course',
  '/publish-course':
    process.env.FUSION_WEBHOOK_PUBLISH ||
    'https://fusion-ai-api.medifus.dev/webhooks/webhook-2d2909ed-d9e7-4291-8f27-fb0c72a2e681/publish-course',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // ── Direct Supabase routes (no Fusion needed) ───────────────
  if (req.method === 'POST' || req.method === 'GET') {
    if (req.url === '/direct-dashboard') {
      try {
        const data = await buildDashboardDirect();
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url === '/direct-students') {
      try {
        const data = await buildStudentsDirect();
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url === '/direct-log-login') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { email } = JSON.parse(body || '{}');
          const e = s => String(s||'').replace(/'/g,"''");
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_sql`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `INSERT INTO public.auth_logs(email,action,status) VALUES('${e(email)}','login','success')` })
          }).catch(() => {});
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: true }));
        } catch(err) {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }
    if (req.url && req.url.startsWith('/direct-user')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const email = urlObj.searchParams.get('email') || '';
        const h = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
        const r = await fetch(`${SUPABASE_URL}/rest/v1/users_profile?email=eq.${encodeURIComponent(email)}&select=id,email,full_name,role,is_active&limit=1`, { headers: h });
        const rows = await r.json();
        const user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify(user || {}));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url && req.url.startsWith('/direct-course-detail')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const courseId = urlObj.searchParams.get('id') || '';
        const data = await buildCourseDetailDirect(courseId);
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url === '/direct-courses') {
      try {
        const data = await buildCoursesDirect();
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  const upstreamUrl = ROUTE_MAP[req.url];
  if (!upstreamUrl) {
    res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk;
  });

  req.on('end', async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization
            ? { Authorization: req.headers.authorization }
            : {}),
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        ...corsHeaders,
      });
      res.end(text || JSON.stringify({ ok: upstream.ok }));
    } catch (err) {
      const details = {
        message: String(err.message || err),
        code: err.code || null,
        cause: err.cause ? String(err.cause.message || err.cause) : null,
      };
      res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ error: 'Proxy error', details }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Proxy running at http://localhost:${PORT}`);
});
