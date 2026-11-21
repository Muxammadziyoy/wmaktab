/* wMaktab - in-browser backend (replaces Flask + SQLite + C++).
   Data: data/db.json is loaded once, then kept in localStorage. Same API paths and rules as the Python version. */
(() => {
const KEY = 'wmaktab_db_v1', SKEY = 'wmaktab_uid';
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const LESSON_TIMES = { 1: '08:00 - 08:45', 2: '08:55 - 09:40', 3: '09:50 - 10:35', 4: '10:55 - 11:40', 5: '11:50 - 12:35', 6: '12:45 - 13:30' };
const GRADE_KINDS = ['Classwork', 'Homework', 'Quiz', 'Test', 'Exam'];
const STATUSES = ['present', 'late', 'excused', 'absent'];
const ROLES = ['student', 'teacher', 'admin'];
class ApiError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const fail = (m, s) => { throw new ApiError(m, s); };

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(`${s}T00:00:00`);
const todayISO = () => iso(new Date());
const nowStr = () => { const d = new Date(); return `${iso(d)} ${d.toTimeString().slice(0, 8)}`; };
const addDays = (s, n) => { const d = parse(s.slice(0, 10)); d.setDate(d.getDate() + n); return iso(d) + s.slice(10); };
const isoWeekday = (s) => parse(s).getDay() || 7;
const quarterFor = (s) => { const m = +s.slice(5, 7); return m >= 9 && m <= 10 ? 1 : m >= 11 ? 2 : m <= 3 ? 3 : 4; };
const yearStart = () => { const d = new Date(); return `${d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1}-09-01`; };
const yearLabel = () => { const y = +yearStart().slice(0, 4); return `${y}-${y + 1}`; };

/* ---------- statistics engine (port of statistics.cpp) ---------- */
const toScale = (x) => Math.max(1, Math.min(5, Math.floor(x + 0.5)));
const r2 = (x) => Math.round(x * 100) / 100;
function compute(groups) {
  const out = {};
  for (const [key, vals] of Object.entries(groups)) {
    const v = vals.map(Number).filter(Number.isFinite), n = v.length;
    if (!n) continue;
    const o = [...v].sort((a, b) => a - b), mean = v.reduce((a, b) => a + b, 0) / n;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    v.forEach((x) => dist[toScale(x)]++);
    let mode = 1; for (let k = 2; k <= 5; k++) if (dist[k] > dist[mode]) mode = k;
    out[key] = {
      count: n, mean: r2(mean), median: r2(n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2), min: o[0], max: o[n - 1],
      stddev: n > 1 ? r2(Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1))) : 0, mode, mark: toScale(mean),
      quality_rate: r2(100 * v.filter((x) => Math.floor(x + 0.5) >= 4).length / n),
      pass_rate: r2(100 * v.filter((x) => Math.floor(x + 0.5) >= 3).length / n), dist,
    };
  }
  return out;
}
const push = (g, k, v) => { (g[k] ||= []).push(v); };

/* ---------- database ---------- */
let db;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const find = (t, id) => db[t].find((r) => r.id === id);
const nextId = (t) => Math.max(0, ...db[t].map((r) => r.id)) + 1;
const byName = (a, b) => a.name.localeCompare(b.name);
const clsName = (id) => find('classes', id)?.name ?? null;
const subjName = (id) => find('subjects', id)?.name ?? null;
const userName = (id) => find('users', id)?.full_name ?? null;
const uv = (u) => (u ? { ...u, class_name: clsName(u.class_id) } : null);
const pub = (u) => Object.fromEntries(['id', 'username', 'role', 'full_name', 'email', 'phone', 'class_id', 'class_name'].map((k) => [k, u[k] ?? null]));
const students = (cid, active = true) => db.users.filter((u) => u.role === 'student' && u.class_id === cid && (!active || u.active));

function shiftDates() { // move demo dates forward by whole weeks so "today" is always current
  const days = Math.round((parse(todayISO()) - parse(db.meta.seed_today)) / 864e5), n = Math.floor(days / 7) * 7;
  if (n <= 0) return;
  db.grades.forEach((g) => { g.date = addDays(g.date, n); g.quarter = quarterFor(g.date); g.created_at = addDays(g.created_at, n); });
  db.attendance.forEach((a) => { a.date = addDays(a.date, n); });
  db.homework.forEach((h) => { h.due_date = addDays(h.due_date, n); h.created_at = addDays(h.created_at, n); });
  db.homework_status.forEach((h) => { if (h.done_at) h.done_at = addDays(h.done_at, n); });
  db.announcements.forEach((a) => { a.created_at = addDays(a.created_at, n); });
  db.meta.seed_today = addDays(db.meta.seed_today, n);
}
const ready = (async () => {
  const cached = localStorage.getItem(KEY);
  if (cached) { db = JSON.parse(cached); return; }
  const res = await fetch('data/db.json');
  db = await res.json();
  shiftDates(); save();
})();

/* ---------- passwords / session ---------- */
async function sha(salt, pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function makePw(pw) { const salt = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join(''); return `${salt}$${await sha(salt, pw)}`; }
async function checkPw(stored, pw) { const [salt, h] = stored.split('$'); return (await sha(salt, pw)) === h; }
function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters long.';
  return p.length > 128 ? 'Password is too long (maximum 128 characters).' : null;
}
const failures = {};
const me = () => { const u = find('users', +localStorage.getItem(SKEY)); return u && u.active ? uv(u) : null; };

/* ---------- validation helpers ---------- */
const lab = (k, l) => l || k.replace(/_id$/, '').replace(/_/g, ' ');
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
function int(src, key, { lo, hi, label, required = true } = {}) {
  const l = lab(key, label), v = src[key];
  if (v === undefined || v === null || v === '') { if (required) fail(`${Cap(l)} is required.`); return null; }
  const n = Number(v);
  if (typeof v === 'boolean' || !Number.isInteger(n)) fail(`${Cap(l)} must be a whole number.`);
  if ((lo !== undefined && n < lo) || (hi !== undefined && n > hi)) fail(`${Cap(l)} is out of range.`);
  return n;
}
function text(src, key, { label, min = 0, max = 200, required = false } = {}) {
  const l = lab(key, label), v = String(src[key] ?? '').trim();
  if (required && !v) fail(`${Cap(l)} is required.`);
  if (v && v.length < min) fail(`${Cap(l)} must be at least ${min} characters.`);
  if (v.length > max) fail(`${Cap(l)} must be at most ${max} characters.`);
  return v;
}
function dt(src, key, { label, required = true } = {}) {
  const l = lab(key, label), v = src[key];
  if (v === undefined || v === null || v === '') { if (required) fail(`${Cap(l)} is required.`); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || iso(parse(v)) !== v) fail(`${Cap(l)} is not a valid date.`);
  return v;
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const email = (b) => { const e = text(b, 'email', { max: 120 }); if (e && !EMAIL.test(e)) fail('Enter a valid email address.'); return e; };

/* ---------- permission helpers ---------- */
const teaches = (tid, cid, sid) => db.teaching.some((t) => t.teacher_id === tid && t.class_id === cid && (sid == null || t.subject_id === sid));
const teacherSubjects = (tid, cid) => db.teaching.filter((t) => t.teacher_id === tid && t.class_id === cid).map((t) => t.subject_id);
function classAccess(u, cid, sid) {
  if (!find('classes', cid)) fail('Class not found.', 404);
  if (u.role === 'teacher' && !teaches(u.id, cid, sid)) fail('You do not teach this class or subject.', 403);
  if (u.role === 'student') fail('You do not have permission to do that.', 403);
}
function getStudent(id) {
  const s = find('users', id);
  if (!s || s.role !== 'student') fail('Student not found.', 404);
  return uv(s);
}
function studentAccess(u, id) {
  const s = getStudent(id);
  if (u.role === 'student' && u.id !== id) fail('You can only view your own records.', 403);
  if (u.role === 'teacher' && !(s.class_id && teaches(u.id, s.class_id))) fail('This student is not in one of your classes.', 403);
  return s;
}
function assignments(u) {
  let rows = db.teaching;
  if (u.role === 'teacher') rows = rows.filter((t) => t.teacher_id === u.id);
  if (u.role === 'student') rows = rows.filter((t) => t.class_id === u.class_id);
  return rows.map((t) => ({ id: t.id, class_id: t.class_id, class_name: clsName(t.class_id), subject_id: t.subject_id, subject_name: subjName(t.subject_id), teacher_id: t.teacher_id, teacher_name: userName(t.teacher_id) }))
    .sort((a, b) => (u.role === 'student' ? 0 : a.class_name.localeCompare(b.class_name)) || a.subject_name.localeCompare(b.subject_name));
}

/* ---------- statistics helpers ---------- */
function sumCounts(c) {
  const p = c.present || 0, l = c.late || 0, e = c.excused || 0, a = c.absent || 0, total = p + l + e + a;
  return { present: p, late: l, excused: e, absent: a, total, rate: total ? Math.round(1000 * (p + l) / total) / 10 : null };
}
const attCounts = (rows) => { const c = {}; rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; };
const attSummary = (sid) => sumCounts(attCounts(db.attendance.filter((a) => a.student_id === sid)));
function studentSummary(sid, cid) {
  const g = db.grades.filter((x) => x.student_id === sid), groups = {};
  g.forEach((r) => { push(groups, `S:${r.subject_id}:${r.quarter}`, r.value); push(groups, 'ALL', r.value); push(groups, `Q:${r.quarter}`, r.value); });
  const first = compute(groups), yg = {};
  Object.entries(first).forEach(([k, st]) => { if (k.startsWith('S:')) push(yg, `Y:${k.split(':')[1]}`, st.mark); });
  const year = compute(yg), gpa = compute({ GPA: Object.values(year).map((v) => v.mark) }).GPA || null;
  const ids = new Set([...db.teaching.filter((t) => t.class_id === cid).map((t) => t.subject_id), ...g.map((r) => r.subject_id)]);
  const subjects = db.subjects.filter((s) => ids.has(s.id)).sort(byName).map((s) => {
    const quarters = {}; for (let q = 1; q <= 4; q++) quarters[q] = first[`S:${s.id}:${q}`] || null;
    return { subject_id: s.id, name: s.name, quarters, year: year[`Y:${s.id}`] || null, count: Object.values(quarters).reduce((a, x) => a + (x ? x.count : 0), 0) };
  });
  const quarters = {}; for (let q = 1; q <= 4; q++) quarters[q] = first[`Q:${q}`] || null;
  return { subjects, overall: first.ALL || null, quarters, gpa, engine: 'js' };
}
function classAttRates() {
  const by = {};
  db.attendance.forEach((a) => { const u = find('users', a.student_id); if (u && u.active) (by[u.class_id] ||= []).push(a); });
  return Object.fromEntries(Object.entries(by).map(([cid, rows]) => [cid, sumCounts(attCounts(rows))]));
}
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const subjStats = (st) => db.subjects.slice().sort(byName).filter((s) => st[`J:${s.id}`]).map((s) => ({ id: s.id, name: s.name, ...pick(st[`J:${s.id}`], ['mean', 'count', 'quality_rate', 'pass_rate']) }));
const qStats = (st) => [1, 2, 3, 4].filter((q) => st[`Q:${q}`]).map((q) => ({ quarter: q, mean: st[`Q:${q}`].mean, count: st[`Q:${q}`].count }));

/* ---------- announcements / homework / timetable views ---------- */
function announcementsFor(u, limit) {
  let rows = db.announcements.filter((a) => u.role === 'admin' || (u.role === 'teacher' ? ['all', 'teachers'].includes(a.audience) || a.author_id === u.id : ['all', 'students'].includes(a.audience)));
  rows = rows.sort((a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at) || b.id - a.id).map((a) => ({ ...a, author_name: userName(a.author_id) }));
  return limit ? rows.slice(0, limit) : rows;
}
const hwView = (h, u) => {
  const sts = students(h.class_id), ids = new Set(sts.map((s) => s.id));
  const v = { id: h.id, class_id: h.class_id, class_name: clsName(h.class_id), subject_id: h.subject_id, subject_name: subjName(h.subject_id), teacher_id: h.teacher_id, teacher_name: userName(h.teacher_id), title: h.title, description: h.description, due_date: h.due_date, created_at: h.created_at, total_students: sts.length, done_count: db.homework_status.filter((x) => x.homework_id === h.id && x.done && ids.has(x.student_id)).length };
  if (u.role === 'student') v.done = db.homework_status.find((x) => x.homework_id === h.id && x.student_id === u.id)?.done ? 1 : 0;
  return v;
};
const isDone = (hid, sid) => db.homework_status.some((x) => x.homework_id === hid && x.student_id === sid && x.done);
const ttView = (e) => ({ id: e.id, class_id: e.class_id, class_name: clsName(e.class_id), weekday: e.weekday, lesson_no: e.lesson_no, subject_id: e.subject_id, subject_name: subjName(e.subject_id), teacher_id: e.teacher_id, teacher_name: userName(e.teacher_id), room: e.room });
const ttSort = (a, b) => a.weekday - b.weekday || a.lesson_no - b.lesson_no;

/* ---------- cascades ---------- */
function dropWhere(t, fn) { db[t] = db[t].filter((r) => !fn(r)); }
function removeUser(id) {
  dropWhere('users', (u) => u.id === id); dropWhere('teaching', (t) => t.teacher_id === id);
  ['grades', 'attendance', 'homework_status'].forEach((t) => dropWhere(t, (r) => r.student_id === id));
  ['grades', 'timetable', 'homework'].forEach((t) => db[t].forEach((r) => { if (r.teacher_id === id) r.teacher_id = null; }));
  db.attendance.forEach((a) => { if (a.marked_by === id) a.marked_by = null; });
  db.announcements.forEach((a) => { if (a.author_id === id) a.author_id = null; });
}
function removeClass(id) {
  ['teaching', 'timetable'].forEach((t) => dropWhere(t, (r) => r.class_id === id));
  const hw = new Set(db.homework.filter((h) => h.class_id === id).map((h) => h.id));
  dropWhere('homework', (h) => h.class_id === id); dropWhere('homework_status', (s) => hw.has(s.homework_id));
  db.users.forEach((u) => { if (u.class_id === id) u.class_id = null; });
  dropWhere('classes', (c) => c.id === id);
}
function removeSubject(id) {
  ['teaching', 'grades', 'timetable', 'homework'].forEach((t) => dropWhere(t, (r) => r.subject_id === id));
  const hw = new Set(db.homework.map((h) => h.id)); dropWhere('homework_status', (s) => !hw.has(s.homework_id));
  dropWhere('subjects', (s) => s.id === id);
}

/* ---------- routes ---------- */
const routes = [];
const R = (m, p, roles, fn) => routes.push({ m, roles, fn, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$') });
const ANY = [], STAFF = ['teacher', 'admin'], ADMIN = ['admin'];
const qi = (q, k) => Number(q.get(k)) || 0;

R('POST', '/api/login', null, async ({ b }) => {
  const username = String(b.username || '').trim().slice(0, 64), password = String(b.password || '').slice(0, 256);
  if (!username || !password) fail('Enter your username and password.');
  const k = username.toLowerCase(), f = failures[k] || { n: 0, until: 0 }, now = Date.now();
  if (f.until > now) fail(`Too many failed attempts. Try again in ${Math.ceil((f.until - now) / 1000)} seconds.`, 429);
  const u = db.users.find((x) => x.username.toLowerCase() === k);
  if (!u || !(await checkPw(u.pw, password))) {
    f.n++; if (f.n >= 5) { f.n = 0; f.until = now + 60000; } failures[k] = f;
    fail('Incorrect username or password.', 401);
  }
  if (!u.active) fail('This account has been disabled. Please contact the school administrator.', 403);
  delete failures[k]; localStorage.setItem(SKEY, u.id);
  return { ok: true, user: pub(uv(u)), csrf: 'static', redirect: 'dashboard.html' };
});
R('POST', '/api/logout', null, async () => { localStorage.removeItem(SKEY); return { ok: true }; });
R('GET', '/api/me', ANY, async ({ u }) => ({ user: pub(u) }));
R('POST', '/api/me/password', ANY, async ({ b, u }) => {
  const rec = find('users', u.id);
  if (!(await checkPw(rec.pw, String(b.current || '')))) fail('Your current password is incorrect.');
  const nw = String(b.new || ''), pr = passwordProblem(nw);
  if (pr) fail(pr);
  if (nw === String(b.current)) fail('Choose a password that is different from the current one.');
  rec.pw = await makePw(nw); return { ok: true };
});
R('GET', '/api/health', null, async () => ({ ok: true, stats_engine: 'js' }));
R('GET', '/api/meta', ANY, async ({ u }) => {
  const m = { user: pub(u), classes: db.classes.slice().sort(byName), subjects: db.subjects.slice().sort(byName), assignments: assignments(u), today: todayISO(), quarter: quarterFor(todayISO()), school_year: yearLabel(), school_year_start: yearStart(), lesson_times: LESSON_TIMES, max_lessons: 6, grade_kinds: GRADE_KINDS, weekdays: WEEKDAYS, engine: 'js' };
  if (u.role === 'admin') m.teachers = db.users.filter((x) => x.role === 'teacher' && x.active).map((x) => pick(x, ['id', 'full_name'])).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return m;
});

R('GET', '/api/dashboard', ANY, async ({ u }) => {
  const today = todayISO(), wd = isoWeekday(today), day = wd <= 5 ? wd : 1;
  const base = { role: u.role, announcements: announcementsFor(u, 4), day, day_name: WEEKDAYS[day - 1], is_next_school_day: wd > 5 };
  if (u.role === 'student') {
    const sum = studentSummary(u.id, u.class_id), att = attSummary(u.id), o = sum.overall || {};
    const hws = db.homework.filter((h) => h.class_id === u.class_id), open = hws.filter((h) => !isDone(h.id, u.id));
    Object.assign(base, {
      stats: { average: o.mean ?? null, quality_rate: o.quality_rate ?? null, grades_count: o.count || 0, attendance_rate: att.rate, homework_pending: open.filter((h) => h.due_date >= today).length, homework_overdue: open.filter((h) => h.due_date < today).length },
      subject_means: sum.subjects.map((s) => ({ name: s.name, value: s.year ? s.year.mean : null })),
      lessons: db.timetable.filter((e) => e.class_id === u.class_id && e.weekday === day).sort(ttSort).map((e) => ({ lesson_no: e.lesson_no, subject_name: subjName(e.subject_id), room: e.room, teacher_name: userName(e.teacher_id) })),
      recent_grades: db.grades.filter((g) => g.student_id === u.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 6).map((g) => ({ id: g.id, value: g.value, kind: g.kind, date: g.date, subject_name: subjName(g.subject_id) })),
      homework: open.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4).map((h) => ({ id: h.id, title: h.title, due_date: h.due_date, subject_name: subjName(h.subject_id) })),
    });
  } else if (u.role === 'teacher') {
    const mine = db.teaching.filter((t) => t.teacher_id === u.id), cids = [...new Set(mine.map((t) => t.class_id))].sort((a, b) => clsName(a).localeCompare(clsName(b)));
    const groups = { ALL: [] };
    db.grades.forEach((g) => { const s = find('users', g.student_id); if (s && s.active && mine.some((t) => t.class_id === s.class_id && t.subject_id === g.subject_id)) { groups.ALL.push(g.value); push(groups, `C:${s.class_id}`, g.value); } });
    const st = compute(groups), cnt = (c) => students(c).length;
    Object.assign(base, {
      stats: { classes: cids.length, students: cids.reduce((a, c) => a + cnt(c), 0), average: st.ALL?.mean ?? null, homework_open: db.homework.filter((h) => h.teacher_id === u.id && h.due_date >= today).length },
      classes: cids.map((c) => ({ class_id: c, class_name: clsName(c), subjects: mine.filter((t) => t.class_id === c).map((t) => subjName(t.subject_id)).sort(), students: cnt(c), mean: st[`C:${c}`]?.mean ?? null })),
      lessons: db.timetable.filter((e) => e.teacher_id === u.id && e.weekday === day).sort(ttSort).map((e) => ({ lesson_no: e.lesson_no, subject_name: subjName(e.subject_id), room: e.room, class_name: clsName(e.class_id) })),
      recent_grades: db.grades.filter((g) => g.teacher_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 8).map((g) => ({ id: g.id, value: g.value, kind: g.kind, date: g.date, subject_name: subjName(g.subject_id), student_name: userName(g.student_id) })),
    });
  } else {
    const groups = { ALL: [] };
    db.grades.forEach((g) => { const s = find('users', g.student_id); if (s && s.active) { groups.ALL.push(g.value); push(groups, `C:${s.class_id}`, g.value); } });
    const st = compute(groups), act = db.users.filter((x) => x.active), classes = db.classes.slice().sort(byName);
    const att = db.attendance.filter((a) => a.date === today && find('users', a.student_id)?.active);
    Object.assign(base, {
      stats: { students: act.filter((x) => x.role === 'student').length, teachers: act.filter((x) => x.role === 'teacher').length, classes: classes.length, average: st.ALL?.mean ?? null, attendance_today: sumCounts(attCounts(att)), is_school_day: wd <= 5 },
      class_means: classes.map((c) => ({ name: c.name, value: st[`C:${c.id}`]?.mean ?? null })),
      distribution: st.ALL?.dist ?? null,
      recent_users: db.users.slice().sort((a, b) => b.id - a.id).slice(0, 5).map((x) => ({ id: x.id, full_name: x.full_name, role: x.role, created_at: x.created_at, class_name: clsName(x.class_id) })),
    });
  }
  base.engine = 'js'; return base;
});

/* profiles */
const profileOf = (t) => {
  const p = { ...pick(uv(t), ['id', 'username', 'role', 'full_name', 'email', 'phone', 'address', 'birth_date', 'class_id', 'class_name', 'created_at', 'active']) };
  if (t.role === 'teacher') p.assignments = assignments(t);
  if (t.role === 'student') { const s = studentSummary(t.id, t.class_id); p.summary = { average: s.overall?.mean ?? null, gpa: s.gpa?.mean ?? null, attendance_rate: attSummary(t.id).rate, grades_count: s.overall?.count || 0 }; }
  return p;
};
R('GET', '/api/profile/:id', ANY, async ({ p, u }) => {
  const id = +p.id, t = find('users', id);
  if (!t) fail('User not found.', 404);
  if (u.id !== id && u.role !== 'admin') { if (t.role === 'student') studentAccess(u, id); else fail('You do not have permission to view this profile.', 403); }
  return { profile: profileOf(t) };
});
R('PUT', '/api/profile/:id', ANY, async ({ p, b, u }) => {
  const id = +p.id, t = find('users', id);
  if (u.id !== id && u.role !== 'admin') fail('You can only edit your own profile.', 403);
  if (!t) fail('User not found.', 404);
  const f = { email: email(b), phone: text(b, 'phone', { max: 30 }), address: text(b, 'address', { max: 200 }) };
  if (u.role === 'admin') { f.full_name = text(b, 'full_name', { min: 2, max: 80, required: true }); f.birth_date = dt(b, 'birth_date', { required: false }) || ''; }
  Object.assign(t, f); return { ok: true };
});

/* users (admin) */
R('GET', '/api/users', ADMIN, async ({ q }) => {
  const role = q.get('role') || '', cid = qi(q, 'class_id'), s = (q.get('q') || '').trim().slice(0, 60).toLowerCase(), ord = { admin: 0, teacher: 1, student: 2 };
  const rows = db.users.filter((x) => (!ROLES.includes(role) || x.role === role) && (!cid || x.class_id === cid) && (!s || x.full_name.toLowerCase().includes(s) || x.username.toLowerCase().includes(s)))
    .map((x) => ({ ...pick(uv(x), ['id', 'username', 'role', 'full_name', 'email', 'phone', 'address', 'birth_date', 'class_id', 'class_name', 'active', 'created_at']) }))
    .sort((a, b) => ord[a.role] - ord[b.role] || (a.class_name || '').localeCompare(b.class_name || '') || a.full_name.localeCompare(b.full_name));
  return { users: rows };
});
const classFor = (b) => { const c = int(b, 'class_id', { label: 'class' }); if (!find('classes', c)) fail('Class not found.'); return c; };
R('POST', '/api/users', ADMIN, async ({ b }) => {
  const username = text(b, 'username', { required: true, max: 32 });
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) fail('Username must be 3-32 characters: letters, numbers, dot, dash or underscore.');
  const role = String(b.role || ''); if (!ROLES.includes(role)) fail('Choose a valid role.');
  const full_name = text(b, 'full_name', { label: 'full name', min: 2, max: 80, required: true }), pr = passwordProblem(String(b.password || ''));
  if (pr) fail(pr);
  const em = email(b), phone = text(b, 'phone', { max: 30 }), class_id = role === 'student' ? classFor(b) : null;
  if (db.users.some((x) => x.username.toLowerCase() === username.toLowerCase())) fail('That username is already taken.', 409);
  const id = nextId('users');
  db.users.push({ id, username, role, full_name, email: em, phone, address: '', birth_date: '', class_id, active: 1, created_at: nowStr(), pw: await makePw(b.password) });
  return { ok: true, id };
});
R('PUT', '/api/users/:id', ADMIN, async ({ p, b, u }) => {
  const id = +p.id, t = find('users', id); if (!t) fail('User not found.', 404);
  const f = { full_name: text(b, 'full_name', { label: 'full name', min: 2, max: 80, required: true }), email: email(b), phone: text(b, 'phone', { max: 30 }), address: text(b, 'address', { max: 200 }), birth_date: dt(b, 'birth_date', { required: false }) || '' };
  if (t.role === 'student') f.class_id = classFor(b);
  if ('active' in b) { f.active = b.active ? 1 : 0; if (id === u.id && !f.active) fail('You cannot disable your own account.'); }
  Object.assign(t, f); return { ok: true };
});
R('DELETE', '/api/users/:id', ADMIN, async ({ p, u }) => {
  const id = +p.id; if (id === u.id) fail('You cannot delete your own account.');
  if (!find('users', id)) fail('User not found.', 404);
  removeUser(id); return { ok: true };
});
R('POST', '/api/users/:id/password', ADMIN, async ({ p, b }) => {
  const t = find('users', +p.id); if (!t) fail('User not found.', 404);
  const pr = passwordProblem(String(b.password || '')); if (pr) fail(pr);
  t.pw = await makePw(b.password); return { ok: true };
});

/* school setup (admin) */
R('GET', '/api/setup', ADMIN, async ({ u }) => ({
  classes: db.classes.slice().sort(byName).map((c) => ({ ...c, students: db.users.filter((x) => x.class_id === c.id && x.role === 'student').length })),
  subjects: db.subjects.slice().sort(byName), assignments: assignments(u),
  teachers: db.users.filter((x) => x.role === 'teacher' && x.active).map((x) => pick(x, ['id', 'full_name'])).sort((a, b) => a.full_name.localeCompare(b.full_name)),
}));
R('POST', '/api/classes', ADMIN, async ({ b }) => {
  const name = text(b, 'name', { label: 'class name', required: true, max: 20 });
  if (db.classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) fail('A class with that name already exists.', 409);
  const id = nextId('classes'); db.classes.push({ id, name }); return { ok: true, id };
});
R('DELETE', '/api/classes/:id', ADMIN, async ({ p }) => { if (!find('classes', +p.id)) fail('Class not found.', 404); removeClass(+p.id); return { ok: true }; });
R('POST', '/api/subjects', ADMIN, async ({ b }) => {
  const name = text(b, 'name', { label: 'subject name', required: true, max: 40 });
  if (db.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) fail('A subject with that name already exists.', 409);
  const id = nextId('subjects'); db.subjects.push({ id, name }); return { ok: true, id };
});
R('DELETE', '/api/subjects/:id', ADMIN, async ({ p }) => { if (!find('subjects', +p.id)) fail('Subject not found.', 404); removeSubject(+p.id); return { ok: true }; });
R('POST', '/api/teaching', ADMIN, async ({ b }) => {
  const tid = int(b, 'teacher_id', { label: 'teacher' }), cid = int(b, 'class_id', { label: 'class' }), sid = int(b, 'subject_id', { label: 'subject' });
  const t = find('users', tid); if (!t || t.role !== 'teacher' || !t.active) fail('Teacher not found.');
  if (!find('classes', cid)) fail('Class not found.'); if (!find('subjects', sid)) fail('Subject not found.');
  const ex = db.teaching.find((x) => x.class_id === cid && x.subject_id === sid);
  if (ex) { ex.teacher_id = tid; db.timetable.forEach((e) => { if (e.class_id === cid && e.subject_id === sid) e.teacher_id = tid; }); }
  else db.teaching.push({ id: nextId('teaching'), teacher_id: tid, class_id: cid, subject_id: sid });
  return { ok: true };
});
R('DELETE', '/api/teaching/:id', ADMIN, async ({ p }) => {
  const row = find('teaching', +p.id); if (!row) fail('Assignment not found.', 404);
  dropWhere('timetable', (e) => e.class_id === row.class_id && e.subject_id === row.subject_id); dropWhere('teaching', (t) => t.id === row.id); return { ok: true };
});

/* students list */
R('GET', '/api/students', STAFF, async ({ q, u }) => {
  const cid = qi(q, 'class_id'); if (!cid) fail('Choose a class.');
  classAccess(u, cid);
  const allowed = u.role === 'teacher' ? teacherSubjects(u.id, cid) : null, list = students(cid), groups = {};
  db.grades.forEach((g) => { const s = find('users', g.student_id); if (s && s.class_id === cid && (!allowed || allowed.includes(g.subject_id))) push(groups, `S:${g.student_id}`, g.value); });
  const st = compute(groups);
  return { students: list.map((s) => ({ ...pick(s, ['id', 'username', 'full_name', 'email', 'phone']), mean: st[`S:${s.id}`]?.mean ?? null, grades_count: st[`S:${s.id}`]?.count || 0, attendance_rate: attSummary(s.id).rate })).sort((a, b) => a.full_name.localeCompare(b.full_name)) };
});

/* grades */
const gradeStudent = (u, q) => { const id = u.role === 'student' ? u.id : qi(q, 'student_id'); if (!id) fail('Choose a student.'); return [id, studentAccess(u, id)]; };
R('GET', '/api/grades', ANY, async ({ q, u }) => {
  const [id] = gradeStudent(u, q), sub = qi(q, 'subject_id'), qr = qi(q, 'quarter');
  return { grades: db.grades.filter((g) => g.student_id === id && (!sub || g.subject_id === sub) && (![1, 2, 3, 4].includes(qr) || g.quarter === qr)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map((g) => ({ id: g.id, value: g.value, kind: g.kind, comment: g.comment, date: g.date, quarter: g.quarter, subject_id: g.subject_id, subject_name: subjName(g.subject_id), teacher_name: userName(g.teacher_id) })) };
});
R('GET', '/api/grades/summary', ANY, async ({ q, u }) => {
  const [id, s] = gradeStudent(u, q);
  return { student: { id: s.id, full_name: s.full_name, class_name: s.class_name }, attendance: attSummary(id), ...studentSummary(id, s.class_id) };
});
function gradeInput(b) {
  const value = int(b, 'value', { lo: 1, hi: 5, label: 'grade' }), kind = String(b.kind || 'Classwork');
  if (!GRADE_KINDS.includes(kind)) fail('Choose a valid grade type.');
  const comment = text(b, 'comment', { max: 200 }), when = dt(b, 'date');
  if (when > todayISO()) fail('A grade cannot be dated in the future.');
  if (when < yearStart()) fail('The date is before the start of this school year.');
  return { value, kind, comment, date: when, quarter: quarterFor(when) };
}
R('POST', '/api/grades', STAFF, async ({ b, u }) => {
  const s = getStudent(int(b, 'student_id', { label: 'student' })), sid = int(b, 'subject_id', { label: 'subject' });
  if (!s.active) fail("This student's account is disabled.");
  const a = db.teaching.find((t) => t.class_id === s.class_id && t.subject_id === sid);
  if (!a) fail("This subject is not taught in the student's class.");
  if (u.role === 'teacher' && a.teacher_id !== u.id) fail('You do not teach this subject in this class.', 403);
  const g = { id: nextId('grades'), student_id: s.id, subject_id: sid, teacher_id: a.teacher_id, ...gradeInput(b), created_at: nowStr() };
  db.grades.push(g); return { ok: true, id: g.id };
});
const editableGrade = (id, u) => {
  const g = find('grades', id); if (!g) fail('Grade not found.', 404);
  if (u.role === 'teacher' && !teaches(u.id, find('users', g.student_id)?.class_id, g.subject_id)) fail('You do not teach this subject in this class.', 403);
  return g;
};
R('PUT', '/api/grades/:id', STAFF, async ({ p, b, u }) => { const g = editableGrade(+p.id, u); Object.assign(g, gradeInput(b)); return { ok: true }; });
R('DELETE', '/api/grades/:id', STAFF, async ({ p, u }) => { editableGrade(+p.id, u); dropWhere('grades', (g) => g.id === +p.id); return { ok: true }; });

R('GET', '/api/gradebook', STAFF, async ({ q, u }) => {
  const cid = qi(q, 'class_id'), sid = qi(q, 'subject_id'), quarter = q.has('quarter') ? Number(q.get('quarter')) : quarterFor(todayISO());
  if (!cid || !sid) fail('Choose a class and a subject.');
  classAccess(u, cid, sid);
  if (!db.teaching.some((t) => t.class_id === cid && t.subject_id === sid)) fail('This subject is not taught in this class.');
  const list = students(cid).map((s) => pick(s, ['id', 'full_name', 'username'])).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const by = Object.fromEntries(list.map((s) => [s.id, []]));
  db.grades.filter((g) => g.subject_id === sid && by[g.student_id]).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach((g) => by[g.student_id].push(pick(g, ['id', 'student_id', 'value', 'kind', 'comment', 'date', 'quarter'])));
  const groups = { ALL: [] };
  if ([1, 2, 3, 4].includes(quarter)) {
    list.forEach((s) => by[s.id].filter((g) => g.quarter === quarter).forEach((g) => { push(groups, `S:${s.id}`, g.value); groups.ALL.push(g.value); }));
    const st = compute(groups);
    list.forEach((s) => { const x = st[`S:${s.id}`]; s.grades = by[s.id].filter((g) => g.quarter === quarter); s.mean = x?.mean ?? null; s.mark = x?.mark ?? null; s.count = x?.count || 0; });
    return { mode: 'quarter', quarter, students: list, summary: st.ALL || null, engine: 'js' };
  }
  list.forEach((s) => by[s.id].forEach((g) => { push(groups, `S:${s.id}:${g.quarter}`, g.value); groups.ALL.push(g.value); }));
  const first = compute(groups), yg = {};
  Object.entries(first).forEach(([k, st]) => { if (k.startsWith('S:')) push(yg, `Y:${k.split(':')[1]}`, st.mark); });
  const year = compute(yg);
  list.forEach((s) => { s.quarters = {}; for (let i = 1; i <= 4; i++) s.quarters[i] = first[`S:${s.id}:${i}`] || null; s.year = year[`Y:${s.id}`] || null; s.count = by[s.id].length; });
  return { mode: 'year', quarter: 0, students: list, summary: first.ALL || null, engine: 'js' };
});

/* statistics */
R('GET', '/api/statistics/class', STAFF, async ({ q, u }) => {
  const cid = qi(q, 'class_id'), sid = qi(q, 'subject_id'), quarter = qi(q, 'quarter');
  if (!cid) fail('Choose a class.');
  classAccess(u, cid, sid || undefined);
  const allowed = !sid && u.role === 'teacher' ? teacherSubjects(u.id, cid) : null, groups = {};
  db.grades.forEach((g) => {
    const s = find('users', g.student_id);
    if (!s || !s.active || s.class_id !== cid || (sid && g.subject_id !== sid) || (allowed && !allowed.includes(g.subject_id)) || ([1, 2, 3, 4].includes(quarter) && g.quarter !== quarter)) return;
    push(groups, 'ALL', g.value); push(groups, `S:${s.id}`, g.value); push(groups, `J:${g.subject_id}`, g.value); push(groups, `Q:${g.quarter}`, g.value);
  });
  const st = compute(groups), list = students(cid);
  const ranking = list.filter((s) => st[`S:${s.id}`]).map((s) => ({ id: s.id, name: s.full_name, mean: st[`S:${s.id}`].mean, count: st[`S:${s.id}`].count })).sort((a, b) => b.mean - a.mean || a.name.localeCompare(b.name));
  return { summary: st.ALL || null, ranking, subjects: subjStats(st), quarters: qStats(st), attendance: classAttRates()[cid] || sumCounts({}), students: list.length, engine: 'js' };
});
R('GET', '/api/statistics/school', ADMIN, async ({ q }) => {
  const quarter = qi(q, 'quarter'), groups = {};
  db.grades.forEach((g) => {
    const s = find('users', g.student_id);
    if (!s || !s.active || ([1, 2, 3, 4].includes(quarter) && g.quarter !== quarter)) return;
    push(groups, 'ALL', g.value); push(groups, `C:${s.class_id}`, g.value); push(groups, `J:${g.subject_id}`, g.value); push(groups, `Q:${g.quarter}`, g.value);
  });
  const st = compute(groups), rates = classAttRates(), tot = { present: 0, late: 0, excused: 0, absent: 0 };
  Object.values(rates).forEach((r) => STATUSES.forEach((k) => { tot[k] += r[k]; }));
  return {
    summary: st.ALL || null, subjects: subjStats(st), quarters: qStats(st), attendance: sumCounts(tot), engine: 'js',
    classes: db.classes.slice().sort(byName).map((c) => { const x = st[`C:${c.id}`] || {}; return { ...c, students: students(c.id).length, mean: x.mean ?? null, count: x.count || 0, quality_rate: x.quality_rate ?? null, pass_rate: x.pass_rate ?? null, attendance_rate: rates[c.id]?.rate ?? null }; }),
  };
});

/* attendance */
R('GET', '/api/attendance/student', ANY, async ({ q, u }) => {
  const [id] = gradeStudent(u, q), m = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month') : todayISO().slice(0, 7);
  const rows = db.attendance.filter((a) => a.student_id === id), monthly = {};
  rows.forEach((a) => { (monthly[a.date.slice(0, 7)] ||= []).push(a); });
  return { month: m, records: rows.filter((a) => a.date.startsWith(m)).sort((a, b) => a.date.localeCompare(b.date)).map((a) => pick(a, ['date', 'status', 'note'])), summary: attSummary(id), by_month: Object.keys(monthly).sort().map((k) => ({ month: k, ...sumCounts(attCounts(monthly[k])) })) };
});
R('GET', '/api/attendance/class', STAFF, async ({ q, u }) => {
  const cid = qi(q, 'class_id'); if (!cid) fail('Choose a class.');
  classAccess(u, cid);
  const when = q.get('date') || todayISO(); dt({ date: when }, 'date', { label: 'date' });
  const list = students(cid).sort((a, b) => a.full_name.localeCompare(b.full_name)).map((s) => { const a = db.attendance.find((x) => x.student_id === s.id && x.date === when); return { id: s.id, full_name: s.full_name, status: a?.status ?? null, note: a?.note ?? null }; });
  return { date: when, students: list, is_school_day: isoWeekday(when) <= 5, marked: list.some((s) => s.status) };
});
R('POST', '/api/attendance/class', STAFF, async ({ b, u }) => {
  const cid = int(b, 'class_id', { label: 'class' }); classAccess(u, cid);
  const when = dt(b, 'date');
  if (when > todayISO()) fail('You cannot mark attendance for a future date.');
  if (isoWeekday(when) > 5) fail('School is closed on weekends.');
  if (!Array.isArray(b.records) || !b.records.length) fail('There is no attendance to save.');
  const valid = new Set(students(cid).map((s) => s.id)), recs = b.records.map((r) => {
    if (!r || typeof r !== 'object') fail('Invalid attendance record.');
    const sid = int(r, 'student_id', { label: 'student' }), status = String(r.status || '');
    if (!valid.has(sid)) fail('A student in the list is not in this class.');
    if (!STATUSES.includes(status)) fail('Invalid attendance status.');
    return { sid, status, note: text(r, 'note', { max: 200 }) };
  });
  recs.forEach(({ sid, status, note }) => {
    const ex = db.attendance.find((a) => a.student_id === sid && a.date === when);
    if (ex) Object.assign(ex, { status, note, marked_by: u.id });
    else db.attendance.push({ id: nextId('attendance'), student_id: sid, date: when, status, note, marked_by: u.id });
  });
  return { ok: true, saved: recs.length };
});

/* timetable */
R('GET', '/api/timetable', ANY, async ({ q, u }) => {
  const cid = qi(q, 'class_id'), mine = q.get('mine'), teacherMode = mine || (u.role === 'teacher' && !cid);
  let rows, title;
  if (u.role === 'student') { rows = db.timetable.filter((e) => e.class_id === u.class_id); title = `Class ${u.class_name}`; }
  else if (teacherMode) { if (u.role !== 'teacher') fail('Choose a class.'); rows = db.timetable.filter((e) => e.teacher_id === u.id); title = 'My schedule'; }
  else { if (!cid) fail('Choose a class.'); const c = find('classes', cid); if (!c) fail('Class not found.', 404); rows = db.timetable.filter((e) => e.class_id === cid); title = `Class ${c.name}`; }
  return { entries: rows.map(ttView).sort(ttSort), title, mode: u.role !== 'student' && teacherMode ? 'teacher' : 'class' };
});
R('POST', '/api/timetable', ADMIN, async ({ b }) => {
  const cid = int(b, 'class_id', { label: 'class' }), weekday = int(b, 'weekday', { lo: 1, hi: 5 }), lesson = int(b, 'lesson_no', { lo: 1, hi: 6, label: 'lesson' }), sid = int(b, 'subject_id', { label: 'subject' }), room = text(b, 'room', { max: 20 });
  const a = db.teaching.find((t) => t.class_id === cid && t.subject_id === sid);
  if (!a) fail('No teacher is assigned to this subject in this class. Add the assignment in School setup first.');
  const clash = db.timetable.find((e) => e.teacher_id === a.teacher_id && e.weekday === weekday && e.lesson_no === lesson && e.class_id !== cid);
  if (clash) fail(`That teacher already teaches class ${clsName(clash.class_id)} at this time.`, 409);
  const ex = db.timetable.find((e) => e.class_id === cid && e.weekday === weekday && e.lesson_no === lesson);
  if (ex) Object.assign(ex, { subject_id: sid, teacher_id: a.teacher_id, room });
  else db.timetable.push({ id: nextId('timetable'), class_id: cid, weekday, lesson_no: lesson, subject_id: sid, teacher_id: a.teacher_id, room });
  return { ok: true };
});
R('DELETE', '/api/timetable/:id', ADMIN, async ({ p }) => { if (!find('timetable', +p.id)) fail('Lesson not found.', 404); dropWhere('timetable', (e) => e.id === +p.id); return { ok: true }; });

/* homework */
R('GET', '/api/homework', ANY, async ({ q, u }) => {
  let rows = db.homework; const cid = qi(q, 'class_id');
  if (u.role === 'student') rows = rows.filter((h) => h.class_id === u.class_id);
  else { if (u.role === 'teacher') rows = rows.filter((h) => h.teacher_id === u.id); if (cid) rows = rows.filter((h) => h.class_id === cid); }
  return { homework: rows.slice().sort((a, b) => b.due_date.localeCompare(a.due_date) || b.id - a.id).map((h) => hwView(h, u)), today: todayISO() };
});
function hwInput(b, u) {
  const cid = int(b, 'class_id', { label: 'class' }), sid = int(b, 'subject_id', { label: 'subject' }), a = db.teaching.find((t) => t.class_id === cid && t.subject_id === sid);
  if (!a) fail('This subject is not taught in that class.');
  if (u.role === 'teacher' && a.teacher_id !== u.id) fail('You do not teach this subject in this class.', 403);
  return { class_id: cid, subject_id: sid, teacher_id: a.teacher_id, title: text(b, 'title', { min: 3, max: 120, required: true }), description: text(b, 'description', { max: 1500 }), due_date: dt(b, 'due_date', { label: 'due date' }) };
}
const editableHw = (id, u) => { const h = find('homework', id); if (!h) fail('Homework not found.', 404); if (u.role === 'teacher' && h.teacher_id !== u.id) fail('You can only change your own homework.', 403); return h; };
R('POST', '/api/homework', STAFF, async ({ b, u }) => { const h = { id: nextId('homework'), ...hwInput(b, u), created_at: nowStr() }; db.homework.push(h); return { ok: true, id: h.id }; });
R('PUT', '/api/homework/:id', STAFF, async ({ p, b, u }) => { const h = editableHw(+p.id, u); Object.assign(h, hwInput(b, u)); return { ok: true }; });
R('DELETE', '/api/homework/:id', STAFF, async ({ p, u }) => { editableHw(+p.id, u); dropWhere('homework', (h) => h.id === +p.id); dropWhere('homework_status', (s) => s.homework_id === +p.id); return { ok: true }; });
R('POST', '/api/homework/:id/done', ['student'], async ({ p, b, u }) => {
  const h = find('homework', +p.id); if (!h || h.class_id !== u.class_id) fail('Homework not found.', 404);
  const done = b.done ? 1 : 0, ex = db.homework_status.find((s) => s.homework_id === h.id && s.student_id === u.id), at = done ? nowStr() : null;
  if (ex) Object.assign(ex, { done, done_at: at }); else db.homework_status.push({ homework_id: h.id, student_id: u.id, done, done_at: at });
  return { ok: true, done: !!done };
});
R('GET', '/api/homework/:id/progress', STAFF, async ({ p, u }) => {
  const h = editableHw(+p.id, u);
  return { title: h.title, students: students(h.class_id).sort((a, b) => a.full_name.localeCompare(b.full_name)).map((s) => { const x = db.homework_status.find((v) => v.homework_id === h.id && v.student_id === s.id); return { id: s.id, full_name: s.full_name, done: x?.done || 0, done_at: x?.done_at ?? null }; }) };
});

/* announcements */
function annInput(b, u) {
  const title = text(b, 'title', { min: 3, max: 120, required: true }), body = text(b, 'body', { min: 3, max: 3000, required: true }), audience = String(b.audience || 'all');
  if (!(u.role === 'admin' ? ['all', 'students', 'teachers'] : ['all', 'students']).includes(audience)) fail('You cannot post to that audience.');
  return { title, body, audience, pinned: u.role === 'admin' && b.pinned ? 1 : 0 };
}
const editableAnn = (id, u) => { const a = find('announcements', id); if (!a) fail('Announcement not found.', 404); if (u.role === 'teacher' && a.author_id !== u.id) fail('You can only change your own announcements.', 403); return a; };
R('GET', '/api/announcements', ANY, async ({ u }) => ({ announcements: announcementsFor(u) }));
R('POST', '/api/announcements', STAFF, async ({ b, u }) => { const a = { id: nextId('announcements'), ...annInput(b, u), author_id: u.id, created_at: nowStr() }; db.announcements.push(a); return { ok: true, id: a.id }; });
R('PUT', '/api/announcements/:id', STAFF, async ({ p, b, u }) => {
  const a = editableAnn(+p.id, u), v = annInput(b, u);
  if (u.role === 'teacher') delete v.pinned; Object.assign(a, v); return { ok: true };
});
R('DELETE', '/api/announcements/:id', STAFF, async ({ p, u }) => { editableAnn(+p.id, u); dropWhere('announcements', (a) => a.id === +p.id); return { ok: true }; });

/* ---------- public entry point (same signature as the old fetch-based api()) ---------- */
window.api = async function api(path, { method = 'GET', body } = {}) {
  await ready;
  const [p, qs] = path.split('?'), q = new URLSearchParams(qs || '');
  const route = routes.map((r) => ({ r, m: p.match(r.re) })).find((x) => x.r.m === method && x.m);
  try {
    if (!route) fail('Not found.', 404);
    const user = me();
    if (route.r.roles) {
      if (!user) fail('Please log in to continue.', 401);
      if (route.r.roles.length && !route.r.roles.includes(user.role)) fail('You do not have permission to do that.', 403);
    }
    const out = await route.r.fn({ p: route.m.groups || {}, q, b: body ? JSON.parse(JSON.stringify(body)) : {}, u: user });
    if (method !== 'GET') save();
    return JSON.parse(JSON.stringify(out));
  } catch (e) {
    if (!(e instanceof ApiError)) { console.error(e); throw new Error('Something went wrong.'); }
    if (e.status === 401 && !path.startsWith('/api/login')) { location.href = 'login.html'; throw new Error('Your session has ended. Please log in again.'); }
    throw new Error(e.message);
  }
};
window.WM = {
  isLoggedIn: async () => { await ready; return !!me(); },
  reset: () => { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); location.href = 'login.html'; },
  exportJSON: async () => { await ready; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' })); a.download = 'wmaktab-db.json'; a.click(); },
};
})();
