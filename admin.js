// BASED admin console. Everything a member wrote is escaped before it reaches the page
// (see html`` below), so nothing in member data can run here.
'use strict';

const SUPABASE_URL = 'https://okubbpsvaogqzdtajiqz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdWJicHN2YW9ncXpkdGFqaXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTYwMTQsImV4cCI6MjA5Njg3MjAxNH0.IpsSIU3C9JOJC5JDS7-WlzrOy1QnSxWiPEy6LMLYEoA';
const ACTIONS_URL = SUPABASE_URL + '/functions/v1/admin-actions';
const OPEN_AREA_URL = SUPABASE_URL + '/functions/v1/open-area';
const IDLE_LIMIT = 30 * 60 * 1000;          // signed out after 30 minutes without activity
const ABSOLUTE_LIMIT = 12 * 60 * 60 * 1000; // and after 12 hours whatever happens

// Sign-in is kept for this browser tab only (closing the tab signs you out)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, storageKey: 'based-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

let me = null; // { label, role }
const $ = (id) => document.getElementById(id);

// ─── Safe HTML ──────────────────────────────────────────────────────────────
class Raw { constructor(s) { this.s = s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
function fmt(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
function html(strings, ...vals) { return raw(strings.reduce((a, s, i) => a + s + (i < vals.length ? fmt(vals[i]) : ''), '')); }
function setMain(h) { $('main').innerHTML = h.s; }

const when = (d) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const day = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const yesno = (b) => b ? 'Yes' : 'No';
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
const memberLink = (id, name) => id ? html`<a href="#member/${id}">${name || 'Deleted member'}</a>` : html`<span class="muted">${name || 'Deleted member'}</span>`;
function statusBadge(s) {
  if (s === 'banned') return html`<span class="badge red">Banned</span>`;
  if (s === 'suspended') return html`<span class="badge amber">Suspended</span>`;
  if (s === 'active') return html`<span class="badge green">Active</span>`;
  return html`<span class="badge">${s || '—'}</span>`;
}

function toast(msg, bad = false) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, bad ? 6000 : 3500);
}

const MESSAGES = {
  NOT_ADMIN: 'This account is not an admin.',
  NOT_SIGNED_IN: 'Your sign-in has ended. Please sign in again.',
  MFA_REQUIRED: 'Please enter your authenticator code.',
  FRESH_MFA_REQUIRED: 'Please enter your authenticator code again.',
  ROLE_NOT_ALLOWED: 'Your admin role can’t do this.',
  REASON_REQUIRED: 'Please give a reason (at least 3 characters).',
  MESSAGE_REQUIRED: 'Please write the message to the member (at least 10 characters).',
  ALREADY_BANNED: 'This member is already banned.',
  NOT_SUSPENDED: 'This member isn’t suspended or banned.',
  BAD_DAYS: 'Choose how long the suspension lasts.',
  PHOTO_NOT_FOUND: 'That photo is no longer on their profile.',
  NAME_INVALID: 'Names can use letters, numbers, spaces, hyphens, apostrophes and full stops, must start with a letter, and be 40 characters or fewer.',
  BAD_DOB: 'Enter the date of birth as a date.',
  DOB_UNDERAGE: 'That date of birth makes them under 18.',
  DOB_LOCKED: 'This date of birth came from their ID. Only an owner can change it.',
  NOTHING_TO_CHANGE: 'Nothing was changed.',
  CONFIRM_NAME: 'Type the member’s name exactly as shown to confirm.',
  REPORT_CLOSED: 'This report has already been decided.',
  REPORT_NOT_FOUND: 'Report not found.',
  MEMBER_NOT_FOUND: 'Member not found — the account may have been deleted.',
  SESSION_NOT_FOUND: 'That check isn’t on this member’s account.',
  NOT_OPEN: 'This request has already been dealt with.',
  REASON_REQUIRED: 'Please write a note to the member.',
  NOT_HELD: 'This check isn’t waiting for a hand approval (it may already have been dealt with).',
  DIDIT_NOT_APPROVED: 'Didit hasn’t passed this check, so it can’t be approved here. Review it in the Didit console first.',
  NO_DOB_ON_ID: 'No date of birth could be found on this check, so it can’t be approved. Use “Let them redo a check”.',
  UNDER_18: 'The date of birth on this ID is under 18. Don’t approve.',
  DIDIT_UNAVAILABLE: 'Couldn’t reach Didit. Please try again shortly.',
  SEND_FAILED: 'The request was recorded but sending didn’t start. It shows under Data requests.',
  TRY_AGAIN: 'Couldn’t check your admin access just now. Please try again.',
  COUNT_CHANGED: 'The number of members in this group has changed since you checked. Check again, then send.',
  NO_RECIPIENTS: 'Nobody matches this group.',
  TITLE_REQUIRED: 'Add a title.',
  WORD_EMPTY: 'Type a word or phrase to add.',
  WORD_INVALID: 'Use only letters, numbers, spaces, hyphens and apostrophes (up to 40 characters), starting and ending with a letter or number.',
  WORD_EXISTS: 'That word is already on the list.',
  WORD_NOT_FOUND: 'That word isn’t on the list (someone may have just removed it).',
  REASON_REQUIRED: 'Add a reason.',
  ALREADY_OPEN: 'That area is already open.',
  AREA_NOT_FOUND: 'That area doesn’t exist any more.',
  ROLE_NOT_ALLOWED: 'Your admin role can’t do this.',
};
function errorText(e) {
  const m = String(e?.message || e || '');
  for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k];
  const own = m.match(/^[A-Z_]+: (.+)$/s);   // errors that carry their own explanation
  if (own) return own[1];
  return 'Something went wrong: ' + m.slice(0, 200);
}

// ─── Screens and sign-in ────────────────────────────────────────────────────
function show(id) {
  for (const s of ['boot', 'scr-signin', 'scr-forgot', 'scr-newpass', 'scr-enrol', 'scr-mfa', 'scr-app']) $(s).hidden = s !== id;
}

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args || {});
  if (error) {
    if (/MFA_REQUIRED|NOT_ADMIN/.test(error.message || '')) { gate(); }
    throw new Error(error.message || 'error');
  }
  return data;
}

async function signOut(note) {
  try { await Promise.race([sb.auth.signOut(), new Promise((r) => setTimeout(r, 3000))]); } catch (_) { /* ignore */ }
  try { for (const k of Object.keys(sessionStorage)) sessionStorage.removeItem(k); } catch (_) { /* ignore */ }
  me = null;
  $('si-pass').value = '';
  $('si-err').textContent = note || '';
  location.hash = '';
  show('scr-signin');
}

// Decides which screen to show: sign in → set up authenticator → enter code → console
async function gate() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('scr-signin');
  const at = Number(sessionStorage.getItem('based-admin-at') || 0);
  if (!at || Date.now() - at > ABSOLUTE_LIMIT) return signOut('Signed out after 12 hours. Please sign in again.');
  let who;
  try { who = await sb.rpc('admin_whoami'); } catch (e) { who = { error: e }; }
  if (who.error) return signOut('Couldn’t check your admin access. Please try again.');
  if (!who.data?.admin) return signOut('This account is not an admin.');
  me = { label: who.data.label, role: who.data.role };
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') { startApp(); return; }
  const { data: f } = await sb.auth.mfa.listFactors();
  const verified = (f?.totp || []).filter((x) => x.status === 'verified');
  if (verified.length) { show('scr-mfa'); $('mfa-err').textContent = ''; $('mfa-code').value = ''; $('mfa-code').focus(); return; }
  await startEnrol(f);
}

async function startEnrol(f) {
  show('scr-enrol'); $('enrol-err').textContent = ''; $('enrol-qr').textContent = '';
  // Clear any half-finished set-up first
  for (const x of (f?.all || [])) if (x.status !== 'verified') { try { await sb.auth.mfa.unenroll({ factorId: x.id }); } catch (_) { /* ignore */ } }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BASED admin' });
  if (error) { $('enrol-err').textContent = 'Couldn’t start set-up: ' + error.message; return; }
  $('f-enrol').dataset.factor = data.id;
  const img = document.createElement('img');
  img.alt = 'QR code for your authenticator app';
  if (String(data.totp.qr_code).startsWith('data:image/svg+xml')) img.src = data.totp.qr_code;
  $('enrol-qr').appendChild(img);
  $('enrol-secret').textContent = data.totp.secret;
  $('enrol-code').value = ''; $('enrol-code').focus();
}

async function verifyCode(code) {
  const { data: f } = await sb.auth.mfa.listFactors();
  const factor = (f?.totp || []).find((x) => x.status === 'verified');
  if (!factor) throw new Error('No authenticator set up');
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) throw error;
}

$('f-signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; $('si-err').textContent = ''; $('si-ok').textContent = '';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: $('si-email').value.trim(), password: $('si-pass').value });
    $('si-pass').value = '';
    if (error) { $('si-err').textContent = error.status === 429 ? 'Too many attempts. Please wait a few minutes.' : 'Email or password is incorrect.'; return; }
    sessionStorage.setItem('based-admin-at', String(Date.now()));
    await gate();
  } finally { btn.disabled = false; }
});

$('f-enrol').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('enrol-code').value.trim();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: $('f-enrol').dataset.factor, code });
  if (error) { $('enrol-err').textContent = 'That code didn’t work. Check the time on your phone is correct and try the next code.'; return; }
  await gate();
});

$('f-mfa').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await verifyCode($('mfa-code').value.trim()); await gate(); }
  catch (_) { $('mfa-err').textContent = 'That code didn’t work. Try the next one.'; }
});

// ─── Idle and absolute time-outs ────────────────────────────────────────────
let lastActive = Date.now();
for (const ev of ['click', 'keydown', 'mousemove', 'touchstart', 'scroll']) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
setInterval(async () => {
  if (!me) return;
  if (Date.now() - lastActive > IDLE_LIMIT) return signOut('Signed out after 30 minutes without activity.');
  const at = Number(sessionStorage.getItem('based-admin-at') || 0);
  if (Date.now() - at > ABSOLUTE_LIMIT) return signOut('Signed out after 12 hours. Please sign in again.');
}, 30000);

// ─── Dialog ─────────────────────────────────────────────────────────────────
// ask({ title, body: html``, ok, danger, run }) resolves with run()'s result (or the form values), or null if cancelled.
// Each dialog is its own element, so one can open on top of another (e.g. the code prompt).
function ask({ title, body, ok = 'Confirm', danger = false, run }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = html`<form method="dialog"><h2></h2><div class="dlg-body">${body || ''}</div><p class="err" role="alert"></p>
      <div class="row end"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="submit" data-ok>${ok}</button></div></form>`.s;
    dlg.querySelector('h2').textContent = title;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form'), okBtn = dlg.querySelector('[data-ok]'), errEl = dlg.querySelector('.err');
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[data-cancel]').onclick = () => done(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vals = {};
      for (const el of form.querySelectorAll('[name]')) vals[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      if (!run) return done(vals);
      okBtn.disabled = true; errEl.textContent = '';
      try { const r = await run(vals); done(r ?? vals); }
      catch (err) { if (String(err && err.message) !== 'Cancelled') errEl.textContent = errorText(err); okBtn.disabled = false; }
    });
    dlg.showModal();
    const first = form.querySelector('input:not([type=checkbox]):not([type=hidden]),select,textarea');
    if (first) first.focus();
  });
}
const reasonField = (label = 'Reason (kept in the audit log)') => html`<label>${label}<textarea name="reason" required minlength="3" maxlength="1000"></textarea></label>`;

// Asks for the authenticator code again (for higher-risk actions)
async function stepUp() {
  const r = await ask({
    title: 'Confirm it’s you', ok: 'Continue',
    body: html`<p class="muted">Enter a code from your authenticator app to carry on.</p><label>6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>`,
    run: async (v) => { await verifyCode(String(v.code).trim()); return true; },
  });
  return !!r;
}

// Calls the admin-actions server function; asks for the code again if it needs it
async function act(action, body, retried = false, url = ACTIONS_URL) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { signOut('Your sign-in has ended.'); throw new Error('NOT_SIGNED_IN'); }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json().catch(() => ({ error: 'FAILED', detail: 'HTTP ' + r.status }));
  if (d.error === 'FRESH_MFA_REQUIRED' && !retried) {
    if (await stepUp()) return act(action, body, true, url);
    throw new Error('Cancelled');
  }
  if (d.error === 'MFA_REQUIRED' || d.error === 'NOT_SIGNED_IN') { gate(); }
  if (d.error) throw new Error(d.error + (d.detail ? ': ' + d.detail : ''));
  return d;
}

function reportOutcome(d, okText) {
  const w = (d && d.warnings) || [];
  if (w.length) {
    ask({ title: 'Done, but some steps need a look', ok: 'OK', body: html`<p class="muted">The main action worked. These were also emailed to alerts@:</p><ul>${w.map((x) => html`<li>${x}</li>`)}</ul>` });
  } else toast(okText + (d && d.emailed === false ? ' (no email sent)' : ''));
}

// ─── Router ─────────────────────────────────────────────────────────────────
function startApp() {
  show('scr-app');
  // "Leaving" page link (added here so the menu needn't change in index.html)
  if (!document.querySelector('#nav a[data-nav=leaving]')) {
    const l = document.createElement('a'); l.href = '#leaving'; l.dataset.nav = 'leaving'; l.textContent = 'Leaving';
    const after = document.querySelector('#nav a[data-nav=reports]');
    if (after) after.after(l); else $('nav').appendChild(l);
  }
  // "Corrections" page link, after Data requests
  if (!document.querySelector('#nav a[data-nav=corrections]')) {
    const l = document.createElement('a'); l.href = '#corrections'; l.dataset.nav = 'corrections'; l.textContent = 'Corrections';
    const after = document.querySelector('#nav a[data-nav=requests]') || document.querySelector('#nav a[data-nav=leaving]');
    if (after) after.after(l); else $('nav').appendChild(l);
  }
  $('who').textContent = `${me.label} · ${me.role}`;
  if (!location.hash || location.hash === '#') location.hash = '#home'; else route();
}
addEventListener('hashchange', () => { if (me) route(); });

// One page load at a time, in order, so a slower earlier load can't overwrite a newer page
let routeChain = Promise.resolve();
function route() { routeChain = routeChain.then(routeNow, routeNow); return routeChain; }
async function routeNow() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  const [page, id] = path.split('/');
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.nav === page || (page === 'member' && a.dataset.nav === 'members') || (page === 'report' && a.dataset.nav === 'reports') || (page === 'advert' && a.dataset.nav === 'adverts'));
  setMain(html`<p class="muted">Loading…</p>`);
  try {
    if (page === 'home') await pageHome();
    else if (page === 'members') await pageMembers(params.get('q') || '');
    else if (page === 'member' && isUuid(id)) await pageMember(id);
    else if (page === 'reports') await pageReports(params.get('s') || 'open');
    else if (page === 'leaving') await pageLeaving(params.get('d') || '90', params.get('t') === '1');
    else if (page === 'report' && isUuid(id)) await pageReport(id);
    else if (page === 'requests') await pageRequests();
    else if (page === 'corrections') await pageCorrections(params.get('s') || 'open');
    else if (page === 'audit') await pageAudit(params.get('t') || '');
    else if (page === 'messages') await pageMessages();
    else if (page === 'words') await pageWords(params.get('q') || '');
    else if (page === 'names') await pageNames();
    else if (page === 'questions') await pageQuestions();
    else if (page === 'extras') await pageExtras();
    else if (page === 'referrals') await pageReferrals(params.get('c') || '');
    else if (page === 'areas') await pageAreas();
    else if (page === 'offers') await pageOffers();
    else if (page === 'adverts') await pageAdverts();
    else if (page === 'advert' && id) await pageAdvert(id);
    else if (page === 'plans') await pagePlans();
    else if (page === 'countries') await pageCountries();
    else if (page === 'tests') await pageTests();
    else if (page === 'legal') await pageLegal();
    else location.hash = '#home';
  } catch (e) {
    setMain(html`<div class="card"><h2>Couldn’t load this page</h2><p class="err">${errorText(e)}</p><button class="btn" data-act="reload">Try again</button></div>`);
  }
  $('main').focus();
}
const can = (roles) => me && (me.role === 'owner' || roles.includes(me.role));

// ─── Home ───────────────────────────────────────────────────────────────────
async function pageHome() {
  const [h, alerts] = await Promise.all([rpc('admin_home'), rpc('admin_alerts')]);
  const tile = (n, label, href, level) => html`<a class="tile ${n > 0 ? level : ''}" href="${href}"><b>${n ?? '—'}</b><span>${label}</span></a>`;
  alerts.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  setMain(html`
    <h1>Home</h1>
    <h3>Needs attention</h3>
    <div class="tiles">
      ${tile(h.urgent_reports, 'Possible under-18 reports', '#reports', 'hot')}
      ${tile(h.open_reports, 'Open reports', '#reports', 'warn')}
      ${tile(h.escalated, 'Escalated reports', '#reports', 'warn')}
      ${tile(h.alerts_unsent, 'Report alerts not emailed', '#reports', 'hot')}
      ${tile(h.corrections_due, 'Corrections due within a week', '#corrections', 'hot')}
      ${tile(h.corrections_open, 'Correction requests open', '#corrections', 'warn')}
      ${tile(h.sar_held, 'Data requests waiting', '#requests', 'warn')}
      ${tile(h.sar_failed, 'Data requests failed', '#requests', 'hot')}
      ${tile(h.sar_bounced, 'Data emails bounced', '#requests', 'hot')}
      ${tile(h.verify_review, 'Checks in manual review', '#members', 'warn')}
      ${tile(h.past_due, 'Payments past due', '#members', 'warn')}
      ${tile(h.cron_failures, 'Scheduled job failures (7 days)', '#home', 'hot')}
    </div>
    <h3>Overview</h3>
    <div class="tiles">
      ${tile(h.members, 'Members', '#members')}${tile(h.active_7d, 'Signed in, last 7 days', '#members')}
      ${tile(h.new_7d, 'Joined, last 7 days', '#members')}${tile(h.paying, 'Paying', '#members')}
      ${tile(h.suspended, 'Suspended', '#members')}${tile(h.banned, 'Banned', '#members')}
    </div>
    <h3>Alerts</h3>
    ${alerts.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>What</th><th></th></tr>
      ${alerts.slice(0, 100).map((a) => html`<tr><td>${when(a.at)}</td><td>${a.text}</td><td>${/^(report\/[0-9a-f-]{36}|requests|home)$/.test(a.link) ? html`<a href="#${a.link}">Open</a>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">Nothing needs a look.</p>`}`);
}

// ─── Members ────────────────────────────────────────────────────────────────
async function pageMembers(q) {
  const rows = q.trim().length >= 2 ? await rpc('admin_search', { p_q: q }) : null;
  setMain(html`
    <h1>Members</h1>
    <form class="searchbar" id="f-search"><input id="q" placeholder="Name, email, member ID, Stripe ID or Didit session ID" value="${q}" aria-label="Search members"><button class="btn primary">Search</button></form>
    ${rows === null ? html`<p class="muted">Type at least 2 characters.</p>` : rows.length ? html`<div class="tablewrap"><table>
      <tr><th>Name</th><th>Email</th><th>Age</th><th>Country</th><th>Plan</th><th>Status</th></tr>
      ${rows.map((r) => html`<tr class="click" data-go="#member/${r.id}"><td><a href="#member/${r.id}">${r.name || '(no name)'}</a> ${r.verified ? html`<span class="badge blue">Verified</span>` : ''} ${r.test ? html`<span class="badge">Test</span>` : ''}</td>
        <td>${r.email}</td><td>${r.age}</td><td>${r.country}</td><td>${r.tier || 'none'}</td><td>${statusBadge(r.status)}</td></tr>`)}
    </table></div>${rows.length === 50 ? html`<p class="muted small">Showing the first 50. Narrow the search to see others.</p>` : ''}` : html`<p class="muted">No members match.</p>`}`);
  $('f-search').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#members?q=' + encodeURIComponent($('q').value.trim()); });
  if (!q) $('q').focus();
}

let current = null; // the member or report on screen
async function pageMember(id) {
  const m = await rpc('admin_member', { p_uid: id });
  current = { kind: 'member', id, m };
  const s = m.summary, c = m.checks, pl = m.plan, act = m.activity;
  const buttons = memberActions(s).filter((x) => x.show !== false && can(x.roles));
  setMain(html`
    <p><a href="#members">← Members</a></p>
    <div class="row"><h1>${s.name || '(no name)'}</h1>${statusBadge(s.status)}${c.verification === 'approved' ? html`<span class="badge blue">Verified</span>` : ''}${s.test ? html`<span class="badge">Test account</span>` : ''}${s.hidden ? html`<span class="badge">Hidden</span>` : ''}</div>
    ${s.status !== 'active' ? html`<div class="note-box">${s.status === 'suspended' ? (s.suspended_until ? `Suspended until ${when(s.suspended_until)}` : 'Suspended until further notice') : 'Banned'}${s.status_reason ? ' — ' + s.status_reason : ''}</div>` : ''}
    <div class="grid2"><div class="stack">
      <div class="card"><h3>Account</h3><dl class="kv">
        <dt>Email</dt><dd>${s.email}</dd><dt>Member ID</dt><dd><code>${s.id}</code></dd>
        <dt>Age</dt><dd>${s.age} (born ${day(s.dob)}${s.dob_changes ? ', changed once' : ''})</dd><dt>Sex</dt><dd>${s.sex || '—'}</dd>
        <dt>Location</dt><dd>${s.location || '—'}, ${s.country || ''}</dd><dt>Religion</dt><dd>${s.religion || '—'}</dd>
        <dt>Joined</dt><dd>${when(s.joined)}</dd><dt>Last sign-in</dt><dd>${when(s.last_sign_in)}</dd>
        <dt>Saved intro</dt><dd class="pre">${s.saved_intro || '—'}</dd>
      </dl></div>
      <div class="card"><h3>Photos</h3>
        <p class="muted small">${(m.photos.paths || []).length} photo(s). Opening them is logged.</p>
        <div id="photos" class="photos"></div>
        <button class="btn" data-act="reveal">Show photos</button>
      </div>
      <div class="card"><h3>Checks</h3><dl class="kv">
        <dt>ID check</dt><dd>${c.verification}${c.issue ? html` <span class="badge red">${ISSUE_TEXT[c.issue] || c.issue}</span>` : ''} ${c.verified_at ? '· ' + day(c.verified_at) : ''}
          ${c.verification === 'in_review' && HELD_ISSUES.includes(c.issue) && can([]) ? html`<button class="btn small" data-act="approve-id" style="margin-left:6px">Approve by hand</button>` : ''}</dd>
        <dt>Selfie age check</dt><dd>${c.age_check} ${c.age_checked_at ? '· ' + day(c.age_checked_at) : ''}</dd></dl>
        ${c.sessions.length ? html`<table class="mt"><tr><th>Didit session</th><th>Kind</th><th>Status</th><th>Started</th><th></th></tr>
          ${c.sessions.map((x) => html`<tr><td><code>${x.id}</code></td><td>${x.kind}</td><td>${x.status}</td><td>${when(x.at)}</td><td>${can([]) ? html`<button class="btn small" data-act="recheck" data-session="${x.id}">Re-check with Didit</button>` : ''}</td></tr>`)}</table>` : ''}
      </div>
      <div class="card"><h3>Plan</h3><dl class="kv">
        <dt>Plan</dt><dd>${pl.tier || 'none'} ${pl.status ? '· ' + pl.status : ''}</dd><dt>Renews / ends</dt><dd>${when(pl.expires)}${pl.cancel_at ? ' · cancels ' + day(pl.cancel_at) : ''}</dd>
        <dt>Stripe customer</dt><dd>${pl.customer ? html`<code>${pl.customer}</code>` : '—'}</dd><dt>Subscription</dt><dd>${pl.subscription ? html`<code>${pl.subscription}</code>` : '—'}</dd>
        <dt>Terms agreed</dt><dd>${when(m.agreements.terms)}</dd><dt>Special data consent</dt><dd>${when(m.agreements.special)}</dd><dt>Marketing</dt><dd>${yesno(m.agreements.marketing)}</dd>
      </dl></div>
      <div class="card"><h3>Activity</h3><dl class="kv">
        <dt>Interest sent / received</dt><dd>${act.interest_sent} / ${act.interest_received}</dd><dt>Matches</dt><dd>${act.matches}</dd>
        <dt>Conversations</dt><dd>${act.conversations} (${act.messages_sent} messages sent)</dd><dt>Profiles viewed / views received</dt><dd>${act.views_made} / ${act.views_received}</dd>
        <dt>Hidden or reported others</dt><dd>${act.blocks_made}</dd></dl></div>
      <div class="card"><h3>Reports about them (${m.reports_about.length})</h3>${listReports(m.reports_about, 'by')}</div>
      <div class="card"><h3>Reports they made (${m.reports_made.length})</h3>${listReports(m.reports_made, 'about')}</div>
      <div class="card"><h3>Data requests</h3>${m.requests.length ? html`<ul class="list">${m.requests.map((q) => html`<li>${when(q.at)} · ${q.status}${q.delivery ? ' · ' + q.delivery : ''}${q.note ? html` <span class="muted small">— ${q.note}</span>` : ''}</li>`)}</ul>` : html`<p class="muted">None.</p>`}</div>
    </div><div class="stack">
      <div class="card actions"><h3>Actions</h3>${buttons.map((b) => html`<button class="btn ${b.danger ? 'danger' : ''}" data-act="member-action" data-k="${b.k}">${b.label}</button>`)}
        ${buttons.length ? '' : html`<p class="muted">No actions for your role.</p>`}</div>
      <div class="card"><h3>Notes (staff only)</h3>
        <form id="f-note"><textarea id="note" maxlength="2000" placeholder="Add a note — included in the member’s data copy if they ask"></textarea><div class="row end"><button class="btn">Add note</button></div></form>
        ${m.notes.length ? html`<ul class="list">${m.notes.map((n) => html`<li><span class="pre">${n.note}</span><br><span class="muted small">${n.by} · ${when(n.at)}</span></li>`)}</ul>` : ''}</div>
      <div class="card"><h3>Notices sent</h3>${m.notices.length ? html`<ul class="list">${m.notices.map((n) => html`<li>${n.title}<br><span class="muted small">${when(n.at)} · ${n.read ? 'read ' + when(n.read) : 'not read yet'}</span></li>`)}</ul>` : html`<p class="muted">None.</p>`}</div>
      <div class="card"><h3>Admin history</h3>${m.history.length ? html`<ul class="list">${m.history.map((x) => html`<li>${x.action}${x.reason ? ' — ' + x.reason : ''}<br><span class="muted small">${x.by} · ${when(x.at)}</span></li>`)}</ul>` : html`<p class="muted">None.</p>`}
        <p><a href="#audit?t=${s.id}">Full audit log for this member</a></p></div>
    </div></div>`);
  $('f-note').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('note').value.trim(); if (!note) return;
    try { await rpc('admin_add_note', { p_uid: id, p_note: note }); toast('Note added'); route(); } catch (err) { toast(errorText(err), true); }
  });
}
function listReports(list, who) {
  if (!list.length) return html`<p class="muted">None.</p>`;
  return html`<ul class="list">${list.map((r) => html`<li><a href="#report/${r.id}">${r.reason}</a> · ${r.status}${r.decision ? ' (' + r.decision + ')' : ''} · ${who === 'by' ? 'by' : 'about'} ${r[who] || 'Deleted member'}<br><span class="muted small">${when(r.at)}</span></li>`)}</ul>`;
}

function memberActions(s) {
  return [
    { k: 'message', label: 'Send a message', roles: ['support', 'moderator'] },
    { k: 'warn', label: 'Send a warning', roles: ['moderator'] },
    { k: 'suspend', label: s.status === 'suspended' ? 'Change suspension' : 'Suspend', roles: ['moderator'], show: s.status !== 'banned' },
    { k: 'lift', label: s.status === 'banned' ? 'Undo ban' : 'Lift suspension', roles: s.status === 'banned' ? [] : ['moderator'], show: s.status !== 'active' },
    { k: 'ban', label: 'Ban', roles: [], show: s.status !== 'banned', danger: true },
    { k: 'clear_text', label: 'Remove intro or change name', roles: ['moderator'] },
    { k: 'correct_details', label: 'Correct details', roles: ['support'] },
    { k: 'reset_verification', label: 'Let them redo a check', roles: ['support'] },
    { k: 'sign_out_everywhere', label: 'Sign out everywhere', roles: ['support'] },
    { k: 'resend_email', label: 'Resend an email', roles: ['support'] },
    { k: 'send_data', label: 'Send them a copy of their data', roles: ['support'] },
    { k: 'mark_test', label: s.test ? 'Unmark as test account' : 'Mark as test account', roles: [] },
    { k: 'delete_account', label: 'Delete account', roles: [], danger: true },
  ];
}

const SUSPEND_FIELDS = html`<label>How long<select name="days"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="">Until further notice</option></select></label>
  <label>Message to include in their email (optional)<textarea name="message" maxlength="2000"></textarea></label>
  <p class="muted small">They’re signed out and can’t sign in, their profile is hidden and any paid plan is paused (no charges) until it ends.</p>`;
const WARN_FIELDS = html`<label>Title<input name="title" maxlength="120" value="A message from the BASED team"></label>
  <label>Message to the member (shown in the app and emailed)<textarea name="message" required minlength="10" maxlength="2000"></textarea></label>`;
const BAN_FIELDS = html`<p class="muted small">They’re signed out for good, their profile is hidden, any paid plan is cancelled and their email can’t be used to join again.</p>
  <label><input type="checkbox" name="block_face" checked> Also block their face at Didit, so they can’t verify a new account</label>`;

function memberActionSpec(k, s) {
  switch (k) {
    case 'message': return { title: `Message ${s.name}`, ok: 'Send', body: html`<label>Title<input name="title" maxlength="120" value="A message from the BASED team"></label>
      <label>Message<textarea name="message" required minlength="10" maxlength="4000" placeholder="Hi is added for you. Leave a blank line between paragraphs."></textarea></label>
      <label>Send as<select name="channel"><option value="both">In the app and by email</option><option value="app">In the app only</option><option value="email">Email only</option></select></label>` };
    case 'warn': return { title: `Warn ${s.name}`, body: WARN_FIELDS };
    case 'suspend': return { title: `Suspend ${s.name}`, body: SUSPEND_FIELDS, ok: 'Suspend', danger: true };
    case 'lift': return { title: s.status === 'banned' ? `Undo the ban on ${s.name}` : `Lift ${s.name}’s suspension`, body: html`<p class="muted small">They can sign in again and their profile goes back to how it was.${s.status === 'banned' ? ' Their email and face are unblocked. A cancelled plan is not restarted.' : ' A paused plan restarts.'}</p>`, ok: 'Reinstate' };
    case 'ban': return { title: `Ban ${s.name}`, body: BAN_FIELDS, ok: 'Ban', danger: true };
    case 'clear_text': return { title: 'Remove intro or change name', body: html`<label>What<select name="field"><option value="intro">Remove their saved intro message</option><option value="name">Change their display name</option></select></label><label>New name (only if changing the name)<input name="new_name" maxlength="40"></label>` };
    case 'correct_details': return { title: 'Correct details', body: html`<p class="muted small">Leave blank anything that stays the same.</p><label>Date of birth<input type="date" name="dob"></label><label>Sex<select name="sex"><option value="">No change</option><option value="female">Female</option><option value="male">Male</option></select></label><label>Name<input name="name" maxlength="40"></label>` };
    case 'reset_verification': return { title: 'Let them redo a check', body: html`<label>Which check<select name="which"><option value="id">ID check</option><option value="age">Selfie age check</option></select></label><p class="muted small">Clears the result so they can take the check again in the app.</p>` };
    case 'sign_out_everywhere': return { title: 'Sign out everywhere', body: html`<p class="muted small">Ends every sign-in on every device. They can sign straight back in.</p>` };
    case 'resend_email': return { title: 'Resend an email', body: html`<label>Which email<select name="kind"><option value="signup">Confirm email address</option><option value="recovery">Reset password</option></select></label>` };
    case 'send_data': return { title: 'Send a copy of their data', body: html`<p class="muted small">Emails a download link to their registered address, as if they had asked from the app.</p>` };
    case 'mark_test': return { title: s.test ? 'Unmark as test account' : 'Mark as test account', body: html`<input type="hidden" name="value" value="${s.test ? '' : '1'}"><p class="muted small">${s.test ? 'This account will see real members again (and they’ll see it), and it will count in the member numbers on Home.' : 'Test accounts only see other test accounts, and real members never see them. They’re also left out of the member counts on Home.'}</p>` };
    case 'delete_account': return { title: `Delete ${s.name}’s account`, ok: 'Delete for good', danger: true, body: html`<p class="muted small">This can’t be undone. Billing is cancelled first; anything under an open report is kept for the investigation.</p><label>Type their name to confirm: <b>${s.name}</b><input name="confirm_name" autocomplete="off" required></label><label><input type="checkbox" name="notify" checked> Email them to say it’s been deleted</label>` };
  }
  return null;
}

async function runMemberAction(k) {
  const s = current.m.summary;
  const spec = memberActionSpec(k, s);
  if (!spec) return;
  await ask({
    ...spec, body: html`${spec.body}${reasonField()}`,
    run: async (v) => {
      if (k === 'mark_test') v.value = !!v.value;
      if (k === 'suspend' && v.days !== '') v.days = Number(v.days);
      if (k === 'suspend' && v.days === '') v.days = null;
      const d = await act(k, { member_id: current.id, ...v });
      reportOutcome(d, 'Done');
      if (k === 'delete_account') location.hash = '#members'; else route();
      return d;
    },
  });
}

async function revealPhotos() {
  await ask({
    title: 'Show photos', ok: 'Show', body: reasonField('Why do you need to see them? (logged)'),
    run: async (v) => {
      const d = await act('reveal_photos', { member_id: current.id, reason: v.reason });
      const box = $('photos'); box.textContent = '';
      for (const p of d.photos || []) {
        const fig = document.createElement('div'); fig.className = 'photo';
        if (p.url && p.url.startsWith(SUPABASE_URL + '/')) { const img = document.createElement('img'); img.src = p.url; img.alt = 'Member photo'; img.referrerPolicy = 'no-referrer'; fig.appendChild(img); }
        if (can(['moderator'])) {
          const b = document.createElement('button'); b.className = 'btn small danger'; b.textContent = 'Remove'; b.dataset.act = 'remove-photo'; b.dataset.path = p.path; b.style.marginTop = '6px'; fig.appendChild(b);
        }
        box.appendChild(fig);
      }
      if (!(d.photos || []).length) box.textContent = 'No photos.';
      return d;
    },
  });
}

async function removePhoto(path) {
  await ask({
    title: 'Remove this photo', ok: 'Remove', danger: true,
    body: html`<p class="muted small">It’s deleted, and they get a notice and an email saying a photo didn’t meet the guidelines.</p>${reasonField()}`,
    run: async (v) => { const d = await act('remove_photo', { member_id: current.id, path, reason: v.reason }); reportOutcome(d, 'Photo removed'); route(); return d; },
  });
}

// ID checks Didit passed but BASED held back because a detail couldn't be read from the document
const HELD_ISSUES = ['no_dob', 'no_name', 'no_sex'];
const ISSUE_TEXT = { no_dob: 'Date of birth not read', no_name: 'Name not read', no_sex: 'Sex not shown on ID', name_mismatch: 'Name doesn’t match', name_swapped: 'Names swapped', dob_mismatch: 'Date of birth doesn’t match', sex_mismatch: 'Sex doesn’t match', underage: 'Under 18' };
async function approveId() {
  await ask({
    title: 'Approve this ID check by hand', ok: 'Approve',
    body: html`<p class="muted small">Didit passed this check (the face matches the document), but BASED couldn’t read one detail from it automatically. Before approving, open the check in the Didit console (Sessions, then the ID shown above) and confirm from the document that:</p>
      <ul class="muted small" style="margin:6px 0 10px 18px"><li>the name matches this member’s first name and surname,</li><li>the date of birth matches and they’re 18 or over,</li><li>the person is the sex shown on their profile.</li></ul>
      <p class="muted small">They’ll get their Verified badge and an email saying they’re verified.</p>${reasonField()}`,
    run: async (v) => { const d = await act('approve_verification', { member_id: current.id, reason: v.reason }); toast('Approved'); route(); return d; },
  });
}
async function recheck(session) {
  await ask({
    title: 'Re-check with Didit', ok: 'Re-check',
    body: html`<p class="muted small">Fetches Didit’s current decision for this check and applies it with the usual rules (for a check approved by hand in Didit’s console).</p>${reasonField()}`,
    run: async (v) => { const d = await act('recheck_verification', { member_id: current.id, session_id: session, reason: v.reason }); toast('Result: ' + (d.result?.status || 'done')); route(); return d; },
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────
const REASONS = { harassment: 'Harassment', fake_or_scam: 'Fake or scam', underage: 'Possibly under 18', known_risk: 'Known danger to others', inappropriate: 'Inappropriate', money: 'Asked for money', other: 'Other' };
// What contact the two had before the report (recorded from 3 Nov 2026)
const CONTACT = { none: 'No contact', interest: 'Interest only, not matched', match: 'Matched, no messages', chat: 'Matched and messaged' };
const contactText = (c) => CONTACT[c] || 'Not recorded';
const noContact = (c) => c === 'none' || c === 'interest';
async function pageReports(st) {
  const rows = await rpc('admin_reports', { p_status: st });
  const tab = (k, l) => html`<a href="#reports?s=${k}" class="${st === k ? 'on' : ''}">${l}</a>`;
  setMain(html`<h1>Reports</h1><div class="tabs">${tab('open', 'Open')}${tab('closed', 'Decided')}${tab('all', 'All')}</div>
    ${rows.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>Reason</th><th>About</th><th>Reported by</th><th>Contact</th><th>Reports against them</th><th>Status</th></tr>
      ${rows.map((r) => html`<tr class="click" data-go="#report/${r.id}"><td><a href="#report/${r.id}">${when(r.at)}</a></td>
        <td>${r.urgent ? html`<span class="badge red">${REASONS[r.reason] || r.reason}</span>` : REASONS[r.reason] || r.reason}${r.escalated ? html` <span class="badge amber">Escalated</span>` : ''}<br><span class="muted small">${r.details || ''}</span></td>
        <td>${r.reported.name || 'Deleted member'} ${r.reported.status && r.reported.status !== 'active' ? statusBadge(r.reported.status) : ''}</td>
        <td>${r.reporter.name || 'Deleted member'}${r.reporter.dismissed >= 3 ? html` <span class="badge amber">${r.reporter.dismissed} dismissed before</span>` : ''}</td>
        <td>${noContact(r.contact) ? html`<span class="badge amber">${contactText(r.contact)}</span>` : contactText(r.contact)}</td><td>${r.against_count}</td><td>${r.status}${r.decision ? ' · ' + r.decision : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">No reports here.</p>`}`);
}

// ─── Correction requests (members asking for their data to be corrected, from the app) ───────
// Sent from inside the app, so each is tied to the account it's about. The law allows one month.
async function pageCorrections(st) {
  const rows = await rpc('admin_corrections', { p_status: st });
  const tab = (k, l) => html`<a href="#corrections?s=${k}" class="${st === k ? 'on' : ''}">${l}</a>`;
  const dueBadge = (r) => { const days = Math.ceil((new Date(r.due) - Date.now()) / 86400000);
    return days < 0 ? html`<span class="badge red">${-days} day${days === -1 ? '' : 's'} overdue</span>` : days <= 7 ? html`<span class="badge red">Due in ${days} day${days === 1 ? '' : 's'}</span>` : html`<span class="muted small">Due ${day(r.due)}</span>`; };
  setMain(html`<h1>Correction requests</h1>
    <p class="muted small">Make the change first (on the member’s page: Correct details, or Remove intro or change name), then mark it corrected. If it can’t or shouldn’t be changed, decline it and say why. Either way they get your note as a notice in the app.</p>
    <div class="tabs">${tab('open', 'Open')}${tab('closed', 'Closed')}${tab('all', 'All')}</div>
    ${rows.length ? rows.map((r) => html`<div class="card" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><div><a href="#member/${r.member.id}"><b>${[r.member.name, r.member.surname].filter(Boolean).join(' ') || '(no name)'}</b></a> <span class="muted small">${r.member.email || ''}</span> ${r.member.status && r.member.status !== 'active' ? statusBadge(r.member.status) : ''}</div>
        <div class="small">${when(r.at)} · ${r.status === 'open' ? dueBadge(r) : html`<span class="badge ${r.status === 'done' ? 'green' : ''}">${r.status === 'done' ? 'Corrected' : 'Declined'}</span> <span class="muted">${r.handled_by || ''} · ${when(r.handled_at)}</span>`}</div></div>
      <p style="white-space:pre-wrap;margin:10px 0">${r.body}</p>
      ${r.reply ? html`<p class="muted small" style="white-space:pre-wrap"><b>Reply:</b> ${r.reply}</p>` : ''}
      ${r.status === 'open' && can(['support']) ? html`<div class="row" style="gap:8px"><button class="btn small primary" data-act="close-correction" data-id="${r.id}" data-o="done">Mark corrected</button><button class="btn small" data-act="close-correction" data-id="${r.id}" data-o="declined">Decline</button></div>` : ''}
    </div>`) : html`<p class="muted">No requests here.</p>`}`);
}
async function closeCorrection(id, outcome) {
  await ask({
    title: outcome === 'done' ? 'Mark as corrected' : 'Decline this request', ok: outcome === 'done' ? 'Mark corrected' : 'Decline',
    body: html`<p class="muted small">${outcome === 'done' ? 'Check you’ve made the change first.' : 'Explain why it hasn’t been changed (for example, a date of birth confirmed by their ID).'} This note is sent to the member as a notice in the app, and kept in the audit log.</p>
      <label>Note to the member<textarea name="note" required minlength="3" maxlength="2000">${outcome === 'done' ? 'We’ve corrected your details as you asked. Thanks for letting us know.' : ''}</textarea></label>`,
    run: async (v) => { await rpc('admin_close_correction', { p_id: id, p_outcome: outcome, p_reply: v.note }); toast(outcome === 'done' ? 'Marked as corrected' : 'Declined'); route(); return true; },
  });
}

async function pageReport(id) {
  const r = await rpc('admin_report', { p_id: id });
  current = { kind: 'report', id, r };
  const open = r.status === 'open';
  const isOwner = me.role === 'owner';
  setMain(html`
    <p><a href="#reports">← Reports</a></p>
    <div class="row"><h1>${REASONS[r.reason] || r.reason}</h1>${r.reason === 'underage' || r.reason === 'known_risk' ? html`<span class="badge red">Urgent</span>` : ''}${r.escalated ? html`<span class="badge amber">Escalated</span>` : ''}<span class="badge">${r.status}</span></div>
    <div class="grid2"><div class="stack">
      <div class="card"><h3>Report</h3><dl class="kv"><dt>When</dt><dd>${when(r.at)}</dd>
        <dt>About</dt><dd>${r.reported ? html`${memberLink(r.reported.id, r.reported.name)}, ${r.reported.age} ${statusBadge(r.reported.status)} ${r.reported.verified ? html`<span class="badge blue">Verified</span>` : ''}` : 'Deleted member'}</dd>
        <dt>Reported by</dt><dd>${r.reporter ? html`${memberLink(r.reporter.id, r.reporter.name)}, ${r.reporter.age}` : 'Deleted member'}</dd>
        <dt>Contact before the report</dt><dd>${contactText(r.contact)}${noContact(r.contact) && ['harassment', 'money'].includes(r.reason) ? html` <span class="badge amber">Reason doesn’t fit — they never chatted</span>` : ''}</dd>
        <dt>Reports against them</dt><dd>${r.against_count}</dd>
        ${r.reporter_record ? html`<dt>Reporter’s record</dt><dd>${r.reporter_record.made} report${r.reporter_record.made === 1 ? '' : 's'} made, ${r.reporter_record.no_contact} about people they hadn’t matched with; ${r.reporter_record.dismissed} of ${r.reporter_record.decided} decided were dismissed${r.reporter_record.dismissed >= 3 && r.reporter_record.dismissed * 2 >= r.reporter_record.decided ? html` <span class="badge amber">Often dismissed</span>` : ''}</dd>` : ''}
        <dt>What they said</dt><dd class="pre">${r.details || '—'}</dd>
        ${r.decision ? html`<dt>Decision</dt><dd>${r.decision} by ${r.decided_by} · ${when(r.reviewed_at)}</dd>` : ''}
        ${r.review_notes ? html`<dt>Notes</dt><dd class="pre">${r.review_notes}</dd>` : ''}</dl></div>
      <div class="card"><h3>Conversation (${r.message_count} messages)</h3>
        <div id="convo"><p class="muted small">Reading the conversation is logged with your reason.</p><button class="btn" data-act="read-convo" ${r.message_count ? '' : 'disabled'}>Read the conversation</button></div></div>
    </div><div class="stack">
      <div class="card actions"><h3>Decision</h3>
        ${open ? html`
          <button class="btn" data-act="decide" data-d="dismiss">Dismiss — no action needed</button>
          <button class="btn" data-act="decide" data-d="warn">Warn them</button>
          <button class="btn" data-act="decide" data-d="suspend">Suspend them</button>
          ${isOwner ? html`<button class="btn danger" data-act="decide" data-d="ban">Ban them</button>` : ''}
          <button class="btn" data-act="decide" data-d="actioned">Mark as dealt with (action taken elsewhere)</button>
          ${r.escalated ? '' : html`<button class="btn" data-act="decide" data-d="escalate">Escalate to an owner</button>`}
          <p class="muted small">The person who reported gets the same neutral email whatever you decide.</p>` : html`<p class="muted">Decided.</p>`}
      </div></div></div>`);
}

async function readConversation() {
  await ask({
    title: 'Read the conversation', ok: 'Read', body: reasonField('Why do you need to read it? (logged)'),
    run: async (v) => {
      const msgs = await rpc('admin_report_messages', { p_id: current.id, p_reason: v.reason });
      const box = $('convo');
      box.innerHTML = html`<div class="msgs">${msgs.length ? msgs.map((x) => html`<div class="msg"><small>${x.from} · ${when(x.at)}</small>${x.text}</div>`) : html`<p class="muted">No messages (they may have been cleared).</p>`}</div>`.s;
      return msgs;
    },
  });
}

async function decide(d) {
  const r = current.r;
  const name = r.reported?.name || 'them';
  const specs = {
    dismiss: { title: 'Dismiss this report', body: html`` },
    warn: { title: `Warn ${name}`, body: WARN_FIELDS },
    suspend: { title: `Suspend ${name}`, body: SUSPEND_FIELDS, danger: true, ok: 'Suspend' },
    ban: { title: `Ban ${name}`, body: BAN_FIELDS, danger: true, ok: 'Ban' },
    actioned: { title: 'Mark as dealt with', body: html`<p class="muted small">For when you’ve already acted, for example removed a photo from their member page.</p>` },
    escalate: { title: 'Escalate to an owner', body: html`<p class="muted small">Stays open and is flagged on Home.</p>` },
  };
  const spec = specs[d];
  await ask({
    ...spec, body: html`${spec.body}${reasonField()}`,
    run: async (v) => {
      if (d === 'suspend') v.days = v.days === '' ? null : Number(v.days);
      const out = await act('report_decide', { report_id: current.id, decision: d, ...v });
      reportOutcome(out.outcome || {}, d === 'escalate' ? 'Escalated' : 'Report decided');
      route();
      return out;
    },
  });
}

// ─── Data requests ──────────────────────────────────────────────────────────
async function pageRequests() {
  const rows = await rpc('admin_requests');
  setMain(html`<h1>Data requests</h1><p class="muted">Subject access requests by email and from the app. “Held” ones wait for you because something about the account needs a look first.</p>
    ${rows.length ? html`<div class="tablewrap"><table><tr><th>Received</th><th>From</th><th>Member</th><th>Status</th><th>Sent</th><th>Delivery</th><th>Note</th><th></th></tr>
      ${rows.map((q) => html`<tr><td>${when(q.received_at)}</td><td>${q.from_email || '—'}</td><td>${q.member || '—'}</td>
        <td>${q.status === 'held' ? html`<span class="badge amber">Held</span>` : q.status === 'failed' ? html`<span class="badge red">Failed</span>` : q.status}</td>
        <td>${when(q.sent_at)}</td><td>${['bounced', 'failed', 'complained'].includes(q.delivery) ? html`<span class="badge red">${q.delivery}</span>` : q.delivery || '—'}</td>
        <td class="small">${q.note || ''}</td><td>${q.status === 'held' && can(['support']) ? html`<button class="btn small primary" data-act="approve-request" data-id="${q.request_id}">Approve and send</button>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">No requests yet.</p>`}`);
}
async function approveRequest(id) {
  await ask({
    title: 'Approve and send', ok: 'Send', body: html`<p class="muted small">The pack goes to the member’s registered email address.</p>${reasonField()}`,
    run: async (v) => { const res = await rpc('admin_approve_request', { p_id: id, p_reason: v.reason }); toast(res); route(); return res; },
  });
}

// ─── Audit log ──────────────────────────────────────────────────────────────
async function pageAudit(t) {
  const rows = await rpc('admin_audit', { p_limit: 300, p_target: t || null });
  setMain(html`<h1>Audit log</h1><p class="muted">Every admin action and every time member data was opened. It can’t be changed or deleted.</p>
    <form class="searchbar" id="f-audit"><input id="t" placeholder="Filter by member or report ID" value="${t}" aria-label="Filter by ID"><button class="btn">Filter</button>${t ? html`<a class="btn" href="#audit">Clear</a>` : ''}</form>
    ${rows.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th><th>Details</th></tr>
      ${rows.map((l) => html`<tr><td>${when(l.at)}</td><td>${l.admin_label || 'System'}</td><td>${l.action}</td>
        <td>${isUuid(l.target_id) ? html`<a href="#${l.target_type === 'report' ? 'report' : l.target_type === 'member' ? 'member' : 'audit?t='}${l.target_type === 'report' || l.target_type === 'member' ? '/' : ''}${l.target_id}">${l.target_type}</a>` : l.target_type || ''}</td>
        <td class="pre">${l.reason || ''}</td><td class="small muted pre">${l.details ? JSON.stringify(l.details).slice(0, 300) : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">Nothing logged${t ? ' for this ID' : ''}.</p>`}`);
  $('f-audit').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#audit?t=' + encodeURIComponent($('t').value.trim()); });
}

// ─── Messages to many members ───────────────────────────────────────────────
const PLAN_NAMES = { none: 'No paid plan', plus: 'BASED+', gold: 'Gold' };
function audienceText(au) {
  if (!au) return '';
  if (au.test_only) return 'Test accounts';
  const parts = [];
  if (au.country) parts.push(au.country);
  if (au.plan) parts.push(PLAN_NAMES[au.plan] || au.plan);
  return parts.length ? parts.join(' · ') : 'All members';
}
let bcPreview = null; // { key, in_app, with_email }
async function pageMessages() {
  const [list, base] = await Promise.all([rpc('admin_broadcasts'), rpc('admin_broadcast_preview', { p_country: null, p_plan: null, p_kind: 'service', p_test_only: false })]);
  const owner = me.role === 'owner';
  bcPreview = null;
  setMain(html`
    <h1>Messages</h1>
    <p class="muted">Send a notice to many members at once. To message one person, use <b>Send a message</b> on their member page.</p>
    <div class="grid2"><form class="card stack" id="f-bc">
      <div class="row">
        <label class="grow">Who to<select name="who"><option value="all">All members (${base.in_app})</option><option value="country">One country</option><option value="plan">One plan</option><option value="test">Test accounts only (${base.test_accounts})</option></select></label>
        <label class="grow" data-show="country" hidden>Country<select name="country">${base.countries.map((c) => html`<option value="${c.code}">${c.code} (${c.members})</option>`)}</select></label>
        <label class="grow" data-show="plan" hidden>Plan<select name="plan"><option value="gold">Gold</option><option value="plus">BASED+</option><option value="none">No paid plan</option></select></label>
      </div>
      <div class="row">
        <label class="grow">Type<select name="kind"><option value="service">Service notice (everyone in the group)</option><option value="marketing">News and offers (only members who opted in)</option></select></label>
        <label class="grow">Send as<select name="channel"><option value="app">In the app only</option><option value="both">In the app and by email</option><option value="email">Email only</option></select></label>
      </div>
      <label>Title (also the email subject)<input name="title" maxlength="120" required></label>
      <label>Message<textarea name="message" rows="7" minlength="10" maxlength="4000" required placeholder="“Hi [name],” is added for you. Leave a blank line between paragraphs."></textarea></label>
      <p class="muted small">Only active members get it: never suspended, banned or demo profiles. News and offers emails include an unsubscribe link. Members see in-app messages the next time they open BASED.</p>
      <div id="bc-count" class="note-box" hidden></div>
      <div class="row end">
        <button class="btn" type="button" data-act="bc-preview">Check who it goes to</button>
        ${owner ? html`<button class="btn primary" type="submit" id="bc-send" disabled>Send…</button>` : html`<span class="muted small">Only an owner can send.</span>`}
      </div>
    </form>
    <div class="card"><h3>Before you send</h3><ul class="list small">
      <li>Service notices are for things members need to know: changes to the service, prices, Terms or privacy notice.</li>
      <li>News and offers go only to members who said yes to marketing.</li>
      <li>Try it on <b>Test accounts only</b> first to see how it looks.</li>
      <li>Resend’s free plan sends up to 100 emails a day. Anything over is recorded as not sent here and emailed to alerts@.</li>
    </ul></div></div>
    <h3 class="mt">Sent</h3>
    ${list.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>By</th><th>Title</th><th>To</th><th>Type</th><th>In app (read)</th><th>Emails</th><th>Status</th></tr>
      ${list.map((b) => html`<tr><td>${when(b.created_at)}</td><td>${b.admin_label}</td><td><b>${b.title}</b><br><span class="muted small pre">${String(b.body).slice(0, 160)}</span></td>
        <td>${audienceText(b.audience)}</td><td>${b.kind === 'marketing' ? 'News and offers' : 'Service'} · ${b.channel === 'both' ? 'app + email' : b.channel}</td>
        <td>${b.channel === 'email' ? '—' : `${b.recipients} (${b.read})`}</td>
        <td>${b.channel === 'app' ? '—' : html`${b.emailed} of ${b.email_planned}${b.email_failed ? html` <span class="badge red">${b.email_failed} not sent</span>` : ''}`}</td>
        <td>${b.status === 'sending' ? html`<span class="badge amber">Sending</span> <button class="btn small" data-act="reload">Refresh</button>` : b.status === 'failed' ? html`<span class="badge red">Failed</span>` : html`<span class="badge green">Sent</span>`}${b.note ? html`<br><span class="muted small">${b.note}</span>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">Nothing sent yet.</p>`}`);
  const f = $('f-bc');
  const sync = () => {
    const who = f.who.value;
    for (const el of f.querySelectorAll('[data-show]')) el.hidden = el.dataset.show !== who;
    bcPreview = null; $('bc-count').hidden = true; if ($('bc-send')) $('bc-send').disabled = true;
  };
  f.addEventListener('change', (e) => { if (!['title', 'message'].includes(e.target.name)) sync(); });
  f.addEventListener('submit', (e) => { e.preventDefault(); sendBroadcast(); });
  sync();
}
function bcValues() {
  const f = $('f-bc'); const who = f.who.value;
  return { country: who === 'country' ? f.country.value : null, plan: who === 'plan' ? f.plan.value : null, test_only: who === 'test',
    kind: f.kind.value, channel: f.channel.value, title: f.title.value.trim(), message: f.message.value.trim() };
}
async function previewBroadcast() {
  const v = bcValues();
  const r = await rpc('admin_broadcast_preview', { p_country: v.country, p_plan: v.plan, p_kind: v.kind, p_test_only: v.test_only });
  bcPreview = { in_app: r.in_app, with_email: r.with_email };
  const box = $('bc-count'); box.hidden = false;
  const emails = v.channel === 'app' ? 0 : r.with_email;
  box.textContent = r.in_app
    ? `Goes to ${r.in_app} member${r.in_app === 1 ? '' : 's'}` + (v.channel !== 'email' ? ' in the app' : '') + (v.channel !== 'app' ? `${v.channel === 'both' ? ', and' : ''} ${emails} by email` : '') + '.'
    : 'Nobody matches. Choose a different group.';
  if ($('bc-send')) $('bc-send').disabled = !r.in_app;
}
async function sendBroadcast() {
  const v = bcValues();
  if (!v.title) return toast('Add a title', true);
  if (v.message.length < 10) return toast('Write the message (at least 10 characters)', true);
  if (!bcPreview) return previewBroadcast();
  const emails = v.channel === 'app' ? 0 : bcPreview.with_email;
  await ask({
    title: 'Send this message?', ok: `Send to ${bcPreview.in_app}`,
    body: html`<div class="note-box"><b>${v.title}</b><br><span class="pre">${v.message}</span></div>
      <p>To: <b>${v.test_only ? 'Test accounts' : audienceText(v)}</b> · ${v.kind === 'marketing' ? 'News and offers (opted-in only)' : 'Service notice'}<br>
      ${v.channel !== 'email' ? `${bcPreview.in_app} in the app` : ''}${v.channel === 'both' ? ' · ' : ''}${v.channel !== 'app' ? `${emails} by email` : ''}</p>
      <p class="muted small">This can’t be unsent.</p>${reasonField('Why (kept in the audit log)')}`,
    run: async (r) => {
      const d = await act('broadcast', { ...v, expected: bcPreview.in_app, reason: r.reason });
      toast(d.emails ? `Sent in the app; ${d.emails} emails are going out` : 'Sent');
      route();
      return d;
    },
  });
}

// ─── Words not allowed in messages ─────────────────────────────────────────
async function pageWords(q) {
  const at = location.hash;
  const list = await rpc('admin_banned_words');
  if (location.hash !== at) return; // moved on (e.g. a search) while this was loading
  const edit = can(['moderator']);
  const f = q.toLowerCase();
  const shown = f ? list.filter((w) => w.word.includes(f)) : list;
  setMain(html`<h1>Words not allowed</h1>
    <p class="muted">A message containing any of these, as a whole word in any capitals, is stopped before it’s sent, and the sender is asked to keep it respectful. “Ass” blocks “ass” but not “class”, and a plural or other form needs its own entry. Words marked <b>only as an exclamation</b> are stopped when they stand on their own (“Jesus!”, “Jesus, what a day”) but allowed in a sentence (“I believe in Jesus Christ”).</p>
    <div class="grid2">
      <div class="card stack">
        ${edit ? html`<form class="row" id="f-word"><label class="grow">Add a word or phrase<input name="word" maxlength="40" autocomplete="off" required></label><button class="btn primary" type="submit">Add</button></form>
          <label class="small"><input type="checkbox" form="f-word" name="excl"> Only as an exclamation</label>
          <p class="muted small">Letters, numbers, spaces, hyphens and apostrophes. Saved in lower case. Changes apply to the next message sent.</p>` : html`<p class="muted small">Only an owner or moderator can change the list.</p>`}
        <form class="searchbar" id="f-wsearch"><input id="wq" placeholder="Find on the list" value="${q}" aria-label="Find a word"><button class="btn">Find</button>${q ? html`<a class="btn" href="#words">Clear</a>` : ''}</form>
      </div>
      <form class="card stack" id="f-wtest"><h3>Test a message</h3>
        <label>Type a message to see whether it would be stopped<textarea name="text" rows="3" maxlength="4000" required></textarea></label>
        <div class="row end"><span id="wtest-out" class="grow" role="status"></span><button class="btn" type="submit">Test</button></div>
      </form>
    </div>
    <h3 class="mt">${shown.length} of ${list.length} word${list.length === 1 ? '' : 's'}</h3>
    ${shown.length ? html`<div class="tablewrap"><table><tr><th>Word or phrase</th><th>Stopped</th><th>Added</th><th>By</th><th></th></tr>
      ${shown.map((w) => html`<tr><td><b>${w.word}</b></td><td>${w.exclamation_only ? html`<span class="badge amber">Only as an exclamation</span>` : 'Anywhere'}</td>
        <td>${w.added_at ? when(w.added_at) : 'Before the console'}</td><td>${w.added_by || '—'}</td>
        <td class="nowrap">${edit ? html`<button class="btn small" data-act="word-mode" data-word="${w.word}" data-on="${w.exclamation_only ? '' : '1'}">${w.exclamation_only ? 'Stop anywhere' : 'Only as exclamation'}</button> <button class="btn small" data-act="remove-word" data-word="${w.word}">Remove</button>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">${q ? 'Nothing on the list matches.' : 'The list is empty, so no messages are stopped.'}</p>`}
    <p class="muted small mt">Names members can’t use are on the <a href="#names">Names</a> page.</p>`);
  $('f-wsearch').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#words?q=' + encodeURIComponent($('wq').value.trim()); });
  if ($('f-word')) $('f-word').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { const w = await rpc('admin_add_banned_word', { p_word: e.target.word.value, p_exclamation_only: !!(document.querySelector('[name=excl]') || {}).checked }); toast(`Added “${w}”`); route(); }
    catch (err) { toast(errorText(err), true); btn.disabled = false; }
  });
  $('f-wtest').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('wtest-out'); out.textContent = 'Checking…'; out.className = 'grow';
    try {
      const hit = await rpc('admin_test_banned_words', { p_text: e.target.text.value });
      out.textContent = hit ? `Would be stopped (matches “${hit}”)` : 'Would be sent';
      out.className = 'grow ' + (hit ? 'err' : 'ok');
    } catch (err) { out.textContent = errorText(err); out.className = 'grow err'; }
  });
}
async function setWordMode(word, on) {
  try { await rpc('admin_set_banned_word_exclamation', { p_word: word, p_on: on }); toast(on ? `“${word}” is now stopped only as an exclamation` : `“${word}” is now stopped anywhere`); route(); }
  catch (err) { toast(errorText(err), true); }
}
async function pageNames() {
  const names = await rpc('admin_blocked_names').catch(() => null); // needs SQL 53
  const edit = can(['moderator']);
  setMain(html`<h1 id="blocked-names">Names not allowed</h1>
    <p class="muted">Members can’t sign up with, or change their name to, a name that matches this list, so nobody can pass themselves off as BASED or its staff. Capitals, spaces, punctuation and look-alike characters are ignored (“B4SED”, “a.d.m.i.n” are caught). <b>Contains</b> refuses it anywhere in a name (“BASED Support”, “TheAdmin”); <b>Whole name</b> refuses it only on its own (“Team”). Words on the <a href="#words">Words</a> page are refused in names too. Names already in use aren’t changed, and staff can still set any name.</p>
    ${names === null ? html`<p class="muted">Run SQL 53 in Supabase to turn this on.</p>` : html`
    <div class="grid2">
      <div class="card stack">
        ${edit ? html`<form class="row" id="f-bname"><label class="grow">Add a name<input name="term" maxlength="30" autocomplete="off" required></label>
            <label>Refuse<select name="match"><option value="contains">Contains</option><option value="exact">Whole name</option></select></label><button class="btn primary" type="submit">Add</button></form>
          <p class="muted small">Letters only (2–30). Applies to the next sign-up or name change.</p>` : html`<p class="muted small">Only an owner or moderator can change the list.</p>`}
      </div>
      <form class="card stack" id="f-ntest"><h3>Test a name</h3>
        <label>Type a name to see whether it would be refused<input name="name" maxlength="40" autocomplete="off" required></label>
        <div class="row end"><span id="ntest-out" class="grow" role="status"></span><button class="btn" type="submit">Test</button></div>
      </form>
    </div>
    <h3 class="mt">${names.length} name${names.length === 1 ? '' : 's'}</h3>
    <div class="tablewrap"><table><tr><th>Name</th><th>Refused</th><th>Added</th><th>By</th><th></th></tr>
      ${names.map((n) => html`<tr><td><b>${n.term}</b></td><td>${n.match === 'exact' ? 'Whole name only' : 'Anywhere in a name'}</td>
        <td>${n.added_at ? when(n.added_at) : '—'}</td><td>${n.added_by || '—'}</td>
        <td class="nowrap">${edit ? html`<button class="btn small" data-act="remove-bname" data-term="${n.term}">Remove</button>` : ''}</td></tr>`)}
    </table></div>`}`);
  if ($('f-bname')) $('f-bname').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { const t = await rpc('admin_add_blocked_name', { p_term: e.target.term.value, p_match: e.target.match.value }); toast(`Added “${t}”`); route(); }
    catch (err) { toast(errorText(err), true); btn.disabled = false; }
  });
  if ($('f-ntest')) $('f-ntest').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('ntest-out'); out.textContent = 'Checking…'; out.className = 'grow';
    try {
      const r = await rpc('admin_test_name', { p_name: e.target.name.value });
      out.textContent = r && r.blocked ? `Would be refused (${r.match === 'rude word' ? 'rude word' : r.match === 'exact' ? 'whole name' : 'contains'} “${r.term}”)` : 'Allowed';
      out.className = 'grow ' + (r && r.blocked ? 'err' : 'ok');
    } catch (err) { out.textContent = errorText(err); out.className = 'grow err'; }
  });
}
async function removeBlockedName(term) {
  await ask({
    title: `Remove “${term}”?`, ok: 'Remove', danger: true,
    body: html`<p class="muted small">Members will be able to use it in their name from now on.</p>${reasonField()}`,
    run: async (v) => { await rpc('admin_remove_blocked_name', { p_term: term, p_reason: v.reason }); toast(`Removed “${term}”`); route(); return true; },
  });
}
async function removeWord(word) {
  await ask({
    title: `Remove “${word}”?`, ok: 'Remove', danger: true,
    body: html`<p class="muted small">Messages containing it will be sent from now on.</p>${reasonField()}`,
    run: async (v) => { await rpc('admin_remove_banned_word', { p_word: word, p_reason: v.reason }); toast(`Removed “${word}”`); route(); return true; },
  });
}

// ─── Questions ──────────────────────────────────────────────────────────────
// The questions are kept in the database. The owner uploads a text file in the format below
// (the same one "Download" gives), checks the preview, and publishes it.
//
//   1. Free speech            ← a number, then the heading (the number itself is ignored: file order is screen order)
//   ID: 1                     ← the question's permanent ID; "ID: new" for a new question
//   Left: …                   ← the statement at the left end of the slider
//   Right: …                  ← the statement at the right end
//   Explanation: …            ← shown under "What does this mean?" (may run onto more lines)
//   Faith picker: yes         ← optional: shows the faith choices when someone slides right
//   Counts: yes / no          ← optional: otherwise questions count until the line
//                               "ON YOUR PROFILE · NOT PART OF MATCHING", and don't after it
let qData = null;     // { questions, versions, can_publish }
let qUpload = null;   // { items, source, errors, warnings }
const Q_SECTION = 'ON YOUR PROFILE · NOT PART OF MATCHING';

function questionsFile(list) {
  const live = list.filter((q) => !q.retired);
  const out = ['BASED questions', '',
    'Each question has a number and heading, its permanent ID, a statement for each end of the slider, and the explanation shown under "What does this mean?".',
    'Keep each ID line as it is. For a new question write "ID: new". To take a question out, delete it from the file (its answers are kept).',
    'Questions count towards matching until the line below; questions after it are shown on the profile but not counted.', ''];
  let section = false;
  live.forEach((q, i) => {
    if (!q.counts && !section) { section = true; out.push('-'.repeat(60), Q_SECTION, '-'.repeat(60), ''); }
    out.push(`${i + 1}. ${q.heading}`, `ID: ${q.id}`);
    if (q.counts && section) out.push('Counts: yes');
    if (q.faith_picker) out.push('Faith picker: yes');
    out.push(`Left: ${q.left}`, `Right: ${q.right}`, `Explanation: ${q.explanation}`, '');
  });
  return out.join('\n');
}

function parseQuestionsFile(text) {
  const items = [], errors = [], warnings = [];
  let cur = null, field = null, section = false;
  const yes = (v) => /^(yes|y|true|1)$/i.test(v.trim());
  const finish = () => { if (cur) items.push(cur); cur = null; field = null; };
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((raw, n) => {
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();
    if (!t) { field = null; return; }
    if (/^-{3,}$/.test(t)) return;
    if (/^(on your profile\b.*)?not part of matching\b/i.test(t)) { finish(); section = true; return; }   // the section line
    const head = t.match(/^\d+\s*[.)]\s*(.+)$/);
    if (head) { finish(); cur = { line: n + 1, heading: head[1].trim(), id: undefined, left: '', right: '', explanation: '', counts: !section, faith_picker: false, countsSet: false }; return; }
    if (!cur) return;   // the title and notes at the top
    const kv = t.match(/^(id|left|right|explanation|faith picker|counts)\s*:\s*(.*)$/i);
    if (kv) {
      const k = kv[1].toLowerCase(), v = kv[2].trim();
      if (k === 'id') cur.id = /^new$/i.test(v) ? null : (/^\d+$/.test(v) ? parseInt(v, 10) : NaN);
      else if (k === 'faith picker') cur.faith_picker = yes(v);
      else if (k === 'counts') { cur.counts = yes(v); cur.countsSet = true; }
      else { cur[k] = v; field = k; }
      if (k !== 'left' && k !== 'right' && k !== 'explanation') field = null;
      return;
    }
    if (field) { cur[field] = (cur[field] + ' ' + t).trim(); return; }
    errors.push(`Line ${n + 1}: “${t.slice(0, 60)}” isn’t a heading, an ID, Left, Right or Explanation line.`);
  });
  finish();
  const seen = new Set();
  items.forEach((q, i) => {
    const name = `Question ${i + 1} (${q.heading})`;
    if (q.id === undefined) errors.push(`${name} has no ID line. Keep the ID from the downloaded file, or write “ID: new” for a new question.`);
    else if (Number.isNaN(q.id)) errors.push(`${name}: the ID should be a number or “new”.`);
    else if (q.id !== null) { if (seen.has(q.id)) errors.push(`${name}: ID ${q.id} is used twice.`); seen.add(q.id); }
    if (q.heading.length > 60) errors.push(`${name}: the heading is over 60 characters.`);
    if (!q.left) errors.push(`${name} has no Left statement.`); else if (q.left.length > 300) errors.push(`${name}: the Left statement is over 300 characters.`);
    if (!q.right) errors.push(`${name} has no Right statement.`); else if (q.right.length > 300) errors.push(`${name}: the Right statement is over 300 characters.`);
    if (q.explanation.length > 1000) errors.push(`${name}: the explanation is over 1,000 characters.`);
  });
  if (!items.length) errors.push('No questions found. Each question starts with a numbered heading, such as “1. Free speech”.');
  if (items.filter((q) => q.faith_picker).length > 1) errors.push('Only one question can have “Faith picker: yes”.');
  if (items.length && !items.some((q) => q.counts)) errors.push('At least one question has to count towards matching.');
  if (items.length && !items.some((q) => q.faith_picker)) warnings.push('No question has “Faith picker: yes”, so members won’t be asked which faith.');
  return { items, errors, warnings };
}

async function pageQuestions() {
  qData = await rpc('admin_questions');
  const { data: ends } = await sb.from('scale_ends').select('side,name,image,updated_at,updated_by');
  const end = (side) => (ends || []).find((e) => e.side === side) || { side, name: '', image: '' };
  qUpload = null;
  const live = qData.questions.filter((q) => !q.retired), retired = qData.questions.filter((q) => q.retired);
  const summaryText = (s) => {
    if (!s) return '—';
    const bits = [];
    if (s.added?.length) bits.push(`Added ${s.added.map((i) => '#' + i).join(', ')}`);
    if (s.changed?.length) bits.push(`Changed ${s.changed.map((i) => '#' + i).join(', ')}`);
    if (s.retired?.length) bits.push(`Retired ${s.retired.map((i) => '#' + i).join(', ')}`);
    if (s.restored?.length) bits.push(`Brought back ${s.restored.map((i) => '#' + i).join(', ')}`);
    if (s.reordered) bits.push('Reordered');
    return bits.join(' · ') || 'No changes';
  };
  setMain(html`<h1>Questions</h1>
    <p class="muted">These are the questions members answer, in the order they see them. Changes reach the app the next time a member opens it. Each question has a permanent ID that its answers are stored under, so rewording, reordering, adding or taking out questions never mixes up anyone’s answers.</p>
    <div class="card stack">
      <div class="row"><button class="btn" type="button" data-act="q-download">Download the current file</button>
        ${qData.can_publish ? html`<label class="btn" for="q-file">Upload a changed file</label><input type="file" id="q-file" accept=".txt,text/plain" class="visually-hidden">` : ''}</div>
      <p class="muted small">${qData.can_publish ? 'Edit the downloaded file in any text editor, then upload it. You’ll see exactly what will change before anything is published.' : 'Only an owner can publish changes to the questions.'}</p>
    </div>
    <div id="q-preview"></div>
    <h3 class="mt">Ends of the slider</h3>
    <p class="muted small">Each member’s Based Score is shown as how far they lean towards one end, such as “62%” with that end’s picture (0% is the middle). The pictures show on profile cards at about 14 pixels, so simple shapes work best. Wide pictures (a word with a drawing) are fine. Uploads are made into a small PNG of up to 320 × 128 pixels.</p>
    ${ends && ends.length ? html`<div class="ends">${['left', 'right'].map((side) => { const e = end(side); return html`<form class="card stack" data-end="${side}">
      <h3>${side === 'left' ? 'Left end' : 'Right end'}</h3>
      <div class="row"><img class="end-img" alt="" src="${e.image}"><img class="end-img small" alt="" src="${e.image}"></div>
      <label>Name (optional)<input name="name" maxlength="30" value="${e.name}" ${qData.can_publish ? '' : 'disabled'}></label>
      ${qData.can_publish ? html`<label>New picture (PNG, JPEG, WebP or SVG)<input type="file" name="pic" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>
        <div class="row end"><button class="btn primary" type="submit">Save</button></div>` : ''}
      <p class="muted small">${e.updated_by ? html`Last changed ${when(e.updated_at)} by ${e.updated_by}` : ''}</p>
    </form>`; })}</div>` : html`<p class="err">The ends aren’t set up yet. Run SQL file 27 in Supabase first.</p>`}
    <h3 class="mt">${live.length} questions (${live.filter((q) => q.counts).length} count towards matching)</h3>
    <div class="tablewrap"><table><tr><th>#</th><th>ID</th><th>Heading</th><th>Left</th><th>Right</th><th>Counts</th></tr>
      ${live.map((q, i) => html`<tr><td>${i + 1}</td><td class="muted">${q.id}</td><td><b>${q.heading}</b>${q.faith_picker ? html`<br><span class="badge blue">Faith picker</span>` : ''}</td><td class="small">${q.left}</td><td class="small">${q.right}</td><td>${q.counts ? html`<span class="badge green">Yes</span>` : html`<span class="badge">No</span>`}</td></tr>`)}
    </table></div>
    ${retired.length ? html`<h3 class="mt">Taken out</h3><p class="muted small">No longer shown or counted. Members’ answers are kept, so a question can be brought back by putting it in the file again with its ID.</p>
      <div class="tablewrap"><table><tr><th>ID</th><th>Heading</th><th>Taken out</th></tr>${retired.map((q) => html`<tr><td class="muted">${q.id}</td><td>${q.heading}</td><td>${when(q.updated_at)}</td></tr>`)}</table></div>` : ''}
    <h3 class="mt">Published sets</h3>
    <div class="tablewrap"><table><tr><th>When</th><th>By</th><th>What changed</th><th>Note</th><th></th></tr>
      ${qData.versions.map((v) => html`<tr><td class="nowrap">${when(v.published_at)}</td><td>${v.published_by || '—'}</td><td class="small">${summaryText(v.summary)}</td><td class="small">${v.note || ''}</td><td>${v.has_file ? html`<button class="btn small" type="button" data-act="q-version" data-id="${v.id}">File</button>` : ''}</td></tr>`)}
    </table></div>`);
  for (const f of document.querySelectorAll('form[data-end]')) {
    let newPic = null;
    const pic = f.querySelector('[name=pic]');
    if (pic) pic.addEventListener('change', async () => {
      newPic = null; const file = pic.files[0]; if (!file) return;
      try { newPic = await shrinkImage(file); for (const im of f.querySelectorAll('.end-img')) im.src = newPic; if (shrinkImage.removedBackground) toast('The plain background was made see-through. Check the preview, then Save.'); }
      catch (err) { toast(err.message || 'Couldn’t read that picture.', true); pic.value = ''; }
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try { await rpc('admin_set_scale_end', { p_side: f.dataset.end, p_name: f.querySelector('[name=name]').value, p_image: newPic }); toast('Saved. Members see it the next time they open the app.'); route(); }
      catch (err) { toast(errorText(err), true); btn.disabled = false; }
    });
  }
  if ($('q-file')) $('q-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 200000) { toast('That file is too big for a questions file.', true); return; }
    const text = await f.text();
    qUpload = { ...parseQuestionsFile(text), source: text, name: f.name };
    showQuestionsPreview();
  });
}

function showQuestionsPreview() {
  const u = qUpload, byId = new Map(qData.questions.map((q) => [q.id, q]));
  const liveBefore = qData.questions.filter((q) => !q.retired);
  const fileIds = new Set(u.items.filter((q) => q.id).map((q) => q.id));
  const unknown = u.items.filter((q) => q.id && !byId.has(q.id));
  const errors = [...u.errors, ...unknown.map((q) => `“${q.heading}” has ID ${q.id}, which doesn’t exist. Use “ID: new” for a new question.`)];
  const FIELDS = [['heading', 'Heading'], ['left', 'Left'], ['right', 'Right'], ['explanation', 'Explanation']];
  let changes = 0;
  const rows = u.items.map((q, i) => {
    const old = q.id ? byId.get(q.id) : null;
    let status, detail = [];
    if (!q.id) { status = html`<span class="badge green">New</span>`; changes++; }
    else if (!old) status = html`<span class="badge red">Unknown ID</span>`;
    else {
      for (const [k, label] of FIELDS) if ((old[k] || '') !== q[k]) detail.push(html`<div class="qdiff"><b>${label}:</b> <span class="old">${old[k] || '(blank)'}</span> → <span class="new">${q[k] || '(blank)'}</span></div>`);
      if (old.counts !== q.counts) detail.push(html`<div class="qdiff"><b>Counts:</b> ${old.counts ? 'Yes' : 'No'} → ${q.counts ? 'Yes' : 'No'}</div>`);
      if (old.faith_picker !== q.faith_picker) detail.push(html`<div class="qdiff"><b>Faith picker:</b> ${old.faith_picker ? 'Yes' : 'No'} → ${q.faith_picker ? 'Yes' : 'No'}</div>`);
      // Moved: the question before it (ignoring new and taken-out ones) isn't the one that was before it
      const keptBefore = liveBefore.filter((x) => fileIds.has(x.id)).map((x) => x.id);
      const keptAfter = u.items.filter((x) => x.id && byId.has(x.id) && !byId.get(x.id).retired).map((x) => x.id);
      const moved = !old.retired && keptBefore[keptBefore.indexOf(q.id) - 1] !== keptAfter[keptAfter.indexOf(q.id) - 1];
      status = old.retired ? html`<span class="badge blue">Brought back</span>` : detail.length ? html`<span class="badge amber">Changed</span>` : moved ? html`<span class="badge">Moved</span>` : html`<span class="muted small">No change</span>`;
      if (old.retired || detail.length || moved) changes++;
    }
    return html`<tr><td>${i + 1}</td><td class="muted">${q.id || 'new'}</td><td><b>${q.heading}</b>${!q.id ? html`<div class="small">${q.left}<br>${q.right}</div>` : ''}${detail}</td><td>${q.counts ? 'Yes' : 'No'}</td><td>${status}</td></tr>`;
  });
  const goingOut = liveBefore.filter((q) => !fileIds.has(q.id));
  changes += goingOut.length;
  const countedBefore = liveBefore.filter((q) => q.counts).map((q) => q.id).sort().join(',');
  const countedAfter = u.items.filter((q) => q.counts && q.id).map((q) => q.id).concat(u.items.some((q) => q.counts && !q.id) ? ['new'] : []).sort().join(',');
  const notes = [...u.warnings];
  if (u.items.some((q) => !q.id)) notes.push('Everyone who has already answered starts at 0 (the middle) on the new question until they change it.');
  if (countedBefore !== countedAfter) notes.push('The questions that count towards matching change, so every member’s Based Score and compatibility will be worked out again.');
  $('q-preview').innerHTML = html`<div class="card stack">
    <h2>Preview: ${u.name}</h2>
    ${errors.length ? html`<div class="err"><b>Fix these in the file, then upload it again:</b><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
    ${notes.length ? html`<ul class="muted small">${notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
    <div class="tablewrap"><table><tr><th>#</th><th>ID</th><th>Question</th><th>Counts</th><th></th></tr>${rows}</table></div>
    ${goingOut.length ? html`<p><b>Taken out</b> (no longer shown or counted; answers kept): ${goingOut.map((q) => q.heading).join(', ')}</p>` : ''}
    ${errors.length ? '' : changes ? html`<label>Note for the history (optional)<input id="q-note" maxlength="200"></label>
      <div class="row end"><button class="btn" type="button" data-act="q-cancel">Cancel</button><button class="btn primary" type="button" data-act="q-publish">Publish ${changes} change${changes === 1 ? '' : 's'}</button></div>`
      : html`<p class="muted">This file is the same as the questions already published.</p><div class="row end"><button class="btn" type="button" data-act="q-cancel">Close</button></div>`}
  </div>`.s;
  $('q-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function publishQuestions() {
  const u = qUpload; if (!u || u.errors.length) return;
  const note = ($('q-note') || {}).value || '';
  await ask({
    title: 'Publish these questions?', ok: 'Publish',
    body: html`<p class="muted small">Members see the new questions the next time they open the app. You can go back by uploading an earlier file from the history.</p>`,
    run: async () => {
      const items = u.items.map((q) => ({ id: q.id, heading: q.heading, left: q.left, right: q.right, explanation: q.explanation, counts: q.counts, faith_picker: q.faith_picker }));
      await rpc('admin_publish_questions', { p_items: items, p_source: u.source, p_note: note });
      toast('Questions published'); route(); return true;
    },
  });
}

// Reads a picture and makes a PNG of up to 320 × 128 pixels (transparency kept)
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) return reject(new Error('That picture is over 5 MB.'));
    const r = new FileReader();
    r.onerror = () => reject(new Error('Couldn’t read that picture.'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file isn’t a picture the browser can open.'));
      img.onload = () => {
        const w0 = img.naturalWidth || 128, h0 = img.naturalHeight || 128, k = Math.min(1, 320 / w0, 128 / h0);   // up to 320 wide and 128 high
        const w = Math.max(1, Math.round(w0 * k)) || 128, h = Math.max(1, Math.round(h0 * k)) || 128;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
        // A picture on a plain background (all four corners the same solid colour, as in a JPEG or a
        // picture saved on a coloured background): that colour is made see-through, so it sits on the app
        try {
          const d = g.getImageData(0, 0, w, h), px = d.data, at = (x, y) => (y * w + x) * 4;
          const cs = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)].map((i) => [px[i], px[i + 1], px[i + 2], px[i + 3]]);
          const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
          if (cs.every((c4) => c4[3] > 250 && near(c4, cs[0]))) {
            const bg = cs[0];
            for (let i = 0; i < px.length; i += 4) {
              const dist = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
              if (dist < 60) px[i + 3] = Math.round(px[i + 3] * Math.max(0, (dist - 20) / 40));
            }
            g.putImageData(d, 0, 0);
            shrinkImage.removedBackground = true;
          } else shrinkImage.removedBackground = false;
        } catch (_) { shrinkImage.removedBackground = false; }
        const out = c.toDataURL('image/png');
        if (out.length > 140000) return reject(new Error('That picture is too detailed. Try a simpler one.'));
        resolve(out);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function saveText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadQuestions() { if (qData) saveText('BASED-questions.txt', questionsFile(qData.questions)); }
async function downloadQuestionVersion(id) {
  try { const t = await rpc('admin_question_version_file', { p_id: Number(id) }); if (t) saveText(`BASED-questions-set-${id}.txt`, t); else toast('No file was kept for that set.', true); }
  catch (err) { toast(errorText(err), true); }
}

// ─── Free extras ────────────────────────────────────────────────────────────
// Give members extra free views, interests or super interests. They're used once the member's
// usual allowance runs out, and also work for something their plan doesn't include.
const EXTRA_NAMES = { profile_views: ['profile view', 'profile views'], express_interest: ['interest', 'interests'], super_interest: ['super interest', 'super interests'] };
const PLAN_GIFTS = { plan_plus: 'BASED+', plan_gold: 'BASED Gold' };
const extraWhat = (f, n) => PLAN_GIFTS[f] || `${n} ${EXTRA_NAMES[f] ? EXTRA_NAMES[f][n === 1 ? 0 : 1] : f}`;
function targetText(t) {
  const bits = [];
  if (t.emails && t.emails.length) bits.push(t.emails.length === 1 ? t.emails[0] : `${t.emails.length} email addresses`);
  if (t.country) bits.push(`in ${t.country}`);
  if (t.areas && t.areas.length) bits.push(`postcodes ${t.areas.join(', ')}`);
  if (t.joined_from || t.joined_to) bits.push(`joined ${t.joined_from ? 'from ' + day(t.joined_from) : ''}${t.joined_from && t.joined_to ? ' ' : ''}${t.joined_to ? 'to ' + day(t.joined_to) : ''}`);
  if (t.include_test === false) bits.push('not test accounts');
  if (t.verified_only) bits.push('verified only');
  return bits.join(' · ') || '—';
}
function extrasTarget() {
  const f = $('f-extras');
  const emails = f.emails.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const areas = f.areas.value.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  const t = {};
  if (emails.length) t.emails = emails;
  if (f.country.value.trim()) t.country = f.country.value.trim().toUpperCase();
  if (areas.length) t.areas = areas;
  if (f.joined_from.value) t.joined_from = f.joined_from.value;
  if (f.joined_to.value) t.joined_to = f.joined_to.value;
  t.include_test = f.include_test.checked;
  if (PLAN_GIFTS[f.feature.value]) t.verified_only = true;   // free plans only go to verified members
  return t;
}
let extrasChecked = null; // { key, count }
async function pageExtras() {
  const d = await rpc('admin_bonus_grants');
  extrasChecked = null;
  setMain(html`<h1>Free extras</h1>
    <p class="muted">Give members extra free profile views, interests or super interests, or a free upgrade to BASED+ or BASED Gold for a while. They’re used once a member’s usual allowance runs out, and they also work for something their plan doesn’t include (a free super interest, say). Members see how many they have left on the Search screen.</p>
    ${d.can_grant ? html`<form class="card stack" id="f-extras">
      <div class="row"><label class="grow">What<select name="feature"><option value="profile_views">Profile views</option><option value="express_interest">Interests</option><option value="super_interest">Super interests</option><option value="plan_plus">Upgrade to BASED+ (verified members only)</option><option value="plan_gold">Upgrade to BASED Gold (verified members only)</option></select></label>
        <label id="x-amount">How many each<input name="amount" type="number" min="1" max="1000" value="5" required></label>
        <label><span id="x-ends-label">Ends on (optional)</span><input name="expires" type="date"></label></div>
      <p class="muted small" id="x-plan-note" hidden>A free plan gives everything that plan includes until the end of the day you choose, with nothing to pay and no card needed. It only goes to members who are verified. Anyone already paying for a higher plan keeps it.</p>
      <h3>Who gets them</h3>
      <p class="muted small">Fill in any of these. A member has to match everything you fill in. Only active members are included.</p>
      <label>Particular members: their email addresses (one per line, or separated by commas)<textarea name="emails" rows="3" autocomplete="off"></textarea></label>
      <div class="row"><label>Country<input name="country" maxlength="2" placeholder="e.g. GB" autocomplete="off"></label>
        <label class="grow">Postcode areas or districts<input name="areas" placeholder="e.g. LS, YO24, SW1" autocomplete="off"></label></div>
      <div class="row"><label>Joined from<input name="joined_from" type="date"></label><label>Joined to<input name="joined_to" type="date"></label></div>
      <label class="small"><input type="checkbox" name="include_test" checked> Include test accounts</label>
      <label class="small"><input type="checkbox" name="notify" checked> Tell them in the app (“You’ve been given …”)</label>
      <label>Note for the history (optional)<input name="note" maxlength="200"></label>
      <div id="x-check" role="status"></div>
      <div class="row end"><button class="btn" type="button" id="x-preview">Check who this reaches</button><button class="btn primary" type="submit" id="x-give" disabled>Give</button></div>
    </form>` : html`<p class="muted">Only an owner can give free extras.</p>`}
    <h3 class="mt">Given so far</h3>
    ${d.grants.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>What</th><th>Who</th><th>Members</th><th>Used</th><th>Ends</th><th></th></tr>
      ${d.grants.map((g) => html`<tr><td class="nowrap">${when(g.created_at)}<br><span class="muted small">${g.created_by || ''}</span></td>
        <td>${PLAN_GIFTS[g.feature] ? html`${PLAN_GIFTS[g.feature]} free` : html`${extraWhat(g.feature, g.amount)} each`}${g.note ? html`<br><span class="muted small">${g.note}</span>` : ''}</td>
        <td class="small">${targetText(g.target || {})}</td><td>${g.members}</td><td>${PLAN_GIFTS[g.feature] ? '—' : `${g.used} of ${g.given}`}</td>
        <td class="nowrap">${g.expires_at ? day(new Date(new Date(g.expires_at).getTime() - 1000)) : 'No end'}</td>
        <td>${g.withdrawn_at ? html`<span class="badge">Withdrawn</span>` : d.can_grant ? html`<button class="btn small" type="button" data-act="x-withdraw" data-id="${g.id}" data-what="${PLAN_GIFTS[g.feature] ? PLAN_GIFTS[g.feature] + ' free' : extraWhat(g.feature, g.amount)} for ${g.members} member${g.members === 1 ? '' : 's'}">Withdraw</button>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">Nothing given yet.</p>`}`);
  const f = $('f-extras'); if (!f) return;
  const syncKind = () => {
    const plan = !!PLAN_GIFTS[f.feature.value];
    $('x-amount').hidden = plan; f.amount.required = !plan;
    f.expires.required = plan; $('x-ends-label').textContent = plan ? 'Ends on' : 'Ends on (optional)';
    $('x-plan-note').hidden = !plan;
  };
  f.feature.addEventListener('change', syncKind); syncKind();
  const key = () => JSON.stringify([extrasTarget(), f.feature.value, f.amount.value, f.expires.value]);
  const stale = () => { if (extrasChecked && extrasChecked.key !== key()) { extrasChecked = null; $('x-give').disabled = true; $('x-give').textContent = 'Give'; $('x-check').innerHTML = html`<p class="muted small">Changed — check again before giving.</p>`.s; } };
  f.addEventListener('input', stale); f.addEventListener('change', stale);
  $('x-preview').addEventListener('click', async () => {
    const out = $('x-check'); out.innerHTML = html`<p class="muted small">Checking…</p>`.s;
    try {
      const r = await rpc('admin_bonus_preview', { p_target: extrasTarget() });
      extrasChecked = { key: key(), count: r.count };
      const plan = PLAN_GIFTS[f.feature.value];
      out.innerHTML = html`<div class="note-box"><b>${r.count} ${plan ? 'verified ' : ''}member${r.count === 1 ? '' : 's'}</b> would get ${plan ? html`${plan} free${f.expires.value ? ' until ' + day(f.expires.value) : ''}` : html`${extraWhat(f.feature.value, Number(f.amount.value) || 0)} each`}.
        ${r.unknown_emails.length ? html`<p class="err">No account for: ${r.unknown_emails.join(', ')}</p>` : ''}
        ${r.sample.length ? html`<p class="small">${r.count > r.sample.length ? 'Including (newest first): ' : ''}${r.sample.map((m) => `${m.name || 'No name yet'} (joined ${day(m.joined)})`).join(', ')}</p>` : ''}</div>`.s;
      $('x-give').disabled = r.count === 0;
      $('x-give').textContent = r.count ? `Give to ${r.count} member${r.count === 1 ? '' : 's'}` : 'Give';
    } catch (err) { out.innerHTML = html`<p class="err">${errorText(err)}</p>`.s; $('x-give').disabled = true; }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!extrasChecked || extrasChecked.key !== key()) { toast('Check who this reaches first.', true); return; }
    if (PLAN_GIFTS[f.feature.value] && !f.expires.value) { toast('Choose the date the free plan ends.', true); return; }
    const n = extrasChecked.count, what = PLAN_GIFTS[f.feature.value] ? `${PLAN_GIFTS[f.feature.value]} until ${day(f.expires.value)}` : extraWhat(f.feature.value, Number(f.amount.value));
    await ask({
      title: `Give ${what} to ${n} member${n === 1 ? '' : 's'}?`, ok: 'Give',
      body: html`<p class="muted small">${f.notify.checked ? 'Each of them gets a message in the app. ' : ''}You can withdraw anything unused later.</p>`,
      run: async () => {
        const r = await rpc('admin_grant_bonus', { p_target: extrasTarget(), p_feature: f.feature.value, p_amount: PLAN_GIFTS[f.feature.value] ? 1 : Number(f.amount.value),
          p_expires: f.expires.value || null, p_note: f.note.value || null, p_notify: f.notify.checked });
        toast(`Given to ${r.members} member${r.members === 1 ? '' : 's'}`); route(); return true;
      },
    });
  });
}
async function withdrawExtras(id, what) {
  await ask({
    title: 'Withdraw this gift?', ok: 'Withdraw', danger: true,
    body: html`<p class="muted small">${what}. ${/BASED/.test(what) ? 'The free plan ends straight away and they go back to their usual plan.' : 'Anything not yet used is taken back; anything used stays used.'}</p>${reasonField()}`,
    run: async (v) => { await rpc('admin_withdraw_bonus', { p_grant: Number(id), p_reason: v.reason }); toast('Withdrawn'); route(); return true; },
  });
}

// ─── Referrals ──────────────────────────────────────────────────────────────
const REF_BASE = 'https://baseddatingonline.com/?ref=';
const REF_KIND = { member: 'Member', campaign: 'Campaign', former: 'Former member', unknown: 'Not a current code' };
async function pageReferrals(open) {
  const d = await rpc('admin_referrals');
  const codes = d.codes || [];
  const tot = codes.reduce((t, c) => ({ s: t.s + c.signups, v: t.v + c.verified, p: t.p + c.paying }), { s: 0, v: 0, p: 0 });
  const who = (c) => c.kind === 'member' ? html`<a href="#member/${c.member_id}">${c.member_name || 'Member'}</a>` : c.label ? c.label : html`<span class="muted">${REF_KIND[c.kind]}</span>`;
  setMain(html`<h1>Referrals</h1>
    <p class="muted">A link like <code>${REF_BASE}henry</code> records the code against anyone who signs up after clicking it. Each member’s Invite friends link carries their own code. Add a campaign code here for an influencer, an advert or an event. Counts leave out test accounts.</p>
    ${d.can_edit ? html`<form class="card stack" id="f-ref">
      <div class="row"><label>Code<input name="code" maxlength="30" placeholder="e.g. henry" autocomplete="off" required></label>
        <label class="grow">Who or what it’s for<input name="label" maxlength="80" placeholder="e.g. Henry (Instagram)" autocomplete="off" required></label>
        <button class="btn primary" type="submit">Add code</button></div>
      <p class="muted small">2 to 30 letters, numbers, - or _. Codes aren’t case sensitive.</p>
    </form>` : ''}
    <div class="row mt"><span class="badge">${codes.length} code${codes.length === 1 ? '' : 's'}</span><span class="badge">${tot.s} signed up</span><span class="badge green">${tot.v} verified</span><span class="badge blue">${tot.p} paying</span></div>
    ${codes.length ? html`<div class="tablewrap mt"><table><tr><th>Code</th><th>Who</th><th>Signed up</th><th>Verified</th><th>Paying</th><th>Last sign-up</th><th></th></tr>
      ${codes.map((c) => html`<tr class="${c.code === open ? 'sel' : ''}"><td class="nowrap"><code>${c.code}</code></td>
        <td>${who(c)}${c.kind === 'campaign' ? html`<br><span class="muted small">Added ${day(c.created_at)}${c.created_by ? ' by ' + c.created_by : ''}</span>` : c.kind === 'member' ? html` <span class="muted small">(member)</span>` : ''}</td>
        <td>${c.signups}</td><td>${c.verified}</td><td>${c.paying}</td><td class="nowrap">${day(c.last_signup)}</td>
        <td class="nowrap"><button class="btn small" type="button" data-act="ref-copy" data-code="${c.code}">Copy link</button>
          ${c.signups ? html`<a class="btn small" href="#referrals?c=${encodeURIComponent(c.code)}">Who joined</a>` : ''}
          ${d.can_edit && c.kind === 'campaign' ? html`<button class="btn small" type="button" data-act="ref-label" data-code="${c.code}" data-label="${c.label || ''}">Rename</button><button class="btn small danger" type="button" data-act="ref-remove" data-code="${c.code}" data-n="${c.signups}">Remove</button>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted mt">No referrals yet. Codes appear here once someone signs up with one, or when you add a campaign code.</p>`}
    <div id="ref-members"></div>`);
  const f = $('f-ref');
  if (f) f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try {
      const c = await rpc('admin_add_referral_code', { p_code: f.querySelector('[name=code]').value, p_label: f.querySelector('[name=label]').value });
      toast('Added ' + REF_BASE + c);
      route();
    } catch (err) { toast(errorText(err), true); } finally { btn.disabled = false; }
  });
  if (open) {
    const box = $('ref-members');
    box.innerHTML = html`<p class="muted">Loading…</p>`.s;
    try {
      const ms = await rpc('admin_referral_members', { p_code: open });
      box.innerHTML = html`<div class="card mt"><h3>Joined with <code>${open}</code></h3>
        ${ms.length ? html`<div class="tablewrap"><table><tr><th>Name</th><th>Email</th><th>Joined</th><th>Verified</th><th>Plan</th><th>Status</th></tr>
          ${ms.map((m) => html`<tr><td><a href="#member/${m.id}">${m.name || 'No name'}</a>${m.test ? html` <span class="badge">Test</span>` : ''}</td><td>${m.email || '—'}</td><td class="nowrap">${day(m.joined)}</td>
            <td>${m.verified ? html`<span class="ok">Yes</span>` : 'No'}</td><td>${m.tier && m.tier !== 'none' ? m.tier + (m.plan_status ? ' (' + m.plan_status + ')' : '') : 'Free'}</td><td>${m.status}</td></tr>`)}
        </table></div>` : html`<p class="muted">Nobody yet.</p>`}
        <a class="btn small mt" href="#referrals">Close</a></div>`.s;
      box.scrollIntoView({ block: 'nearest' });
    } catch (err) { box.innerHTML = html`<p class="err">${errorText(err)}</p>`.s; }
  }
}
async function copyRefLink(code) {
  const link = REF_BASE + code;
  try { await navigator.clipboard.writeText(link); toast('Copied ' + link); }
  catch (_) { await ask({ title: 'Invite link', ok: 'Done', body: html`<p class="muted small">Copy this link:</p><input readonly value="${link}">` }); }
}
async function renameRefCode(code, label) {
  await ask({
    title: 'Rename ' + code, ok: 'Save',
    body: html`<label>Who or what it’s for<input name="label" maxlength="80" value="${label}" required></label>`,
    run: async (v) => { await rpc('admin_label_referral_code', { p_code: code, p_label: v.label }); toast('Saved'); route(); return true; },
  });
}
async function removeRefCode(code, n) {
  await ask({
    title: 'Remove ' + code + '?', ok: 'Remove', danger: true,
    body: html`<p class="muted small">The link stops counting new sign-ups.${Number(n) ? ` The ${n} member${n === '1' ? '' : 's'} who joined with it keep it on their profile, and it then shows here as “Not a current code”.` : ''}</p>`,
    run: async () => { await rpc('admin_remove_referral_code', { p_code: code }); toast('Removed'); route(); return true; },
  });
}

// ─── Areas (pre-registration) ────────────────────────────────────────────────
let AREA_COUNTRIES = [['GB', 'United Kingdom'], ['AU', 'Australia'], ['US', 'United States'], ['CA', 'Canada']]; // replaced by the open countries (loadOpenCountries)
let areasData = null;
const areaFormHtml = (x = {}) => html`
  <div class="row"><label class="grow">Name<input name="name" maxlength="60" placeholder="e.g. Leeds" value="${x.name || ''}" required autocomplete="off"></label>
    <label>Country<select name="country">${AREA_COUNTRIES.map(([c, n]) => html`<option value="${c}" ${c === (x.country || 'GB') ? raw('selected') : ''}>${n}</option>`)}</select></label></div>
  <div class="row"><label class="grow">Centre: a postcode, postcode district or town<input name="place" maxlength="60" placeholder="e.g. LS1 4BR, LS1 or Leeds" autocomplete="off"></label>
    <button class="btn" type="button" data-act="area-find">Find</button></div>
  <div class="row"><label>Latitude<input name="lat" type="number" step="any" value="${x.lat ?? ''}" required></label><label>Longitude<input name="lng" type="number" step="any" value="${x.lng ?? ''}" required></label>
    <label>Radius (miles)<input name="radius" type="number" min="1" max="200" value="${x.radius_miles ?? 25}" required></label></div>
  <div class="row"><label>Open at (members)<input name="target" type="number" min="1" value="${x.target ?? 300}" required></label>
    <label>Smaller sex at least (%)<input name="min_pct" type="number" min="0" max="50" value="${x.min_pct ?? 40}" required></label></div>
  <p class="muted small" data-found></p>`;
// Looks up a place: UK postcodes, districts and towns through postcodes.io; elsewhere through Photon.
// Returns the best match first, then any other places with that name, so staff can pick the right one
// (e.g. "Hull" is a city, but also a hamlet in Shetland).
const PLACE_RANK = ['city', 'town', 'suburban area', 'village', 'hamlet'];
async function findPlace(country, q) {
  q = String(q || '').trim(); if (!q) throw new Error('Type a postcode or a town.');
  const get = async (u) => { const r = await fetch(u); return r.ok ? r.json() : null; };
  if (country === 'GB') {
    const pc = q.replace(/\s+/g, '').toUpperCase();
    let d = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc) ? await get('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc)) : null;
    if (d?.result) return [{ lat: d.result.latitude, lng: d.result.longitude, label: d.result.postcode + (d.result.admin_district ? ', ' + d.result.admin_district : '') }];
    d = /^[A-Z]{1,2}\d[A-Z\d]?$/.test(pc) ? await get('https://api.postcodes.io/outcodes/' + encodeURIComponent(pc)) : null;
    if (d?.result) return [{ lat: d.result.latitude, lng: d.result.longitude, label: d.result.outcode + ' (postcode district)' }];
    const lists = await Promise.all([q, 'Kingston upon ' + q, q + ' upon'].map((t, i) => i && q.split(/\s+/).length > 1 ? null : get('https://api.postcodes.io/places?limit=20&q=' + encodeURIComponent(t))));
    const seen = new Set(), all = [];
    for (const l of lists) for (const x of (l?.result || [])) if (!seen.has(x.code)) { seen.add(x.code); all.push(x); }
    const want = q.toLowerCase(), nm = (x) => String(x.name_1 || '').toLowerCase();
    const matches = (x) => nm(x) === want || nm(x).endsWith(' upon ' + want) || nm(x).startsWith(want + ' upon ') || nm(x).startsWith(want + '-');
    const rank = (x) => { const r = PLACE_RANK.indexOf(String(x.local_type || '').toLowerCase()); return (matches(x) ? 0 : 10) + (r < 0 ? 9 : r); };
    const ranked = all.filter((x) => PLACE_RANK.includes(String(x.local_type || '').toLowerCase()) || matches(x)).sort((a, b) => rank(a) - rank(b)).slice(0, 6);
    if (ranked.length) return ranked.map((p) => ({ lat: p.latitude, lng: p.longitude,
      label: p.name_1 + (p.county_unitary || p.region ? ', ' + (p.county_unitary || p.region) : '') + (p.local_type ? ' (' + String(p.local_type).toLowerCase() + ')' : '') }));
  } else {
    const d = await get('https://photon.komoot.io/api/?limit=8&q=' + encodeURIComponent(q));
    const fs = (d?.features || []).filter((x) => String(x.properties?.countrycode || '').toUpperCase() === country).slice(0, 6);
    if (fs.length) return fs.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: [f.properties.name, f.properties.state].filter(Boolean).join(', ') + (f.properties.type ? ' (' + f.properties.type + ')' : '') }));
  }
  throw new Error('Couldn’t find that place. Try another spelling, a postcode, or enter the latitude and longitude.');
}
function areaUse(form, f, others) {
  const out = form.querySelector('[data-found]');
  form.querySelector('[name=lat]').value = Number(f.lat).toFixed(5);
  form.querySelector('[name=lng]').value = Number(f.lng).toFixed(5);
  out.textContent = '';
  const b = document.createElement('b'); b.textContent = 'Centred on ' + f.label; out.append(b);
  if (others.length) {
    out.append(document.createElement('br'), 'Not the right place? ');
    others.forEach((o, i) => {
      const a = document.createElement('a'); a.href = '#'; a.textContent = o.label;
      a.addEventListener('click', (e) => { e.preventDefault(); areaUse(form, o, [f, ...others.filter((x) => x !== o)]); });
      if (i) out.append(' · '); out.append(a);
    });
  }
}
async function areaFind(form) {
  const out = form.querySelector('[data-found]');
  out.textContent = 'Looking…';
  try {
    const found = await findPlace(form.querySelector('[name=country]').value, form.querySelector('[name=place]').value);
    areaUse(form, found[0], found.slice(1));
    const nm = form.querySelector('[name=name]'); if (!nm.value.trim()) nm.value = String(found[0].label).split(',')[0].replace(/^Kingston upon /, '');
  } catch (e) { out.textContent = e.message; }
}
const areaArgs = (v, id) => ({
  p_id: id || null, p_name: v.name, p_country: v.country, p_lat: Number(v.lat), p_lng: Number(v.lng),
  p_radius: Number(v.radius), p_target: Number(v.target), p_min_pct: Number(v.min_pct),
});
function areaReady(x) {
  const small = Math.min(x.men, x.women), share = x.total ? Math.round(100 * small / x.total) : 0;
  return { share, ready: x.total >= x.target && share >= x.min_pct };
}
async function pageAreas() {
  await loadOpenCountries();
  const d = areasData = await rpc('admin_areas');
  // An open area nobody lives in (e.g. centred in the wrong place) can still be removed
  await Promise.all((d.areas || []).filter((x) => x.status === 'open').map(async (x) => {
    try { x.empty = await rpc('admin_area_empty', { p_id: x.id }); } catch (e) { x.empty = false; }
  }));
  const ed = d.can_edit;
  setMain(html`<h1>Areas</h1>
    <p class="muted">While pre-registration is on, people can sign up and get their profile ready, but can only search, see profiles and send interests once they live inside an <b>open</b> area. Everyone still waiting is invisible. Opening an area lets everyone in it in, gives founding members ${d.founding_months} months of BASED+ free (it starts once their ID is verified), and emails them.</p>
    <div class="card"><div class="row"><h3 class="grow">Pre-registration is ${d.prereg_on ? html`<span class="ok">on</span>` : html`<span class="muted">off</span>`}</h3>
      ${ed ? html`<button class="btn ${d.prereg_on ? 'danger' : 'primary'}" type="button" data-act="prereg-toggle" data-on="${d.prereg_on ? '' : '1'}">${d.prereg_on ? 'Open BASED everywhere' : 'Turn on pre-registration'}</button>` : ''}</div>
      <p class="muted small">${d.prereg_on ? html`${d.waiting_total} member${d.waiting_total === 1 ? ' is' : 's are'} waiting for their area to open (not counting test accounts).` : 'BASED is open to everyone. Turning pre-registration on pauses search for anyone outside an open area, so open an area for your testers first.'}</p>
      <p class="muted small">Rewards so far: ${d.rewards.founding} founding member${d.rewards.founding === 1 ? '' : 's'} (${d.rewards.founding_started} started), ${d.rewards.invite} invite reward${d.rewards.invite === 1 ? '' : 's'} (${d.rewards.invite_started} started). Invite reward: ${d.invite_months} month of BASED+ once 3 friends register.</p></div>
    ${ed ? html`<form class="card stack" id="f-area"><h3>Add an area</h3>${areaFormHtml()}<div class="row end"><button class="btn primary" type="submit">Add area</button></div></form>` : ''}
    <h3 class="mt">Areas</h3>
    ${d.areas.length ? html`<div class="tablewrap"><table><tr><th>Area</th><th>Status</th><th>Members</th><th>Men</th><th>Women</th><th>Test accounts</th><th></th></tr>
      ${d.areas.map((x) => { const r = areaReady(x); const pct = Math.min(100, Math.round(100 * x.total / Math.max(1, x.target))); return html`<tr>
        <td><b>${x.name}</b><br><span class="muted small">${x.country} · ${x.radius_miles} miles round ${Number(x.lat).toFixed(3)}, ${Number(x.lng).toFixed(3)}</span></td>
        <td>${x.status === 'open' ? html`<span class="badge green">Open</span><br><span class="muted small">${day(x.opened_at)}${x.opened_by ? ' · ' + x.opened_by : ''}</span>` : r.ready ? html`<span class="badge blue">Ready to open</span>` : html`<span class="badge">Waiting</span>`}</td>
        <td class="nowrap">${x.total} of ${x.target}<div class="bar"><i data-pct="${pct}"></i></div></td>
        <td>${x.men}</td><td>${x.women}<br><span class="muted small">smaller sex ${r.share}% (needs ${x.min_pct}%)</span></td><td>${x.test_accounts}</td>
        <td class="nowrap">${ed ? html`<button class="btn small" type="button" data-act="area-edit" data-id="${x.id}">Change</button>${x.status !== 'open' || x.empty === true ? html`<button class="btn small" type="button" data-act="area-remove" data-id="${x.id}">Remove</button>` : ''}${x.status !== 'open' ? html`<button class="btn small primary" type="button" data-act="area-open" data-id="${x.id}">Open</button>` : ''}` : ''}</td></tr>`; })}
    </table></div>` : html`<p class="muted">No areas yet. Add the first town or city above.</p>`}
    <h3 class="mt">Members outside every area</h3>
    <p class="muted small">Where people are signing up that no area covers yet: postcode districts in the UK, towns elsewhere. Test accounts aren’t counted.</p>
    ${d.outside.length ? html`<div class="tablewrap"><table><tr><th>Country</th><th>Place</th><th>Members</th></tr>${d.outside.map((o) => html`<tr><td>${o.country || '—'}</td><td>${o.place}</td><td>${o.members}</td></tr>`)}</table></div>` : html`<p class="muted">Nobody outside an area.</p>`}`);
  // The page's security policy doesn't allow style attributes, so the bar widths are set here
  for (const b of document.querySelectorAll('.bar i[data-pct]')) b.style.width = Math.min(100, Number(b.dataset.pct) || 0) + '%';
  const f = $('f-area');
  if (f) f.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try { await rpc('admin_save_area', areaArgs(Object.fromEntries(new FormData(f)))); toast('Area added'); route(); }
    catch (err) { toast(errorText(err), true); } finally { btn.disabled = false; }
  });
}
async function editArea(id) {
  const x = (areasData?.areas || []).find((a) => a.id === id); if (!x) return;
  await ask({
    title: 'Change ' + x.name, ok: 'Save',
    body: html`${x.status === 'open' ? html`<p class="muted small">This area is open, so only its name and numbers can change.</p>` : ''}${areaFormHtml(x)}`,
    run: async (v) => { await rpc('admin_save_area', areaArgs(v, id)); toast('Saved'); route(); return true; },
  });
}
async function removeArea(id) {
  const x = (areasData?.areas || []).find((a) => a.id === id); if (!x) return;
  await ask({ title: 'Remove ' + x.name + '?', ok: 'Remove', danger: true, body: x.status === 'open' ? html`<p class="muted small">Nobody lives inside this open area, so nobody loses access.</p>` : html`<p class="muted small">Members there keep their profiles and carry on waiting.</p>`,
    run: async () => { await rpc('admin_delete_area', { p_id: id }); toast('Removed'); route(); return true; } });
}
async function openArea(id) {
  const x = (areasData?.areas || []).find((a) => a.id === id); if (!x) return;
  const r = areaReady(x);
  await ask({
    title: 'Open ' + x.name + '?', ok: 'Open ' + x.name, danger: !r.ready,
    body: html`<p class="muted small">${x.total} member${x.total === 1 ? '' : 's'} (plus ${x.test_accounts} test account${x.test_accounts === 1 ? '' : 's'}) will be let in, become founding members and be emailed straight away. This can’t be undone.</p>
      ${r.ready ? '' : html`<p class="err">It hasn’t reached its target yet (${x.total} of ${x.target}, smaller sex ${r.share}% of ${x.min_pct}% needed).</p>`}
      <label>Type the area’s name to confirm<input name="confirm" autocomplete="off" required></label>${reasonField()}`,
    run: async (v) => {
      if (String(v.confirm).trim().toLowerCase() !== x.name.toLowerCase()) throw new Error('CONFIRM: Type the area’s name exactly to confirm.');
      const d = await act('open_area', { area_id: id, reason: v.reason }, false, OPEN_AREA_URL);
      toast(`${x.name} is open: ${d.let_in} let in, ${d.emails} email${d.emails === 1 ? '' : 's'} on the way`); route(); return true;
    },
  });
}
async function togglePrereg(on) {
  await ask({
    title: on ? 'Turn on pre-registration?' : 'Open BASED everywhere?', ok: on ? 'Turn on' : 'Open everywhere', danger: !on,
    body: html`<p class="muted small">${on
      ? 'Anyone outside an open area, including test accounts, will only see the waiting screen until their area opens.'
      : `Everyone can search straight away. The ${areasData?.waiting_total ?? 0} members still waiting become founding members (${areasData?.founding_months ?? 2} months of BASED+ free once verified). Nobody is emailed: send a message from the Messages page if you want to tell them.`}</p>${reasonField()}`,
    run: async (v) => { const d = await rpc('admin_set_prereg', { p_on: on, p_reason: v.reason }); toast(on ? 'Pre-registration is on' : `BASED is open everywhere (${d.founding_rewards} founding members)`); route(); return true; },
  });
}

// ─── Offers (top-ups) ───────────────────────────────────────────────────────
let OFFER_CURRENCIES = [['gbp', '£', 'Pounds (UK and elsewhere)'], ['usd', '$', 'US dollars'], ['aud', 'A$', 'Australian dollars'], ['cad', 'C$', 'Canadian dollars']]; // replaced by the open countries' currencies (loadOpenCountries)
// ─── Open countries: which countries can sign up, and the currency each pays in ──
// The Areas, Offers and Plans pages follow the open countries. Before SQL 59 the lists above are used.
const CURRENCY_NAMES = { gbp: 'Pounds', eur: 'Euros', usd: 'US dollars', aud: 'Australian dollars', cad: 'Canadian dollars', nzd: 'New Zealand dollars',
  chf: 'Swiss francs', sek: 'Swedish kronor', nok: 'Norwegian kroner', dkk: 'Danish kroner', pln: 'Polish złoty', czk: 'Czech koruna', ron: 'Romanian lei',
  zar: 'South African rand', sgd: 'Singapore dollars', hkd: 'Hong Kong dollars', ils: 'Israeli shekels', aed: 'UAE dirhams', mxn: 'Mexican pesos',
  brl: 'Brazilian reais', inr: 'Indian rupees' };
const CUR_SIGNS = { gbp: '£', usd: '$', aud: 'A$', cad: 'C$', eur: '€', nzd: 'NZ$' };
function curSign(c) {
  if (CUR_SIGNS[c]) return CUR_SIGNS[c];
  try { const v = new Intl.NumberFormat('en-GB', { style: 'currency', currency: c.toUpperCase() }).formatToParts(0).find((x) => x.type === 'currency').value; return /^[A-Za-z]+$/.test(v) ? v + ' ' : v; }
  catch (_) { return c.toUpperCase() + ' '; }
}
let openCountriesData = null;
async function loadOpenCountries() {
  try {
    const d = openCountriesData = await rpc('admin_open_countries');
    const list = d.countries || [];
    const curs = ['gbp', ...new Set(list.map((c) => c.currency).filter((c) => c !== 'gbp'))];
    OFFER_CURRENCIES = curs.map((c) => {
      const where = list.filter((x) => x.currency === c).map((x) => regionName(x.code));
      return [c, curSign(c), c === 'gbp' ? 'Pounds (UK and elsewhere)' : `${CURRENCY_NAMES[c] || c.toUpperCase()}${where.length ? ' (' + where.join(', ') + ')' : ''}`];
    });
    AREA_COUNTRIES = list.map((x) => [x.code, regionName(x.code)]).sort((a, b) => (a[0] === 'GB' ? -1 : b[0] === 'GB' ? 1 : a[1].localeCompare(b[1])));
  } catch (_) { openCountriesData = null; } // before SQL 59: keep the built-in lists
  return openCountriesData;
}
let offersData = null;
const money = (cur, n) => ((OFFER_CURRENCIES.find((c) => c[0] === cur) || [0, curSign(cur)])[1]) + (Number(n) / 100).toFixed(2);
const offerFormHtml = (o = {}) => html`
  <div class="row"><label class="grow">Name<input name="name" maxlength="40" placeholder="e.g. Starter pack" value="${o.name || ''}" required autocomplete="off"></label>
    <label>Order on the list<input name="sort" type="number" value="${o.sort ?? 0}"></label></div>
  <div class="row"><label>Profile views<input name="views" type="number" min="0" max="1000" value="${o.views ?? 10}"></label>
    <label>Interests<input name="interests" type="number" min="0" max="1000" value="${o.interests ?? 5}"></label>
    <label>Super interests<input name="supers" type="number" min="0" max="1000" value="${o.supers ?? 1}"></label>
    <label>Lasts for (days, blank = no end)<input name="valid_days" type="number" min="1" max="3650" value="${o.valid_days ?? ''}"></label></div>
  <div class="row">${OFFER_CURRENCIES.map(([c, sign, label]) => html`<label>${label} (${sign})<input name="price_${c}" type="number" min="0.5" max="1000" step="0.01" placeholder="${c === 'gbp' ? 'e.g. 2.99' : 'Not sold'}" value="${o.prices && o.prices[c] != null ? (o.prices[c] / 100).toFixed(2) : ''}"></label>`)}</div>
  <label class="small"><input type="checkbox" name="active" ${o.active ? raw('checked') : ''}> On sale</label>`;
function offerArgs(v, id) {
  const prices = {};
  for (const [c] of OFFER_CURRENCIES) { const x = String(v['price_' + c] || '').trim(); if (x) prices[c] = String(Math.round(Number(x) * 100)); }
  const n = (x) => (String(x ?? '').trim() === '' ? 0 : Number(x));
  return { p_id: id || null, p_name: v.name, p_views: n(v.views), p_interests: n(v.interests), p_supers: n(v.supers),
           p_valid_days: String(v.valid_days || '').trim() ? Number(v.valid_days) : null, p_prices: prices, p_active: !!v.active, p_sort: n(v.sort) };
}
const offerWhat = (o) => [o.views ? `${o.views} view${o.views === 1 ? '' : 's'}` : '', o.interests ? `${o.interests} interest${o.interests === 1 ? '' : 's'}` : '',
  o.supers ? `${o.supers} super interest${o.supers === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
async function pageOffers() {
  await loadOpenCountries();
  const d = offersData = await rpc('admin_topup_offers');
  setMain(html`<h1>Offers</h1>
    <p class="muted">Top-up packs that members on the free plans (selfie checked or ID verified) can buy with a one-off payment, from the ⋯ menu in the app. The extras are used once a member’s usual allowance runs out, like Free extras. Members only see offers priced in their own currency: pounds for the UK and anywhere else, dollars for the US, Australia and Canada.</p>
    ${d.can_edit ? html`<form class="card stack" id="f-offer"><h3>Add an offer</h3>${offerFormHtml()}<div class="row end"><button class="btn primary" type="submit">Add offer</button></div></form>` : ''}
    <h3 class="mt">Offers</h3>
    ${d.offers.length ? html`<div class="tablewrap"><table><tr><th>Offer</th><th>What’s in it</th><th>Prices</th><th>Lasts</th><th>Status</th><th>Sold</th><th></th></tr>
      ${d.offers.map((o) => html`<tr><td><b>${o.name}</b></td><td>${offerWhat(o)}</td>
        <td class="nowrap">${OFFER_CURRENCIES.filter(([c]) => o.prices && o.prices[c] != null).map(([c]) => html`${money(c, o.prices[c])}<br>`)}</td>
        <td>${o.valid_days ? `${o.valid_days} days` : 'No end'}</td>
        <td>${o.active ? html`<span class="badge green">On sale</span>` : html`<span class="badge">Not on sale</span>`}</td>
        <td>${o.sold}${Object.keys(o.takings || {}).length ? html`<br><span class="muted small">${Object.entries(o.takings).map(([c, n]) => money(c, n)).join(' · ')}</span>` : ''}</td>
        <td class="nowrap">${d.can_edit ? html`<button class="btn small" type="button" data-act="offer-edit" data-id="${o.id}">Change</button><button class="btn small" type="button" data-act="offer-toggle" data-id="${o.id}">${o.active ? 'Take off sale' : 'Put on sale'}</button>` : ''}</td></tr>`)}
    </table></div>` : html`<p class="muted">No offers yet.</p>`}
    <h3 class="mt">Recent purchases</h3>
    ${d.recent.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>Member</th><th>Offer</th><th>Paid</th></tr>
      ${d.recent.map((r) => html`<tr><td class="nowrap">${when(r.at)}</td><td>${r.member_id ? html`<a href="#member/${r.member_id}">${r.member || 'Member'}</a>` : '—'}</td><td>${r.offer}</td><td>${money(r.currency, r.amount)}</td></tr>`)}
    </table></div>` : html`<p class="muted">Nothing bought yet.</p>`}
    <p class="muted small mt">Payments are in Stripe test mode until Stripe is switched to live.</p>`);
  const f = $('f-offer');
  if (f) f.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    const v = {}; for (const el of f.querySelectorAll('[name]')) v[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    try { await rpc('admin_save_topup_offer', offerArgs(v)); toast('Offer added'); route(); }
    catch (err) { toast(errorText(err), true); } finally { btn.disabled = false; }
  });
}
async function editOffer(id) {
  const o = (offersData?.offers || []).find((x) => String(x.id) === String(id)); if (!o) return;
  await ask({ title: 'Change ' + o.name, ok: 'Save', body: offerFormHtml(o),
    run: async (v) => { await rpc('admin_save_topup_offer', offerArgs(v, o.id)); toast('Saved'); route(); return true; } });
}
async function toggleOffer(id) {
  const o = (offersData?.offers || []).find((x) => String(x.id) === String(id)); if (!o) return;
  try {
    const v = { name: o.name, views: o.views, interests: o.interests, supers: o.supers, valid_days: o.valid_days ?? '', sort: o.sort, active: !o.active };
    for (const [c] of OFFER_CURRENCIES) v['price_' + c] = o.prices && o.prices[c] != null ? (o.prices[c] / 100).toFixed(2) : '';
    await rpc('admin_save_topup_offer', offerArgs(v, o.id)); toast(o.active ? 'Taken off sale' : 'On sale'); route();
  } catch (err) { toast(errorText(err), true); }
}

// ─── Adverts (a "Sponsored" card in Search, or a pop-up when the app opens) ────────
const AD_TIERS = [['liveness', 'Selfie'], ['id', 'ID verified'], ['plus', 'BASED+'], ['gold', 'BASED Gold']];
const AD_IMG = (p) => `${SUPABASE_URL}/storage/v1/object/public/adverts/${encodeURIComponent(p)}`;
let adsData = null;
function adState(a) {
  const now = Date.now();
  if (a.status !== 'active') return html`<span class="badge">Paused</span>`;
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return html`<span class="badge">Ended</span>`;
  if (new Date(a.starts_at).getTime() > now) return html`<span class="badge blue">Starts ${day(a.starts_at)}</span>`;
  return a.test_only ? html`<span class="badge amber">Live · test accounts only</span>` : html`<span class="badge green">Live</span>`;
}
function adWho(a) {
  const c = (a.countries || []).length ? a.countries.map(regionName).join(', ') : 'All open countries';
  const t = (a.tiers || []).map((x) => (AD_TIERS.find((y) => y[0] === x) || [, x])[1]).join(', ');
  const s = a.shown_to === 'male' ? 'Men' : a.shown_to === 'female' ? 'Women' : 'Everyone';
  const ages = a.age_min > 18 || a.age_max < 100 ? ` · ${a.age_min}–${a.age_max}` : '';
  const lean = a.leans === 'left' ? ' · Score leans left' : a.leans === 'right' ? ' · Score leans right' : '';
  return `${s}${ages}${lean} · ${c} · ${t}`;
}
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
async function pageAdverts() {
  await loadOpenCountries();
  const d = adsData = await rpc('admin_adverts');
  setMain(html`<h1>Adverts</h1>
    <p class="muted">Adverts show as a <b>card in Search</b> (after every few profiles) or a <b>pop-up when the app opens</b>, marked “Sponsored”, with a button that opens the advertiser’s website. Members whose plan includes Ad-free (see Plans) never see them, nor does anyone still waiting for their area to open. Only the numbers below are kept: how many saw an advert and how many tapped it.</p>
    ${d.can_edit ? html`<p><a class="btn primary" href="#advert/new">Add an advert</a></p>` : html`<p class="muted small">Only an owner can add or change adverts.</p>`}
    ${d.adverts.length ? html`<div class="tablewrap"><table><tr><th></th><th>Advert</th><th>Where</th><th>Who sees it</th><th>When</th><th>Status</th><th>Seen by</th><th>Taps</th><th>Tap rate</th><th></th></tr>
      ${d.adverts.map((a) => html`<tr>
        <td>${a.image_path ? html`<img class="ad-thumb" src="${AD_IMG(a.image_path)}" alt="">` : html`<span class="ad-thumb none">No image</span>`}</td>
        <td><b>${a.name}</b><br><span class="muted small">${a.title}</span></td>
        <td>${a.format === 'popup' ? `Pop-up, up to ${a.per_day}× a day` : `Search card, every ${a.every_n} profiles`}</td>
        <td class="small">${adWho(a)}</td>
        <td class="nowrap small">${day(a.starts_at)} –<br>${a.ends_at ? day(a.ends_at) : 'no end'}</td>
        <td>${adState(a)}</td>
        <td>${a.people}<br><span class="muted small">${a.views} views · ${a.views_7d} this week</span></td>
        <td>${a.clicks}<br><span class="muted small">${a.clicks_7d} this week</span></td>
        <td>${pct(a.clickers, a.people)}</td>
        <td class="nowrap">${d.can_edit ? html`<a class="btn small" href="#advert/${a.id}">Change</a>
          <button class="btn small" type="button" data-act="ad-toggle" data-id="${a.id}">${a.status === 'active' ? 'Pause' : 'Go live'}</button>
          <button class="btn small danger" type="button" data-act="ad-delete" data-id="${a.id}">Delete</button>` : ''}</td></tr>`)}
    </table></div>
    <p class="muted small mt">Seen by = different members who saw it. Tap rate = the share of them who tapped the button. Individual views and taps are kept for 60 days, then only daily totals, so for older days a member is counted once per day.</p>` : html`<p class="muted">No adverts yet.</p>`}`);
}
async function toggleAdvert(id) {
  const a = (adsData?.adverts || []).find((x) => String(x.id) === String(id)); if (!a) return;
  try { await rpc('admin_set_advert_status', { p_id: a.id, p_status: a.status === 'active' ? 'paused' : 'active' }); toast(a.status === 'active' ? 'Paused' : 'Live'); route(); }
  catch (err) { toast(errorText(err), true); }
}
async function deleteAdvert(id) {
  const a = (adsData?.adverts || []).find((x) => String(x.id) === String(id)); if (!a) return;
  await ask({ title: `Delete ${a.name}?`, ok: 'Delete', danger: true,
    body: html`<p class="muted small">It stops showing straight away and its numbers (${a.people} seen, ${a.clicks} taps) are deleted too. To keep the numbers, pause it instead.</p>`,
    run: async () => {
      const img = await rpc('admin_delete_advert', { p_id: a.id });
      if (img) { try { await sb.storage.from('adverts').remove([img]); } catch (_) { /* the advert is gone; a stray image does no harm */ } }
      toast('Deleted'); route(); return true;
    } });
}

// Turn the chosen image or PDF (first page) into a JPEG no wider than 1200px
let pdfjsReady = null;
function loadPdfJs() {
  if (!pdfjsReady) pdfjsReady = new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; bad(new Error('Couldn’t load the PDF reader.')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}
const canvasToJpeg = (c) => new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Couldn’t make the image.'))), 'image/jpeg', 0.86));
async function fileToAdImage(file) {
  const W = 1200;
  let canvas = document.createElement('canvas');
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    const page = await pdf.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(4, W / v1.width) });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (pdf.numPages > 1) toast(`Only the first of the PDF’s ${pdf.numPages} pages is used.`);
  } else if (/^image\//.test(file.type)) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, W / bmp.width);
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  } else throw new Error('Choose an image (JPEG, PNG or WebP) or a PDF.');
  if (canvas.height > canvas.width * 2) throw new Error('That’s very tall: an advert image should be no more than twice as tall as it is wide.');
  return canvasToJpeg(canvas);
}

const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
async function pageAdvert(id) {
  await loadOpenCountries();
  if (!adsData) adsData = await rpc('admin_adverts');
  if (!adsData.can_edit) { location.hash = '#adverts'; return; }
  const a = id === 'new' ? null : (adsData.adverts || []).find((x) => String(x.id) === String(id));
  if (id !== 'new' && !a) { location.hash = '#adverts'; return; }
  const o = a || { format: 'card', tiers: ['liveness', 'id'], shown_to: 'all', leans: 'any', age_min: 18, age_max: 100, per_day: 1, every_n: 8, status: 'paused', button: 'Find out more', countries: [] };
  let imagePath = o.image_path || null;
  const chk = (name, val, on, label) => html`<label class="check"><input type="checkbox" name="${name}" value="${val}" ${on ? raw('checked') : ''}>${label}</label>`;
  const opt = (v, label, cur) => html`<option value="${v}" ${String(cur) === String(v) ? raw('selected') : ''}>${label}</option>`;
  setMain(html`<p><a href="#adverts">← Adverts</a></p><h1>${a ? 'Change ' + a.name : 'Add an advert'}</h1>
    <div class="ad-edit">
      <form class="card stack" id="f-ad">
        <label>Name (only shown here)<input name="name" maxlength="60" required value="${o.name || ''}" placeholder="e.g. Acme spring campaign" autocomplete="off"></label>
        <label>Picture: an image, or a PDF (its first page is used)<input type="file" id="ad-file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
        <p class="muted small" id="ad-file-note">${imagePath ? 'Using the current picture. Choose a file to replace it.' : 'Optional, but adverts with a picture work much better. Wide pictures (about 3:2) suit both formats.'}</p>
        ${imagePath ? html`<button class="btn small" type="button" id="ad-noimg">Remove picture</button>` : ''}
        <label>Headline<input name="title" maxlength="60" required value="${o.title || ''}" placeholder="e.g. 20% off your first order"></label>
        <label>Text (optional, up to 200 characters)<textarea name="body" maxlength="200">${o.body || ''}</textarea></label>
        <div class="row"><label class="grow">Button<input name="button" maxlength="24" value="${o.button || ''}"></label>
          <label class="grow">Opens this website<input name="link" type="url" required maxlength="500" value="${o.link || ''}" placeholder="https://"></label></div>
        <div class="row"><label class="grow">Shown as<select name="format">${opt('card', 'A card in Search', o.format)}${opt('popup', 'A pop-up when the app opens', o.format)}</select></label>
          <label class="grow" id="ad-every">After every … profiles<input name="every_n" type="number" min="3" max="50" value="${o.every_n}"></label>
          <label class="grow" id="ad-perday">Times a day, each person<input name="per_day" type="number" min="1" max="10" value="${o.per_day}"></label></div>
        <h3 class="mt">Who sees it</h3>
        <div class="row"><label class="grow">Shown to<select name="shown_to">${opt('all', 'Men and women', o.shown_to)}${opt('male', 'Men only', o.shown_to)}${opt('female', 'Women only', o.shown_to)}</select></label>
          <label>Youngest<input name="age_min" type="number" min="18" max="100" value="${o.age_min}"></label>
          <label>Oldest<input name="age_max" type="number" min="18" max="100" value="${o.age_max}"></label></div>
        <label>Their Score<select name="leans">${opt('any', 'Any Score', o.leans || 'any')}${opt('left', 'Leans left (towards the left-hand statements)', o.leans)}${opt('right', 'Leans right (towards the right-hand statements)', o.leans)}</select></label>
        <p class="muted small">Uses each member’s Score: below 50% leans left, above 50% leans right. Members exactly in the middle only see adverts set to Any Score.</p>
        <p class="muted small">Plan levels (members on a plan that includes Ad-free won’t see it even if ticked):</p>
        <div class="checks">${AD_TIERS.map(([t, n]) => chk('tier', t, (o.tiers || []).includes(t), n))}</div>
        <p class="muted small">Countries (none ticked = every open country):</p>
        <div class="checks">${AREA_COUNTRIES.map(([c, n]) => chk('country', c, (o.countries || []).includes(c), n))}</div>
        <h3 class="mt">When</h3>
        <div class="row"><label class="grow">Starts<input name="starts_at" type="datetime-local" value="${toLocalInput(o.starts_at || new Date())}"></label>
          <label class="grow">Ends (blank = no end)<input name="ends_at" type="datetime-local" value="${toLocalInput(o.ends_at)}"></label></div>
        <label class="check"><input type="checkbox" name="test_only" ${o.test_only ? raw('checked') : ''}>Test accounts only (try it out before real members see it)</label>
        <label class="check"><input type="checkbox" name="live" ${o.status === 'active' ? raw('checked') : ''}>Live (untick to save it paused)</label>
        <p class="muted small">Adverts must be clearly identifiable as adverts (UK advertising rules), so the app always marks them “Sponsored”. Check what you accept: some products, like gambling and alcohol, have extra rules (this isn’t legal advice).</p>
        <p class="err" id="ad-err" role="alert"></p>
        <div class="row end"><a class="btn" href="#adverts">Cancel</a><button class="btn primary" type="submit">${a ? 'Save' : 'Add advert'}</button></div>
      </form>
      <div class="ad-previews"><h3>Preview</h3><div id="ad-preview"></div></div>
    </div>`);
  const f = $('f-ad');
  let localPreview = null; // a picture chosen but not yet uploaded (as a data: URL)
  let pendingBlob = null;
  const vals = () => { const v = {}; for (const el of f.querySelectorAll('[name]')) if (el.type !== 'checkbox') v[el.name] = el.value; return v; };
  const showFormatFields = () => { const pop = f.format.value === 'popup'; $('ad-every').hidden = pop; $('ad-perday').hidden = !pop; };
  const preview = () => {
    const v = vals(), src = localPreview || (imagePath ? AD_IMG(imagePath) : null);
    const pic = src ? html`<img class="ad-pv-img" src="${src}" alt="">` : '';
    const inner = html`<span class="ad-pv-tag">Sponsored</span>${pic}<div class="ad-pv-text"><b>${v.title || 'Your headline'}</b>${v.body ? html`<span>${v.body}</span>` : ''}<span class="ad-pv-btn">${v.button || 'Find out more'}</span></div>`;
    $('ad-preview').innerHTML = (v.format === 'popup'
      ? html`<div class="ad-pv-phone"><div class="ad-pv-popup"><span class="ad-pv-x">✕</span>${inner}</div></div><p class="muted small">How it looks when the app opens, over the Search screen.</p>`
      : html`<div class="ad-pv-phone"><div class="ad-pv-fake"></div><div class="ad-pv-card">${inner}</div><div class="ad-pv-fake"></div></div><p class="muted small">How it looks between profiles in Search.</p>`).s;
  };
  f.addEventListener('input', preview); f.format.addEventListener('change', () => { showFormatFields(); preview(); });
  showFormatFields(); preview();
  const noImg = $('ad-noimg');
  if (noImg) noImg.addEventListener('click', () => { imagePath = null; pendingBlob = null; localPreview = null; noImg.remove(); $('ad-file').value = ''; $('ad-file-note').textContent = 'No picture.'; preview(); });
  $('ad-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('ad-err').textContent = ''; $('ad-file-note').textContent = 'Preparing the picture…';
    try {
      pendingBlob = await fileToAdImage(file);
      localPreview = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(pendingBlob); }); // the console only shows data: images
      $('ad-file-note').textContent = `Ready (${Math.round(pendingBlob.size / 1024)} KB). It’s uploaded when you save.`;
      preview();
    } catch (err) { pendingBlob = null; e.target.value = ''; $('ad-file-note').textContent = ''; $('ad-err').textContent = err.message || String(err); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true; $('ad-err').textContent = '';
    const v = vals();
    let uploaded = null;
    try {
      if (pendingBlob) {
        uploaded = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const { error } = await sb.storage.from('adverts').upload(uploaded, pendingBlob, { contentType: 'image/jpeg', upsert: false });
        if (error) { uploaded = null; throw new Error('Couldn’t upload the picture: ' + error.message); }
      }
      const iso = (x) => (x ? new Date(x).toISOString() : '');
      const p = { name: v.name, title: v.title, body: v.body, button: v.button, link: v.link.trim(),
        image_path: uploaded || imagePath || '', format: v.format, shown_to: v.shown_to, leans: v.leans || 'any',
        age_min: Number(v.age_min), age_max: Number(v.age_max), per_day: Number(v.per_day), every_n: Number(v.every_n),
        starts_at: iso(v.starts_at), ends_at: iso(v.ends_at),
        tiers: [...f.querySelectorAll('input[name=tier]:checked')].map((x) => x.value),
        countries: [...f.querySelectorAll('input[name=country]:checked')].map((x) => x.value),
        test_only: f.test_only.checked, status: f.live.checked ? 'active' : 'paused' };
      await rpc('admin_save_advert', { p_id: a ? a.id : null, p });
      // The old picture isn't needed once a new one (or none) is saved
      if (a && a.image_path && a.image_path !== p.image_path) { try { await sb.storage.from('adverts').remove([a.image_path]); } catch (_) { /* harmless */ } }
      adsData = null;
      toast(a ? 'Saved' : 'Advert added'); location.hash = '#adverts';
    } catch (err) {
      if (uploaded) { try { await sb.storage.from('adverts').remove([uploaded]); } catch (_) { /* ignore */ } }
      $('ad-err').textContent = errorText(err); btn.disabled = false;
    }
  });
}

// ─── Leaving (why members deleted their accounts) ────────────────────────────
const LEAVING_NAMES = { met_on_based: 'Met someone on BASED', met_elsewhere: 'Met someone elsewhere', few_people: 'Not enough people near them',
  wrong_matches: 'Matches weren’t right', no_replies: 'Not enough replies', too_expensive: 'Costs too much', break: 'Taking a break from dating',
  privacy: 'Privacy or safety worries', bad_experience: 'Bad experience with another member', app_problems: 'Problems with the app', other: 'Something else' };
async function pageLeaving(days, withTests) {
  const d = await rpc('admin_deletion_feedback', { p_days: days === 'all' ? null : Number(days) || 90, p_include_test: !!withTests });
  const reasons = Object.entries(d.reasons || {}).sort((a, b) => b[1] - a[1]);
  const pctOf = (n) => (d.total ? Math.round((100 * n) / d.total) + '%' : '—');
  const period = { 30: 'the last 30 days', 90: 'the last 90 days', 365: 'the last year', all: 'all time' }[days] || `the last ${days} days`;
  const opt = (v, label) => html`<option value="${v}" ${String(days) === v ? raw('selected') : ''}>${label}</option>`;
  setMain(html`<h1>Why members leave</h1>
    <p class="muted">When members delete their account they can tick reasons and add a comment (both optional). These are saved without who they were: no name, email or account, only their plan, how long they’d been a member, country, man or woman, age band and whether they were ID verified. Entries are deleted automatically after 2 years.</p>
    <form class="row" id="f-leaving">
      <label>Period<select name="d">${opt('30', 'Last 30 days')}${opt('90', 'Last 90 days')}${opt('365', 'Last year')}${opt('all', 'All time')}</select></label>
      <label class="small"><input type="checkbox" name="t" ${withTests ? raw('checked') : ''}> Include test accounts</label>
    </form>
    <p><b>${d.total}</b> member${d.total === 1 ? '' : 's'} gave feedback in ${period}${d.total ? html`, ${d.with_comment} with a comment` : ''}.</p>
    ${reasons.length ? html`<h3 class="mt">Reasons</h3>
      <div class="tablewrap"><table><tr><th>Reason</th><th>Members</th><th>Share</th></tr>
        ${reasons.map(([k, n]) => html`<tr><td>${LEAVING_NAMES[k] || k}</td><td>${n}</td><td>${pctOf(n)}</td></tr>`)}
      </table></div>
      <p class="muted small">Members can tick more than one reason, so the shares can add up to more than 100%.</p>` : ''}
    ${Object.keys(d.by_plan || {}).length ? html`<p class="muted small">By plan when they left: ${Object.entries(d.by_plan).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}</p>` : ''}
    <h3 class="mt">Entries</h3>
    ${d.entries.length ? html`<div class="tablewrap"><table><tr><th>When</th><th>Reasons</th><th>Comment</th><th>Plan</th><th>Member for</th><th>Who</th></tr>
      ${d.entries.map((e) => html`<tr><td class="nowrap">${when(e.at)}</td>
        <td>${(e.reasons || []).map((r) => LEAVING_NAMES[r] || r).join(', ') || html`<span class="muted">—</span>`}</td>
        <td>${e.comment || html`<span class="muted">—</span>`}</td>
        <td class="nowrap">${e.plan || '—'}${e.verified ? html`<br><span class="badge blue">ID verified</span>` : ''}</td>
        <td class="nowrap">${e.member_days == null ? '—' : e.member_days < 1 ? 'Under a day' : `${e.member_days} day${e.member_days === 1 ? '' : 's'}`}</td>
        <td class="nowrap">${[e.sex === 'male' ? 'Man' : e.sex === 'female' ? 'Woman' : null, e.age_band, e.country ? regionName(e.country) : null].filter(Boolean).join(', ') || '—'}${e.is_test ? html`<br><span class="badge">Test account</span>` : ''}</td></tr>`)}
    </table></div>${d.entries.length >= 300 ? html`<p class="muted small">Showing the latest 300.</p>` : ''}` : html`<p class="muted">Nothing yet for this period.</p>`}`);
  const f = $('f-leaving');
  f.addEventListener('change', () => { location.hash = `#leaving?d=${f.d.value}${f.t.checked ? '&t=1' : ''}`; });
}

// ─── Legal (Terms, special category data, privacy notice) ───────────────────
const LEGAL_DOCS = [['terms', 'Terms and Conditions'], ['special', 'Special category data'], ['privacy', 'Privacy notice']];
const legalName = (k) => (LEGAL_DOCS.find((d) => d[0] === k) || [, k])[1];
let legalData = null;
function legalBlocksOf(body) {
  const out = []; let para = []; const flush = () => { if (para.length) { out.push({ t: 'p', x: para.join(' ') }); para = []; } };
  String(body || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').forEach((raw) => {
    const l = raw.trim();
    if (!l) { flush(); return; }
    if (/^#{1,3}\s+/.test(l)) { flush(); out.push({ t: 'h', x: l.replace(/^#{1,3}\s+/, '') }); return; }
    if (/^[-•*]\s+/.test(l)) { flush(); out.push({ t: 'li', x: l.replace(/^[-•*]\s+/, '') }); return; }
    para.push(l);
  });
  flush(); return out;
}
const legalInlineOf = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
// The document as members will see it; with `before`, new or changed paragraphs are marked
function legalPreview(body, before) {
  const old = before ? new Set(legalBlocksOf(before).map((b) => b.t + '|' + b.x)) : null;
  return raw(`<div class="legal">${legalBlocksOf(body).map((b) => {
    const cls = old && !old.has(b.t + '|' + b.x) ? ' class="chg"' : '';
    return b.t === 'h' ? `<h4${cls}>${legalInlineOf(b.x)}</h4>` : b.t === 'li' ? `<p${cls ? ' class="li chg"' : ' class="li"'}>• ${legalInlineOf(b.x)}</p>` : `<p${cls}>${legalInlineOf(b.x)}</p>`;
  }).join('')}</div>`);
}
async function pageLegal() {
  const d = legalData = await rpc('admin_legal');
  setMain(html`<h1>Legal</h1>
    <p class="muted">The Terms and Conditions, special category data notice and privacy notice that members see in the app (and on baseddatingonline.com/privacy.html). Download one, edit it in any text editor (in Word, save it as Plain Text), then upload it to preview and publish. Members see the new version straight away.</p>
    <details class="card"><summary><b>How the file is laid out</b></summary>
      <p class="small">A line starting <code># </code> is a heading. A blank line starts a new paragraph. A line starting <code>- </code> is a bullet point. <code>**words**</code> are bold, and <code>[words](https://…)</code> is a link. The "Last updated" date is added for you when you publish. Anything else is shown exactly as typed; web code isn't allowed.</p></details>
    ${LEGAL_DOCS.map(([k, name]) => { const c = d.current[k]; const need = d.need_again ? d.need_again[k] : 0; return html`<div class="card">
      <div class="row"><div class="grow"><h3>${name}</h3><p class="muted small">${c ? html`Version ${c.version}, published ${when(c.published_at)} by ${c.published_by || '—'}${c.note ? html` · “${c.note}”` : ''}${c.reaccept ? html` · <span class="badge amber">Members asked to agree again</span>` : ''}` : 'Not published yet'}</p>
        ${need ? html`<p class="small">${need} member${need === 1 ? '' : 's'} still need${need === 1 ? 's' : ''} to agree to this version.</p>` : ''}</div>
      <div class="row end"><button class="btn small" type="button" data-act="legal-view" data-k="${k}">View</button><button class="btn small" type="button" data-act="legal-download" data-k="${k}">Download</button>
        ${d.can_edit ? html`<label class="btn small primary" for="legal-file-${k}">Upload edited file</label><input type="file" id="legal-file-${k}" data-k="${k}" accept=".txt,.md,text/plain" class="visually-hidden legal-file">` : ''}</div></div></div>`; })}
    <h3 class="mt">Version history</h3>
    <div class="tablewrap"><table><tr><th>Document</th><th>Version</th><th>Published</th><th>By</th><th>Note</th><th>Agree again</th><th></th></tr>
      ${d.history.map((h) => html`<tr><td>${legalName(h.kind)}</td><td>${h.version}</td><td class="nowrap">${when(h.published_at)}</td><td>${h.published_by || '—'}</td><td>${h.note || ''}</td><td>${h.reaccept ? 'Yes' : ''}</td>
        <td><button class="btn small" type="button" data-act="legal-version" data-id="${h.id}" data-k="${h.kind}" data-v="${h.version}">Download</button></td></tr>`)}
    </table></div>
    ${d.can_edit ? '' : html`<p class="muted small mt">Only an owner can publish changes.</p>`}`);
  document.querySelectorAll('.legal-file').forEach((inp) => inp.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (/\.(docx?|pdf|rtf|pages)$/i.test(f.name)) { toast('Please save it as Plain Text (.txt) first.', true); return; }
    if (f.size > 400000) { toast('That file is too big.', true); return; }
    publishLegal(inp.dataset.k, (await f.text()).replace(/^﻿/, ''), f.name);
  }));
}
function viewLegal(k) {
  const c = legalData && legalData.current[k]; if (!c) return;
  ask({ title: `${legalName(k)} · version ${c.version}`, ok: 'Close', body: legalPreview(c.body) });
}
function downloadLegal(k) { const c = legalData && legalData.current[k]; if (c) saveText(`BASED-${k}-v${c.version}.txt`, c.body); }
async function downloadLegalVersion(id, k, v) {
  try { saveText(`BASED-${k}-v${v}.txt`, await rpc('admin_legal_version', { p_id: Number(id) })); } catch (err) { toast(errorText(err), true); }
}
async function publishLegal(k, body, fileName) {
  const c = legalData && legalData.current[k];
  const blocks = legalBlocksOf(body);
  if (!blocks.length) { toast('That file looks empty.', true); return; }
  if (/<\s*(script|iframe|style|object|embed)/i.test(body)) { toast('That file contains web code. Use the plain text layout only.', true); return; }
  const oldSet = c ? new Set(legalBlocksOf(c.body).map((b) => b.t + '|' + b.x)) : new Set();
  const newSet = new Set(blocks.map((b) => b.t + '|' + b.x));
  const added = [...newSet].filter((x) => !oldSet.has(x)).length, removed = [...oldSet].filter((x) => !newSet.has(x)).length;
  await ask({ title: `Publish ${legalName(k)}?`, ok: 'Publish',
    body: html`<p class="muted small">${fileName}: ${blocks.length} paragraphs and headings. ${c ? html`Compared with version ${c.version}: ${added} new or changed (marked in gold below), ${removed} removed or changed.` : ''}</p>
      <div class="legal-box">${legalPreview(body, c && c.body)}</div>
      <label>What changed (kept in the history and the audit log)<input name="note" maxlength="300" placeholder="e.g. New company name" autocomplete="off"></label>
      ${k === 'privacy' ? '' : html`<label class="small"><input type="checkbox" name="reaccept"> Members must agree again (they'll be asked the next time they open BASED). Leave unticked for small wording fixes.</label>`}`,
    run: async (v) => {
      const r = await rpc('admin_publish_legal', { p_kind: k, p_body: body, p_note: v.note || null, p_reaccept: !!v.reaccept });
      toast(`${legalName(k)} version ${r.version} published`); route(); return true;
    } });
}

// ─── Countries ──────────────────────────────────────────────────────────────
const regionName = (() => { try { const d = new Intl.DisplayNames(['en-GB'], { type: 'region' }); return (c) => { try { return d.of(c) || c; } catch (_) { return c; } }; } catch (_) { return (c) => c; } })();
// ─── Test accounts (owner only) ──────────────────────────────────────────────
// Reset test accounts between test runs, and set their level. The server only ever acts on
// accounts marked as test accounts, and only on things between test accounts.
const TEST_LEVELS = [['liveness', 'Selfie'], ['id', 'ID verified'], ['plus', 'BASED+'], ['gold', 'BASED Gold']];
const TEST_CLEAR = [['interest', 'Interest', 'one-way interest sent or received, Move on, withdrawn and cleared'],
  ['mutual', 'It’s mutual', 'matches and their chats'],
  ['hidden', 'Don’t show again', 'including blocks from a chat'],
  ['reports', 'Reports', 'reports between test accounts, and the warnings sent'],
  ['allowances', 'Allowances used', 'profile views and interests used, so the plan’s allowance starts afresh']];
async function pageTests() {
  if (!can([])) { setMain(html`<h1>Test accounts</h1><p class="muted">Only an owner can use this page.</p>`); return; }
  const rows = await rpc('admin_test_accounts').catch((e) => { if (/admin_test_accounts|function/i.test(String(e && e.message))) return null; throw e; });
  if (rows === null) { setMain(html`<h1>Test accounts</h1><p class="muted">Run SQL 56 in Supabase to turn this page on.</p>`); return; }
  const lvl = Object.fromEntries(TEST_LEVELS);
  const num = (n) => (Number(n) ? html`<b>${n}</b>` : html`<span class="muted">0</span>`);
  setMain(html`<h1>Test accounts</h1>
    <p class="muted">Tick the test accounts to change, then clear what’s between them and the other test accounts, or set their level. Only accounts marked as test accounts can be changed, and only things between test accounts are cleared, so real members are never affected. Everything is recorded in the Audit log.</p>
    <div class="card stack">
      <div class="row wrap"><b class="grow">Clear for the ticked accounts</b></div>
      <div class="row wrap">${TEST_CLEAR.map(([k, label, hint]) => html`<label class="small" title="${hint}"><input type="checkbox" name="clr" value="${k}"> ${label}</label>`)}</div>
      <p class="muted small">${TEST_CLEAR.map(([, label, hint]) => html`<b>${label}:</b> ${hint}. `)}</p>
      <div class="row end"><button class="btn danger" type="button" id="t-clear">Clear</button></div>
      <div class="row wrap"><b class="grow">Set the ticked accounts to</b>
        <select id="t-level" style="width:auto">${TEST_LEVELS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
        <button class="btn primary" type="button" id="t-level-go">Set level</button></div>
      <p class="muted small">BASED+ and Gold are set directly for a year, without Stripe. Free plans given from Free extras are removed so the level is exactly as chosen. If an account is paying through Stripe (marked “Stripe”), cancel it in Stripe first, or Stripe will put its plan back.</p>
    </div>
    <h3 class="mt">${rows.length} test account${rows.length === 1 ? '' : 's'}</h3>
    <div class="tablewrap"><table><tr><th><input type="checkbox" id="t-all" aria-label="Tick all"></th><th>Name</th><th>Email</th><th>Level</th>
      <th title="One-way interest they've sent">Interest sent</th><th title="One-way interest they've received">Received</th><th>Mutual</th><th title="Don't show again, either way">Hidden</th><th>Reports</th></tr>
      ${rows.map((r) => html`<tr><td><input type="checkbox" class="t-pick" value="${r.id}" aria-label="Tick ${r.name}"></td>
        <td><a href="#member/${r.id}">${r.name || '—'}</a> <span class="muted small">${r.sex === 'female' ? 'F' : r.sex === 'male' ? 'M' : ''}</span></td>
        <td class="small">${r.email || '—'}</td>
        <td class="nowrap">${lvl[r.level] || (r.level === 'none' ? 'No check yet' : r.level)}${r.paying ? html` <span class="badge amber">Stripe</span>` : ''}</td>
        <td>${num(r.interest_out)}</td><td>${num(r.interest_in)}</td><td>${num(r.mutual)}</td><td>${num(r.hidden)}</td><td>${num(r.reports)}</td></tr>`)}
    </table></div>`);
  const picked = () => [...document.querySelectorAll('.t-pick:checked')].map((x) => x.value);
  $('t-all').addEventListener('change', (e) => document.querySelectorAll('.t-pick').forEach((x) => { x.checked = e.target.checked; }));
  $('t-clear').addEventListener('click', async () => {
    const ids = picked(), what = [...document.querySelectorAll('[name=clr]:checked')].map((x) => x.value);
    if (!ids.length) { toast('Tick at least one test account', true); return; }
    if (!what.length) { toast('Choose what to clear', true); return; }
    const names = TEST_CLEAR.filter(([k]) => what.includes(k)).map(([, l]) => l).join(', ');
    await ask({ title: `Clear for ${ids.length} test account${ids.length === 1 ? '' : 's'}?`, ok: 'Clear', danger: true,
      body: html`<p class="muted small">Clears: ${names}. Only between test accounts. This can’t be undone.</p>`,
      run: async () => {
        const r = await rpc('admin_test_clear', { p_ids: ids, p_what: what });
        const bits = [['interest', 'interest'], ['mutual', 'mutual'], ['hidden', 'hidden'], ['reports', 'reports'], ['views', 'views']].filter(([k]) => r && r[k]).map(([k, l]) => `${r[k]} ${l}`);
        toast(bits.length ? 'Cleared ' + bits.join(', ') : 'Nothing to clear'); route(); return true;
      } });
  });
  $('t-level-go').addEventListener('click', async () => {
    const ids = picked(), level = $('t-level').value;
    if (!ids.length) { toast('Tick at least one test account', true); return; }
    await ask({ title: `Set ${ids.length} test account${ids.length === 1 ? '' : 's'} to ${lvl[level]}?`, ok: 'Set level',
      body: html`<p class="muted small">Their age check is marked as passed${level === 'liveness' ? ', ID verification is removed' : ', ID is marked as verified'}${level === 'plus' || level === 'gold' ? `, and ${lvl[level]} is set for a year` : ', and any paid plan is removed'}. They’ll see the change next time the app refreshes.</p>`,
      run: async () => { const n = await rpc('admin_test_set_level', { p_ids: ids, p_level: level }); toast(`${n} account${n === 1 ? '' : 's'} set to ${lvl[level]}`); route(); return true; } });
  });
}
async function pageCountries() {
  const [rows, oc] = await Promise.all([rpc('admin_countries'), loadOpenCountries()]);
  const sum = (k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const cols = [['waitlist', 'Waitlist'], ['profiles', 'Profiles'], ['none', 'No check yet'], ['liveness', 'Selfie'], ['id', 'ID verified'], ['plus', 'BASED+'], ['gold', 'Gold'], ['online', 'Online now'], ['active_7d', 'Active 7 days'], ['test', 'Test accounts']];
  const num = (n) => (Number(n) ? html`${n}` : html`<span class="muted">0</span>`);
  const ocEdit = oc && oc.can_edit;
  const openList = (oc && oc.countries) || [];
  const curOpts = (sel) => ((oc && oc.currencies) || ['gbp']).map((c) => html`<option value="${c}" ${c === sel ? raw('selected') : ''}>${CURRENCY_NAMES[c] || c.toUpperCase()} (${curSign(c)})</option>`);
  const openSection = !oc ? html`<p class="muted">Run SQL 59 in Supabase to open and close countries here.</p>` : html`
    <h2 class="mt">Open countries</h2>
    <p class="muted">People in an open country can sign up; everyone else joins the waitlist. Each country pays in its own currency, once BASED+, Gold and any top-ups have a price in it (Plans and Offers pages); until then they pay in pounds. Closing a country stops new sign-ups there; members already there keep their accounts.</p>
    <div class="tablewrap"><table><tr><th>Country</th><th>Currency</th><th>Members</th><th>Waitlist</th><th>Prices</th><th></th></tr>
      ${openList.map((c) => html`<tr><td><b>${regionName(c.code)}</b> <span class="muted small">${c.code}</span></td>
        <td>${CURRENCY_NAMES[c.currency] || c.currency.toUpperCase()} (${curSign(c.currency)})</td><td>${c.members}</td><td>${c.waitlist}</td>
        <td>${c.currency === 'gbp' || c.plan_prices >= 2 ? html`<span class="badge green">Set</span>` : html`<span class="badge amber">Not set: pounds used</span>`}</td>
        <td class="nowrap">${ocEdit ? html`<button class="btn small" type="button" data-cc-cur="${c.code}" data-cur="${c.currency}">Change currency</button>${c.code !== 'GB' ? html` <button class="btn small" type="button" data-cc-close="${c.code}">Close</button>` : ''}` : ''}</td></tr>`)}
    </table></div>
    ${ocEdit ? html`<form class="card stack mt" id="f-open-country"><h3>Open a country</h3>
      <div class="row wrap"><label class="grow">Country<select name="code" required id="oc-code"></select></label>
        <label>Currency<select name="currency">${curOpts('gbp')}</select></label>
        <button class="btn primary" type="submit">Open…</button></div>
      <p class="muted small">Countries with people on the waitlist are listed first. Before opening, it’s worth checking that country’s rules on data protection, age checks and online dating.</p></form>` : ''}`;
  setMain(html`<h1>Countries</h1>
    ${openSection}
    <h2 class="mt">Members by country</h2>
    <p class="muted">Members and waitlist sign-ups by country. Profiles and the plan columns count real members only; test accounts are counted on their own. Online now = had BASED open in the last 5 minutes (test accounts included, shown in brackets). Active 7 days = opened BASED or signed in during the last week. The planet profiles aren’t counted.</p>
    ${rows.length ? html`<div class="tablewrap"><table><tr><th>Country</th>${cols.map(([, l]) => html`<th class="nowrap">${l}</th>`)}</tr>
      ${rows.map((r) => html`<tr><td><b>${r.country === '—' ? 'Not given' : regionName(r.country)}</b> <span class="muted small">${r.country}</span>${r.open ? html` <span class="badge green">Open</span>` : html` <span class="badge">Not open</span>`}</td>
        ${cols.map(([k]) => html`<td>${num(r[k])}${k === 'online' && r.online_test ? html` <span class="muted small">(${r.online_test} test)</span>` : ''}</td>`)}</tr>`)}
      <tr class="sel"><td><b>All countries</b></td>${cols.map(([k]) => html`<td><b>${sum(k)}</b></td>`)}</tr>
    </table></div>` : html`<p class="muted">Nobody has signed up yet.</p>`}
    <p class="muted small mt">Figures are as of loading the page. <button class="btn small" type="button" data-act="reload">Refresh</button></p>`);
  if (!ocEdit) return;
  // Every country (from the browser's own list of regions), waitlisted ones first
  const isOpen = new Set(openList.map((c) => c.code));
  const waiting = new Map(((oc && oc.waiting) || []).map((w) => [w.code, w.waitlist]));
  const notRegions = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AA', 'XK']);
  const codes = [];
  for (let i = 65; i <= 90; i++) for (let j = 65; j <= 90; j++) {
    const c = String.fromCharCode(i, j);
    if (isOpen.has(c) || notRegions.has(c)) continue;
    const n = regionName(c); if (n && n !== c) codes.push([c, n]);
  }
  codes.sort((a, b) => ((waiting.get(b[0]) || 0) - (waiting.get(a[0]) || 0)) || a[1].localeCompare(b[1]));
  const sel = $('oc-code');
  sel.innerHTML = '<option value="">Choose…</option>';
  for (const [c, n] of codes) { const o = document.createElement('option'); o.value = c; o.textContent = n + (waiting.get(c) ? ` (${waiting.get(c)} waiting)` : ''); sel.appendChild(o); }
  $('f-open-country').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = e.target.code.value, cur = e.target.currency.value;
    if (!code) { toast('Choose a country', true); return; }
    ask({ title: `Open ${regionName(code)}?`, ok: `Open ${regionName(code)}`,
      body: html`<p class="muted small">People in ${regionName(code)} will be able to sign up straight away, paying in ${CURRENCY_NAMES[cur] || cur.toUpperCase()}${cur !== 'gbp' ? ' once prices are set in that currency (pounds until then)' : ''}.</p>${reasonField()}`,
      run: async (v) => { await rpc('admin_set_country', { p_code: code, p_open: true, p_currency: cur, p_reason: v.reason }); toast(`${regionName(code)} is open`); route(); return true; } });
  });
  document.querySelectorAll('[data-cc-close]').forEach((b) => b.addEventListener('click', () => {
    const code = b.dataset.ccClose;
    ask({ title: `Close ${regionName(code)}?`, ok: 'Close', danger: true,
      body: html`<p class="muted small">New sign-ups from ${regionName(code)} will join the waitlist instead. Members already there keep their accounts.</p>${reasonField()}`,
      run: async (v) => { await rpc('admin_set_country', { p_code: code, p_open: false, p_currency: null, p_reason: v.reason }); toast(`${regionName(code)} is closed to new sign-ups`); route(); return true; } });
  }));
  document.querySelectorAll('[data-cc-cur]').forEach((b) => b.addEventListener('click', () => {
    const code = b.dataset.ccCur;
    ask({ title: `Currency for ${regionName(code)}`, ok: 'Save',
      body: html`<label>Currency<select name="currency">${curOpts(b.dataset.cur)}</select></label><p class="muted small">Applies to new subscriptions and top-ups. Members already subscribed keep paying in the currency they signed up in.</p>${reasonField()}`,
      run: async (v) => { await rpc('admin_set_country', { p_code: code, p_open: true, p_currency: v.currency, p_reason: v.reason }); toast('Saved'); route(); return true; } });
  }));
}

// ─── Plans (what each level includes, and prices) ───────────────────────────
const PLAN_TIERS = [['liveness', 'Selfie'], ['id', 'ID verified'], ['plus', 'BASED+'], ['gold', 'BASED Gold']];
const FEATURE_NAMES = { profile_views: 'Profile views', express_interest: 'Express interest', super_interest: 'Super interest', photos: 'Photos on profile',
  see_interested: 'See who’s interested', religion_filter: 'Religion filter', country_filter: 'Country filter', verified_only_filter: 'Verified members only filter', travel_mode: 'Travel mode',
  priority_support: 'Priority support', ad_free: 'Ad-free', dealbreakers: 'Dealbreaker filters', profile_insights: 'Profile insights',
  read_receipts: 'Read receipts', saved_intro: 'Pre-saved introduction', planet_filter: 'Inter-planetary filter' };
const PERIOD_WORD = { total: 'in total', day: 'a day', week: 'a week' };
let plansData = null;
const ruleOf = (f, t) => (plansData?.rules || []).find((r) => r.country === '*' && r.feature === f && r.tier === t);
const COUNTED_FEATURES = ['profile_views', 'express_interest', 'super_interest', 'photos'];
// Like the app's Compare plans: ✓ included, 🔒 locked, the allowance where there's a limit
const ruleText = (r, f) => !r ? html`<span class="muted">Not set</span>` : r.access === 'hidden' ? html`<span class="badge">Hidden</span>`
  : r.access === 'locked' ? html`<span class="muted" title="Locked">🔒</span>` : r.limit != null ? html`${r.limit} ${PERIOD_WORD[r.period] || ''}`
  : COUNTED_FEATURES.includes(f) ? html`Unlimited` : html`<span class="badge green" title="Included">✓</span>`;
// How generous an allowance is (unlimited highest; a day beats a week beats in total)
const ruleRank = (r) => !r || r.access !== 'allowed' ? 0 : r.limit == null ? 1e9 : r.limit * (r.period === 'day' ? 7 : r.period === 'week' ? 1 : 0.01);
// The first level that includes a feature (4 = none), for the staircase order
const firstLevel = (f) => { const i = PLAN_TIERS.findIndex(([t]) => (ruleOf(f, t) || {}).access === 'allowed'); return i < 0 ? PLAN_TIERS.length : i; };
const STEP_NAMES = ['On every level', 'From ID verified', 'From BASED+', 'BASED Gold only', 'Not included on any level'];
const planMoney = (cur, n) => n == null ? '' : money(cur, n).replace(/\.00$/, '');
async function pagePlans() {
  await loadOpenCountries();
  const d = plansData = await rpc('admin_plans');
  // Same order as Compare plans in the app: what every level gets, then what each level adds
  const feats = [...new Set(d.rules.map((r) => r.feature))]
    .sort((a, b) => firstLevel(a) - firstLevel(b) || (FEATURE_NAMES[a] || a).localeCompare(FEATURE_NAMES[b] || b));
  const overrides = d.rules.filter((r) => r.country !== '*');
  const price = (plan, cur) => d.prices.find((x) => x.plan === plan && x.currency === cur);
  setMain(html`<h1>Plans</h1>
    <p class="muted">What each level includes, and what BASED+ and BASED Gold cost. Changes apply in the app straight away and are kept in the audit log.</p>
    <h3 class="mt">Prices</h3>
    <p class="muted small">Monthly prices in each currency. A first-month price, if set, is what new subscribers pay for their first month (members who have subscribed before pay the normal price). Changing a price doesn’t change what current subscribers pay${d.subscribers ? ` (${d.subscribers.plus} on BASED+, ${d.subscribers.gold} on Gold)` : ''}: they stay on the price they signed up at. Members in countries without their own price pay in pounds.</p>
    <div class="tablewrap"><table><tr><th>Currency</th>${['plus', 'gold'].map((pl) => html`<th>${pl === 'plus' ? 'BASED+' : 'BASED Gold'}</th>`)}</tr>
      ${OFFER_CURRENCIES.map(([c, , label]) => html`<tr><td>${label}</td>${['plus', 'gold'].map((pl) => { const x = price(pl, c); return html`<td>${x ? html`<b>${planMoney(c, x.amount)}</b> a month${x.intro != null ? html`<br><span class="badge blue">First month ${planMoney(c, x.intro)}</span>` : ''}` : html`<span class="muted">Not set (pays in pounds)</span>`}
        ${d.can_edit ? html` <button class="btn small" type="button" data-act="price-edit" data-plan="${pl}" data-cur="${c}">Change</button>` : ''}</td>`; })}</tr>`)}
    </table></div>
    <h3 class="mt">What each level includes</h3>
    <p class="muted small">Laid out like Compare plans in the app, so you can see what each level adds as you move right. ✓ = included. 🔒 = locked (shown with a padlock and an upgrade prompt). Hidden = not shown at all (anything hidden on every level is left off Compare plans). A <b>bold</b> allowance is more than the level to its left. Limits “in total” never reset; “a day” and “a week” reset each day or week. Free extras and top-ups are used on top of these.</p>
    <div class="tablewrap"><table><tr><th>Feature</th>${PLAN_TIERS.map(([, n]) => html`<th>${n}</th>`)}</tr>
      ${feats.map((f, i) => html`${i === 0 || firstLevel(feats[i - 1]) !== firstLevel(f) ? html`<tr><th colspan="${PLAN_TIERS.length + 1}">${STEP_NAMES[firstLevel(f)]}</th></tr>` : ''}
        <tr><td>${FEATURE_NAMES[f] || f}</td>${PLAN_TIERS.map(([t], k) => {
          const r = ruleOf(f, t), prev = k ? ruleOf(f, PLAN_TIERS[k - 1][0]) : null;
          const better = k > 0 && prev && prev.access === 'allowed' && ruleRank(r) > ruleRank(prev);
          return html`<td class="nowrap">${better ? html`<b>${ruleText(r, f)}</b>` : ruleText(r, f)}${d.can_edit ? html` <button class="btn small" type="button" data-act="rule-edit" data-f="${f}" data-t="${t}" aria-label="Change ${FEATURE_NAMES[f] || f} for ${t}">Change</button>` : ''}</td>`; })}</tr>`)}
    </table></div>
    ${overrides.length ? html`<p class="muted small mt">Some countries have their own settings, which take priority there: ${overrides.map((r) => `${r.country} ${FEATURE_NAMES[r.feature] || r.feature} (${r.tier})`).join(', ')}.</p>` : ''}
    ${d.can_edit ? '' : html`<p class="muted small mt">Only an owner can change plans.</p>`}`);
}
async function editRule(f, t) {
  const r = ruleOf(f, t) || { access: 'locked' };
  const tierName = (PLAN_TIERS.find((x) => x[0] === t) || [, t])[1];
  const opt = (v, label, cur) => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${label}</option>`;
  await ask({ title: `${FEATURE_NAMES[f] || f} · ${tierName}`, ok: 'Save',
    body: html`<label>Access<select name="access">${opt('allowed', 'Included', r.access)}${opt('locked', 'Locked (padlock and upgrade prompt)', r.access)}${opt('hidden', 'Hidden', r.access)}</select></label>
      <div class="row"><label>Limit (blank = unlimited)<input name="limit" type="number" min="1" max="10000" value="${r.limit ?? ''}"></label>
      <label>Per<select name="period">${opt('total', 'In total', r.period || 'week')}${opt('day', 'A day', r.period || 'week')}${opt('week', 'A week', r.period || 'week')}</select></label></div>
      <p class="muted small">The limit only applies when it’s Included. Members on ${tierName} see the change next time the app checks their plan (within a minute or two, or when they reopen it).</p>`,
    run: async (v) => {
      const lim = String(v.limit || '').trim();
      await rpc('admin_save_feature_rule', { p_feature: f, p_tier: t, p_access: v.access, p_limit: lim ? Number(lim) : null, p_period: lim ? v.period : null, p_country: '*' });
      toast('Saved'); route(); return true;
    } });
}
async function editPrice(plan, cur) {
  const x = (plansData?.prices || []).find((p) => p.plan === plan && p.currency === cur) || {};
  const [, sign, label] = OFFER_CURRENCIES.find((c) => c[0] === cur);
  const name = plan === 'plus' ? 'BASED+' : 'BASED Gold';
  await ask({ title: `${name} price · ${label}`, ok: 'Save price',
    body: html`<div class="row"><label>Monthly price (${sign})<input name="amount" type="number" min="0.5" max="1000" step="0.01" required value="${x.amount != null ? (x.amount / 100).toFixed(2) : ''}"></label>
      <label>First month (${sign}, blank = no offer)<input name="intro" type="number" min="0" max="1000" step="0.01" value="${x.intro != null ? (x.intro / 100).toFixed(2) : ''}"></label></div>
      <p class="muted small">New subscribers are charged the new price from their next checkout. People already subscribed keep paying what they signed up at. The app shows it as “${sign}1.99 for your first month, then ${sign}4.99 a month”.</p>
      <p class="muted small">Check that the wording and any time limit on an introductory offer suit UK consumer rules before you use one (this isn’t legal advice).</p>`,
    run: async (v) => {
      const intro = String(v.intro || '').trim();
      await rpc('admin_save_plan_price', { p_plan: plan, p_currency: cur, p_amount: Math.round(Number(v.amount) * 100), p_intro: intro ? Math.round(Number(intro) * 100) : null });
      toast('Price saved'); route(); return true;
    } });
}

// ─── Clicks ─────────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-go]');
  if (!el) return;
  if (el.dataset.go && !e.target.closest('a,button')) { location.hash = el.dataset.go; return; }
  const a = el.dataset.act;
  if (!a) return;
  if (a === 'signout') signOut();
  else if (a === 'reload') route();
  else if (a === 'member-action') runMemberAction(el.dataset.k);
  else if (a === 'reveal') revealPhotos();
  else if (a === 'remove-photo') removePhoto(el.dataset.path);
  else if (a === 'recheck') recheck(el.dataset.session);
  else if (a === 'approve-id') approveId();
  else if (a === 'close-correction') closeCorrection(el.dataset.id, el.dataset.o);
  else if (a === 'read-convo') readConversation();
  else if (a === 'decide') decide(el.dataset.d);
  else if (a === 'approve-request') approveRequest(el.dataset.id);
  else if (a === 'remove-word') removeWord(el.dataset.word);
  else if (a === 'remove-bname') removeBlockedName(el.dataset.term);
  else if (a === 'word-mode') setWordMode(el.dataset.word, el.dataset.on === '1');
  else if (a === 'x-withdraw') withdrawExtras(el.dataset.id, el.dataset.what);
  else if (a === 'ref-copy') copyRefLink(el.dataset.code);
  else if (a === 'offer-edit') editOffer(el.dataset.id);
  else if (a === 'offer-toggle') toggleOffer(el.dataset.id);
  else if (a === 'ad-toggle') toggleAdvert(el.dataset.id);
  else if (a === 'ad-delete') deleteAdvert(el.dataset.id);
  else if (a === 'rule-edit') editRule(el.dataset.f, el.dataset.t);
  else if (a === 'legal-view') viewLegal(el.dataset.k);
  else if (a === 'legal-download') downloadLegal(el.dataset.k);
  else if (a === 'legal-version') downloadLegalVersion(el.dataset.id, el.dataset.k, el.dataset.v);
  else if (a === 'price-edit') editPrice(el.dataset.plan, el.dataset.cur);
  else if (a === 'area-find') areaFind(el.closest('form'));
  else if (a === 'area-edit') editArea(el.dataset.id);
  else if (a === 'area-remove') removeArea(el.dataset.id);
  else if (a === 'area-open') openArea(el.dataset.id);
  else if (a === 'prereg-toggle') togglePrereg(!!el.dataset.on);
  else if (a === 'ref-label') renameRefCode(el.dataset.code, el.dataset.label);
  else if (a === 'ref-remove') removeRefCode(el.dataset.code, el.dataset.n);
  else if (a === 'q-download') downloadQuestions();
  else if (a === 'q-version') downloadQuestionVersion(el.dataset.id);
  else if (a === 'q-publish') publishQuestions();
  else if (a === 'q-cancel') { qUpload = null; $('q-preview').innerHTML = ''; $('q-file').value = ''; }
  else if (a === 'bc-preview') previewBroadcast().catch((err) => toast(errorText(err), true));
});

// ─── Show / hide password ───────────────────────────────────────────────────
for (const b of document.querySelectorAll('.pw-eye')) {
  b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    b.setAttribute('aria-pressed', String(!showing));
    b.setAttribute('aria-label', (showing ? 'Show' : 'Hide') + b.getAttribute('aria-label').replace(/^(Show|Hide)/, ''));
    inp.focus();
  });
}
function hideAllPasswords() {
  for (const b of document.querySelectorAll('.pw-eye')) {
    const inp = b.parentElement.querySelector('input');
    inp.type = 'password'; b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Show' + b.getAttribute('aria-label').replace(/^(Show|Hide)/, ''));
  }
}

// ─── Forgotten password ─────────────────────────────────────────────────────
// The email link brings you back here; you then need your authenticator code as
// well as the link before a new password is saved.
$('si-forgot').addEventListener('click', () => {
  $('fp-email').value = $('si-email').value.trim();
  $('fp-err').textContent = ''; $('fp-ok').textContent = '';
  show('scr-forgot'); $('fp-email').focus();
});
for (const b of document.querySelectorAll('[data-back="signin"]')) {
  b.addEventListener('click', async () => {
    hideAllPasswords(); $('np-pass').value = ''; $('np-pass2').value = '';
    if ((await sb.auth.getSession()).data.session) return signOut('');
    show('scr-signin');
  });
}
$('f-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; $('fp-err').textContent = ''; $('fp-ok').textContent = '';
  try {
    const { error } = await sb.auth.resetPasswordForEmail($('fp-email').value.trim(), { redirectTo: location.origin + '/' });
    if (error && error.status === 429) { $('fp-err').textContent = 'Too many requests. Please wait a few minutes and try again.'; return; }
    if (error && error.status >= 500) { $('fp-err').textContent = 'Couldn’t send the email just now. Please try again shortly.'; return; }
    // Same message whether or not the address has an account
    $('fp-ok').textContent = 'If that’s a staff account, we’ve emailed it a link. The link works once and expires after an hour.';
  } catch (_) { $('fp-err').textContent = 'Couldn’t send the email just now. Please try again shortly.'; }
  finally { btn.disabled = false; }
});

let newPassNeedsCode = false;
// Returns true if the page was opened from an email link (handled here)
async function handleEmailLink() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('error_code') || h.get('error')) {
    history.replaceState(null, '', location.pathname);
    await signOut(h.get('error_code') === 'otp_expired' ? 'That link has expired or has already been used. Ask for a new one.' : 'That link didn’t work. Ask for a new one.');
    return true;
  }
  if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
  history.replaceState(null, '', location.pathname);
  const { error } = await sb.auth.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') || '' });
  if (error) { await signOut('That link has expired or has already been used. Ask for a new one.'); return true; }
  let who;
  try { who = await sb.rpc('admin_whoami'); } catch (err) { who = { error: err }; }
  if (who.error) { await signOut('Couldn’t check your admin access. Please try again.'); return true; }
  if (!who.data?.admin) { await signOut('This isn’t a staff account. Members can reset their password in the BASED app.'); return true; }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  newPassNeedsCode = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';
  $('np-code-row').hidden = !newPassNeedsCode; $('np-code').required = newPassNeedsCode;
  $('np-err').textContent = ''; $('np-code').value = ''; $('np-pass').value = ''; $('np-pass2').value = '';
  show('scr-newpass'); (newPassNeedsCode ? $('np-code') : $('np-pass')).focus();
  return true;
}
$('f-newpass').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; $('np-err').textContent = '';
  const pass = $('np-pass').value, pass2 = $('np-pass2').value;
  if (pass.length < 8) { $('np-err').textContent = 'Use at least 8 characters.'; return; }
  if (pass !== pass2) { $('np-err').textContent = 'The two passwords don’t match.'; return; }
  btn.disabled = true;
  try {
    if (newPassNeedsCode) {
      try { await verifyCode($('np-code').value.trim()); newPassNeedsCode = false; $('np-code-row').hidden = true; $('np-code').required = false; }
      catch (_) { $('np-err').textContent = 'That code didn’t work. Try the next one.'; return; }
    }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) {
      $('np-err').textContent = error.code === 'same_password' ? 'Choose a password you haven’t used before.'
        : error.code === 'weak_password' ? 'That password is too easy to guess, or has appeared in a data breach. Choose another.'
        : 'Couldn’t save the password: ' + error.message;
      return;
    }
    $('np-pass').value = ''; $('np-pass2').value = ''; hideAllPasswords();
    await signOut('');
    $('si-ok').textContent = 'Password changed. Sign in with your new password.';
  } finally { btn.disabled = false; }
});

handleEmailLink().then((handled) => { if (!handled) return gate(); }).catch(() => show('scr-signin'));
