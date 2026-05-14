/* ── CLEAN UP OLD AUTH ─────────────────────────────────────────────────── */
(function() {
  Object.keys(localStorage).forEach(key => {
    if ((key.startsWith('sb-') || (key.includes('supabase') && key !== 'pt_ak' && key !== 'pt_meta_cache'))) {
      localStorage.removeItem(key);
    }
  });
})();

/* ── CONFIG ────────────────────────────────────────────────────────────── */
const SUPABASE_URL = 'https://ifpljbwwperpjzlmoust.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcGxqYnd3cGVycGp6bG1vdXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MTM2OTUsImV4cCI6MjA5MzI4OTY5NX0.KcrGgQa7vgI67A9Ug7pkQbMv5UdhhZ70D2f__MRNZVs';

/* ── TAG DEFINITIONS ───────────────────────────────────────────────────── */
// Genre autocomplete input builder
function buildGenreInput(id, currentGenres) {
  const current = parseTags(currentGenres);
  const chips = current.map(g => {
    const safeG = g.replace(/'/g, "\\'");
    return `<span class="tchip tchip-genre" data-tag="${g}">${g}<span class="tchip-x" onclick="removeTag('${id}','${safeG}')">×</span></span>`;
  }).join('');
  return `<div class="genre-input-wrap">
    <div class="tag-wrap" id="${id}-wrap" onclick="document.getElementById('${id}-in').focus()">${chips}<input class="tag-txt" id="${id}-in" placeholder="Type a genre…" oninput="genreAutocomplete('${id}')" onkeydown="genreKey(event,'${id}')" autocomplete="off"></div>
    <div class="genre-suggestions" id="${id}-suggestions"></div>
  </div>`;
}

function genreAutocomplete(id) {
  const inp = document.getElementById(id+'-in');
  const val = inp.value.trim().toLowerCase();
  const sugEl = document.getElementById(id+'-suggestions');
  if (!val) { sugEl.innerHTML=''; return; }
  const existing = [...document.querySelectorAll(`#${id}-wrap .tchip`)].map(c=>c.dataset.tag);
  const matches = GENRES.filter(g => g.toLowerCase().includes(val) && !existing.includes(g));
  if (!matches.length) { sugEl.innerHTML=''; return; }
  sugEl.innerHTML = matches.slice(0,6).map(g =>
    `<div class="genre-suggestion-item" onmousedown="event.preventDefault();addTag('${id}','${g.replace(/'/g,"\'").replace(/"/g,'\"')}','genre');document.getElementById('${id}-in').value='';document.getElementById('${id}-suggestions').innerHTML=''">${g}</div>`
  ).join('');
}

function genreKey(e, id) {
  const inp = e.target;
  const sugEl = document.getElementById(id+'-suggestions');
  if (e.key === 'Enter' && inp.value.trim()) {
    e.preventDefault();
    // If exact match in canonical list, add it
    const match = GENRES.find(g => g.toLowerCase() === inp.value.trim().toLowerCase());
    if (match) { addTag(id, match, 'genre'); inp.value=''; sugEl.innerHTML=''; }
  }
  if (e.key === 'Escape') { sugEl.innerHTML=''; }
  if (e.key === 'Backspace' && !inp.value) {
    const wrap = document.getElementById(id+'-wrap');
    const chips = [...wrap.querySelectorAll('.tchip')];
    if (chips.length) removeTag(id, chips[chips.length-1].dataset.tag);
  }
}

// Fiction genres
const FICTION_GENRES = ['Adventure',"Children's",'Classics','Crime','Dystopian','Fantasy','Gothic','Graphic Novel','Historical','Horror','Literary','Magical Realism','Mystery','Psychological Fiction','LGBTQ+','Romance','Satire','Sci-Fi','Short Stories','Speculative Fiction','Thriller','Young Adult'];
// Nonfiction genres
const NONFICTION_GENRES = ['Art & Design','Biography','Essay Collection','Food & Cooking','Memoir','Nature','Philosophy','Politics','Science','Self-Help','Travel','True Crime'];
// Combined for backwards compat
const GENRES = [...new Set([...FICTION_GENRES, ...NONFICTION_GENRES])];
const MOODS  = ['Dark','Cozy','Tense','Melancholic','Funny','Hopeful','Unsettling','Dreamy','Gritty','Propulsive','Atmospheric','Whimsical','Intense','Slow-burn','Heartwarming'];
const THEMES = ['Found family','Identity','Grief','Power','Survival','Colonialism','Queerness','Religion','Class','Nature','Memory','Trauma','Redemption','Coming of age','Love','War','Technology','Death','Friendship'];

// Genre canonicalisation — maps messy OL/Google tags to our clean list
const GENRE_MAP = {
  'science fiction':'Sci-Fi','sci-fi':'Sci-Fi','sf':'Sci-Fi',
  'fantasy':'Fantasy','epic fantasy':'Fantasy','urban fantasy':'Fantasy','dark fantasy':'Fantasy',
  'horror':'Horror','ghost stories':'Horror','supernatural fiction':'Horror',
  'mystery':'Mystery','detective':'Mystery','whodunit':'Mystery',
  'thriller':'Thriller','suspense':'Thriller','espionage':'Thriller',
  'romance':'Romance','love stories':'Romance','romantic fiction':'Romance',
  'historical fiction':'Historical','historical novel':'Historical',
  'historical fantasy':'Historical','historical mystery':'Historical',
  'history':'Historical','historical':'Historical',
  'literary fiction':'Literary','literary':'Literary','contemporary fiction':'Literary',
  'magical realism':'Magical Realism','magic realism':'Magical Realism',
  'dystopian':'Dystopian','dystopia':'Dystopian','post-apocalyptic':'Dystopian',
  'young adult':'Young Adult','ya':'Young Adult','teen fiction':'Young Adult',
  'graphic novel':'Graphic Novel','comics':'Graphic Novel','manga':'Graphic Novel',
  'short stories':'Short Stories','short story collection':'Short Stories',
  'memoir':'Memoir','autobiography':'Memoir','personal narrative':'Memoir',
  'biography':'Biography','biographies':'Biography',
  'true crime':'True Crime','crime nonfiction':'True Crime',

  'philosophy':'Philosophy','philosophical':'Philosophy',
  'science':'Science','popular science':'Science','natural history':'Science',
  'self-help':'Self-Help','self help':'Self-Help','personal development':'Self-Help',
  'politics':'Politics','political science':'Politics',
  'travel':'Travel','travel writing':'Travel',
  'nature':'Nature','environment':'Nature','ecology':'Nature',
  'food':'Food & Cooking','cooking':'Food & Cooking','cookbook':'Food & Cooking',
  'art':'Art & Design','design':'Art & Design',
  'essay':'Essay Collection','essays':'Essay Collection',
  'speculative fiction':'Speculative Fiction','speculative':'Speculative Fiction',
  'psychological fiction':'Psychological Fiction','psychological thriller':'Psychological Fiction',
  'crime':'Crime','noir':'Crime',
  'gothic':'Gothic','gothic fiction':'Gothic',
  'satire':'Satire','satirical':'Satire',
  'classics':'Classics','classic literature':'Classics',
  'adventure':'Adventure','action and adventure':'Adventure',
  'queer':'LGBTQ+','lgbtq':'LGBTQ+','lgbt':'LGBTQ+','queer literature':'LGBTQ+',
  'children':"Children's",'childrens':"Children's",'juvenile fiction':"Children's",
};

function canonicaliseGenre(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  // Direct match first
  if (GENRE_MAP[lower]) return GENRE_MAP[lower];
  // Check if it's already a canonical genre (exact case match)
  if (GENRES.includes(raw)) return raw;
  // Partial match — longest keys first so specific beats general
  // Special protection: if tag contains 'historical' AND 'fiction/novel/fantasy/mystery'
  // it must NOT map to History nonfiction
  const FICTION_SIGNALS = ['fiction','novel','fantasy','mystery','thriller','romance','horror'];
  const isHistoricalFiction = lower.includes('historical') && FICTION_SIGNALS.some(s => lower.includes(s));
  const sortedKeys = Object.keys(GENRE_MAP).sort((a,b) => b.length - a.length);
  for (const key of sortedKeys) {
    // Skip 'history' mapping if the tag contains 'historical' + fiction signal
    if (key === 'history' && isHistoricalFiction) continue;
    if (lower.includes(key)) return GENRE_MAP[key];
  }
  return null;
}

function canonicaliseGenres(rawTags) {
  const seen = new Set();
  const result = [];
  parseTags(rawTags).forEach(tag => {
    const canonical = canonicaliseGenre(tag);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  });
  return result.join(', ');
}

/* ── STATE ─────────────────────────────────────────────────────────────── */
let books = [], currentUser = null, sessionToken = null;
let sort = 'recent', chartsDrawn = false;
// Load persisted chat history
let chatHistory = (() => {
  try { return JSON.parse(localStorage.getItem('pt_chat_history') || '[]'); } catch(e) { return []; }
})();
function saveChatHistory() {
  try { localStorage.setItem('pt_chat_history', JSON.stringify(chatHistory.slice(-40))); } catch(e) {} // keep last 40 messages
}
let apiKey = localStorage.getItem('pt_ak') || '';
let olResults = [], selResult = null, editions = [], selEdition = null, edFilt = 'all';
let authMode = 'signin', pendingImport = null;
let gsearchResults = [], gsearchIdx = -1, gsearchDebounce = null;

/* ── METADATA CACHE ────────────────────────────────────────────────────── */
// Keyed by ISBN. Stores: title, author, cover, pages, year, genre, description
let metaCache = {};
try { metaCache = JSON.parse(localStorage.getItem('pt_meta_cache') || '{}'); } catch(e) {}
function saveMeta() { try { localStorage.setItem('pt_meta_cache', JSON.stringify(metaCache)); } catch(e) {} }
function getMeta(isbn) { return isbn ? metaCache[isbn] || null : null; }
function setMeta(isbn, data) { if (!isbn) return; metaCache[isbn] = { ...metaCache[isbn], ...data }; saveMeta(); }

/* ── UTILS ─────────────────────────────────────────────────────────────── */
const cUrl  = (id, s='M') => id ? `https://covers.openlibrary.org/b/id/${id}-${s}.jpg` : null;
// All helpers try isbn first, then ol_key, then manual_title as cache key
const bMeta   = b => getMeta(b.isbn) || getMeta(b.ol_key) || getMeta(b.manual_title) || {};
const bFN = b => b.fiction_nonfiction || '';

const bCover  = b => { const m=bMeta(b); if(m.coverId)return cUrl(m.coverId); if(m.googleCover)return m.googleCover; return null; };
const bTitle  = b => bMeta(b).title  || b.manual_title  || '(Unknown title)';
const bAuthor = b => bMeta(b).author || b.manual_author || '(Unknown author)';
const bPages  = b => bMeta(b).pages  || 0;
const bYear   = b => bMeta(b).year   || 0;
const bGenre  = b => bMeta(b).genre  || '';
const bDesc   = b => bMeta(b).description || '';
const bDays   = b => {
  if (!b.start_date || !b.end_date) return 0;
  return Math.max(1, Math.round((new Date(b.end_date) - new Date(b.start_date)) / 86400000));
};
const bPPD = b => { const d = bDays(b); return d > 0 ? Math.round(bPages(b) / d) : 0; };

const pipC = r => r >= 8 ? 'pip-hi' : r >= 6 ? 'pip-mid' : r > 0 ? 'pip-lo' : 'pip-none';
const scC  = v => v >= 8 ? 'hi' : v >= 6 ? 'mid' : 'lo';
const toStars = r => {
  if (!r) return '';
  const f = Math.round(r / 2 * 2) / 2;
  const full = Math.floor(f), half = f % 1 >= 0.5 ? 1 : 0, empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
};
const parseTags = s => s ? s.split(',').map(t => t.trim()).filter(Boolean) : [];
const joinTags  = a => a.join(', ');
const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escQ = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
// Format retro_thoughts as Q&A pairs if they contain the prompt format
function parseInitialPrompt(notes, question) {
  if (!notes) return '';
  const lines = notes.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === question && i+1 < lines.length) {
      // Collect lines until next question or end
      let answer = '';
      let j = i+1;
      while (j < lines.length && !lines[j].trim().endsWith('?')) {
        answer += (answer ? '\n' : '') + lines[j];
        j++;
      }
      return answer.trim();
    }
  }
  return '';
}

function formatRetroThoughts(text) {
  if (!text) return '';
  // Check if it contains our prompt format (question followed by newline and answer)
  const lines = text.split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    // Check if this line looks like a question (ends with ?)
    if (line.endsWith('?') && i+1 < lines.length && lines[i+1].trim()) {
      html.push(`<div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--amber);margin-bottom:3px">${line}</div>
        <div style="font-size:14px;line-height:1.6;color:var(--tx0)">${lines[i+1].trim()}</div>
      </div>`);
      i += 2;
    } else {
      // Plain text — just render it
      html.push(`<div style="font-size:14px;line-height:1.7;margin-bottom:6px">${line}</div>`);
      i++;
    }
  }
  return html.join('');
}

const bSeriesName   = b => b.series_name || null;
const bSeriesNumber = b => b.series_number || null;

const isRetroDue = b => {
  if (b.status !== 'finished' || !b.end_date || b.retro_rating) return false;
  const months = getReflectWaitMonths();
  const due = new Date(b.end_date);
  due.setMonth(due.getMonth() + months);
  return new Date() >= due;
};

/* ── SUPABASE REST API ─────────────────────────────────────────────────── */
function sbHeaders(extra = {}) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${sessionToken || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra
  };
}

async function sbSelect(table, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: sbHeaders()
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.statusText); }
  return r.json();
}

async function sbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(Array.isArray(data) ? data : [data])
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.statusText); }
  return r.json();
}

async function sbUpdate(table, id, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(data)
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.statusText); }
  return r.json();
}

async function sbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.statusText); }
  return true;
}

/* ── SUPABASE AUTH (REST) ──────────────────────────────────────────────── */
async function signInREST(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || 'Sign in failed');
  return d;
}

async function signUpREST(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || 'Sign up failed');
  return d;
}

async function signOutREST() {
  if (!sessionToken) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}` }
  });
}

function saveSession(data) {
  sessionToken = data.access_token;
  currentUser = data.user;
  try {
    localStorage.setItem('pt_session', JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      user: data.user
    }));
  } catch(e) {}
}

function loadSavedSession() {
  try {
    const s = JSON.parse(localStorage.getItem('pt_session') || 'null');
    if (!s) return false;
    if (Date.now() > s.expires_at - 60000) { localStorage.removeItem('pt_session'); return false; }
    sessionToken = s.access_token;
    currentUser = s.user;
    return true;
  } catch(e) { return false; }
}

async function refreshSession() {
  try {
    const s = JSON.parse(localStorage.getItem('pt_session') || 'null');
    if (!s?.refresh_token) return false;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!r.ok) return false;
    const d = await r.json();
    saveSession(d); return true;
  } catch(e) { return false; }
}

/* ── AUTH UI ───────────────────────────────────────────────────────────── */
async function sendPasswordReset() {
  const email = document.getElementById('reset-email').value.trim();
  const btn = document.getElementById('reset-btn');
  const err = document.getElementById('reset-error');
  const success = document.getElementById('reset-success');
  if (!email) { err.textContent = 'Please enter your email address.'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  err.style.display = 'none'; success.style.display = 'none';
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, redirect_to: 'https://amarg28.github.io/pageturner' })
    });
    if (r.ok || r.status === 200) {
      success.textContent = 'Reset link sent. Check your inbox — and your spam folder.';
      success.style.display = 'block';
      btn.textContent = 'Sent ✓';
    } else {
      const d = await r.json();
      throw new Error(d.msg || d.error_description || 'Could not send reset email.');
    }
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Send reset link';
  }
}

function showForgotPassword() {
  document.getElementById('auth-form-view').style.display = 'none';
  document.getElementById('forgot-view').style.display = 'flex';
  setTimeout(() => document.getElementById('reset-email')?.focus(), 100);
}

function hideForgotPassword() {
  document.getElementById('forgot-view').style.display = 'none';
  document.getElementById('auth-form-view').style.display = 'flex';
}

// Handle password reset token in URL (when user clicks email link)
async function checkPasswordResetToken() {
  const hash = window.location.hash;
  if (!hash.includes('type=recovery') && !hash.includes('access_token')) return;
  const params = new URLSearchParams(hash.slice(1));
  const type = params.get('type');
  const token = params.get('access_token');
  if (type === 'recovery' && token) {
    // Show set new password form
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('landing-view').style.display = 'none';
    document.getElementById('auth-form-view').style.display = 'none';
    document.getElementById('forgot-view').style.display = 'none';
    document.getElementById('set-password-view').style.display = 'flex';
    window._resetToken = token;
    // Clear hash from URL
    history.replaceState(null, '', window.location.pathname);
  }
}

async function setNewPassword() {
  const pw = document.getElementById('new-password').value.trim();
  const btn = document.getElementById('set-pw-btn');
  const err = document.getElementById('set-pw-error');
  if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  err.style.display = 'none';
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${window._resetToken}`
      },
      body: JSON.stringify({ password: pw })
    });
    if (r.ok) {
      document.getElementById('set-password-view').style.display = 'none';
      document.getElementById('auth-form-view').style.display = 'flex';
      switchAuthTab('signin');
      document.getElementById('auth-success').textContent = 'Password updated. You can now sign in.';
      document.getElementById('auth-success').style.display = 'block';
    } else {
      const d = await r.json();
      throw new Error(d.msg || 'Could not update password.');
    }
  } catch(e) {
    document.getElementById('set-pw-error').textContent = e.message;
    document.getElementById('set-pw-error').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Save new password';
  }
}

function switchAuthTab(m) {
  authMode = m;
  document.querySelectorAll('.auth-tab').forEach((t,i) =>
    t.classList.toggle('on', (i===0&&m==='signin') || (i===1&&m==='signup')));
  document.getElementById('auth-btn').textContent = m === 'signin' ? 'Sign in' : 'Create account';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-success').style.display = 'none';
  const forgotLink = document.getElementById('forgot-pw-link');
  if (forgotLink) forgotLink.style.display = m === 'signin' ? 'block' : 'none';
}

async function authSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  const btn   = document.getElementById('auth-btn');
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-success').style.display = 'none';
  if (!email || !pw) { showAErr('Please enter your email and password.'); return; }
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';
  try {
    if (authMode === 'signin') {
      const d = await signInREST(email, pw);
      saveSession(d);
      onSignedIn();
    } else {
      const d = await signUpREST(email, pw);
      if (d.access_token) {
        saveSession(d); onSignedIn();
      } else {
        const ok = document.getElementById('auth-success');
        ok.textContent = 'Account created! Check your email to confirm, then sign in.';
        ok.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Create account';
      }
    }
  } catch(e) {
    showAErr(e.message || 'Something went wrong.');
    btn.disabled = false;
    btn.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  }
}

function showAErr(m) { const el = document.getElementById('auth-error'); el.textContent = m; el.style.display = 'block'; }

function startSessionRefreshTimer() {
  // Refresh token every 50 minutes (tokens expire after 60 min)
  setInterval(async () => {
    const ok = await refreshSession();
    if (!ok) {
      // Only sign out if we're actually logged in
      if (sessionToken) {
        console.warn('Session refresh failed — signing out');
        signOut();
      }
    }
  }, 50 * 60 * 1000);
  // Refresh immediately if flagged as stale
  if (window._needsRefresh) {
    window._needsRefresh = false;
    refreshSession().then(ok => {
      if (!ok && sessionToken) signOut();
    });
  }
}

function onSignedIn() {
  startSessionRefreshTimer();
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const displayName = localStorage.getItem('pt_display_name');
  document.getElementById('uavatar').textContent = (displayName || currentUser.email).slice(0,1).toUpperCase();
  updateApiNotice();
  restoreChatHistory();
  go('library');
  loadBooks();
  // Show tour then survey for new users
  const toured = localStorage.getItem('pt_toured');
  const surveyed = localStorage.getItem('pt_survey_done');
  if (!toured) {
    setTimeout(() => showTour(), 1200);
    setTimeout(() => { if (!localStorage.getItem('pt_survey_done')) showSurvey(); }, 3000);
  } else if (!surveyed) {
    setTimeout(() => showSurvey(), 800);
  }
}

function showTour() {
  const toured = localStorage.getItem('pt_toured');
  if (toured) return;
  localStorage.setItem('pt_toured', '1');
  document.getElementById('tour-overlay').classList.add('on');
}

function closeTour() {
  document.getElementById('tour-overlay').classList.remove('on');
}

async function signOut() {
  await signOutREST();
  sessionToken = null; currentUser = null; books = [];
  chartsDrawn = false; chatHistory = [];
  localStorage.removeItem('pt_session');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('landing-view').style.display = 'block';
  document.getElementById('auth-form-view').style.display = 'none';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

/* ── INIT ──────────────────────────────────────────────────────────────── */
window.addEventListener('load', async () => {
  if (loadSavedSession()) {
    // Session loaded - refresh if stale, then sign in
    if (window._needsRefresh) {
      window._needsRefresh = false;
      const ok = await refreshSession();
      if (ok) { onSignedIn(); } else { localStorage.removeItem('pt_session'); }
    } else {
      onSignedIn();
    }
  }
  // If no session, just show the landing page (already visible by default)
});

/* ── DATABASE ──────────────────────────────────────────────────────────── */
let booksLoaded = false;
let notesMigrated = false;

function migrateRawNotes() {
  if (notesMigrated || localStorage.getItem('pt_notes_migrated')) return;
  let changed = false;
  books.forEach(b => {
    if (!b.notes) return;
    // If notes don't start with a question, wrap in impression prompt
    const firstLine = b.notes.split('\n')[0].trim();
    if (!firstLine.endsWith('?')) {
      b.notes = `${INITIAL_PROMPTS[0].q}\n${b.notes}`;
      saveBook(b); // fire and forget
      changed = true;
    }
  });
  if (changed) { notesMigrated = true; localStorage.setItem('pt_notes_migrated', '1'); }
}

async function loadBooks() {
  booksLoaded = false;
  document.getElementById('shelf').innerHTML =
    `<div class="loading-wrap"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div><span>Loading your library…</span></div>`;
  try {
    const data = await sbSelect('books', `user_id=eq.${currentUser.id}&order=created_at.desc`);
    books = data || [];
    booksLoaded = true;
    // One-time migration: wrap raw notes in impression question format
    migrateRawNotes();
    // Fetch missing metadata for all books
    await fetchMissingMeta(books);
    renderLibrary();
  } catch(e) {
    console.error('loadBooks error:', e);
    document.getElementById('shelf').innerHTML =
      `<div class="empty"><div class="empty-icon">⚠</div>Could not load library: ${e.message}</div>`;
  }
}

function bookToRow(b) {
  const nn = v => (v === '' || v === null || v === undefined) ? null : v;
  return {
    user_id: currentUser.id,
    isbn: nn(b.isbn),
    ol_key: nn(b.ol_key),
    google_id: nn(b.google_id),
    status: b.status || 'finished',
    start_date: nn(b.start_date),
    end_date: nn(b.end_date),
    rating: nn(b.rating),
    retro_rating: nn(b.retro_rating),
    notes: b.notes || '',
    retro_thoughts: b.retro_thoughts || '',
    mood: b.mood || '',
    themes: b.themes || '',
    manual_title: b.manual_title || null,
    manual_author: b.manual_author || null,
    import_source: b.import_source || '',
    pages_read: nn(b.pages_read),
    series_name: b.series_name || null,
    series_number: nn(b.series_number),
    fiction_nonfiction: b.fiction_nonfiction || null
  };
}

async function saveBook(b) {
  try {
    if (b.id) {
      await sbUpdate('books', b.id, bookToRow(b));
    } else {
      const rows = await sbInsert('books', bookToRow(b));
      b.id = rows[0]?.id;
    }
  } catch(e) { console.error('saveBook error:', e); throw e; }
}

async function deleteBookById(id) {
  try { await sbDelete('books', id); return true; }
  catch(e) { console.error('deleteBook error:', e); return false; }
}

/* ── METADATA FETCHING ─────────────────────────────────────────────────── */
async function fetchMissingMeta(bookList) {
  const cacheKey = b => b.isbn || b.ol_key || b.manual_title;
  const needs = bookList.filter(b => cacheKey(b) && !getMeta(cacheKey(b)));
  if (!needs.length) return;
  document.getElementById('enrich-bar').style.display = 'flex';
  for (let i = 0; i < needs.length; i++) {
    const b = needs[i];
    document.getElementById('enrich-msg').textContent = `Fetching book data… ${i+1}/${needs.length}`;
    await fetchMetaForBook(b);
    await new Promise(res => setTimeout(res, 80));
  }
  document.getElementById('enrich-bar').style.display = 'none';
  renderBooks();
}

async function fetchMetaForBook(b) {
  if (!b.isbn && !b.ol_key && !b.manual_title) return;
  const ck = b.isbn || b.ol_key || b.manual_title;
  if (getMeta(ck)?.title) return; // already have data

  let meta = {};

  // 1. Open Library search — most reliable for cover + pages + author
  const searchQ = b.isbn
    ? `isbn=${encodeURIComponent(b.isbn)}`
    : `title=${encodeURIComponent(b.manual_title||'')}&author=${encodeURIComponent(b.manual_author||'')}`;
  try {
    const r = await fetch(`https://openlibrary.org/search.json?${searchQ}&limit=1&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject,isbn`);
    const d = await r.json();
    const doc = d.docs?.[0];
    if (doc) {
      meta.title       = doc.title;
      meta.author      = (doc.author_name||[])[0] || '';
      meta.coverId     = doc.cover_i || null;
      meta.year        = doc.first_publish_year || null;
      meta.pages       = doc.number_of_pages_median || null;
      // Genre not taken from OL — user assigns manually
      // meta.genre stays empty
      meta.olKey       = doc.key || null;
      if (!b.ol_key && doc.key) b.ol_key = doc.key;
      if (!b.isbn && doc.isbn?.[0]) b.isbn = doc.isbn[0];
    }
  } catch(e) {}

  // 2. OL ISBN API for description + richer data if we have an ISBN
  if (b.isbn && !meta.description) {
    try {
      const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${b.isbn}&format=json&jscmd=data`);
      const d = await r.json();
      const book = d[`ISBN:${b.isbn}`];
      if (book) {
        if (!meta.title)  meta.title  = book.title;
        if (!meta.author) meta.author = book.authors?.[0]?.name || '';
        if (!meta.pages)  meta.pages  = book.number_of_pages || null;
        if (!meta.year)   meta.year   = book.publish_date ? parseInt(book.publish_date.match(/\d{4}/)?.[0]) : null;
        meta.description = book.excerpts?.[0]?.text || '';
        if (!meta.coverId) {
          const coverUrl = book.cover?.large || book.cover?.medium || '';
          const m = coverUrl.match(/covers\.openlibrary\.org\/b\/id\/(\d+)/);
          if (m) meta.coverId = parseInt(m[1]);
        }
      }
    } catch(e) {}
  }

  // 3. Google Books fallback for anything still missing
  if (!meta.coverId || !meta.pages || !meta.description) {
    try {
      const q = b.isbn ? `isbn:${b.isbn}` : `${meta.title||b.manual_title} ${meta.author||b.manual_author||''}`;
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`);
      const d = await r.json();
      const item = d.items?.[0]?.volumeInfo;
      if (item) {
        if (!meta.title)       meta.title       = item.title;
        if (!meta.author)      meta.author      = item.authors?.[0] || '';
        if (!meta.year)        meta.year        = parseInt(item.publishedDate?.slice(0,4)) || null;
        if (!meta.pages)       meta.pages       = item.pageCount || null;
        if (!meta.description) meta.description = item.description?.slice(0,500) || '';
        // Genre not taken from Google Books — user assigns manually
        if (!meta.coverId)     meta.googleCover = item.imageLinks?.thumbnail?.replace('http://','https://') || null;
        if (!b.google_id)      b.google_id      = d.items?.[0]?.id || null;
      }
    } catch(e) {}
  }

  // Canonicalise genres before caching
  if (meta.genre) meta.genre = canonicaliseGenres(meta.genre);
  if (Object.keys(meta).length) setMeta(ck, meta);
}

/* ── LIBRARY ───────────────────────────────────────────────────────────── */
function renderLibrary() {
  cleanGenreCache();
  // Hide entire layout until books are loaded
  const layoutEl = document.getElementById('library-layout');
  const mainEl = document.querySelector('.library-main');
  if (!booksLoaded) {
    if (layoutEl) layoutEl.style.display = 'none';
    if (mainEl) mainEl.style.display = 'none';
  } else {
    if (layoutEl) layoutEl.style.display = '';
    if (mainEl) mainEl.style.display = '';
  }
  renderQuickStats(); renderRetroDue(); renderCRTBR(); renderBooks();
  // Sidebar: show only when 5+ books
  const sidebar = document.getElementById('library-sidebar');
  const layout = document.querySelector('.library-layout');
  const hasSidebar = booksLoaded && books.length >= 5;
  if (sidebar) sidebar.style.display = hasSidebar ? '' : 'none';
  if (layout) {
    layout.style.cssText = '';
    layout.classList.toggle('has-sidebar', hasSidebar);
  }
  if (hasSidebar) renderSidebar();
}

// One-time cleanup: canonicalise all cached genres
function cleanGenreCache() {
  let changed = false;
  Object.keys(metaCache).forEach(k => {
    const m = metaCache[k];
    if (m?.genre) {
      const clean = canonicaliseGenres(m.genre);
      if (clean !== m.genre) { m.genre = clean; changed = true; }
    }
  });
  if (changed) saveMeta();
}

let sidebarCharsDrawn = false;
function toggleSidebar() {
  const sidebarContent = document.getElementById('sidebar-content');
  const icon = document.getElementById('sidebar-toggle-icon');
  const layout = document.querySelector('.library-layout');
  const collapsed = sidebarContent.classList.toggle('collapsed');
  icon.textContent = collapsed ? '▶' : '◀';
  // Use CSS class, never inline styles
  if (layout) {
    layout.classList.toggle('sidebar-collapsed', collapsed);
    // Remove any lingering inline style from old code
    layout.style.gridTemplateColumns = '';
  }
}

function openStatsOverlay() {
  document.getElementById('stats-overlay').classList.add('on');
  document.body.style.overflow = 'hidden';
  chartsDrawn = false;
  // Wait for overlay to render before drawing charts
  requestAnimationFrame(() => setTimeout(drawStats, 50));
}

function closeStatsOverlay() {
  document.getElementById('stats-overlay').classList.remove('on');
  document.body.style.overflow = '';
}

// Tap topbar to scroll to top on mobile
document.addEventListener('DOMContentLoaded', () => {
  checkPasswordResetToken();
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    topbar.addEventListener('click', e => {
      // Only trigger if clicking the topbar itself, not its buttons
      if (e.target === topbar || e.target.classList.contains('logo')) {
        const modal = document.getElementById('book-modal');
        if (modal?.classList.contains('on')) {
          const inner = document.getElementById('book-modal-inner');
          if (inner) inner.scrollTo({top:0, behavior:'smooth'});
        } else {
          window.scrollTo({top:0, behavior:'smooth'});
        }
      }
    });
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('book-modal')?.classList.contains('on')) closeBookModal();
    if (document.getElementById('stats-overlay')?.classList.contains('on')) closeStatsOverlay();
    if (document.getElementById('settings-drawer')?.classList.contains('open')) closeSettings();
  }
});



function renderSidebar() {
  const fin = books.filter(b => b.status === 'finished');
  if (!fin.length) return;

  // ── PERSONAL FACTS ───────────────────────────────────────────────────────
  const genreMap = {};
  fin.forEach(b => {
    parseTags(bGenre(b)).forEach(g => {
      if (!g) return;
      if (!genreMap[g]) genreMap[g] = {count:0,total:0,rated:0};
      genreMap[g].count++;
      if (b.rating) { genreMap[g].total+=b.rating; genreMap[g].rated++; }
    });
  });
  const genreSorted = Object.entries(genreMap).sort((a,b)=>b[1].count-a[1].count);
  const topGenre = genreSorted[0]?.[0] || '—';
  const highestRatedGenre = Object.entries(genreMap)
    .filter(([,v]) => v.rated >= 3)
    .sort((a,b) => (b[1].total/b[1].rated) - (a[1].total/a[1].rated))[0]?.[0] || '—';

  // Most productive month (with year)
  const monthCount = {};
  fin.forEach(b => {
    if (!b.end_date) return;
    const d = new Date(b.end_date);
    const k = d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    monthCount[k] = (monthCount[k]||0)+1;
  });
  const topMonth = Object.entries(monthCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

  const rated = fin.filter(b => b.rating > 0);
  const avgRating = rated.length ? (rated.reduce((s,b)=>s+b.rating,0)/rated.length).toFixed(1) : '—';

  document.getElementById('sidebar-facts').innerHTML = `
    <div class="sidebar-facts-grid">
      <div class="sidebar-fact"><div class="sidebar-fact-l">Most read genre</div><div class="sidebar-fact-v">${topGenre}</div><div class="sidebar-fact-s">${genreMap[topGenre]?.count||0} books</div></div>
      <div class="sidebar-fact"><div class="sidebar-fact-l">Highest rated genre</div><div class="sidebar-fact-v">${highestRatedGenre}</div><div class="sidebar-fact-s">${highestRatedGenre!=='—'?((genreMap[highestRatedGenre]?.total||0)/(genreMap[highestRatedGenre]?.rated||1)).toFixed(1)+' avg':''}</div></div>
      <div class="sidebar-fact"><div class="sidebar-fact-l">Most read month</div><div class="sidebar-fact-v">${topMonth}</div><div class="sidebar-fact-s">${monthCount[topMonth]||0} books</div></div>
      <div class="sidebar-fact"><div class="sidebar-fact-l">Avg rating</div><div class="sidebar-fact-v">${avgRating}</div><div class="sidebar-fact-s">out of 10</div></div>
    </div>`;

  // ── MINI GENRE BARS ──────────────────────────────────────────────────────
  const top5 = genreSorted.slice(0,5);
  const maxCount = top5[0]?.[1]?.count || 1;
  document.getElementById('sidebar-genre-bars').innerHTML = top5.map(([g,v]) => {
    const avgR = v.rated ? v.total/v.rated : 0;
    const color = avgR>=8?'#1D9E75':avgR>=6?'#BA7517':'#D85A30';
    const pct = Math.round(v.count/maxCount*100);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:90px;font-size:11px;font-weight:500;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx0)" title="${g}">${g}</div>
      <div style="flex:1;height:16px;background:var(--bg2);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:4px">
          ${v.count>=2?`<span style="font-size:10px;color:#fff;font-weight:500">${v.count}</span>`:''}
        </div>
      </div>
      <div style="width:24px;font-size:10px;color:var(--tx2);flex-shrink:0">${avgR>0?avgR.toFixed(1):''}</div>
    </div>`;
  }).join('');

  // ── MINI CHARTS (only draw once) ─────────────────────────────────────────
  if (sidebarCharsDrawn) return;
  sidebarCharsDrawn = true;

  // Books per month line chart
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yearSet=new Set(fin.filter(b=>b.end_date).map(b=>new Date(b.end_date).getFullYear()));
  const years=[...yearSet].sort();
  const yearColors=['#534AB7','#1D9E75','#D85A30','#1A6FA8','#BA7517'];
  const bpmData={};
  years.forEach(y=>{bpmData[y]=Array(12).fill(0);});
  fin.forEach(b=>{
    if(!b.end_date)return;
    const d=new Date(b.end_date);
    bpmData[d.getFullYear()][d.getMonth()]++;
  });
  const bpmCanvas = document.getElementById('cSidebarBPM');
  if (bpmCanvas) {
    new Chart(bpmCanvas,{type:'line',data:{labels:MONTHS,datasets:years.map((y,i)=>({label:String(y),data:bpmData[y],borderColor:yearColors[i%yearColors.length],backgroundColor:'transparent',tension:.3,fill:false,pointRadius:2,borderWidth:1.5}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:9},padding:6,usePointStyle:true}}},scales:{x:{ticks:{font:{size:9}},grid:{display:false}},y:{ticks:{stepSize:1,font:{size:9}},grid:{color:'rgba(128,128,128,0.1)'},min:0}}}});
  }

  // Top 5 decades
  const decMap={};
  fin.forEach(b=>{
    const y=bYear(b);if(!y)return;
    const dec=Math.floor(y/10)*10+'s';
    decMap[dec]=(decMap[dec]||0)+1;
  });
  const top5dec=Object.entries(decMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxDec=top5dec[0]?.[1]||1;
  const decEl=document.getElementById('sidebar-decades');
  if(decEl){
    decEl.innerHTML=top5dec.map(([dec,count])=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:44px;font-size:11px;font-weight:500;text-align:right;flex-shrink:0;color:var(--tx0)">${dec}</div>
        <div style="flex:1;height:16px;background:var(--bg2);border-radius:3px;overflow:hidden">
          <div style="width:${Math.round(count/maxDec*100)}%;height:100%;background:var(--purple);border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:4px">
            ${count>=2?`<span style="font-size:10px;color:#fff;font-weight:500">${count}</span>`:''}
          </div>
        </div>
        <div style="width:20px;font-size:10px;color:var(--tx2);flex-shrink:0">${count<2?count:''}</div>
      </div>`).join('');
  }
}

function renderQuickStats() {
  const fin = books.filter(b => b.status === 'finished');
  if (!fin.length) {
    document.getElementById('quick-stats').innerHTML =
      `<div class="stat"><div class="stat-l">Books</div><div class="stat-v">0</div></div>`;
    return;
  }
  const rated = fin.filter(b => b.rating > 0);
  const avg = rated.length ? (rated.reduce((s,b) => s+b.rating, 0) / rated.length).toFixed(1) : '—';
  const paced = fin.filter(b => bPPD(b) > 0);
  const avgPace = paced.length ? Math.round(paced.reduce((s,b) => s+bPPD(b), 0) / paced.length) : 0;
  const totalPages = fin.reduce((s,b) => s+bPages(b), 0);
  document.getElementById('quick-stats').innerHTML = `
    <div class="stat"><div class="stat-l">Finished</div><div class="stat-v">${fin.length}</div></div>
    <div class="stat"><div class="stat-l">Reading</div><div class="stat-v">${books.filter(b=>b.status==='reading').length}</div></div>
    <div class="stat"><div class="stat-l">To read</div><div class="stat-v">${books.filter(b=>b.status==='tbr').length}</div></div>
    <div class="stat"><div class="stat-l">Avg rating</div><div class="stat-v">${avg}</div><div class="stat-s">out of 10</div></div>
    <div class="stat"><div class="stat-l">Pages read</div><div class="stat-v">${totalPages.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-l">Avg pace</div><div class="stat-v">${avgPace}</div><div class="stat-s">p/day</div></div>`;
}

function renderRetroDue() {
  const due = books.filter(isRetroDue);
  const sec = document.getElementById('retro-due-section');
  if (!due.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `<div class="retro-due-section">
    <div class="retro-due-header">
      <div class="retro-due-label">Due for reflection</div>
      <div class="retro-due-badge">${due.length}</div>
    </div>
    <div class="retro-due-strip">
      ${due.map(b => {
        const cover = bCover(b);
        const yearAgo = new Date(b.end_date); yearAgo.setMonth(yearAgo.getMonth() + getReflectWaitMonths());
        const daysOver = Math.floor((new Date()-yearAgo)/86400000);
        const txt = daysOver<=7?'Just became due':`${Math.floor(daysOver/30)||1} month${Math.floor(daysOver/30)!==1?'s':''} ago`;
        return `<div class="retro-due-card" onclick="openReflectFromLibrary('${b.id}')">
          <div class="retro-dot"></div>
          ${cover?`<img class="retro-due-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="retro-due-cover-ph">📖</div>`}
          <div>
            <div class="retro-due-title">${bTitle(b)}</div>
            <div class="retro-due-author">${bAuthor(b)}</div>
            <div class="retro-due-info">${toStars(b.rating)} · ${txt}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderCR() {
  const reading = books.filter(b => b.status === 'reading');
  const sec = document.getElementById('cr-section');
  if (!reading.length) { sec.innerHTML = ''; return; }
  // handled together with TBR in renderCRTBR
}

function renderTBR() {
  // handled together with CR in renderCRTBR
}

function renderCRTBR() {
  const reading = books.filter(b => b.status === 'reading');
  const tbr     = books.filter(b => b.status === 'tbr');
  const crSec   = document.getElementById('cr-section');
  const tbrSec  = document.getElementById('tbr-section');

  // Clear both sections — we render into a combined row
  tbrSec.innerHTML = '';

  if (!reading.length && !tbr.length) { crSec.innerHTML = ''; return; }

  const MAX_CR  = 3;
  const MAX_TBR = 6;

  // ── Currently Reading box ────────────────────────────────────────────────
  const crHtml = reading.length ? `
    <div class="crbox">
      <div class="crbox-label">Currently reading</div>
      <div class="crbox-books">
        ${reading.slice(0, MAX_CR).map((b, i) => {
          const cover = bCover(b);
          const pages = bPages(b);
          const pct = (b.pages_read && pages) ? Math.min(100, Math.round(b.pages_read/pages*100)) : null;
          return `${i>0?'<div class="crbox-divider"></div>':''}
          <div class="crbox-book" style="position:relative" onclick="openBookPage('${b.id}')">
            ${cover?`<img class="crbox-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="crbox-cover-ph">📖</div>`}
            <div class="crbox-info">
              <div class="crbox-title">${bTitle(b)}</div>
              <div class="crbox-author">${bAuthor(b)}</div>
              ${pct!==null?`<div style="margin-top:5px"><div style="height:3px;background:rgba(0,0,0,.1);border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--amber);border-radius:2px"></div></div><div style="font-size:10px;color:var(--tx2);margin-top:2px">${pct}%</div></div>`:''}

            </div>
          </div>`;
        }).join('')}
        ${reading.length > MAX_CR ? `<div class="crbox-divider"></div><div class="crbox-more" onclick="openCRModal()">+${reading.length-MAX_CR} more</div>` : ''}
      </div>
    </div>` : '';

  // ── TBR box ──────────────────────────────────────────────────────────────
  const tbrHtml = tbr.length ? `
    <div class="crbox crbox-tbr" style="flex:1">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="crbox-label">To be read</div>
        <span style="font-size:10px;color:var(--amber);opacity:.7">${tbr.length} books</span>
        ${tbr.length > MAX_TBR ? `<button onclick="openTBRModal()" class="crbox-viewall">View all →</button>` : ''}
      </div>
      <div class="crbox-books">
        ${tbr.slice(0, MAX_TBR).map((b, i) => {
          const cover = bCover(b);
          const shortTitle = bTitle(b).length > 18 ? bTitle(b).slice(0,18)+'…' : bTitle(b);
          const shortAuthor = bAuthor(b).length > 16 ? bAuthor(b).slice(0,16)+'…' : bAuthor(b);
          return `${i>0?'<div class="crbox-divider"></div>':''}
          <div class="crbox-book crbox-book-compact" style="position:relative" onclick="openBookPage('${b.id}')">
            ${cover?`<img class="crbox-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="crbox-cover-ph" style="font-size:14px">📚</div>`}
            <div class="crbox-info">
              <div class="crbox-title" title="${bTitle(b)}">${shortTitle}</div>
              <div class="crbox-author" title="${bAuthor(b)}">${shortAuthor}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  crSec.innerHTML = (crHtml || tbrHtml) ? `
    <div class="crtbr-row">${crHtml}${tbrHtml}</div>` : '';
}

function openCRModal() {
  const reading = books.filter(b => b.status === 'reading');
  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">Currently reading (${reading.length})</div>
    <div style="max-height:60vh;overflow-y:auto">
      ${reading.map(b => {
        const cover = bCover(b);
        const pages = bPages(b);
        const pct = (b.pages_read && pages) ? Math.min(100, Math.round(b.pages_read/pages*100)) : null;
        return `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--bd);cursor:pointer;align-items:center" onclick="document.getElementById('del-modal').classList.remove('on');openBookPage('${b.id}')">
          ${cover?`<img src="${cover}" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0" loading="lazy">`:`<div style="width:36px;height:54px;background:var(--bg2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center">📖</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Lora',serif;font-size:14px;font-weight:500">${bTitle(b)}</div>
            <div style="font-size:12px;color:var(--tx1);margin-top:2px">${bAuthor(b)}</div>
            ${pct!==null?`<div style="margin-top:5px;font-size:11px;color:var(--tx1)">${b.pages_read} of ${pages} pages · ${pct}%</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="form-acts" style="margin-top:14px">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Close</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

function openTBRModal() {
  let tbr = books.filter(b => b.status === 'tbr');
  if (tbrSort === 'title') tbr.sort((a,b) => bTitle(a).localeCompare(bTitle(b)));
  else if (tbrSort === 'author') tbr.sort((a,b) => bAuthor(a).localeCompare(bAuthor(b)));
  else if (tbrSort === 'random') tbr = [...tbr].sort(() => Math.random() - 0.5);
  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-top:32px">
      <div class="modal-title" style="margin:0">To be read (${tbr.length})</div>
      <select class="tbr-sort-sel" onchange="setTbrSort(this.value);openTBRModal()">
        <option value="added" ${tbrSort==='added'?'selected':''}>Recently added</option>
        <option value="title" ${tbrSort==='title'?'selected':''}>Title A–Z</option>
        <option value="author" ${tbrSort==='author'?'selected':''}>Author A–Z</option>
        <option value="random" ${tbrSort==='random'?'selected':''}>Surprise me 🎲</option>
      </select>
    </div>
    <div style="max-height:60vh;overflow-y:auto">
      ${tbr.map(b => {
        const cover = bCover(b);
        return `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--bd);cursor:pointer;align-items:center" onclick="document.getElementById('del-modal').classList.remove('on');openBookPage('${b.id}')">
          ${cover?`<img src="${cover}" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0" loading="lazy">`:`<div style="width:36px;height:54px;background:var(--bg2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">📚</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Lora',serif;font-size:14px;font-weight:500">${bTitle(b)}</div>
            <div style="font-size:12px;color:var(--tx1);margin-top:2px">${bAuthor(b)}</div>
            ${bYear(b)?`<div style="font-size:11px;color:var(--tx2);margin-top:1px">${bYear(b)}</div>`:''}
          </div>
          <div style="font-size:11px;color:var(--amber)">View →</div>
        </div>`;
      }).join('')}
    </div>
    <div class="form-acts" style="margin-top:14px">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Close</button>
      <button class="btn-primary" onclick="document.getElementById('del-modal').classList.remove('on');chip('Help me pick from my TBR list');go('discover')">Ask AI to help me pick</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

function renderBooks() {
  // Restore saved cover size
  const savedSize = localStorage.getItem('pt_cover_size');
  const sizeSlider = document.getElementById('cover-size');
  if (savedSize && sizeSlider) {
    sizeSlider.value = savedSize;
    const shelf = document.getElementById('shelf');
    if (shelf) shelf.style.gridTemplateColumns = `repeat(auto-fill,minmax(${savedSize}px,1fr))`;
  }
  const q  = ''; // search removed - use global topbar search
  const gf = document.getElementById('gf')?.value||'';
  const ff = document.getElementById('ff')?.value||''; // fiction/nonfiction filter
  const mf = ''; // mood filter removed
  const fin = books.filter(b => b.status==='finished' || b.status==='dnf');

  // Rebuild dropdowns from cached metadata
  const genres = new Set(); fin.forEach(b => parseTags(bGenre(b)).forEach(g=>genres.add(g)));
  // mood filter removed
  const gsel = document.getElementById('gf'); const gcur=gsel.value;
  gsel.innerHTML='<option value="">All genres</option>';
  [...genres].sort().forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;if(g===gcur)o.selected=true;gsel.appendChild(o);});
  // mood dropdown removed

  let list = fin.filter(b =>
    (!q || bTitle(b).toLowerCase().includes(q) || bAuthor(b).toLowerCase().includes(q)) &&
    (!gf || bGenre(b).toLowerCase().includes(gf.toLowerCase())) &&
    (!ff || (b.fiction_nonfiction||'') === ff)
  );

  if (sort==='rating-hi') list.sort((a,b)=>b.rating-a.rating);
  else if (sort==='rating-lo') list.sort((a,b)=>a.rating-b.rating);
  else if (sort==='first') list.sort((a,b)=>new Date(a.end_date)-new Date(b.end_date));
  else list.sort((a,b)=>new Date(b.end_date)-new Date(a.end_date));

  const shelf = document.getElementById('shelf');

  // Zero books after load: show full-width onboarding, hide grid
  const onboardEl = document.getElementById('onboard-fullwidth');
  const layoutEl  = document.getElementById('library-layout');
  if (books.length === 0 && booksLoaded) {
    if (onboardEl) {
      onboardEl.style.display = 'block';
      onboardEl.innerHTML = `<div class="empty-onboard">
        <div class="empty-onboard-title">Welcome to PageTurner</div>
        <div class="empty-onboard-sub">Your personal reading companion. Here's how to get started:</div>
        <div class="onboard-steps">
          <div class="onboard-step" onclick="go('discover')">
            <div class="onboard-step-num">1</div>
            <div class="onboard-step-icon">🔭</div>
            <div class="onboard-step-title">Add a book</div>
            <div class="onboard-step-desc">Search for books you've read and log your rating, dates, and thoughts</div>
            <div class="onboard-step-cta">Go to Discover →</div>
          </div>
          <div class="onboard-step">
            <div class="onboard-step-num">2</div>
            <div class="onboard-step-icon">✦</div>
            <div class="onboard-step-title">Reflect on it</div>
            <div class="onboard-step-desc">A year after finishing, revisit how you feel about it. Your reflections make AI recommendations smarter</div>
            <div class="onboard-step-cta">Available once you've had time to reflect</div>
          </div>
          <div class="onboard-step" onclick="go('discover')">
            <div class="onboard-step-num">3</div>
            <div class="onboard-step-icon">🤖</div>
            <div class="onboard-step-title">Discover what's next</div>
            <div class="onboard-step-desc">Ask the AI book advisor for recommendations based on your reading history and taste</div>
            <div class="onboard-step-cta">Go to Discover →</div>
          </div>
        </div>
        <div style="margin-top:20px">
          <button class="btn-primary" onclick="go('discover')" style="font-size:14px;padding:11px 24px">Add your first book →</button>
        </div>
      </div>`;
    }
    if (layoutEl) layoutEl.style.display = 'none';
    const mainEl2 = document.querySelector('.library-main');
    if (mainEl2) mainEl2.style.display = 'none';
    return;
  }
  // Has books: hide onboarding, show everything
  if (onboardEl) onboardEl.style.display = 'none';
  if (layoutEl)  layoutEl.style.display  = '';
  const mainEl2 = document.querySelector('.library-main');
  if (mainEl2) mainEl2.style.display = '';


  if (!list.length) {
    shelf.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>${!gf&&!mf?'Your finished library is empty.':'No books match your filters.'}</div>`;
    return;
  }

  const viewMode = window.libraryView || 'shelf';
  if (viewMode === 'list') {
    shelf.innerHTML = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="list-table">
      <thead><tr>
        <th style="min-width:200px">Title</th>
        <th style="min-width:140px">Author</th>
        <th style="min-width:90px">Your Rating</th>

        <th style="min-width:80px">Year Pub.</th>
        <th style="min-width:70px">Pages</th>
        <th style="min-width:110px">Date Started</th>
        <th style="min-width:110px">Date Finished</th>
        <th style="min-width:120px">Days Reading</th>
        <th style="min-width:100px">Pages / Day</th>
        <th style="min-width:160px">Genre</th>
      </tr></thead>
      <tbody>${list.map(b => {
        const due = isRetroDue(b);
        const startDate = b.start_date ? new Date(b.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
        const endDate   = b.end_date   ? new Date(b.end_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
        const ratingCol = b.rating ? `<span style="color:var(--amber)">${toStars(b.rating)}</span>` : '—';
        const genreList = bGenre(b).split(',').slice(0,3).map(g=>g.trim()).filter(Boolean).map(g=>`<span style="font-size:10px;background:var(--purple-l);color:var(--purple);padding:1px 6px;border-radius:100px;display:inline-block;margin:1px">${g}</span>`).join('');
        return `<tr onclick="openBookPage('${b.id}')" class="list-row">
          <td><span class="list-title">${bTitle(b)}${due?'<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-left:6px;vertical-align:middle" title="Due for reflection"></span>':''}</span></td>
          <td style="color:var(--tx1)">${bAuthor(b)}</td>
          <td>${ratingCol}</td>
          <td style="color:var(--tx1)">${bYear(b)||'—'}</td>
          <td style="color:var(--tx1)">${bPages(b)||'—'}</td>
          <td style="white-space:nowrap;color:var(--tx1)">${startDate}</td>
          <td style="white-space:nowrap;color:var(--tx1)">${endDate}</td>
          <td style="color:var(--tx1)">${bDays(b)||'—'}</td>
          <td style="color:var(--tx1)">${bPPD(b)||'—'}</td>
          <td>${genreList||'—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } else {
    shelf.innerHTML = list.map(b => {
      const cover = bCover(b);
      const due = isRetroDue(b);
      const iflag = ''; // import source labels removed
      const date = b.end_date ? new Date(b.end_date).toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '';
      return `<div class="book-card${b.status==='dnf'?' dnf-card':''}">
        ${due?'<div class="retro-due-dot" title="Due for reflection"></div>':''}
        <div class="card-acts">
          <button class="cact cact-edit" onclick="event.stopPropagation();openEdit('${b.id}')" title="Edit">✎</button>
        </div>
        <div class="cover-wrap" onclick="openBookPage('${b.id}')">
          ${cover?`<img src="${cover}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bTitle(b)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:''}<div class="cover-ph"${cover?' style="display:none"':''}><span>${bTitle(b)}</span></div>
          <div class="rpip ${pipC(b.rating)}">${b.rating ? toStars(b.rating) : '—'}</div>
        </div>
        <div onclick="openBookPage('${b.id}')">
          <div class="card-title">${bTitle(b)}${iflag}</div>
          <div class="card-author" onclick="event.stopPropagation();openAuthorPage('${esc(bAuthor(b))}')" style="cursor:pointer">${bAuthor(b)}</div>
          ${b.status==='dnf'?'<span class="card-dnf-badge">DNF</span>':''}
          ${bFN(b)?`<span class="card-fn-tag">${bFN(b)}</span>`:''}
          ${b.series_name?`<div style="font-size:9px;color:var(--tx2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.series_name}${b.series_number?' #'+b.series_number:''}</div>`:''}

          ${date?`<div class="card-date">${date}</div>`:''}
        </div>
      </div>`;
    }).join('');
  }
}

function setSort(s) { sort=s; renderBooks(); }

function setCoverSize(val) {
  const shelf = document.getElementById('shelf');
  if (shelf) shelf.style.gridTemplateColumns = `repeat(auto-fill,minmax(${val}px,1fr))`;
  localStorage.setItem('pt_cover_size', val);
}
function setView(v) {
  document.getElementById('shelf').classList.toggle('list-mode', v==='list');
  window.libraryView=v;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('on',b.dataset.view===v));
  const sliderWrap = document.querySelector('.size-slider-wrap');
  if (sliderWrap) sliderWrap.style.display = v==='list' ? 'none' : '';
  // Mobile: if stats view selected, show stats overlay instead
  if (v === 'stats' && window.innerWidth <= 600) {
    openStatsOverlay();
    window.libraryView = 'shelf';
    document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('on', b.dataset.view==='shelf'));
    return;
  }
  renderBooks();
}

/* ── GLOBAL SEARCH ─────────────────────────────────────────────────────── */
function gsearchInput() {
  const q = document.getElementById('gsearch-input').value.trim();
  document.getElementById('gsearch-clear').classList.toggle('visible', q.length>0);
  clearTimeout(gsearchDebounce);
  if (!q) { closeGsearch(); return; }
  if (q.length < 2) return;
  gsearchDebounce = setTimeout(() => doGsearch(q), 350);
}

function gsearchFocus() {
  // On mobile, expand the search box
  document.getElementById('gsearch-wrap').classList.add('mobile-open');
  const q = document.getElementById('gsearch-input').value.trim();
  if (q.length >= 2) document.getElementById('gsearch-results').classList.add('open');
}

function gsearchClear() {
  document.getElementById('gsearch-input').value='';
  document.getElementById('gsearch-clear').classList.remove('visible');
  document.getElementById('gsearch-wrap').classList.remove('mobile-open');
  closeGsearch();
}

function mobileSearchOpen() {
  const wrap = document.getElementById('gsearch-wrap');
  wrap.classList.add('mobile-open');
  setTimeout(() => document.getElementById('gsearch-input').focus(), 50);
}

function closeGsearch() {
  document.getElementById('gsearch-results').classList.remove('open');
  gsearchResults=[]; gsearchIdx=-1;
}

let gsearchAllResults = [];

async function doGsearch(q) {
  const box = document.getElementById('gsearch-results');
  box.innerHTML = `<div class="gsearch-loading"><div class="spinner"></div>Searching…</div>`;
  box.classList.add('open');

  try {
    // Search broadly - OL indexes alternate titles and translated titles
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20&fields=key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median,alternative_title,edition_key`);
    const d = await r.json();
    gsearchAllResults = d.docs || [];
    gsearchResults = gsearchAllResults.slice(0, 5);
    const total = d.numFound || 0;

    if (!gsearchAllResults.length) {
      // Try a broader search stripping articles
      const stripped = q.replace(/^(the|a|an|el|la|los|las|le|les|il|die|der|das)\s+/i,'');
      box.innerHTML = `<div class="gsearch-empty">No results for "${q}". ${stripped!==q?`Try searching "<span style="color:var(--amber);cursor:pointer" onclick="document.getElementById('gsearch-input').value='${stripped}';gsearchInput()">${stripped}</span>"`:''}<div style="margin-top:6px;font-size:11px;color:var(--tx2)">Tip: try the original language title or the author's name</div></div>`;
      return;
    }

    const safeQ = q.replace(/'/g, "\\'");
    const resultsHtml = gsearchResults.map((res,i) => {
      const inLib = books.find(b => (b.isbn && res.isbn?.includes(b.isbn)) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
      const author = (res.author_name||[]).slice(0,2).join(', ') || 'Unknown author';
      const altTitle = res.alternative_title?.[0] && res.alternative_title[0].toLowerCase()!==res.title.toLowerCase() ? res.alternative_title[0] : null;
      return `<div class="gsearch-result" id="gsr-${i}" onclick="gsearchSelect(${i})">
        ${res.cover_i?`<img class="gsearch-result-cover" src="${cUrl(res.cover_i,'S')}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="gsearch-result-cover-ph">📖</div>`}
        <div style="flex:1;min-width:0">
          <div class="gsearch-result-title">${res.title}</div>
          ${altTitle?`<div style="font-size:10px;color:var(--tx2);font-style:italic">Also known as: ${altTitle}</div>`:''}
          <div class="gsearch-result-author">${author}</div>
          <div class="gsearch-result-meta">${[res.first_publish_year,res.number_of_pages_median?'~'+res.number_of_pages_median+' pages':''].filter(Boolean).join(' · ')}</div>
          ${inLib?`<div class="gsearch-in-lib">In your library${inLib.rating?' · '+toStars(inLib.rating):''}</div>`:''}
        </div>
      </div>`;
    }).join('');
    box.innerHTML = `<div class="gsearch-scroll">${resultsHtml}</div><div class="gsearch-view-all" onclick="openFullSearch('${safeQ}')">View all results for "${q.length>25?q.slice(0,25)+'…':q}" →</div>`;
  } catch(e) { box.innerHTML = `<div class="gsearch-empty">Search failed.</div>`; }
}

function openFullSearch(q) {
  closeGsearch();
  showFullSearchModal(q);
}

async function showFullSearchModal(q, page=1, advTitle='', advAuthor='', advYear='') {
  const parts = [];
  if (advTitle) parts.push('title:' + advTitle);
  if (advAuthor) parts.push('author:' + advAuthor);
  if (!advTitle && !advAuthor) parts.push(q);
  const offset = (page-1) * 20;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(parts.join(' '))}&limit=20&offset=${offset}&fields=key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median,alternative_title${advYear?'&published_in='+advYear:''}`;

  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title" style="margin-bottom:12px">Search books</div>
    <input type="password" style="display:none" autocomplete="new-password">
    <div class="full-search-bar">
      <input class="full-search-input fi" id="fs-q" value="${q}" placeholder="Title, author, ISBN…" onkeydown="if(event.key==='Enter')showFullSearchModal(document.getElementById('fs-q').value)" autofocus>
      <button class="btn-primary" style="flex-shrink:0;padding:8px 16px" onclick="showFullSearchModal(document.getElementById('fs-q').value)">Search</button>
    </div>
    <details class="full-search-advanced" style="margin:10px 0 14px">
      <summary style="font-size:12px;color:var(--tx2);cursor:pointer;user-select:none">Advanced search ▾</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;margin-top:10px;align-items:end">
        <div><div style="font-size:11px;color:var(--tx2);margin-bottom:3px">Title</div><input class="fi" id="fs-title" placeholder="Exact title" value="${advTitle}" style="font-size:12px;padding:6px 10px" autocomplete="off"></div>
        <div><div style="font-size:11px;color:var(--tx2);margin-bottom:3px">Author</div><input class="fi" id="fs-author" placeholder="Author name" value="${advAuthor}" style="font-size:12px;padding:6px 10px" autocomplete="off"></div>
        <div><div style="font-size:11px;color:var(--tx2);margin-bottom:3px">Year</div><input class="fi" id="fs-year" placeholder="2019" value="${advYear}" style="width:70px;font-size:12px;padding:6px 10px" autocomplete="off"></div>
        <button class="btn-primary" style="padding:8px 12px;font-size:12px" onclick="showFullSearchModal(document.getElementById('fs-q').value,1,document.getElementById('fs-title').value,document.getElementById('fs-author').value,document.getElementById('fs-year').value)">Go</button>
      </div>
    </details>
    <div id="full-search-results"><div style="display:flex;gap:8px;align-items:center;padding:16px 0"><div class="spinner"></div>Searching…</div></div>`;
  document.getElementById('del-modal').classList.add('on');

  try {
    const r = await fetch(url);
    const d = await r.json();
    const results = d.docs || [];
    const total = d.numFound || 0;
    const pages = Math.min(Math.ceil(total / 20), 10);

    if (!results.length) {
      document.getElementById('full-search-results').innerHTML = `<div style="padding:16px 0;color:var(--tx1)">No results found. Try different search terms.</div>`;
      return;
    }

    const safeQ = q.replace(/'/g,"\\'");
    const safeT = advTitle.replace(/'/g,"\\'");
    const safeA = advAuthor.replace(/'/g,"\\'");

    // Store results for safe index-based lookup — avoids inline JSON breaking onclick
    window._fullSearchResults = results;
    const resultsHtml = results.map((res,i) => {
      const inLib = books.find(b => (b.isbn && res.isbn?.includes(b.isbn)) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
      const author = (res.author_name||[]).slice(0,2).join(', ') || 'Unknown author';
      const clickFn = inLib
        ? `document.getElementById('del-modal').classList.remove('on');setTimeout(()=>openBookPage('${inLib.id}'),100)`
        : `document.getElementById('del-modal').classList.remove('on');setTimeout(()=>openUnreadBookPage(window._fullSearchResults[${i}]),100)`;
      return `<div class="full-search-result" onclick="${clickFn}">
        ${res.cover_i?`<img src="${cUrl(res.cover_i,'S')}" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy" onerror="this.style.display='none'">`:`<div style="width:36px;height:54px;background:var(--bg2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">📖</div>`}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:14px;font-weight:500;margin-bottom:2px">${res.title}</div>
          <div style="font-size:12px;color:var(--tx1)">${author}</div>
          <div style="font-size:11px;color:var(--tx2);margin-top:2px">${[res.first_publish_year,res.number_of_pages_median?'~'+res.number_of_pages_median+' p':''].filter(Boolean).join(' · ')}</div>
          ${inLib?`<div style="font-size:11px;color:var(--teal);margin-top:2px">✓ In your library${inLib.rating?' · '+toStars(inLib.rating):''}</div>`:''}
        </div>
      </div>`;
    }).join('');

    const paginationHtml = pages > 1 ? `<div class="full-search-pagination">
      ${page>1?`<button class="btn-ghost" onclick="showFullSearchModal('${safeQ}',${page-1},'${safeT}','${safeA}','${advYear}')">← Prev</button>`:'<span></span>'}
      <span style="font-size:12px;color:var(--tx2)">Page ${page} of ${pages} · ${total.toLocaleString()} results</span>
      ${page<pages?`<button class="btn-ghost" onclick="showFullSearchModal('${safeQ}',${page+1},'${safeT}','${safeA}','${advYear}')">Next →</button>`:'<span></span>'}
    </div>` : `<div style="font-size:12px;color:var(--tx2);padding:8px 0">${total.toLocaleString()} result${total!==1?'s':''}</div>`;

    document.getElementById('full-search-results').innerHTML = paginationHtml + resultsHtml;
  } catch(e) {
    document.getElementById('full-search-results').innerHTML = `<div style="color:var(--coral);padding:16px 0">Search failed: ${e.message}</div>`;
  }
}

function gsearchKey(e) {
  const box = document.getElementById('gsearch-results');
  if (e.key==='Enter') {
    e.preventDefault();
    const q = document.getElementById('gsearch-input').value.trim();
    if (!q) return;
    if (gsearchIdx >= 0 && box.classList.contains('open')) {
      gsearchSelect(gsearchIdx);
    } else {
      // Open full search modal
      closeGsearch();
      showFullSearchModal(q);
    }
    return;
  }
  if (!box.classList.contains('open')) return;
  if (e.key==='ArrowDown'){e.preventDefault();gsearchIdx=Math.min(gsearchIdx+1,gsearchResults.length-1);highlightGsearch();}
  else if (e.key==='ArrowUp'){e.preventDefault();gsearchIdx=Math.max(gsearchIdx-1,0);highlightGsearch();}
  else if (e.key==='Escape') closeGsearch();
}

function highlightGsearch() {
  document.querySelectorAll('.gsearch-result').forEach((el,i) => { el.style.background=i===gsearchIdx?'var(--bg2)':''; });
}

function gsearchSelect(i) {
  const res = gsearchResults[i]; if (!res) return;
  closeGsearch();
  document.getElementById('gsearch-input').value='';
  document.getElementById('gsearch-clear').classList.remove('visible');
  const isbn = res.isbn?.[0] || null;
  const inLib = books.find(b => (isbn && b.isbn===isbn) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
  if (inLib) openBookPage(inLib.id);
  else openUnreadBookPage(res);
  // Keep current tab active — modal overlays everything
}

document.addEventListener('click', e => {
  if (!document.getElementById('gsearch-wrap')?.contains(e.target)) closeGsearch();
});

/* ── UNREAD BOOK PAGE ──────────────────────────────────────────────────── */
async function openUnreadBookPage(olBook) {
  openBookModal();
  const author = (olBook.author_name||[]).slice(0,2).join(', ') || 'Unknown author';
  const authorLast = author.split(' ').slice(-1)[0];
  const isbn = olBook.isbn?.[0] || null;
  const title = olBook.title || 'Unknown title';
  const year = olBook.first_publish_year || null;
  const coverSrc = olBook.cover_i ? cUrl(olBook.cover_i,'L') : null;

  // Pre-cache metadata
  if (!bMeta({isbn, ol_key: olBook.key, manual_title: title})?.title) {
    const fakeBook = { isbn, ol_key: olBook.key, manual_title: title, manual_author: author };
    await fetchMetaForBook(fakeBook);
  }
  const fakeB = { isbn, ol_key: olBook.key, manual_title: title };
  const desc = bDesc(fakeB) || '';

  // Add buttons in hero
  const addBtns = `<div class="bp-add-btns" style="margin-top:14px">
    <button class="bp-add-btn bp-add-btn-tbr" onclick="quickAddBook('tbr','${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(title)}','${esc(author)}')">+ Add to TBR</button>
    <button class="bp-add-btn bp-add-btn-reading" onclick="quickAddBook('reading','${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(title)}','${esc(author)}')">+ Currently reading</button>
    <button class="bp-add-btn bp-add-btn-finished" onclick="openAddFinishedForm('${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(title)}','${esc(author)}',${olBook.cover_i||'null'},${year||'null'})">+ Add as finished</button>
  </div>`;

  // Fake book object for bpHero
  const fakeBookFull = { isbn, ol_key: olBook.key, manual_title: title, manual_author: author,
    status: 'tbr', rating: null, start_date: null, end_date: null,
    fiction_nonfiction: null, series_name: null };

  // AI section with unread-specific handler
  const aiSection = `<div class="bpsec ai-sec">
    <div class="bp-sidebar-head">
      <div class="bpsec-t" style="margin:0">Would you like this book?</div>
      <button class="ai-btn" id="ai-gen-btn" onclick="genUnreadAnalysis('${esc(olBook.key||'')}','${esc(title)}','${esc(author)}')">✦ Analyse for me</button>
    </div>
    <div id="ai-result" style="margin-top:10px"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click to get a personalised take based on your reading history.</div></div>
  </div>`;

  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav"><div class="bp-back" onclick="closeBookModal()">← Back</div></div>
    <div class="bp-hero">
      <div class="bp-img">${coverSrc ? `<img src="${coverSrc}" alt="${esc(title)}" loading="lazy">` : `<div class="bp-img-ph"><span>${esc(title)}</span></div>`}</div>
      <div class="bp-hero-info">
        <div class="bp-title">${esc(title)}</div>
        <div class="bp-author"><span class="author-link" onclick="pushModal(()=>openAuthorPage('${esc(author)}'))">${esc(author)}</span>${year ? ' · ' + year : ''}</div>
        ${addBtns}
      </div>
    </div>
    <div class="bp-body">
      <div class="bp-left">
        ${bpDesc(desc, olBook.key || title)}
        ${aiSection}
      </div>
      ${bpSidebar(olBook.key || title, false, authorLast)}
    </div>
  </div>`;

  // Load also-by for unread book
  const fakeForAlsoBy = { isbn, ol_key: olBook.key, manual_title: title, manual_author: author };
  loadAlsoBy(fakeForAlsoBy);

  // Restore cached analysis
  const cacheKey = 'unread_' + (olBook.key || title);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) {
    document.getElementById('ai-result').innerHTML = cached;
    const btn = document.getElementById('ai-gen-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '✦ Regenerate'; }
  }
}

async function loadUnreadOLData(olBook) {
  try {
    if (!olBook.key) { document.getElementById('ol-data').innerHTML='<div style="font-size:12px;color:var(--tx1)">No data available.</div>'; return; }
    const r = await fetch(`https://openlibrary.org${olBook.key}.json`);
    const work = await r.json();
    const ra = work.ratings_average?parseFloat(work.ratings_average).toFixed(1):null;
    const rc = work.ratings_count?work.ratings_count.toLocaleString():null;
    document.getElementById('ol-data').innerHTML =
      `${ra?`<div style="margin-bottom:10px"><div style="font-size:30px;font-family:'Lora',serif;font-weight:500;color:var(--amber)">${ra}<span style="font-size:14px;opacity:.5">/5</span></div><div style="font-size:12px;color:var(--tx1)">On Open Library${rc?' · '+rc+' ratings':''}</div></div>`:''}
       ${work.first_publish_date?`<div class="ol-row"><span style="color:var(--tx2)">First published</span><span style="font-weight:500">${work.first_publish_date}</span></div>`:''}`;
  } catch(e) { document.getElementById('ol-data').innerHTML='<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
}

async function quickStatusChange(bookId, newStatus) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  b.status = newStatus;
  if (newStatus === 'reading' && !b.start_date) b.start_date = new Date().toISOString().slice(0,10);
  await saveBook(b);
  renderLibrary();
  openBookPage(bookId);
  showToast('Status updated ✓');
}

async function quickAddBook(status, isbn, olKey, title, author) {
  // Prevent duplicates
  const exists = books.find(b =>
    (isbn && b.isbn === isbn) ||
    (olKey && b.ol_key === olKey) ||
    bTitle(b).toLowerCase() === title.toLowerCase()
  );
  if (exists) {
    const statusLabel = exists.status==='finished'?'finished':exists.status==='reading'?'currently reading':exists.status==='tbr'?'on your TBR':'in your library';
    alert(`"${title}" is already ${statusLabel}.`);
    return;
  }
  const newBook = { isbn: isbn||null, ol_key: olKey||null, google_id: null, status, start_date: null, end_date: null, rating: null, retro_rating: null, notes: '', retro_thoughts: '', mood: '', themes: '', manual_title: title||null, manual_author: author||null, import_source: '' };
  try {
    await saveBook(newBook);
    books.unshift(newBook);
    closeBookModal(); renderLibrary(); go('library');
  } catch(e) { alert('Could not add book: '+e.message); }
}

async function removeFromActive(bookId) {
  if (!confirm('Remove this book from your library?')) return;
  const ok = await deleteBookById(bookId);
  if (ok) books = books.filter(x => x.id !== bookId);
  chartsDrawn = false; renderLibrary();
}

async function markDNF(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  b.status = 'dnf';
  await saveBook(b);
  chartsDrawn = false; renderLibrary();
}

function openAddFinishedForm(isbn, olKey, title, author, coverId, year) {
  // Pre-fill the modal with an add form
  const coverSrc = coverId ? cUrl(coverId,'M') : null;
  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="modalBack()">← Back</div>
    </div>
    <div class="fcard">
      <div class="fcard-title">Add to your library — ${title}</div>
      <div class="sel-header">
        ${coverSrc?`<img class="sel-cover" src="${coverSrc}" alt="">`:`<div class="sel-cover-ph">📖</div>`}
        <div>
          <div class="sel-title">${title}</div>
          <div class="sel-author">${author}</div>
          ${year?`<span class="stag">${year}</span>`:''}
        </div>
      </div>
      <div class="fgrid">
        <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="af-rating" min="1" max="10" placeholder="e.g. 8"></div>
        <div class="fg"><label class="fl">Fiction / Nonfiction</label>
          <select class="fi" id="af-fn"><option value="">—</option><option value="Fiction">Fiction</option><option value="Nonfiction">Nonfiction</option></select>
        </div>
        <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="af-start"></div>
        <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="af-end"></div>
        <div class="fg"><label class="fl">Series name</label><input class="fi" type="text" id="af-series-name" placeholder="e.g. The Broken Earth" autocomplete="off"></div>
        <div class="fg"><label class="fl">Book number</label><input class="fi" type="number" id="af-series-num" min="1" step="0.5" placeholder="e.g. 1"></div>
      </div>
      <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildGenreInput('af-genre','')}</div>
      <div class="fg full" style="margin-bottom:10px">
        <label class="fl" style="margin-bottom:10px">Initial thoughts</label>
        ${INITIAL_PROMPTS.map(p=>`<div class="fg full" style="margin-bottom:10px">
          <div style="font-size:11px;color:var(--amber);font-weight:500;margin-bottom:4px">${p.q}</div>
          <textarea class="fi fta" id="af-ip-${p.id}" placeholder="Optional…" style="min-height:60px;width:100%"></textarea>
        </div>`).join('')}
      </div>
      <div class="form-acts">
        <button class="btn-ghost" onclick="closeBookModal()">Cancel</button>
        <button class="btn-primary" id="af-submit" onclick="submitAddFinished('${isbn}','${olKey}','${title}','${author}',${coverId||'null'})">Add to library</button>
      </div>
    </div>
  </div>`;
}

async function submitAddFinished(isbn, olKey, title, author, coverId) {
  const btn = document.getElementById('af-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  const start = document.getElementById('af-start').value || null;
  const end   = document.getElementById('af-end').value || null;
  const rating = parseFloat(document.getElementById('af-rating').value) || null;
  // Pre-cache metadata
  if (isbn || olKey) {
    const fakeBook = { isbn: isbn||null, ol_key: olKey||null, manual_title: title, manual_author: author };
    await fetchMetaForBook(fakeBook);
  }
  const newBook = {
    isbn: isbn||null, ol_key: olKey||null, google_id: null,
    status: 'finished', start_date: start, end_date: end,
    rating, retro_rating: null,
    notes: INITIAL_PROMPTS.map(p => {
      const v = document.getElementById('af-ip-'+p.id)?.value.trim();
      return v ? p.q+'\n'+v : '';
    }).filter(Boolean).join('\n\n'),
    fiction_nonfiction: document.getElementById('af-fn')?.value||null,
    series_name: document.getElementById('af-series-name')?.value.trim()||null,
    series_number: parseFloat(document.getElementById('af-series-num')?.value)||null,
    retro_thoughts: '',
    mood: '', themes: '',
    manual_title: title||null, manual_author: author||null,
    import_source: ''
  };
  // Check for duplicates
  const exists = books.find(b =>
    (isbn && b.isbn === isbn) ||
    (olKey && b.ol_key === olKey) ||
    bTitle(b).toLowerCase() === title.toLowerCase()
  );
  if (exists) {
    alert(`"${title}" is already in your library.`);
    btn.disabled = false; btn.textContent = 'Add to library'; return;
  }
  try {
    await saveBook(newBook);
    books.unshift(newBook);
    closeBookModal();
    renderLibrary(); go('library');
  } catch(e) {
    alert('Could not save: ' + e.message);
    btn.disabled = false; btn.textContent = 'Add to library';
  }
}

/* ── BOOK PAGE ─────────────────────────────────────────────────────────── */
// ── SHARED: build the right sidebar ─────────────────────────────────────
function bpSidebar(bookId, showSeries, authorLast) {
  return `<div class="bp-sidebar">
    ${showSeries ? `<div class="scard" id="series-card"><div class="scard-t">Series</div><div id="series-section"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>` : ''}
    <div class="scard">
      <div class="bp-sidebar-head"><div class="scard-t" style="margin:0">Similar books</div><button class="ai-btn" id="sim-btn" onclick="genSimilar('${bookId}')" style="background:var(--purple);padding:4px 10px;font-size:11px">✦ Find</button></div>
      <div id="sim-result"><div style="font-size:12px;color:var(--tx1);font-style:italic">Click for AI recommendations.</div></div>
    </div>
    <div class="scard"><div class="scard-t" style="cursor:pointer" onclick="pushModal(()=>openAuthorPage('${esc(authorLast)}'))">Books by ${authorLast} ↗</div><div id="also-by"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
  </div>`;
}

// ── SHARED: build the hero section ───────────────────────────────────────
function bpHero(b, extraBtns) {
  const cover = bCover(b);
  const coverLg = getMeta(b.isbn)?.coverId ? cUrl(getMeta(b.isbn).coverId,'L') : (getMeta(b.isbn)?.googleCover || cover);
  const title = bTitle(b), author = bAuthor(b), year = bYear(b);
  const genre = bGenre(b), pages = bPages(b), days = bDays(b), ppd = bPPD(b);
  const fntag = bFN(b) ? `<span class="bptag bptag-fn">${bFN(b)}</span>` : '';
  const gtags = parseTags(genre).map(g => `<span class="bptag bptag-g">${g}</span>`).join('');
  return `<div class="bp-hero">
    <div class="bp-img">${coverLg ? `<img src="${coverLg}" alt="${title}" loading="lazy">` : `<div class="bp-img-ph"><span>${title}</span></div>`}</div>
    <div class="bp-hero-info">
      <div class="bp-title">${title}</div>
      <div class="bp-author"><span class="author-link" onclick="pushModal(()=>openAuthorPage('${esc(author)}'))">${author}</span>${year ? ' · ' + year : ''}</div>
      <div class="bp-tags">${fntag}${gtags}</div>
      ${b.status !== 'tbr' ? `<div class="bp-scores">
        <div class="bps"><div class="bps-l">Your rating</div><div class="bps-v ${scC(b.rating)}">${b.rating ? toStars(b.rating) : '—'}</div></div>
        <div class="bps"><div class="bps-l">Pages</div><div class="bps-v">${pages || '—'}</div></div>
        <div class="bps"><div class="bps-l">Pace</div><div class="bps-v">${ppd || '—'}<span style="font-size:10px;opacity:.6">${ppd ? ' p/d' : ''}</span></div></div>
      </div>
      <div class="bp-ri">
        ${b.start_date ? `<div class="bp-ri-item"><div class="bp-ri-l">Started</div><div>${new Date(b.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>` : ''}
        ${b.end_date ? `<div class="bp-ri-item"><div class="bp-ri-l">Finished</div><div>${new Date(b.end_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>` : ''}
        ${days ? `<div class="bp-ri-item"><div class="bp-ri-l">Duration</div><div>${days} days</div></div>` : ''}
      </div>` : ''}
      ${extraBtns || ''}
    </div>
  </div>`;
}

// ── SHARED: render description with read more ────────────────────────────
function bpDesc(desc, bookId) {
  const body = desc
    ? `<div id="desc-text-${bookId}" style="font-size:14px;line-height:1.7;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical">${desc}</div>
       ${desc.length > 300 ? `<button onclick="var el=document.getElementById('desc-text-${bookId}');el.style.webkitLineClamp='unset';el.style.display='block';this.style.display='none'" style="margin-top:6px;background:none;border:none;font-size:12px;color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;padding:0">Read more ↓</button>` : ''}`
    : `<div style="font-size:13px;color:var(--tx2);font-style:italic">No description available.</div>`;
  return `<div class="bpsec">
    <div class="bpsec-t">About this book</div>
    ${body}
  </div>`;
}

// ── SHARED: render initial thoughts (three Q&A prompts) ──────────────────
function bpInitialThoughts(notes) {
  if (!notes) return '';
  const formatted = formatRetroThoughts(notes);
  if (!formatted) return '';
  return `<div class="bpsec">
    <div class="bpsec-t">Initial thoughts</div>
    <div style="margin-top:6px">${formatted}</div>
  </div>`;
}

// ── SHARED: render retrospective section ─────────────────────────────────
function bpRetro(b) {
  if (!b.retro_rating && !b.retro_thoughts) return '';
  return `<div class="bpsec">
    <div class="retro-pill">Retrospective${b.retro_rating ? ' · ' + toStars(b.retro_rating) : ''}</div>
    ${b.retro_thoughts ? `<div style="margin-top:10px">${formatRetroThoughts(b.retro_thoughts)}</div>` : ''}
  </div>`;
}

// ── SHARED: AI analysis section ──────────────────────────────────────────
function bpAI(bookId, isInLib) {
  const label = isInLib ? 'AI analysis for you' : 'Would you like this book?';
  const btnLabel = isInLib ? '✦ Generate analysis' : '✦ Analyse for me';
  const btnFn = isInLib ? `genAnalysis('${bookId}')` : '';
  const placeholder = isInLib
    ? 'Click for a personalised take based on your reading history.'
    : 'Click to get a personalised take based on your reading history.';
  return `<div class="bpsec ai-sec">
    <div class="bp-sidebar-head">
      <div class="bpsec-t" style="margin:0">${label}</div>
      <button class="ai-btn" id="ai-gen-btn" onclick="${btnFn}">${btnLabel}</button>
    </div>
    <div id="ai-result" style="margin-top:10px"><div style="font-size:13px;color:var(--tx1);font-style:italic">${placeholder}</div></div>
  </div>`;
}

// ── IN-LIBRARY BOOK PAGE ─────────────────────────────────────────────────
async function openBookPage(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  openBookModal();

  const title = bTitle(b), author = bAuthor(b);
  const authorLast = author.split(' ').slice(-1)[0];
  const desc = bDesc(b);
  const due = isRetroDue(b);
  const isReadingLayout = b.status === 'finished' || b.status === 'reading';

  // Retro prompt (due for reflection)
  const retroPrompt = due ? `<div class="retro-prompt" id="retro-prompt-box">
    <div class="retro-prompt-head"><span class="retro-prompt-icon">✦</span><div class="retro-prompt-title">Time for a retrospective</div></div>
    <div class="retro-prompt-sub">It's been ${getReflectWaitMonths() < 12 ? getReflectWaitMonths() + ' months' : 'a year'} since you finished <em>${title}</em>. How do you feel about it now?</div>
    <div class="retro-form">
      <div class="retro-rating-row">
        <span class="retro-rating-label">Retrospective rating</span>
        <input class="retro-rating-input" type="number" id="retro-rating-inp" min="1" max="10" placeholder="1–10" value="${b.rating||''}">
        <span style="font-size:12px;color:var(--tx1)">out of 10</span>
      </div>
      <textarea class="retro-textarea" id="retro-thoughts-inp" placeholder="What do you remember? Has your opinion changed?">${b.retro_thoughts||''}</textarea>
      <button class="retro-save-btn" onclick="saveRetro('${b.id}')">Save reflection</button>
    </div>
  </div>` : '';

  // TBR extra buttons
  const tbrBtns = b.status === 'tbr' ? `<div class="bp-add-btns" style="margin-top:12px">
    <button class="bp-add-btn bp-add-btn-reading" onclick="quickStatusChange('${b.id}','reading')">Currently reading</button>
    <button class="bp-add-btn bp-add-btn-finished" onclick="openAddFinishedForm('${b.isbn||''}','${b.ol_key||''}','${title.replace(/'/g,"\'")}','${author.replace(/'/g,"\'")}',null,null,'${b.id}')">Mark as finished</button>
  </div>` : '';

  // Left column content depends on status
  const leftCol = isReadingLayout
    ? `${bpDesc(desc, b.id)}${bpInitialThoughts(b.notes)}${bpRetro(b)}${bpAI(b.id, true)}`
    : `${bpDesc(desc, b.id)}${bpAI(b.id, true)}`;

  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="modalBack()">← Back</div>
      <button class="bp-edit-btn" onclick="openEdit('${b.id}')">Edit</button>
      <button class="bp-remove-btn" onclick="openDel('${b.id}')">Remove</button>
      <button class="bp-refresh-btn" onclick="refreshBookMeta('${b.id}')" title="Refresh cover and metadata">↻</button>
    </div>
    ${retroPrompt}
    ${bpHero(b, tbrBtns)}
    <div class="bp-body">
      <div class="bp-left">${leftCol}</div>
      ${bpSidebar(b.id, !!b.series_name, authorLast)}
    </div>
  </div>`;

  // Load async data
  loadAlsoBy(b);
  if (b.series_name) loadSeriesSection(b);
  // Restore cached AI analysis
  const cached = getCachedAnalysis(b.id);
  if (cached) {
    document.getElementById('ai-result').innerHTML = cached;
    const btn = document.getElementById('ai-gen-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '✦ Regenerate'; }
  }
}

// Modal navigation stack
const modalStack = [];

function openBookModal() {
  const modal = document.getElementById('book-modal');
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  const inner = document.getElementById('book-modal-inner');
  if (inner) {
    inner.scrollTop = 0;

  }
}

function pushModal(fn) {
  // Save current modal content before navigating
  const inner = document.getElementById('book-modal-inner');
  const body = document.getElementById('book-modal-body');
  if (body) modalStack.push(body.innerHTML);
  fn();
}

function modalBack() {
  if (modalStack.length > 0) {
    const prev = modalStack.pop();
    const body = document.getElementById('book-modal-body');
    if (body) {
      body.innerHTML = prev;
      const inner = document.getElementById('book-modal-inner');
      if (inner) inner.scrollTop = 0;
    }
  } else {
    closeBookModal();
  }
}

function closeBookModal() {
  modalStack.length = 0; // clear stack on close
  document.getElementById('book-modal').classList.remove('on');
  document.body.style.overflow = '';
  const inner = document.getElementById('book-modal-inner');
  if (inner) inner.onscroll = null;
}

function addSwipeToClose(elId, closeFn) {
  const el = document.getElementById(elId);
  if (!el || !('ontouchstart' in window)) return;
  let startY = 0;
  el.ontouchstart = e => { startY = e.touches[0].clientY; };
  el.ontouchmove = e => {
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  };
  el.ontouchend = e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) { el.style.transform = ''; closeFn(); }
    else { el.style.transform = ''; }
  };
}

// closeBookModal now defined with openBookModal

function bookModalClick(e) {
  // On mobile, don't close on backdrop tap - too easy to accidentally close
  // Desktop only: close if clicking the overlay backdrop
  if (e.target.id === 'book-modal' && window.innerWidth > 600) closeBookModal();
}



async function saveRetro(bookId) {
  const b = books.find(x=>x.id===bookId); if (!b) return;
  b.retro_rating = parseFloat(document.getElementById('retro-rating-inp').value)||0;
  b.retro_thoughts = document.getElementById('retro-thoughts-inp').value.trim();
  await saveBook(b);
  document.getElementById('retro-prompt-box').innerHTML =
    `<div style="padding:14px;font-size:13px;color:var(--teal);background:var(--bg2);border:0.5px solid var(--teal);border-radius:var(--rl)">✓ Reflection saved. Retrospective rating: ${b.retro_rating}/10</div>`;
  chartsDrawn=false; renderRetroDue(); renderBooks();
}

/* ── SERIES ────────────────────────────────────────────────────────────── */
async function fetchSeriesFromOL(olKey) {
  if (!olKey) return null;
  try {
    const r = await fetch(`https://openlibrary.org${olKey}.json`);
    const work = await r.json();
    // OL stores series in work.series as array of strings like "The Broken Earth (3)"
    const seriesRaw = work.series?.[0] || null;
    if (!seriesRaw) return null;
    // Parse "Series Name (#N)" or just "Series Name"
    const match = seriesRaw.match(/^(.+?)\s*\(#?(\d+(?:\.\d+)?)\)$/);
    if (match) return { name: match[1].trim(), number: parseFloat(match[2]) };
    return { name: seriesRaw.trim(), number: null };
  } catch(e) { return null; }
}

async function loadSeriesSection(b) {
  const el = document.getElementById('series-section');
  if (!el) return;

  const seriesName = b.series_name;

  if (!seriesName) {
    el.innerHTML = `<div style="font-size:12px;color:var(--tx1)">Not part of a series.<br><span style="font-size:11px;color:var(--tx2)">Add series info via Edit.</span></div>`;
    return;
  }

  // Only show books the user has explicitly connected — no OL suggestions
  const seriesBooks = books
    .filter(x => x.series_name && x.series_name.trim().toLowerCase() === seriesName.trim().toLowerCase())
    .sort((a, b) => (a.series_number||999) - (b.series_number||999));

  el.innerHTML = `
    <div style="font-size:11px;font-weight:500;color:var(--amber);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">${seriesName}</div>
    ${seriesBooks.map(lb => {
      const isCurrent = lb.id === b.id;
      const cover = bCover(lb);
      const coverHtml = cover
        ? `<img src="${cover}" style="width:26px;height:39px;object-fit:cover;border-radius:3px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy">`
        : `<div style="width:26px;height:39px;background:var(--bg2);border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--tx2)">${lb.series_number||'?'}</div>`;
      const ratingHtml = lb.rating ? toStars(lb.rating) : 'In library';
      const thisLabel = isCurrent ? '<div style="font-size:10px;color:#fff;flex-shrink:0;align-self:center;font-weight:500">← you are here</div>' : '';
      const bg = isCurrent ? 'var(--amber)' : '';
      const click = isCurrent ? '' : `closeBookModal();setTimeout(()=>openBookPage('${lb.id}'),150)`;
      return `<div style="display:flex;gap:9px;padding:7px 6px;border-bottom:0.5px solid var(--bd);cursor:${isCurrent?'default':'pointer'};border-radius:var(--r);background:${bg}" onclick="${click}">
        ${coverHtml}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:12px;font-weight:500;line-height:1.3;color:${isCurrent?'#fff':'var(--tx0)'}">${lb.series_number?'#'+lb.series_number+' ':''}${bTitle(lb)}</div>
          <div style="font-size:10px;margin-top:2px;color:${isCurrent?'rgba(255,255,255,.8)':lb.rating?'var(--amber)':'var(--tx2)'}">${ratingHtml}</div>
        </div>
        ${thisLabel}
      </div>`;
    }).join('')}`;
}

function openEditSeriesModal(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">Edit series info</div>
    <div class="fgrid" style="margin-bottom:16px">
      <div class="fg full"><label class="fl">Series name</label><input class="fi" id="es-name" value="${b.series_name||''}" placeholder="e.g. The Broken Earth"></div>
      <div class="fg"><label class="fl">Book number</label><input class="fi" type="number" id="es-num" value="${b.series_number||''}" placeholder="e.g. 1"></div>
    </div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Cancel</button>
      <button class="btn-primary" onclick="saveSeriesEdit('${bookId}')">Save</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

async function saveSeriesEdit(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  b.series_name = document.getElementById('e-series-name').value.trim() || null;
  b.series_number = parseFloat(document.getElementById('e-series-num').value) || null;
  await saveBook(b);
  document.getElementById('del-modal').classList.remove('on');
  // Reload the series section
  loadSeriesSection(b);
}

async function refreshBookMeta(bookId) {
  const b = books.find(x=>x.id===bookId); if (!b) return;
  const ck = b.isbn || b.ol_key || b.manual_title;
  if (ck) delete metaCache[ck];
  saveMeta();
  showToast('Refreshing metadata…');
  await fetchMetaForBook(b);
  showToast('Metadata updated ✓');
  sidebarCharsDrawn = false;
  renderLibrary();
  openBookPage(bookId);
}

async function loadOLData(b) {
  let olKey = b.ol_key || bMeta(b)?.olKey;
  const el = document.getElementById('ol-data');
  if (!el) return;

  // If no OL key, try to find it via ISBN search
  if (!olKey && b.isbn) {
    try {
      const r = await fetch(`https://openlibrary.org/search.json?isbn=${b.isbn}&limit=1&fields=key`);
      const d = await r.json();
      olKey = d.docs?.[0]?.key || null;
      if (olKey) { b.ol_key = olKey; await saveBook(b); }
    } catch(e) {}
  }
  // If still no key, try by title+author
  if (!olKey && bTitle(b) !== '(Unknown title)') {
    try {
      const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(bTitle(b))}&author=${encodeURIComponent(bAuthor(b))}&limit=1&fields=key`);
      const d = await r.json();
      olKey = d.docs?.[0]?.key || null;
      if (olKey) { b.ol_key = olKey; await saveBook(b); }
    } catch(e) {}
  }

  if (!olKey) {
    el.innerHTML = `<div style="font-size:12px;color:var(--tx1)">Not found on Open Library.</div>
      ${b.isbn?`<div style="font-family:monospace;font-size:11px;margin-top:6px;color:var(--tx2)">ISBN: ${b.isbn}</div>`:''}`;
    return;
  }
  try {
    const r = await fetch(`https://openlibrary.org${olKey}.json`);
    const work = await r.json();
    const ra = work.ratings_average ? parseFloat(work.ratings_average).toFixed(1) : null;
    const rc = work.ratings_count ? work.ratings_count.toLocaleString() : null;
    el.innerHTML = `
      ${ra?`<div style="margin-bottom:10px">
        <div style="font-size:30px;font-family:'Lora',serif;font-weight:500;color:var(--amber)">${ra}<span style="font-size:14px;opacity:.5">/5</span></div>
        <div style="font-size:12px;color:var(--tx1)">On Open Library${rc?' · '+rc+' ratings':''}</div>
      </div>`:''}
      ${work.first_publish_date?`<div class="ol-row"><span style="color:var(--tx2)">First published</span><span style="font-weight:500">${work.first_publish_date}</span></div>`:''}
      ${b.isbn?`<div class="ol-row"><span style="color:var(--tx2)">ISBN</span><span style="font-family:monospace;font-size:11px">${b.isbn}</span></div>`:''}`;
  } catch(e) { el.innerHTML = '<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
}

async function loadAlsoBy(b) {
  try {
    const author = bAuthor(b);
    const r = await fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(author)}&limit=6&fields=key,title,cover_i,first_publish_year,isbn`);
    const d = await r.json();
    const others = (d.docs||[]).filter(x=>x.title.toLowerCase()!==bTitle(b).toLowerCase()).slice(0,4);
    if (!others.length) { document.getElementById('also-by').innerHTML='<div style="font-size:12px;color:var(--tx1)">No other works found.</div>'; return; }
    // Store book data in a lookup table so onclick can access it safely
    window._alsoByBooks = {};
    document.getElementById('also-by').innerHTML = others.map((w,i) => {
      const inLib = books.find(x => bTitle(x).toLowerCase()===w.title.toLowerCase() || (w.isbn?.[0] && x.isbn===w.isbn?.[0]));
      window._alsoByBooks[i] = {key:w.key,title:w.title,author_name:[author],cover_i:w.cover_i,first_publish_year:w.first_publish_year,isbn:w.isbn};
      const clickFn = inLib ? `openBookPage('${inLib.id}')` : `openUnreadBookPage(window._alsoByBooks[${i}])`;
      return `<div style="display:flex;gap:9px;padding:7px 6px;border-bottom:0.5px solid var(--bd);cursor:pointer;border-radius:var(--r);margin:0 -6px" onclick="${clickFn}" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
        ${w.cover_i?`<img src="${cUrl(w.cover_i,'S')}" style="width:26px;height:39px;object-fit:cover;border-radius:3px;flex-shrink:0" loading="lazy">`:`<div style="width:26px;height:39px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:12px;font-weight:500;line-height:1.3">${w.title}</div>
          ${w.first_publish_year?`<div style="font-size:10px;color:var(--tx2);margin-top:1px">${w.first_publish_year}</div>`:''}
          ${inLib?`<div style="font-size:10px;background:var(--bg2);color:var(--teal);border:0.5px solid var(--teal);padding:1px 5px;border-radius:100px;display:inline-block;margin-top:2px">${inLib.rating ? 'In library · '+toStars(inLib.rating) : 'In library'}</div>`:`<div style="font-size:10px;color:var(--tx2);margin-top:2px">Tap to view →</div>`}
        </div>
      </div>`;
    }).join('');
  } catch(e) { document.getElementById('also-by').innerHTML='<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
}

/* ── AI ────────────────────────────────────────────────────────────────── */
function booksCtxStr() {
  const reading = books.filter(b=>b.status==='reading').map(b=>`"${bTitle(b)}" by ${bAuthor(b)}`);
  const tbr = books.filter(b=>b.status==='tbr').map(b=>`"${bTitle(b)}" by ${bAuthor(b)}`);
  const dnf = books.filter(b=>b.status==='dnf').map(b=>`"${bTitle(b)}" by ${bAuthor(b)}${b.rating?' (rated '+b.rating+'/10 before stopping)':''}`);
  const finished = books.filter(b=>b.status==='finished').map(b => {
    const parts = [];
    parts.push(`"${bTitle(b)}" by ${bAuthor(b)}`);
    parts.push(`Rating: ${b.rating||'?'}/10`);
    if (bGenre(b)) parts.push(`Genre: ${bGenre(b)}`);
    if (bPPD(b) > 0) parts.push(`Read at ${bPPD(b)} pages/day`);
    if (b.notes) {
      const answers = b.notes.split('\n')
        .filter(l => l.trim() && !l.trim().endsWith('?'))
        .join(' ');
      if (answers) parts.push(`Initial thoughts: "${answers}"`);
    }
    if (b.retro_thoughts) {
      const answers = b.retro_thoughts.split('\n')
        .filter(l => l.trim() && !l.trim().endsWith('?'))
        .join(' ');
      if (answers) parts.push(`Reflection: "${answers}"`);
    }
    return parts.join('. ');
  }).join('\n');

  let ctx = `FINISHED BOOKS:\n${finished}`;
  if (reading.length) ctx += `\n\nCURRENTLY READING (do NOT recommend these):\n${reading.join(', ')}`;
  if (tbr.length) ctx += `\n\nON TBR LIST (already aware of these):\n${tbr.join(', ')}`;
  if (dnf.length) ctx += `\n\nDID NOT FINISH (avoid recommending similar):\n${dnf.join(', ')}`;
  return ctx;
}

// Analysis cache - persists across sessions
const analysisCache = (() => {
  try { return JSON.parse(localStorage.getItem('pt_analysis_cache') || '{}'); } catch(e) { return {}; }
})();
function saveAnalysisCache() {
  try { localStorage.setItem('pt_analysis_cache', JSON.stringify(analysisCache)); } catch(e) {}
}
function getCachedAnalysis(bookId) { return analysisCache[bookId] || null; }
function setCachedAnalysis(bookId, html) { analysisCache[bookId] = html; saveAnalysisCache(); }

async function callClaude(prompt, maxTokens=600) {
  // Use personal API key if set, otherwise fall back to server proxy
  const useProxy = !apiKey;
  const url = useProxy ? 'https://pageturner-bay.vercel.app/api/chat' : 'https://api.anthropic.com/v1/messages';
  const headers = useProxy
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await r.json();
  if (r.status === 429) throw new Error('You\'ve reached the hourly limit for Book Bot. Please try again in an hour, or add your own API key in Settings.');
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.map(c=>c.text||'').join('')||'';
}

async function genAnalysis(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  const btn=document.getElementById('ai-gen-btn');

  // Check cache first
  const cached = getCachedAnalysis(bookId);
  if (cached) {
    document.getElementById('ai-result').innerHTML = cached;
    btn.disabled=false; btn.innerHTML='✦ Regenerate';
    return;
  }

  btn.disabled=true; btn.textContent='Thinking…';
  document.getElementById('ai-result').innerHTML=`<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Checking your reading history…</div>`;
  try {
    const text = await callClaude(`Based on this reader's history, is "${bTitle(b)}" by ${bAuthor(b)} a good fit for them?\nHistory:\n${booksCtxStr()}\nGenre:${bGenre(b)}\nDescription:${bDesc(b)||'N/A'}\n\nRespond warmly in 2-3 sentences. Focus on the big picture — why it does or doesn't fit their taste based on patterns you see in their reading history. Reference 1-2 specific books. End with PREDICTED: [number]/10.`, 300);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const analysis = text.replace(/PREDICTED:.*$/im,'').trim();
    const html = `${pred?`<div class="ai-pred"><span>Book Bot thinks</span><span style="color:var(--amber)">${toStars(parseFloat(pred[1]))}</span></div>`:''}
       <div style="font-size:14px;line-height:1.7;font-family:Georgia,serif">${analysis.replace(/\n/g,'<br>')}</div>`;
    document.getElementById('ai-result').innerHTML = html;
    setCachedAnalysis(bookId, html);
  }catch(e){document.getElementById('ai-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false; btn.innerHTML='✦ Regenerate';
}

async function genUnreadAnalysis(olKey, title, author) {
  const cacheKey = 'unread_' + (olKey||title);
  const btn=document.getElementById('ai-gen-btn');

  const cached = getCachedAnalysis(cacheKey);
  if (cached) {
    document.getElementById('ai-result').innerHTML = cached;
    btn.disabled=false; btn.innerHTML='✦ Regenerate';
    return;
  }

  btn.disabled=true; btn.textContent='Thinking…';
  document.getElementById('ai-result').innerHTML=`<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Checking your reading history…</div>`;
  try {
    const text = await callClaude(`Based on this reader's history, is "${title}" by ${author} a good fit for them?\nHistory:\n${booksCtxStr()}\n\nRespond warmly in 2-3 sentences. Focus on the big picture — why it does or doesn't fit their taste based on patterns you see in their reading history. Reference 1-2 specific books. End with PREDICTED: [number]/10.`, 300);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const analysis = text.replace(/PREDICTED:.*$/im,'').trim();
    const html = `${pred?`<div class="ai-pred"><span>Book Bot thinks</span><span style="color:var(--amber)">${toStars(parseFloat(pred[1]))}</span></div>`:''}
       <div style="font-size:14px;line-height:1.7;font-family:Georgia,serif">${analysis.replace(/\n/g,'<br>')}</div>`;
    document.getElementById('ai-result').innerHTML = html;
    setCachedAnalysis(cacheKey, html);
  }catch(e){document.getElementById('ai-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false; btn.innerHTML='✦ Regenerate';
}

async function genSimilar(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  const btn=document.getElementById('sim-btn');btn.disabled=true;btn.textContent='Finding…';
  document.getElementById('sim-result').innerHTML=`<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Finding recommendations…</div>`;
  try {
    const hist=books.filter(x=>x.status==='finished').map(bk=>`"${bTitle(bk)}" by ${bAuthor(bk)}: ${bk.rating||'?'}/10`).join(', ');
    const text = await callClaude(`Suggest 4 books similar to "${bTitle(b)}" by ${bAuthor(b)} for this reader.\nLibrary:${hist}\nDo NOT suggest books in their library.\nRespond ONLY with JSON:\n[{"title":"...","author":"...","reason":"one sentence why"}]`);
    let recs=[];try{recs=JSON.parse(text.replace(/```json|```/g,'').trim());}catch(e){}
    if(!recs.length){document.getElementById('sim-result').innerHTML='<div style="font-size:13px;color:var(--tx1)">Could not generate recommendations.</div>';return;}
    document.getElementById('sim-result').innerHTML='<div id="sim-list"></div>';
    for(const rec of recs){
      const inLib=books.find(x=>bTitle(x).toLowerCase()===rec.title.toLowerCase());
      let coverUrl=inLib?bCover(inLib):null;
      let doc=null;
      if(!coverUrl){try{const sr=await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(rec.title)}&author=${encodeURIComponent(rec.author)}&limit=1&fields=key,cover_i,first_publish_year,isbn`);const sd=await sr.json();doc=sd.docs?.[0]||null;const cid=doc?.cover_i;if(cid)coverUrl=cUrl(cid,'S');}catch(e){}}
      const card=document.createElement('div');card.className='sim-book';
      card.style.cursor='pointer';
      if(inLib){
        card.onclick=()=>openBookPage(inLib.id);
      } else if(doc) {
        // Store OL data for click
        const olData={key:doc.key,title:rec.title,author_name:[rec.author],cover_i:doc.cover_i,first_publish_year:doc.first_publish_year,isbn:doc.isbn};
        card.onclick=()=>openUnreadBookPage(olData);
      }
      const clickHint = inLib ? `<span class="sim-inlib">In library · ${toStars(inLib.rating)}</span>` : `<span style="font-size:10px;color:var(--amber)">Tap to explore →</span>`;
      card.innerHTML=`${coverUrl?`<img class="sim-cover" src="${coverUrl}" alt="" loading="lazy">`:`<div class="sim-cover-ph">📖</div>`}<div style="flex:1;min-width:0"><div style="font-family:'Lora',serif;font-size:13px;font-weight:500;margin-bottom:2px">${rec.title}</div><div style="font-size:11px;color:var(--tx1);margin-bottom:3px">${rec.author}</div><div style="font-size:11px;color:var(--tx2);line-height:1.4">${rec.reason}</div>${clickHint}</div>`;
      document.getElementById('sim-list')?.appendChild(card);
    }
  }catch(e){document.getElementById('sim-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false;btn.innerHTML='✦ Regenerate';
}

/* ── EDIT / DELETE MODALS ──────────────────────────────────────────────── */
function editStatusChanged(sel) {
  if (sel.value === 'finished' || sel.value === 'dnf') {
    const endInp = document.getElementById('e-end');
    if (endInp && !endInp.value) endInp.value = new Date().toISOString().slice(0,10);
  }
}

function editEndDateChanged() {
  const endInp = document.getElementById('e-end');
  const statusSel = document.getElementById('e-status');
  if (endInp?.value && statusSel?.value === 'tbr') {
    statusSel.value = 'finished';
  }
}

function openEdit(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  const title=bTitle(b);
  document.getElementById('edit-body').innerHTML=`
    <button class="modal-x" onclick="document.getElementById('edit-modal').classList.remove('on')">×</button>
    <div class="modal-title">Edit — ${title}</div>
    <!-- Prevent Chrome password save prompt -->
    <input type="password" style="display:none" autocomplete="new-password">
    <div class="fgrid" style="margin-bottom:12px">
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="e-status" onchange="editStatusChanged(this)">
          <option value="finished"${b.status==='finished'?' selected':''}>Finished</option>
          <option value="reading"${b.status==='reading'?' selected':''}>Currently Reading</option>
          <option value="tbr"${b.status==='tbr'?' selected':''}>To Be Read</option>
          <option value="dnf"${b.status==='dnf'?' selected':''}>Did Not Finish</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Fiction / Nonfiction</label>
        <select class="fi" id="e-fn">
          <option value="">—</option>
          <option value="Fiction"${b.fiction_nonfiction==='Fiction'?' selected':''}>Fiction</option>
          <option value="Nonfiction"${b.fiction_nonfiction==='Nonfiction'?' selected':''}>Nonfiction</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="e-rating" min="1" max="10" value="${b.rating||''}"></div>
      <div class="fg"><label class="fl">Retrospective rating</label><input class="fi" type="number" id="e-retro" min="1" max="10" value="${b.retro_rating||''}"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="e-start" value="${b.start_date||''}"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="e-end" value="${b.end_date||''}" onchange="editEndDateChanged()"></div>
      ${b.status==='reading'?`<div class="fg"><label class="fl">Pages read so far</label><input class="fi" type="number" id="e-pages-read" min="0" value="${b.pages_read||''}"></div>`:''}
      <div class="fg"><label class="fl">Series name</label><input class="fi" type="text" id="e-series-name" placeholder="e.g. The Broken Earth" value="${b.series_name||''}" autocomplete="off" list="series-datalist"><datalist id="series-datalist">${[...new Set(books.filter(x=>x.series_name).map(x=>x.series_name))].map(s=>`<option value="${s}">`).join('')}</datalist></div>
      <div class="fg"><label class="fl">Book number</label><input class="fi" type="number" id="e-series-num" min="1" step="0.5" placeholder="e.g. 1" value="${b.series_number||''}"></div>
    </div>
    <div class="fgrid" style="margin-bottom:12px">

    </div>
    <div style="margin-bottom:12px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildGenreInput('e-genre', bGenre(b))}</div>
    <div class="fg full" style="margin-bottom:10px">
      <label class="fl" style="margin-bottom:10px">Initial thoughts</label>
      ${INITIAL_PROMPTS.map(p=>{
        const existing = parseInitialPrompt(b.notes||'', p.q);
        return `<div class="fg full" style="margin-bottom:10px">
          <div style="font-size:11px;color:var(--amber);font-weight:500;margin-bottom:4px">${p.q}</div>
          <textarea class="fi fta" id="e-ip-${p.id}" placeholder="Optional…" style="min-height:60px;width:100%">${existing}</textarea>
        </div>`;
      }).join('')}
    </div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Retrospective thoughts</label><textarea class="fi fta" id="e-retro-notes">${b.retro_thoughts||''}</textarea></div>
    <div class="edit-modal-footer">
      <div class="form-acts">
        <button class="btn-ghost" onclick="document.getElementById('edit-modal').classList.remove('on')">Cancel</button>
        <button class="btn-primary" id="save-edit-btn" onclick="saveEdit('${b.id}')">Save changes</button>
      </div>
    </div>`;
  document.getElementById('edit-modal').classList.add('on');
}

async function saveEdit(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  b.status=document.getElementById('e-status').value;
  b.rating=parseFloat(document.getElementById('e-rating').value)||null;
  b.retro_rating=parseFloat(document.getElementById('e-retro').value)||null;
  b.start_date=document.getElementById('e-start').value||null;
  b.end_date=document.getElementById('e-end').value||null;
  // Save genre to metadata cache (not Supabase - it's metadata)
  const newGenre = getTagVal('e-genre');
  const ck = b.isbn || b.ol_key || b.manual_title;
  if (ck && newGenre !== undefined) setMeta(ck, { genre: newGenre });
  b.series_name = document.getElementById('e-series-name')?.value.trim() || null;
  b.series_number = parseFloat(document.getElementById('e-series-num')?.value) || null;
  b.notes=INITIAL_PROMPTS.map(p=>{const v=document.getElementById('e-ip-'+p.id)?.value.trim();return v?p.q+'\n'+v:'';}).filter(Boolean).join('\n\n');
  b.retro_thoughts=document.getElementById('e-retro-notes').value.trim();
  if(b.status==='reading'){
    const pr=document.getElementById('e-pages-read');
    if(pr)b.pages_read=parseInt(pr.value)||null;
  }
  b.series_name=document.getElementById('e-series-name')?.value.trim()||null;
  b.series_number=parseFloat(document.getElementById('e-series-num')?.value)||null;
  b.fiction_nonfiction=document.getElementById('e-fn')?.value||null;
  await saveBook(b);
  document.getElementById('edit-modal').classList.remove('on');
  chartsDrawn=false;renderLibrary();
  showToast('Changes saved ✓');
  // If book modal is open, refresh it with updated data
  if (document.getElementById('book-modal')?.classList.contains('on')) {
    openBookPage(bookId);
  }
}

function openDel(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  document.getElementById('del-body').innerHTML=`
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">Remove book</div>
    <p style="font-size:13px;line-height:1.6;margin-bottom:18px;color:var(--tx1)">Are you sure you want to remove <strong>${bTitle(b)}</strong>? This cannot be undone.</p>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Cancel</button>
      <button class="btn-danger" onclick="confirmDel('${bookId}')">Remove</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

async function confirmDel(bookId) {
  const ok=await deleteBookById(bookId);
  if(ok)books=books.filter(x=>x.id!==bookId);
  document.getElementById('del-modal').classList.remove('on');
  chartsDrawn=false;renderLibrary();
}

function maybeClose(e,id){if(e.target.id===id)document.getElementById(id).classList.remove('on');}

/* ── TAG SYSTEM ────────────────────────────────────────────────────────── */
function buildTagInput(id,value,type,suggs){
  const tags=parseTags(value);
  const chips=tags.map(t=>`<span class="tchip tchip-${type}" data-tag="${esc(t)}">${esc(t)}<span class="tchip-x" onclick="removeTag('${id}','${escQ(t)}')">×</span></span>`).join('');
  const suggBtns=suggs.filter(s=>!tags.includes(s)).slice(0,10).map(s=>`<button class="tsugg" onclick="addTag('${id}','${escQ(s)}','${type}')">${esc(s)}</button>`).join('');
  return`<div class="tag-wrap" id="${id}-wrap" onclick="document.getElementById('${id}-in').focus()">${chips}<input class="tag-txt" id="${id}-in" placeholder="Type and press Enter…" onkeydown="tagKey(event,'${id}','${type}')"></div><div class="tag-sugg">${suggBtns}</div>`;
}
function addTag(id,tag,type){const wrap=document.getElementById(id+'-wrap');if(!wrap)return;const existing=[...wrap.querySelectorAll('.tchip')].map(el=>el.dataset.tag);if(existing.includes(tag))return;const chip=document.createElement('span');chip.className=`tchip tchip-${type}`;chip.dataset.tag=tag;chip.innerHTML=`${esc(tag)}<span class="tchip-x" onclick="removeTag('${id}','${escQ(tag)}')">×</span>`;wrap.insertBefore(chip,document.getElementById(id+'-in'));const sw=wrap.nextElementSibling;if(sw){const btn=[...sw.querySelectorAll('.tsugg')].find(b=>b.textContent===tag);if(btn)btn.style.display='none';}}
function removeTag(id,tag){const wrap=document.getElementById(id+'-wrap');if(!wrap)return;const chip=[...wrap.querySelectorAll('.tchip')].find(c=>c.dataset.tag===tag);if(chip)chip.remove();const sw=wrap.nextElementSibling;if(sw){const btn=[...sw.querySelectorAll('.tsugg')].find(b=>b.textContent===tag);if(btn)btn.style.display='';}}
function tagKey(e,id,type){const inp=e.target;if((e.key==='Enter'||e.key===',')&&inp.value.trim()){e.preventDefault();addTag(id,inp.value.trim(),type);inp.value='';}if(e.key==='Backspace'&&!inp.value){const wrap=document.getElementById(id+'-wrap');const chips=[...wrap.querySelectorAll('.tchip')];if(chips.length)removeTag(id,chips[chips.length-1].dataset.tag);}}
function getTagVal(id){const wrap=document.getElementById(id+'-wrap');if(!wrap)return'';return joinTags([...wrap.querySelectorAll('.tchip')].map(el=>el.dataset.tag));}

/* ── ADD BOOK (OL SEARCH) ──────────────────────────────────────────────── */


async function selRes(i){
  document.querySelectorAll('.ritem').forEach(el=>el.classList.remove('sel'));
  document.getElementById(`ri-${i}`)?.classList.add('sel');
  selResult=olResults[i];selEdition=null;
  await loadEds(selResult.key);
}

async function loadEds(key){
  sec.innerHTML=`<div class="edsec"><div style="font-size:12px;color:var(--tx1)">Loading editions…</div></div>`;sec.style.display='block';
  try{
    const r=await fetch(`https://openlibrary.org${key}/editions.json?limit=40`);const d=await r.json();
    editions=(d.entries||[]).map(e=>({key:e.key,publishers:(e.publishers||[]).join(', '),year:e.publish_date||'',isbn:(e.isbn_13||[])[0]||(e.isbn_10||[])[0]||'',format:gFmt(e),pages:e.number_of_pages||null,coverId:e.covers?.[0]||null}));
    renderEds();
  }catch(e){sec.innerHTML='<div class="edsec"><div style="font-size:13px;color:var(--coral)">Could not load editions.</div></div>';}
}

function gFmt(e){const f=(e.physical_format||'').toLowerCase();if(f.includes('ebook')||f.includes('digital'))return'EBook';if(f.includes('audio'))return'Audiobook';if(f.includes('hard'))return'Hardcover';if(f.includes('paper')||f.includes('mass'))return'Paperback';return'Print';}

function renderEds(){
  const fil=edFilt==='all'?editions:editions.filter(e=>e.format.toLowerCase().includes(edFilt));
  const fc={};editions.forEach(e=>{fc[e.format]=(fc[e.format]||0)+1;});
  const fbtns=['all',...Object.keys(fc)].map(f=>`<button class="efilt${edFilt===f?' on':''}" onclick="setEF('${f}')">${f==='all'?'All':f}${f!=='all'?' ('+fc[f]+')':''}</button>`).join('');
  const rows=fil.slice(0,20).map(e=>{const p=selEdition&&selEdition.key===e.key;return`<div class="edrow${p?' picked':''}" onclick="pickEd(${editions.indexOf(e)})">${e.coverId?`<img class="edrow-cover" src="${cUrl(e.coverId,'S')}" alt="" loading="lazy">`:`<div class="edrow-cover-ph"></div>`}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;margin-bottom:2px">${e.format}${e.year?' · '+e.year:''}</div><div style="font-size:11px;color:var(--tx1)">${e.publishers||'Publisher unknown'}${e.pages?' · '+e.pages+' pages':''}</div>${e.isbn?`<div class="isbn-mono">ISBN: ${e.isbn}</div>`:''}</div></div>`;}).join('');
  sec.innerHTML=`<div class="edsec"><div style="font-size:12px;font-weight:500;color:var(--tx1);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Select an edition</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${fbtns}</div><div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto">${rows||'<div style="font-size:13px;color:var(--tx1)">No editions match.</div>'}</div></div>`;
}

function setEF(f){edFilt=f;renderEds();}
function pickEd(i){selEdition=editions[i];edFilt='all';renderEds();buildForm();}

function buildForm(){
  if(!selResult)return;
  const ed=selEdition||{};const r=selResult;
  const author=(r.author_name||[]).slice(0,2).join(', ')||'';
  const year=ed.year?.match(/\d{4}/)?.[0]||r.first_publish_year||'';
  const fmt=ed.format||'Print';const coverId=ed.coverId||r.cover_i||null;const isbn=ed.isbn||r.isbn?.[0]||'';
  document.getElementById('book-form').innerHTML=`<div class="fcard">
    <div class="fcard-title">Add to your library</div>
    <div class="sel-header">
      ${coverId?`<img class="sel-cover" src="${cUrl(coverId,'M')}" alt="">`:`<div class="sel-cover-ph">📖</div>`}
      <div><div class="sel-title">${r.title}</div><div class="sel-author">${author}</div>
        <div>${fmt?`<span class="stag">${fmt}</span>`:''} ${year?`<span class="stag">${year}</span>`:''} ${isbn?`<span class="stag">ISBN ${isbn}</span>`:''}</div>
      </div>
    </div>
    <div class="fgrid">
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="f-status"><option value="finished">Finished</option><option value="reading">Currently Reading</option><option value="tbr">To Be Read</option></select>
      </div>
      <div class="fg"><label class="fl">Fiction / Nonfiction</label>
        <select class="fi" id="f-fn"><option value="">—</option><option value="Fiction">Fiction</option><option value="Nonfiction">Nonfiction</option></select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="f-rating" min="1" max="10" placeholder="e.g. 8"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="f-start"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="f-end"></div>
    </div>
    <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildGenreInput('f-genre','')}</div>
    <div class="fg full" style="margin-bottom:10px">
      <label class="fl" style="margin-bottom:10px">Initial thoughts</label>
      ${INITIAL_PROMPTS.map(p=>`<div class="fg full" style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--amber);font-weight:500;margin-bottom:4px">${p.q}</div>
        <textarea class="fi fta" id="f-ip-${p.id}" placeholder="Optional…" style="min-height:60px;width:100%"></textarea>
      </div>`).join('')}
    </div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Retrospective thoughts</label><textarea class="fi fta" id="f-retro" placeholder="How do you feel about it now?"></textarea></div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="resetAdd()">Clear</button>
      <button class="btn-primary" id="submit-book-btn" onclick="submitBook()">Add to library</button>
    </div>
  </div>`;
  document.getElementById('book-form').style.display='block';
  document.getElementById('book-form').dataset.isbn=isbn;
  document.getElementById('book-form').dataset.olKey=r.key||'';
  document.getElementById('book-form').dataset.title=r.title;
  document.getElementById('book-form').dataset.author=author;
  document.getElementById('book-form').dataset.coverId=coverId||'';
  // Pre-cache metadata
  if(isbn){setMeta(isbn,{title:r.title,author,year:parseInt(year)||null,coverId:coverId||null,cover:coverId?cUrl(coverId,'L'):null});}
}

async function submitBook(){
  const fd=document.getElementById('book-form').dataset;
  if(!fd.isbn&&!fd.olKey){alert('No book selected.');return;}
  const btn=document.getElementById('submit-book-btn');btn.disabled=true;btn.textContent='Saving…';
  const newBook={isbn:fd.isbn||null,ol_key:fd.olKey||null,google_id:null,status:document.getElementById('f-status').value,start_date:document.getElementById('f-start').value||null,end_date:document.getElementById('f-end').value||null,rating:parseFloat(document.getElementById('f-rating').value)||null,retro_rating:null,notes:INITIAL_PROMPTS.map(p=>{const v=document.getElementById('f-ip-'+p.id)?.value.trim();return v?p.q+'\n'+v:'';}).filter(Boolean).join('\n\n'),retro_thoughts:document.getElementById('f-retro').value.trim(),mood:'',themes:'',manual_title:null,manual_author:null,import_source:''};
  try{
    await saveBook(newBook);
    books.unshift(newBook);
    // Cache genre from form
    const fGenre = getTagVal('f-genre');
    const fck = newBook.isbn||newBook.ol_key||newBook.manual_title;
    if(fck && fGenre) setMeta(fck, {genre: fGenre});
    resetAdd();renderLibrary();go('library');}
  catch(e){alert('Could not save: '+e.message);btn.disabled=false;btn.textContent='Add to library';}
}

function resetAdd(){
  olResults=[];selResult=null;editions=[];selEdition=null;
  document.getElementById('book-form').style.display='none';
}

/* ── CSV IMPORT ────────────────────────────────────────────────────────── */
function handleImport(event, platform){
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let p = platform;
      // Auto-detect if not specified
      if (!p || p === 'auto') {
        const firstLine = e.target.result.split('\n')[0].toLowerCase();
        if (firstLine.includes('exclusive shelf') || firstLine.includes('bookshelves')) p = 'goodreads';
        else if (firstLine.includes('read status') && firstLine.includes('star rating')) p = 'storygraph';
        else if (firstLine.includes('manual_title') || firstLine.includes('import_source')) p = 'pageturner';
        else { alert('Could not detect the format of this CSV.\n\nMake sure it is exported directly from Goodreads, StoryGraph, or PageTurner.'); return; }
      }
      const parsed = parseCSV(e.target.result, p);
      pendingImport = {books: parsed, platform: p};
      showImportPreview(parsed, p);
    } catch(err) { alert('Could not parse: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function parseFullCSV(text){
  const rows=[];let row=[];let cur='';let inQ=false;
  const t=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<t.length;i++){const ch=t[i];if(inQ){if(ch==='"'&&t[i+1]==='"'){cur+='"';i++;}else if(ch==='"'){inQ=false;}else{cur+=ch;}}else{if(ch==='"'){inQ=true;}else if(ch===','){row.push(cur);cur='';}else if(ch==='\n'){row.push(cur);cur='';if(row.some(c=>c.trim()))rows.push(row);row=[];}else{cur+=ch;}}}
  row.push(cur);if(row.some(c=>c.trim()))rows.push(row);return rows;
}

function fmtDate(s){
  if(!s||s==='None')return null;s=s.trim();
  const dmy=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(dmy){const[_,d,m,y]=dmy;return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');}
  const dmyS=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(dmyS){const[_,d,m,y]=dmyS;const full=parseInt(y)>50?'19'+y:'20'+y;return full+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');}
  if(s.match(/^\d{4}-\d{2}-\d{2}$/))return s;
  const d=new Date(s);if(isNaN(d))return null;return d.toISOString().split('T')[0];
}

function parseCSV(text,platform){
  const allRows=parseFullCSV(text);if(!allRows.length)return[];
  const headers=allRows[0].map(h=>h.trim().toLowerCase());
  const cm={};headers.forEach((h,i)=>cm[h]=i);
  const get=(row,name)=>{const i=cm[name];return i!==undefined?(row[i]||'').trim():''};
  const results=[];
  for(let i=1;i<allRows.length;i++){
    const row=allRows[i];let b=null;
    if(platform==='goodreads'){
      const title=get(row,'title');if(!title)continue;
      const grR=parseFloat(get(row,'my rating'))||0;const rating=grR>0?grR*2:0;
      const shelf=(get(row,'exclusive shelf')||get(row,'bookshelves')||'').toLowerCase();
      const status=shelf.includes('currently')||shelf.includes('reading')?'reading':shelf.includes('to-read')||shelf.includes('to read')?'tbr':'finished';
      // Extract genres from bookshelves - filter out shelf names, keep genre-like tags
      const grShelves = get(row,'bookshelves')||get(row,'bookshelves with positions')||'';
      const grGenres = grShelves.split(',').map(s=>s.trim())
        .filter(s=>s && !['read','to-read','currently-reading','owned','favorites','did-not-finish','dnf'].includes(s.toLowerCase()))
        .map(s=>canonicaliseGenre(s)).filter(Boolean);
      const grGenreStr = [...new Set(grGenres)].join(', ');
      b={isbn:get(row,'isbn13')||get(row,'isbn')||null,ol_key:null,google_id:null,status,start_date:null,end_date:fmtDate(get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:(()=>{const r=get(row,'my review')||'';return r?`${INITIAL_PROMPTS[0].q}\n${r}`:''})(),retro_thoughts:'',mood:'',themes:'',manual_title:title,manual_author:get(row,'author')||get(row,'author l-f')||null,import_source:'goodreads',_ratingConverted:grR>0,_importGenre:grGenreStr};
    }else if(platform==='storygraph'){
      const title=get(row,'title');if(!title)continue;
      const sgR=parseFloat(get(row,'star rating'))||parseFloat(get(row,'my rating'))||0;const rating=sgR>0?sgR*2:0;
      const rs=(get(row,'read status')||get(row,'shelf')||'').toLowerCase();
      const status=rs.includes('currently')||rs==='reading'?'reading':rs.includes('to-read')||rs==='want to read'?'tbr':'finished';
      // StoryGraph has a 'genres' column with comma-separated genres
      const sgGenreRaw = get(row,'genres')||get(row,'tags')||'';
      const sgGenres = sgGenreRaw.split(',').map(s=>s.trim())
        .map(s=>canonicaliseGenre(s)).filter(Boolean);
      const sgGenreStr = [...new Set(sgGenres)].join(', ');
      // StoryGraph moods column
      const sgMoods = parseTags(get(row,'moods')||'').map(m=>m.trim()).filter(Boolean).join(', ');
      const sgFN = (() => { const f=get(row,'fiction/non-fiction')||get(row,'fiction')||''; if(f.toLowerCase().includes('nonfiction')||f.toLowerCase().includes('non-fiction'))return'Nonfiction'; if(f.toLowerCase().includes('fiction'))return'Fiction'; return ''; })();
      b={isbn:null,ol_key:null,google_id:null,status,start_date:fmtDate(get(row,'date started')||''),end_date:fmtDate(get(row,'date finished')||get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:(()=>{const r=get(row,'review')||'';return r?`${INITIAL_PROMPTS[0].q}\n${r}`:''})(),retro_thoughts:'',mood:'',themes:'',fiction_nonfiction:sgFN||null,manual_title:title,manual_author:get(row,'authors')||get(row,'author')||null,import_source:'storygraph',_ratingConverted:sgR>0,_importGenre:sgGenreStr};
    }else{
      const title=get(row,'title');if(!title)continue;
      const retro=parseFloat(get(row,'retrospective rating'))||null;
      b={isbn:null,ol_key:null,google_id:null,status:'finished',start_date:fmtDate(get(row,'start date')||''),end_date:fmtDate(get(row,'end date')||''),rating:parseFloat(get(row,'rating'))||null,retro_rating:retro,notes:get(row,'notes')||'',retro_thoughts:get(row,'retrospective thoughts')||'',mood:'',themes:'',manual_title:title,manual_author:get(row,'author')||null,import_source:'pageturner'};
    }
    if(b)results.push(b);
  }
  return results;
}

function showImportPreview(parsed,platform){
  const fin=parsed.filter(b=>b.status==='finished');
  const reading=parsed.filter(b=>b.status==='reading');
  const tbr=parsed.filter(b=>b.status==='tbr');
  const converted=parsed.filter(b=>b._ratingConverted);
  const platformName=platform==='goodreads'?'Goodreads':platform==='storygraph'?'StoryGraph':'PageTurner';

  // Detect duplicates against existing library
  const dupes = parsed.filter(b => books.find(x =>
    bTitle(x).toLowerCase() === (b.manual_title||'').toLowerCase() ||
    (b.isbn && x.isbn === b.isbn)
  ));
  // Mark duplicates on parsed books
  parsed.forEach(b => {
    b._isDupe = !!books.find(x =>
      bTitle(x).toLowerCase() === (b.manual_title||'').toLowerCase() ||
      (b.isbn && x.isbn === b.isbn)
    );
  });
  const newBooks = parsed.filter(b => !b._isDupe);

  const preview=document.getElementById('import-preview');
  preview.style.display='block';
  preview.innerHTML=`<div class="import-preview">
    <div style="font-size:14px;font-weight:500;margin-bottom:3px">Import preview — ${platformName}</div>
    <div style="font-size:12px;color:var(--tx1);margin-bottom:14px">Review before importing.${converted.length?' '+converted.length+' ratings converted from 1–5 to 1–10.':''}</div>
    <div class="ip-stats">
      <div class="ip-stat"><strong>${parsed.length}</strong>Total</div>
      <div class="ip-stat"><strong>${newBooks.length}</strong>New</div>
      <div class="ip-stat" style="${dupes.length?'color:var(--amber)':''}"><strong>${dupes.length}</strong>Duplicates</div>
      <div class="ip-stat"><strong>${fin.length}</strong>Finished</div>
    </div>
    ${dupes.length?`<div class="ip-warn">⚠ ${dupes.length} book${dupes.length!==1?'s are':' is'} already in your library and will be skipped.</div>`:''}
    ${converted.length?`<div class="ip-warn">⚠ ${converted.length} ratings multiplied by 2 (5-star → 10-point). Edit after import if needed.</div>`:''}
    <div class="ip-legend">
      <span><span class="ip-swatch" style="background:var(--bg0);border:0.5px solid var(--bd)"></span>New</span>
      <span><span class="ip-swatch" style="background:var(--teal-l)"></span>Reading</span>
      <span><span class="ip-swatch" style="background:var(--purple-l)"></span>TBR</span>
      <span><span class="ip-swatch" style="background:var(--bg2);border:0.5px solid var(--bd)"></span>Duplicate (skipped)</span>
    </div>
    <div class="ip-table-wrap">
      <table class="ip-table">
        <thead><tr><th>Title</th><th>Author</th><th>Rating</th><th>Status</th><th>Dates</th><th>Note</th></tr></thead>
        <tbody>${parsed.slice(0,50).map(b=>{
          const cls=b._isDupe?'ip-dupe':b.status==='reading'?'ip-read':b.status==='tbr'?'ip-tbr':b._ratingConverted?'ip-conv':'ip-fin';
          const dates=[b.start_date,b.end_date].filter(Boolean).join(' → ');
          return`<tr class="${cls}" style="${b._isDupe?'opacity:.5':''}"><td>${b.manual_title||'—'}</td><td>${b.manual_author||'—'}</td><td>${b.rating?toStars(b.rating):'—'}</td><td>${b.status==='reading'?'Reading':b.status==='tbr'?'TBR':'Finished'}</td><td style="font-size:11px">${dates||'—'}</td><td style="font-size:11px;color:var(--amber)">${b._isDupe?'Already in library':''}</td></tr>`;
        }).join('')}${parsed.length>50?`<tr><td colspan="6" style="text-align:center;color:var(--tx1);padding:10px">…and ${parsed.length-50} more</td></tr>`:''}</tbody>
      </table>
    </div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="cancelImport()">Cancel</button>
      <button class="btn-primary" id="confirm-import-btn" onclick="confirmImport()">${newBooks.length?`Import ${newBooks.length} new book${newBooks.length!==1?'s':''}`:'Nothing new to import'}</button>
    </div>
  </div>`;
  preview.scrollIntoView({behavior:'smooth',block:'start'});
}

function cancelImport(){pendingImport=null;document.getElementById('import-preview').style.display='none';}

async function confirmImport(){
  if(!pendingImport)return;
  const btn=document.getElementById('confirm-import-btn');
  btn.disabled=true;btn.textContent='Importing…';
  // Merge genre + notes + fiction_nonfiction into existing duplicate books
  pendingImport.books.filter(b=>b._isDupe).forEach(incoming => {
    const existing = books.find(x =>
      bTitle(x).toLowerCase() === (incoming.manual_title||'').toLowerCase() ||
      (incoming.isbn && x.isbn === incoming.isbn)
    );
    if (!existing) return;
    let changed = false;
    const ck = existing.isbn || existing.ol_key || existing.manual_title;
    // Merge genre
    if (incoming._importGenre && !bGenre(existing)) {
      if (ck) setMeta(ck, { genre: incoming._importGenre });
      changed = true;
    }
    // Merge notes
    if (incoming.notes && !existing.notes) {
      existing.notes = incoming.notes;
      changed = true;
    }
    // Merge fiction_nonfiction
    if (incoming.fiction_nonfiction && !existing.fiction_nonfiction) {
      existing.fiction_nonfiction = incoming.fiction_nonfiction;
      changed = true;
    }
    if (changed) saveBook(existing);
  });
  const toInsert=pendingImport.books.filter(b=>!b._isDupe).map(b=>({...bookToRow({...b,id:null})}));
  if(!toInsert.length){alert('No new books to import.');pendingImport=null;document.getElementById('import-preview').style.display='none';return;}
  const chunkSize=50;let inserted=0;
  for(let i=0;i<toInsert.length;i+=chunkSize){
    const chunk=toInsert.slice(i,i+chunkSize);
    try{
      const rows=await sbInsert('books',chunk);
      rows.forEach((row,j)=>{
        // Find the original book object from pendingImport that matches this inserted row
        const origIdx = pendingImport.books.filter(b=>!b._isDupe).indexOf(
          pendingImport.books.filter(b=>!b._isDupe)[i+j]
        );
        books.push({...pendingImport.books.filter(b=>!b._isDupe)[i+j],id:row.id});
      });
      inserted+=chunk.length;btn.textContent=`Importing… ${inserted}/${toInsert.length}`;
    }catch(e){
      console.error('Import error:',e);
      alert(`Import failed at row ${inserted+1}: ${e.message}`);
      btn.disabled=false;btn.textContent='Try again';return;
    }
  }
  pendingImport=null;document.getElementById('import-preview').style.display='none';
  // Cache import genres immediately so they show before metadata fetch
  books.forEach(b => {
    if (b._importGenre) {
      const ck = b.isbn || b.ol_key || b.manual_title;
      if (ck) setMeta(ck, { genre: b._importGenre });
    }
  });
  // Fetch metadata for all imported books in background
  fetchMissingMeta(books);
  renderLibrary();go('library');
  showToast(`Imported ${inserted} book${inserted!==1?'s':''} successfully ✓`);
}

/* ── SERIES ────────────────────────────────────────────────────────────── */

// Fetch series info from Open Library for a work key
async function fetchOLSeries(olKey) {
  if (!olKey) return null;
  try {
    // OL works can have a 'series' field or we check via search
    const r = await fetch(`https://openlibrary.org${olKey}.json`);
    const d = await r.json();
    if (d.series?.length) {
      return { name: d.series[0], number: null };
    }
    // Try subjects for series hints
    const subjects = d.subjects || [];
    for (const s of subjects) {
      const m = s.match(/^(.+?),?\s+(?:book|vol\.?|volume|#)\s*(\d+(?:\.\d+)?)/i);
      if (m) return { name: m[1].trim(), number: parseFloat(m[2]) };
    }
    return null;
  } catch(e) { return null; }
}

// Get all books in a series from OL by series name
async function fetchSeriesBooks(seriesName, currentOlKey) {
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent('"'+seriesName+'"')}&limit=12&fields=key,title,author_name,cover_i,first_publish_year`);
    const d = await r.json();
    return (d.docs || []).filter(x => x.key !== currentOlKey).slice(0, 10);
  } catch(e) { return []; }
}

// Render series section on book page sidebar

// Render series browse in Discover tab
function renderDiscoverSeries() {
  const el = document.getElementById('discover-series-list');
  if (!el) return;

  // Group library books by series
  const seriesMap = {};
  books.filter(b => b.series_name).forEach(b => {
    // Normalise key to lowercase for grouping, display original capitalisation
    const key = b.series_name.trim().toLowerCase();
    if (!seriesMap[key]) seriesMap[key] = { display: b.series_name.trim(), books: [] };
    seriesMap[key].books.push(b);
  });

  if (!Object.keys(seriesMap).length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--tx1)">No series tracked yet. Add series info to books via Edit.</div>';
    return;
  }

  el.innerHTML = Object.entries(seriesMap)
    .sort((a,b) => b[1].books.length - a[1].books.length)
    .map(([key, {display: name, books: sBooks}]) => {
      const sorted = sBooks.sort((a,b) => (a.series_number||0)-(b.series_number||0));
      const finished = sBooks.filter(b=>b.status==='finished').length;
      const avgRating = sBooks.filter(b=>b.rating>0).reduce((s,b)=>s+b.rating,0) / (sBooks.filter(b=>b.rating>0).length||1);
      return `<div class="series-card">
        <div class="series-card-header">
          <div>
            <div class="series-card-name">${name}</div>
            <div class="series-card-meta">${finished} book${finished!==1?'s':''} read${sBooks.filter(b=>b.rating>0).length?` · avg ${toStars(Math.round(avgRating*2)/2)}`:''}</div>
          </div>
        </div>
        <div class="series-books-row">
          ${sorted.map(b => {
            const cover = bCover(b);
            const statusColor = b.status==='finished'?'var(--teal)':b.status==='reading'?'var(--amber)':'var(--purple)';
            return `<div class="series-book-item" onclick="openBookPage('${b.id}')">
              <div style="position:relative">
                ${cover?`<img src="${cover}" style="width:52px;height:78px;object-fit:cover;border-radius:5px;display:block;border:0.5px solid var(--bd)" loading="lazy">`:`<div style="width:52px;height:78px;border-radius:5px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--tx2);text-align:center;padding:4px">📖</div>`}
                ${b.series_number?`<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:var(--bg0);border:0.5px solid var(--bd);border-radius:100px;font-size:9px;font-weight:500;padding:1px 5px;white-space:nowrap">#${b.series_number}</div>`:''}
              </div>
              <div style="margin-top:10px;font-size:10px;color:${statusColor};text-align:center">${b.status==='finished'?b.rating?toStars(b.rating):'✓':b.status==='reading'?'Reading':'TBR'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
}

/* ── SETTINGS ──────────────────────────────────────────────────────────── */
function openSettings() {
  addSwipeToClose('settings-drawer', closeSettings);
  // Populate fields
  document.getElementById('s-email').value = currentUser?.email || '';
  document.getElementById('s-api-key').value = apiKey || '';
  const savedName = localStorage.getItem('pt_display_name') || '';
  document.getElementById('s-display-name').value = savedName;
  const savedFmt = localStorage.getItem('pt_date_format') || 'dmy';
  document.getElementById('s-date-format').value = savedFmt;
  const savedWait = localStorage.getItem('pt_reflect_wait') || '12';
  document.getElementById('s-reflect-wait').value = savedWait;
  document.getElementById('settings-drawer').classList.add('open');
  document.getElementById('settings-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  document.getElementById('settings-drawer').classList.remove('open');
  document.getElementById('settings-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveAccountSettings() {
  const name = document.getElementById('s-display-name').value.trim();
  const pw = document.getElementById('s-password').value;
  if (name) {
    localStorage.setItem('pt_display_name', name);
    // Update avatar
    document.getElementById('uavatar').textContent = name.slice(0,1).toUpperCase();
  }
  if (pw) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      if (!r.ok) throw new Error('Password update failed');
      document.getElementById('s-password').value = '';
      showToast('Password updated ✓');
    } catch(e) { showToast('Could not update password: ' + e.message); return; }
  } else {
    showToast('Account saved ✓');
  }
}

function restoreChatHistory() {
  if (!chatHistory.length) return;
  const c = document.getElementById('chat-msgs');
  if (!c) return;
  // Keep the welcome message, add history after
  chatHistory.forEach(msg => {
    const d = document.createElement('div');
    d.className = `msg msg-${msg.role==='user'?'u':'a'}`;
    d.innerHTML = `<div class="bubble">${renderChatText(msg.content)}</div><div class="msg-lbl">${msg.role==='user'?'You':'Book Bot'}</div>`;
    c.appendChild(d);
  });
  c.scrollTop = c.scrollHeight;
}

function clearChat() {
  if (!confirm('Clear your conversation with Book Bot? This cannot be undone.')) return;
  chatHistory = [];
  saveChatHistory();
  const c = document.getElementById('chat-msgs');
  if (c) c.innerHTML = `<div class="msg msg-a"><div class="bubble">Hi! I know your reading history well. Tell me what you're in the mood for — or ask me anything about books.</div><div class="msg-lbl">Book Bot</div></div>`;
}

function saveApiKey() {
  const key = document.getElementById('s-api-key').value.trim();
  apiKey = key;
  localStorage.setItem('pt_ak', key);
  updateApiNotice();
  showToast('API key saved ✓');
}

function updateApiNotice() {
  const notice = document.getElementById('chat-api-notice');
  if (!notice) return;
  if (apiKey) {
    notice.textContent = 'Using your personal API key.';
    notice.style.display = 'block';
    notice.style.color = 'var(--teal)';
    notice.style.background = 'var(--bg2)';
  } else {
    notice.innerHTML = 'Using shared AI access. For faster responses, <button onclick="openSettings()" style="background:none;border:none;color:var(--amber);cursor:pointer;font-size:12px;font-family:\'DM Sans\',sans-serif;padding:0;text-decoration:underline">add your own API key in Settings →</button>';
    notice.style.display = 'block';
    notice.style.color = 'var(--tx2)';
    notice.style.background = 'var(--bg2)';
  }
}

function savePreferences() {
  const fmt = document.getElementById('s-date-format').value;
  localStorage.setItem('pt_date_format', fmt);
  const wait = document.getElementById('s-reflect-wait').value;
  localStorage.setItem('pt_reflect_wait', wait);
  showToast('Preferences saved ✓');
}

/* ── MANUAL BOOK ENTRY ─────────────────────────────────────────────────── */
function openManualEntry() {
  const el = document.getElementById('manual-entry-form');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div class="fcard" style="margin-top:14px">
    <div class="fcard-title">Add book manually</div>
    <div class="fgrid">
      <div class="fg full"><label class="fl">Title <span style="color:var(--coral)">*</span></label><input class="fi" id="m-title" type="text" placeholder="Book title"></div>
      <div class="fg full"><label class="fl">Author <span style="color:var(--coral)">*</span></label><input class="fi" id="m-author" type="text" placeholder="Author name"></div>
      <div class="fg"><label class="fl">Year published</label><input class="fi" id="m-year" type="number" placeholder="e.g. 2019"></div>
      <div class="fg"><label class="fl">Page count</label><input class="fi" id="m-pages" type="number" placeholder="e.g. 320"></div>
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="m-status">
          <option value="finished">Finished</option>
          <option value="reading">Currently Reading</option>
          <option value="tbr">To Be Read</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Fiction / Nonfiction</label>
        <select class="fi" id="m-fn"><option value="">—</option><option value="Fiction">Fiction</option><option value="Nonfiction">Nonfiction</option></select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" id="m-rating" type="number" min="1" max="10" placeholder="e.g. 8"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" id="m-start" type="date"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" id="m-end" type="date"></div>
    </div>
    <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildGenreInput('m-genre','')}</div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Notes</label><textarea class="fi fta" id="m-notes" placeholder="Thoughts while reading…"></textarea></div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="closeManualEntry()">Cancel</button>
      <button class="btn-primary" onclick="submitManualEntry()">Add to library</button>
    </div>
  </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeManualEntry() {
  const el = document.getElementById('manual-entry-form');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

async function submitManualEntry() {
  const title  = document.getElementById('m-title')?.value.trim();
  const author = document.getElementById('m-author')?.value.trim();
  if (!title || !author) { showToast('Title and author are required'); return; }

  // Check for duplicates
  const exists = books.find(b => bTitle(b).toLowerCase() === title.toLowerCase());
  if (exists) { showToast(`"${title}" is already in your library`); return; }

  const year  = parseInt(document.getElementById('m-year')?.value)  || null;
  const pages = parseInt(document.getElementById('m-pages')?.value) || null;
  const genre = getTagVal('m-genre');

  // Cache metadata manually since there's no API to fetch from
  const cacheKey = title;
  setMeta(cacheKey, {
    title, author,
    year,
    pages,
    genre: genre || '',
    description: '',
    mood: '',
    coverId: null,
    googleCover: null
  });

  const newBook = {
    isbn: null, ol_key: null, google_id: null,
    status: document.getElementById('m-status')?.value || 'finished',
    start_date: document.getElementById('m-start')?.value || null,
    end_date:   document.getElementById('m-end')?.value   || null,
    rating:     parseFloat(document.getElementById('m-rating')?.value) || null,
    retro_rating: null,
    notes:      document.getElementById('m-notes')?.value.trim() || '',
    retro_thoughts: '',
    mood: '', themes: '',
    fiction_nonfiction: document.getElementById('m-fn')?.value||null,
    manual_title:  title,
    manual_author: author,
    import_source: 'manual',
    pages_read: null, series_name: null, series_number: null
  };

  try {
    await saveBook(newBook);
    books.unshift(newBook);
    closeManualEntry();
    renderLibrary();
    go('library');
    showToast(`"${title}" added to your library ✓`);
  } catch(e) {
    showToast('Could not save: ' + e.message);
  }
}

/* ── AUTHOR PAGE ───────────────────────────────────────────────────────── */

async function openAuthorPage(authorName, olAuthorKey) {
  openBookModal();
  const modal = document.getElementById('book-modal-body');
  modal.innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="modalBack()">← Back</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:20px 0">
      <div class="spinner"></div>
      <div style="font-size:14px;color:var(--tx1)">Loading author data…</div>
    </div>
  </div>`;

  try {
    // 1. Find author key if not provided
    let authorKey = olAuthorKey;
    if (!authorKey) {
      const sr = await fetch(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`);
      const sd = await sr.json();
      authorKey = sd.docs?.[0]?.key || null;
    }

    // 2. Fetch author data
    let bio = '', born = '', died = '', nationality = '';
    if (authorKey) {
      const ar = await fetch(`https://openlibrary.org/authors/${authorKey}.json`);
      const ad = await ar.json();
      bio = typeof ad.bio === 'string' ? ad.bio : ad.bio?.value || '';
      bio = bio.replace(/\[\[([^\]]+)\]\]/g, '$1'); // strip OL markup

      born = ad.birth_date || '';
      died = ad.death_date || '';
      nationality = ad.nationality || '';
    }

    // 3. Fetch works
    let works = [];
    if (authorKey) {
      const wr = await fetch(`https://openlibrary.org/authors/${authorKey}/works.json?limit=200`);
      const wd = await wr.json();
      works = (wd.entries || []).map(w => ({
        key: w.key,
        title: w.title,
        year: w.first_publish_date ? parseInt(w.first_publish_date) : null,
        covers: w.covers || [],
        editions: w.edition_count || 0,
        description: typeof w.description === 'string' ? w.description : w.description?.value || ''
      })).sort((a,b) => (a.year||9999) - (b.year||9999));
    }

    // 4. Books you've read by this author
    const myBooks = books.filter(b =>
      bAuthor(b).toLowerCase().includes(authorName.split(' ').slice(-1)[0].toLowerCase())
    ).sort((a,b) => (b.rating||0) - (a.rating||0));

    // 5. Notable vs all works
    const notableThreshold = 3;
    const notable = works.filter(w => w.editions >= notableThreshold);
    const showNotable = notable.length > 0 && notable.length < works.length;
    const displayWorks = showNotable ? notable : works;

    // Render
    renderAuthorPage(authorName, authorKey, bio, born, died, nationality, works, displayWorks, showNotable, myBooks);

  } catch(e) {
    document.getElementById('book-modal-body').innerHTML = `<div class="bp">
      <div class="bp-nav"><div class="bp-back" onclick="closeBookModal()">← Back</div></div>
      <div style="padding:20px;color:var(--coral)">Could not load author data: ${e.message}</div>
    </div>`;
  }
}

function renderAuthorPage(name, olKey, bio, born, died, nationality, allWorks, displayWorks, hasMore, myBooks) {
  const stats = [
    born ? `Born ${born}` : null,
    died ? `Died ${died}` : null,
    nationality || null,
    allWorks.length ? `${allWorks.length} works` : null,
    myBooks.length ? `${myBooks.length} in your library` : null,
  ].filter(Boolean);

  // No avatar — hero is text only

  const myBooksHtml = myBooks.length ? `
    <div class="bpsec">
      <div class="bpsec-t">In your library</div>
      ${myBooks.map(b => {
        const cover = bCover(b);
        return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--bd);cursor:pointer;align-items:center" onclick="closeBookModal();setTimeout(()=>openBookPage('${b.id}'),150)">
          ${cover?`<img src="${cover}" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy">`:`<div style="width:32px;height:48px;background:var(--bg2);border-radius:4px;flex-shrink:0"></div>`}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Lora',serif;font-size:13px;font-weight:500">${bTitle(b)}</div>
            ${b.rating?`<div style="font-size:11px;color:var(--amber);margin-top:2px">${toStars(b.rating)}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const aiHtml = `<div class="bpsec ai-sec">
    <div class="bp-sidebar-head">
      <div class="bpsec-t" style="margin:0">${myBooks.length ? 'What to read next' : 'Where to start'}</div>
      <button class="ai-btn" id="author-ai-btn" onclick="genAuthorRec('${esc(name)}','${esc(olKey||'')}')">✦ ${myBooks.length ? 'Get recommendation' : 'Where to start'}</button>
    </div>
    <div id="author-ai-result" style="margin-top:10px">
      <div style="font-size:13px;color:var(--tx1);font-style:italic">${myBooks.length
        ? `You've read ${myBooks.length} book${myBooks.length!==1?'s':''} by ${name}. Click for a personalised next read.`
        : `New to ${name}? Click for a personalised starting point based on your reading history.`
      }</div>
    </div>
  </div>`;

  // Bibliography
  const worksHtml = displayWorks.map(w => {
    const inLib = books.find(b => bTitle(b).toLowerCase() === w.title.toLowerCase());
    const coverUrl = w.covers?.[0] && w.covers[0] > 0 ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-S.jpg` : null;
    const clickAction = inLib
      ? `closeBookModal();setTimeout(()=>openBookPage('${inLib.id}'),50)`
      : `openUnreadBookPage({key:'${w.key}',title:'${esc(w.title)}',author_name:['${esc(name)}'],cover_i:${w.covers?.[0]||null},first_publish_year:${w.year||null}})`;
    return `<div style="display:flex;gap:10px;padding:8px 4px;border-bottom:0.5px solid var(--bd);align-items:center;cursor:pointer;border-radius:var(--r)" onclick="${clickAction}" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
      ${coverUrl?`<img src="${coverUrl}" style="width:28px;height:42px;object-fit:cover;border-radius:3px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy" onerror="this.style.display='none'">`:`<div style="width:28px;height:42px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Lora',serif;font-size:13px;font-weight:500;line-height:1.3">${w.title}</div>
        ${w.year?`<div style="font-size:11px;color:var(--tx2);margin-top:1px">${w.year}</div>`:''}
      </div>
      ${inLib
        ? `<div style="font-size:10px;color:var(--teal);flex-shrink:0">${inLib.rating?toStars(inLib.rating):'✓ Read'}</div>`
        : `<button onclick="event.stopPropagation();quickAddBook('tbr','','${w.key}','${esc(w.title)}','${esc(name)}')" style="font-size:10px;padding:3px 8px;border:0.5px solid var(--amber);border-radius:100px;background:none;cursor:pointer;color:var(--amber);font-family:'DM Sans',sans-serif;flex-shrink:0;white-space:nowrap">+ TBR</button>`
      }
    </div>`;
  }).join('');

  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="modalBack()">← Back</div>
    </div>

    <!-- Hero: centered text only -->
    <div class="author-hero">
      <div class="bp-title" style="margin-bottom:6px">${name}</div>
      <div style="font-size:13px;color:var(--tx1);line-height:1.8">${stats.join(' · ')}</div>
    </div>

    <!-- Body: two columns -->
    <div class="bp-body">
      <div class="bp-left">
        ${bio ? `<div class="bpsec">
          <div class="bpsec-t">About</div>
          <div id="author-bio-text" style="font-size:14px;line-height:1.75;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical">${bio}</div>
          ${bio.length>400?`<button onclick="var el=document.getElementById('author-bio-text');el.style.webkitLineClamp='unset';el.style.display='block';this.style.display='none'" style="margin-top:6px;background:none;border:none;font-size:12px;color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;padding:0">Read more ↓</button>`:''}
        </div>` : ''}
        <div class="author-mobile-ai">${aiHtml}</div>
        ${myBooks.length ? `<div class="bpsec author-mobile-library">
          <div class="bpsec-t">In your library</div>
          ${myBooks.map(b => {
            const cover = bCover(b);
            return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--bd);cursor:pointer;align-items:center" onclick="closeBookModal();setTimeout(()=>openBookPage('${b.id}'),150)">
              ${cover?`<img src="${cover}" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy">`:`<div style="width:32px;height:48px;background:var(--bg2);border-radius:4px;flex-shrink:0"></div>`}
              <div style="flex:1;min-width:0">
                <div style="font-family:'Lora',serif;font-size:13px;font-weight:500">${bTitle(b)}</div>
                ${b.rating?`<div style="font-size:11px;color:var(--amber);margin-top:2px">${toStars(b.rating)}</div>`:''}
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <div class="bpsec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div class="bpsec-t" style="margin:0">Bibliography</div>
            ${hasMore?`<button id="author-show-all-btn" onclick="showAllAuthorWorks('${esc(name)}','${esc(olKey||'')}',this)" style="font-size:11px;padding:3px 10px;border:0.5px solid var(--bd2);border-radius:100px;background:none;cursor:pointer;color:var(--tx1);font-family:'DM Sans',sans-serif">Show all ${allWorks.length} works</button>`:''}
          </div>
          <div id="author-works-list">${worksHtml}</div>
        </div>
      </div>

      <div class="bp-sidebar author-desktop-sidebar">
        ${myBooksHtml}
        ${aiHtml}
      </div>
    </div>
  </div>`;
}

async function showAllAuthorWorks(name, olKey, btn) {
  // Re-fetch all works and re-render the works list
  btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const wr = await fetch(`https://openlibrary.org/authors/${olKey}/works.json?limit=200`);
    const wd = await wr.json();
    const allWorks = (wd.entries || []).map(w => ({
      key: w.key, title: w.title,
      year: w.first_publish_date ? parseInt(w.first_publish_date) : null,
      covers: w.covers || [], editions: w.edition_count || 0
    })).sort((a,b) => (a.year||9999) - (b.year||9999));

    document.getElementById('author-works-list').innerHTML = allWorks.map(w => {
      const inLib = books.find(b => bTitle(b).toLowerCase() === w.title.toLowerCase());
      const coverUrl = w.covers?.[0] && w.covers[0] > 0 ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-S.jpg` : null;
      const ca = inLib
        ? `closeBookModal();setTimeout(()=>openBookPage('${inLib.id}'),50)`
        : `openUnreadBookPage({key:'${w.key}',title:'${esc(w.title)}',author_name:['${esc(name)}'],cover_i:${w.covers?.[0]||null},first_publish_year:${w.year||null}})`;
      return `<div style="display:flex;gap:10px;padding:8px 4px;border-bottom:0.5px solid var(--bd);align-items:center;cursor:pointer;border-radius:var(--r)" onclick="${ca}" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
        ${coverUrl?`<img src="${coverUrl}" style="width:28px;height:42px;object-fit:cover;border-radius:3px;flex-shrink:0;border:0.5px solid var(--bd)" loading="lazy" onerror="this.style.display='none'">`:`<div style="width:28px;height:42px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:13px;font-weight:500;line-height:1.3">${w.title}</div>
          ${w.year?`<div style="font-size:11px;color:var(--tx2);margin-top:1px">${w.year}</div>`:''}
        </div>
        ${inLib
          ? `<div style="font-size:10px;color:var(--teal);flex-shrink:0">${inLib.rating?toStars(inLib.rating):'✓ Read'}</div>`
          : `<button onclick="event.stopPropagation();quickAddBook('tbr','','${w.key}','${esc(w.title)}','${esc(name)}')" style="font-size:10px;padding:3px 8px;border:0.5px solid var(--amber);border-radius:100px;background:none;cursor:pointer;color:var(--amber);font-family:'DM Sans',sans-serif;flex-shrink:0;white-space:nowrap">+ TBR</button>`
        }
      </div>`;
    }).join('');
    btn.style.display = 'none';
  } catch(e) { btn.disabled = false; btn.textContent = 'Show all'; }
}

async function genAuthorRec(authorName, olKey) {
  const btn = document.getElementById('author-ai-btn');
  const result = document.getElementById('author-ai-result');
  if (!btn || !result) return;
  btn.disabled = true; btn.textContent = 'Thinking…';
  result.innerHTML = `<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Checking your reading history…</div>`;

  const myByAuthor = books.filter(b =>
    bAuthor(b).toLowerCase().includes(authorName.split(' ').slice(-1)[0].toLowerCase())
  );
  const alreadyRead = myByAuthor.map(b => `"${bTitle(b)}" (${b.rating?toStars(b.rating):'unrated'})`).join(', ');
  const isNew = myByAuthor.length === 0;

  const prompt = isNew
    ? `A reader wants to start reading ${authorName}. Based on their reading history, recommend the single best starting point.

Reading history: ${booksCtxStr()}

Respond warmly in 3-4 sentences. Name the specific book you recommend, give a one-sentence description of it, and explain why it's right for this reader based on their history. Format: start with the book title in bold markdown.`
    : `A reader has read ${alreadyRead} by ${authorName}. Based on their reading history and what they've already read, what should they read next by this author?

Reading history: ${booksCtxStr()}

Respond warmly in 3-4 sentences. Name the specific next book, give a one-sentence description, and explain why based on their history and what they thought of the books they've already read. Format: start with the book title in bold markdown.`;

  try {
    const text = await callClaude(prompt, 350);
    // Convert **bold** to HTML
    const html = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g,'<br>');
    result.innerHTML = `<div style="font-size:14px;line-height:1.75;font-family:Georgia,serif;margin-top:8px">${html}</div>`;
    btn.textContent = '✦ Regenerate';
    btn.disabled = false;
  } catch(e) {
    result.innerHTML = `<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;
    btn.textContent = '✦ Try again';
    btn.disabled = false;
  }
}

/* ── LANDING PAGE ──────────────────────────────────────────────────────── */
function showAuthView(tab) {
  document.getElementById('landing-view').style.display = 'none';
  document.getElementById('auth-form-view').style.display = 'flex';
  switchAuthTab(tab);
  if (tab === 'signup') document.getElementById('auth-email').focus();
}

function showLanding() {
  document.getElementById('landing-view').style.display = 'block';
  document.getElementById('auth-form-view').style.display = 'none';
}

/* ── ONBOARDING SURVEY ─────────────────────────────────────────────────── */
let surveyAnswers = {
  books: [],        // [{title, author, key}]
  mood: '',         // 'challenge' | 'relax'
  length: '',       // 'long' | 'short'
  reality: '',      // 'real' | 'fantastical'
  themes: ''        // free text
};
let surveyStep = 0;
const SURVEY_STEPS = 5;

function showSurvey() {
  surveyAnswers = { books: [], mood: '', length: '', reality: '', themes: '' };
  surveyStep = 0;
  document.getElementById('survey-overlay').style.display = 'flex';
  renderSurveyStep();
}

function closeSurvey() {
  document.getElementById('survey-overlay').style.display = 'none';
  localStorage.setItem('pt_survey_done', '1');
}

function renderSurveyStep() {
  const card = document.getElementById('survey-card');
  const progress = `<div class="survey-progress">
    ${Array.from({length:SURVEY_STEPS},(_,i)=>`<div class="survey-pip${i<=surveyStep?' on':''}"></div>`).join('')}
  </div>`;

  if (surveyStep === 0) {
    card.innerHTML = `
      ${progress}
      <div class="survey-title">Let's find your next book</div>
      <div class="survey-sub">Tell us about books you've loved and we'll suggest where to start.</div>
      <div class="survey-q">Name up to 5 books you've enjoyed</div>
      <div class="survey-book-search-wrap">
        <input class="fi" id="survey-book-input" placeholder="Search by title or author…" oninput="surveyBookSearch()" autocomplete="off" style="margin-bottom:8px">
        <div id="survey-book-suggestions" class="survey-suggestions"></div>
      </div>
      <div id="survey-books-added" class="survey-books-added"></div>
      <div class="survey-acts">
        <button class="btn-ghost" onclick="closeSurvey()">Skip</button>
        <button class="btn-primary" onclick="surveyNext()">Next →</button>
      </div>`;
  } else if (surveyStep === 1) {
    card.innerHTML = `
      ${progress}
      <div class="survey-title">What are you in the mood for?</div>
      <div class="survey-q" style="margin-bottom:20px">Right now, I want something that…</div>
      <div class="survey-choice-grid">
        <button class="survey-choice${surveyAnswers.mood==='challenge'?' selected':''}" onclick="surveyPick('mood','challenge',this)">
          <div class="survey-choice-icon">🧠</div>
          <div class="survey-choice-label">Challenges my mind</div>
          <div class="survey-choice-desc">Complex ideas, deep themes, makes me think</div>
        </button>
        <button class="survey-choice${surveyAnswers.mood==='relax'?' selected':''}" onclick="surveyPick('mood','relax',this)">
          <div class="survey-choice-icon">☁️</div>
          <div class="survey-choice-label">Gives my mind a break</div>
          <div class="survey-choice-desc">Enjoyable, absorbing, doesn't require effort</div>
        </button>
      </div>
      <div class="survey-acts">
        <button class="btn-ghost" onclick="surveyBack()">← Back</button>
        <button class="btn-primary" onclick="surveyNext()" ${!surveyAnswers.mood?'disabled':''}>Next →</button>
      </div>`;
  } else if (surveyStep === 2) {
    card.innerHTML = `
      ${progress}
      <div class="survey-title">How much time do you have?</div>
      <div class="survey-q" style="margin-bottom:20px">I want to read something…</div>
      <div class="survey-choice-grid">
        <button class="survey-choice${surveyAnswers.length==='long'?' selected':''}" onclick="surveyPick('length','long',this)">
          <div class="survey-choice-icon">🌊</div>
          <div class="survey-choice-label">Long and immersive</div>
          <div class="survey-choice-desc">A world to lose myself in for weeks</div>
        </button>
        <button class="survey-choice${surveyAnswers.length==='short'?' selected':''}" onclick="surveyPick('length','short',this)">
          <div class="survey-choice-icon">⚡</div>
          <div class="survey-choice-label">Quick and satisfying</div>
          <div class="survey-choice-desc">Reads fast, stays with me</div>
        </button>
      </div>
      <div class="survey-acts">
        <button class="btn-ghost" onclick="surveyBack()">← Back</button>
        <button class="btn-primary" onclick="surveyNext()" ${!surveyAnswers.length?'disabled':''}>Next →</button>
      </div>`;
  } else if (surveyStep === 3) {
    card.innerHTML = `
      ${progress}
      <div class="survey-title">Reality or beyond?</div>
      <div class="survey-q" style="margin-bottom:20px">I prefer stories that are…</div>
      <div class="survey-choice-grid">
        <button class="survey-choice${surveyAnswers.reality==='real'?' selected':''}" onclick="surveyPick('reality','real',this)">
          <div class="survey-choice-icon">🌍</div>
          <div class="survey-choice-label">Grounded in reality</div>
          <div class="survey-choice-desc">Could actually happen</div>
        </button>
        <button class="survey-choice${surveyAnswers.reality==='fantastical'?' selected':''}" onclick="surveyPick('reality','fantastical',this)">
          <div class="survey-choice-icon">🌌</div>
          <div class="survey-choice-label">Beyond reality</div>
          <div class="survey-choice-desc">Magic, sci-fi, the impossible</div>
        </button>
      </div>
      <div class="survey-acts">
        <button class="btn-ghost" onclick="surveyBack()">← Back</button>
        <button class="btn-primary" onclick="surveyNext()" ${!surveyAnswers.reality?'disabled':''}>Next →</button>
      </div>`;
  } else if (surveyStep === 4) {
    card.innerHTML = `
      ${progress}
      <div class="survey-title">Any themes or moods?</div>
      <div class="survey-sub">Optional — type anything that calls to you right now.</div>
      <div class="survey-q">I want to read about…</div>
      <input class="fi" id="survey-themes" placeholder="e.g. grief, found family, political intrigue, slow burn…" value="${surveyAnswers.themes}" oninput="surveyAnswers.themes=this.value" style="margin-bottom:8px">
      <div style="font-size:11px;color:var(--tx2)">Separate with commas. Leave blank to skip.</div>
      <div class="survey-acts">
        <button class="btn-ghost" onclick="surveyBack()">← Back</button>
        <button class="btn-primary" onclick="surveySubmit()">Find my books ✦</button>
      </div>`;
  }
}

let surveyBookTimer;
async function surveyBookSearch() {
  clearTimeout(surveyBookTimer);
  const q = document.getElementById('survey-book-input')?.value.trim();
  const sug = document.getElementById('survey-book-suggestions');
  if (!q || q.length < 2) { if (sug) sug.innerHTML=''; return; }
  surveyBookTimer = setTimeout(async () => {
    try {
      const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=key,title,author_name`);
      const d = await r.json();
      const results = d.docs||[];
      if (!sug) return;
      sug.innerHTML = results.map(res => {
        const author = (res.author_name||[])[0]||'';
        const alreadyAdded = surveyAnswers.books.find(b=>b.key===res.key);
        if (alreadyAdded) return '';
        return `<div class="survey-suggestion" onclick="surveyAddBook('${res.key}','${esc(res.title)}','${esc(author)}')">
          <span style="font-family:'Lora',serif;font-size:13px">${res.title}</span>
          <span style="font-size:11px;color:var(--tx2);margin-left:6px">${author}</span>
        </div>`;
      }).join('');
    } catch(e) {}
  }, 300);
}

function surveyAddBook(key, title, author) {
  if (surveyAnswers.books.length >= 5) return;
  if (surveyAnswers.books.find(b=>b.key===key)) return;
  surveyAnswers.books.push({key, title, author});
  document.getElementById('survey-book-input').value = '';
  document.getElementById('survey-book-suggestions').innerHTML = '';
  renderSurveyBooks();
}

function surveyRemoveBook(key) {
  surveyAnswers.books = surveyAnswers.books.filter(b=>b.key!==key);
  renderSurveyBooks();
}

function renderSurveyBooks() {
  const el = document.getElementById('survey-books-added');
  if (!el) return;
  el.innerHTML = surveyAnswers.books.map(b =>
    `<div class="survey-book-chip">
      <span style="font-family:'Lora',serif;font-size:13px">${b.title}</span>
      <span style="font-size:11px;color:var(--tx2);margin:0 6px">${b.author}</span>
      <button onclick="surveyRemoveBook('${b.key}')" style="background:none;border:none;cursor:pointer;color:var(--tx2);font-size:14px;padding:0;line-height:1">×</button>
    </div>`
  ).join('');
}

function surveyPick(field, value, btn) {
  surveyAnswers[field] = value;
  btn.closest('.survey-choice-grid').querySelectorAll('.survey-choice').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  btn.closest('.survey-card').querySelector('.btn-primary').disabled = false;
}

function surveyNext() {
  surveyStep = Math.min(surveyStep+1, SURVEY_STEPS-1);
  renderSurveyStep();
}

function surveyBack() {
  surveyStep = Math.max(surveyStep-1, 0);
  renderSurveyStep();
}

async function surveySubmit() {
  const card = document.getElementById('survey-card');
  card.innerHTML = `<div style="text-align:center;padding:40px 20px">
    <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto 16px"></div>
    <div style="font-family:'Lora',serif;font-size:18px;margin-bottom:8px">Finding your books…</div>
    <div style="font-size:13px;color:var(--tx1)">Checking the whole library for you.</div>
  </div>`;

  const moodLabel = surveyAnswers.mood==='challenge'?'challenging and intellectually stimulating':'relaxing and easy to enjoy';
  const lengthLabel = surveyAnswers.length==='long'?'long and immersive':'shorter and quick to read';
  const realityLabel = surveyAnswers.reality==='real'?'grounded in reality':'fantastical, magical, or science fiction';
  const booksCtx = surveyAnswers.books.length
    ? `Books they've loved: ${surveyAnswers.books.map(b=>`"${b.title}" by ${b.author}`).join(', ')}.`
    : 'No prior books specified.';
  const themesCtx = surveyAnswers.themes ? `Themes/moods they want: ${surveyAnswers.themes}.` : '';

  const prompt = `A new reader has just signed up for a book tracking app. Based on their preferences, recommend exactly 5 books they should read.

${booksCtx}
They want something: ${moodLabel}, ${lengthLabel}, and ${realityLabel}.
${themesCtx}

For each book provide:
- Title and author
- One sentence description (what it's about)
- One sentence on why it matches their preferences

Format as JSON array only, no other text:
[{"title":"...","author":"...","description":"...","why":"..."},...]`;

  try {
    const text = await callClaude(prompt, 800);
    const clean = text.replace(/\`\`\`json|\`\`\`/g,'').trim();
    const recs = JSON.parse(clean);
    renderSurveyResults(recs);
  } catch(e) {
    card.innerHTML = `<div style="padding:20px;text-align:center">
      <div style="font-size:14px;color:var(--coral);margin-bottom:16px">Couldn't generate recommendations right now.</div>
      <button class="btn-primary" onclick="surveySubmit()">Try again</button>
      <button class="btn-ghost" style="margin-left:8px" onclick="closeSurvey()">Skip for now</button>
    </div>`;
  }
}

function renderSurveyResults(recs) {
  const card = document.getElementById('survey-card');
  card.innerHTML = `
    <div class="survey-title">Your starter books</div>
    <div class="survey-sub" style="margin-bottom:20px">Based on your preferences — add any to your TBR to get started.</div>
    <div class="survey-results">
      ${recs.map((r,i) => `<div class="survey-result-card">
        <div class="survey-result-num">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:15px;font-weight:500;margin-bottom:2px">${r.title}</div>
          <div style="font-size:12px;color:var(--tx2);margin-bottom:6px">by ${r.author}</div>
          <div style="font-size:13px;color:var(--tx1);line-height:1.5;margin-bottom:4px">${r.description}</div>
          <div style="font-size:12px;color:var(--amber);font-style:italic">${r.why}</div>
        </div>
        <button class="survey-tbr-btn" onclick="surveyAddTBR('${esc(r.title)}','${esc(r.author)}',this)">+ TBR</button>
      </div>`).join('')}
    </div>
    <div class="survey-acts" style="margin-top:20px">
      <button class="btn-primary" onclick="closeSurvey();go('library')">Go to my library →</button>
    </div>`;
}

async function surveyAddTBR(title, author, btn) {
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1&fields=key,cover_i,isbn`);
    const d = await r.json();
    const doc = d.docs?.[0];
    await quickAddBook('tbr', doc?.isbn?.[0]||'', doc?.key||'', title, author);
    btn.textContent = '✓ Added';
    btn.style.background = 'var(--teal)';
    btn.style.borderColor = 'var(--teal)';
  } catch(e) {
    btn.disabled=false; btn.textContent='+ TBR';
  }
}

/* ── EXPORT ────────────────────────────────────────────────────────────── */
function exportLibrary() {
  const fin = books.filter(b => b.status === 'finished');
  const rows = [
    ['Title','Author','Year','Rating','Retro Rating','Pages','Start Date','End Date','Days Reading','Pages/Day','Genre','Mood','Themes','Notes','Retro Thoughts','Import Source']
  ];
  fin.forEach(b => {
    rows.push([
      bTitle(b), bAuthor(b), bYear(b)||'',
      b.rating||'', b.retro_rating||'',
      bPages(b)||'', b.start_date||'', b.end_date||'',
      bDays(b)||'', bPPD(b)||'',
      bGenre(b)||'', b.mood||'', b.themes||'',
      b.notes||'', b.retro_thoughts||'', b.import_source||''
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pageturner-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ── DISCOVER TBR ──────────────────────────────────────────────────────── */
let tbrSort = 'added';
function setTbrSort(s) { tbrSort = s; renderDiscoverTBR(); }

function renderDiscover() {
  renderDiscoverTBR();
  renderDiscoverSeries();
  updateApiNotice();
}

function renderDiscoverTBR() {
  let tbr = books.filter(b => b.status === 'tbr');
  if (tbrSort === 'title') tbr.sort((a,b) => bTitle(a).localeCompare(bTitle(b)));
  else if (tbrSort === 'author') tbr.sort((a,b) => bAuthor(a).localeCompare(bAuthor(b)));
  else if (tbrSort === 'random') tbr = [...tbr].sort(() => Math.random() - 0.5);
  document.getElementById('tbr-count').textContent = `(${tbr.length})`;
  const el = document.getElementById('discover-tbr-list');
  if (!tbr.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--tx1);padding:10px 0">Your TBR list is empty. Add books from search above.</div>';
    return;
  }
  el.innerHTML = tbr.map(b => {
    const cover = bCover(b);
    return `<div class="discover-tbr-item" onclick="openBookPage('${b.id}')">
      ${cover ? `<img class="discover-tbr-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="discover-tbr-cover-ph">📖</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Lora',serif;font-size:13px;font-weight:500;line-height:1.3">${bTitle(b)}</div>
        <div style="font-size:11px;color:var(--tx1)">${bAuthor(b)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── DISCOVER SERIES ───────────────────────────────────────────────────── */

/* ── DISCOVER SEARCH ───────────────────────────────────────────────────── */
let discoverDebounce = null, discoverResults = [], discoverIdx = -1;

function discoverSearch() {
  const q = document.getElementById('discover-q').value.trim();
  clearTimeout(discoverDebounce);
  if (!q) { closeDiscoverSearch(); return; }
  if (q.length < 2) return;
  discoverDebounce = setTimeout(() => doDiscoverSearch(q), 350);
}

function discoverSearchKey(e) {
  const box = document.getElementById('discover-results');
  if (!box.classList.contains('open')) return;
  if (e.key==='ArrowDown'){e.preventDefault();discoverIdx=Math.min(discoverIdx+1,discoverResults.length-1);highlightDiscover();}
  else if (e.key==='ArrowUp'){e.preventDefault();discoverIdx=Math.max(discoverIdx-1,0);highlightDiscover();}
  else if (e.key==='Enter'&&discoverIdx>=0){e.preventDefault();selectDiscoverResult(discoverIdx);}
  else if (e.key==='Escape'){closeDiscoverSearch();}
}

function highlightDiscover() {
  document.querySelectorAll('.gsearch-result').forEach((el,i) => { el.style.background=i===discoverIdx?'var(--bg2)':''; });
}

function closeDiscoverSearch() {
  document.getElementById('discover-results').classList.remove('open');
  discoverResults=[]; discoverIdx=-1;
}

async function doDiscoverSearch(q) {
  const box = document.getElementById('discover-results');
  box.innerHTML=`<div class="gsearch-loading"><div class="spinner"></div>Searching…</div>`;
  box.classList.add('open');
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=7&fields=key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median`);
    const d = await r.json();
    discoverResults = d.docs||[];
    if (!discoverResults.length) { box.innerHTML=`<div class="gsearch-empty">No results found.</div>`; return; }
    box.innerHTML = discoverResults.map((res,i) => {
      const inLib = books.find(b => (res.isbn?.[0] && b.isbn===res.isbn[0]) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
      const author = (res.author_name||[]).slice(0,2).join(', ')||'Unknown';
      return `<div class="gsearch-result" id="dsr-${i}" onclick="selectDiscoverResult(${i})">
        ${res.cover_i?`<img class="gsearch-result-cover" src="${cUrl(res.cover_i,'S')}" alt="" loading="lazy">`:`<div class="gsearch-result-cover-ph">📖</div>`}
        <div style="flex:1;min-width:0">
          <div class="gsearch-result-title">${res.title}</div>
          <div class="gsearch-result-author">${author}</div>
          <div class="gsearch-result-meta">${res.first_publish_year||''}</div>
          ${inLib?`<div class="gsearch-in-lib">In your library${inLib.rating?' · '+toStars(inLib.rating):''}</div>`:''}
        </div>
      </div>`;
    }).join('');
  } catch(e) { box.innerHTML=`<div class="gsearch-empty">Search failed.</div>`; }
}

function selectDiscoverResult(i) {
  const res = discoverResults[i]; if (!res) return;
  closeDiscoverSearch();
  document.getElementById('discover-q').value='';
  const isbn = res.isbn?.[0]||null;
  const inLib = books.find(b => (isbn && b.isbn===isbn) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
  if (inLib) openBookPage(inLib.id);
  else openUnreadBookPage(res);
}

document.addEventListener('click', e => {
  if (!document.getElementById('discover-q')?.contains(e.target) && !document.getElementById('discover-results')?.contains(e.target)) closeDiscoverSearch();
});

/* ── REFLECT TAB ───────────────────────────────────────────────────────── */
const INITIAL_PROMPTS = [
  { id:'impression', q:'What was your overall impression?' },
  { id:'love',       q:'What did you love or struggle with?' },
  { id:"stick",      q:"What's one thing that will stick with you?" },
];

const REFLECT_PROMPTS = [
  { id:'stayed',    q:'What stayed with you?' },
  { id:'characters',q:'Did any characters feel real or hollow?' },
  { id:'thought',   q:'What did it make you think about?' },
  { id:'recommend', q:'Would you recommend it, and to whom?' },
  { id:'changed',   q:'Has your opinion changed since finishing?' },
];

function getReflectWaitMonths() {
  return parseInt(localStorage.getItem('pt_reflect_wait') || '12');
}

function openReflectFromLibrary(bookId) {
  go('reflect');
  // Scroll to the specific card after a short delay for render
  setTimeout(() => {
    const card = document.getElementById(`reflect-card-${bookId}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function renderReflect() {
  renderReflectPage();
}

function renderReflectPage() {
  const sec = document.getElementById('reflect-due-section');
  const emptyEl = document.getElementById('reflect-empty');
  const timelineSec = document.getElementById('reflect-timeline-section');

  if (!booksLoaded || books.length === 0) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `<div class="reflect-empty">
        <div class="reflect-empty-icon">✦</div>
        <div style="font-weight:500;margin-bottom:8px">Your reflection journal is waiting</div>
        <div style="margin-bottom:16px">Once you've read and logged books, they'll appear here once enough time has passed.</div>
        <button class="btn-primary" onclick="go('discover')">Add your first book →</button>
      </div>`;
    }
    sec.innerHTML = '';
    if (timelineSec) timelineSec.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const due = books.filter(isRetroDue);
  const done = books.filter(b => b.status==='finished' && (b.retro_rating||b.retro_thoughts))
    .sort((a,b) => new Date(b.end_date)-new Date(a.end_date));

  // ── Due section ────────────────────────────────────────────────────────
  if (!due.length) {
    sec.innerHTML = `<div class="reflect-none-due">
      <span class="reflect-none-icon">✦</span>
      <div>
        <div style="font-weight:500;margin-bottom:3px">No reflections due</div>
        <div style="font-size:13px;color:var(--tx2)">Books appear here after your chosen wait period — <button onclick="openSettings()" style="background:none;border:none;color:var(--amber);cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;padding:0;text-decoration:underline">adjust in Settings</button>.</div>
      </div>
    </div>`;
  } else {
    sec.innerHTML = `
      <div class="reflect-due-label">Ready for reflection <span class="reflect-due-badge">${due.length}</span></div>
      ${due.map(b => renderReflectCard(b)).join('')}`;
  }

  // ── Timeline / journal section ─────────────────────────────────────────
  if (timelineSec) renderReflectJournal(done, timelineSec);
}

function renderReflectCard(b) {
  const cover = bCover(b);
  const yearAgo = new Date(b.end_date); yearAgo.setMonth(yearAgo.getMonth() + getReflectWaitMonths());
  const daysOver = Math.floor((new Date()-yearAgo)/86400000);
  const months = Math.floor(daysOver/30);
  const when = daysOver<=7 ? 'Just became due' : months < 1 ? 'This week' : `${months} month${months!==1?'s':''} ago`;
  return `<div class="reflect-due-card" id="reflect-card-${b.id}">
    <div class="reflect-card-hero">
      ${cover?`<img class="reflect-card-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="reflect-card-cover-ph">📖</div>`}
      <div class="reflect-card-info">
        <div class="reflect-card-title">${bTitle(b)}</div>
        <div class="reflect-card-author">${bAuthor(b)}</div>
        <div class="reflect-card-meta">${b.rating ? toStars(b.rating) : ''} · Finished ${when}</div>
      </div>
    </div>
    <div class="reflect-prompts">
      ${REFLECT_PROMPTS.map(p=>`
        <div class="reflect-prompt">
          <div class="reflect-prompt-q">${p.q}</div>
          <textarea class="reflect-prompt-ta" id="rp-${b.id}-${p.id}" placeholder="Take your time…"></textarea>
        </div>`).join('')}
    </div>
    <div class="reflect-rating-row">
      <span class="reflect-rating-label">Retrospective rating</span>
      <input class="reflect-rating-in" type="number" id="rr-${b.id}" min="1" max="10" placeholder="1–10" value="${b.rating||''}">
      <span style="font-size:12px;color:var(--tx2)">/ 10</span>
    </div>
    <div class="reflect-card-acts">
      <button class="reflect-save-btn" onclick="saveReflection('${b.id}')">Save reflection</button>
      <button class="reflect-skip-btn" onclick="skipReflection('${b.id}')">Skip for now</button>
    </div>
  </div>`;
}

function renderReflectJournal(done, el) {
  if (!done.length) { el.innerHTML = ''; return; }

  // Group by year finished
  const byYear = {};
  done.forEach(b => {
    const yr = b.end_date ? new Date(b.end_date).getFullYear() : 'Unknown';
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(b);
  });

  el.innerHTML = `
    <div class="reflect-journal-header">
      <div class="reflect-journal-title">Your reflection journal</div>
      <div class="reflect-journal-sub">${done.length} reflection${done.length!==1?'s':''} written</div>
      <button class="reflect-insights-btn" id="reflect-insights-btn" onclick="genReflectInsights()">✦ Generate insights</button>
    </div>
    <div id="reflect-insights-result"></div>
    ${Object.entries(byYear).sort((a,b)=>b[0]-a[0]).map(([yr,bks]) => `
      <div class="reflect-year-group">
        <div class="reflect-year-label">${yr}</div>
        ${bks.map(b => {
          const cover = bCover(b);
          const ratingChange = b.retro_rating && b.rating ? b.retro_rating - b.rating : 0;
          // Convert 10-point change to star display (divide by 2, show as fraction if needed)
          const starChange = ratingChange / 2;
          const starStr = Number.isInteger(starChange) ? String(starChange) : starChange.toFixed(1);
          const changeStr = ratingChange > 0 ? `↑${starStr}★` : ratingChange < 0 ? `↓${starStr.replace('-','')}★` : '';
          const changeCol = ratingChange > 0 ? 'var(--teal)' : ratingChange < 0 ? 'var(--coral)' : 'var(--tx2)';
          const snippet = b.retro_thoughts
            ? b.retro_thoughts.split('\n').filter(l=>l.trim()&&!l.trim().endsWith('?'))[0]?.slice(0,120)
            : '';
          return `<div class="reflect-journal-entry" onclick="openBookPage('${b.id}')">
            <div class="reflect-journal-entry-left">
              ${cover?`<img class="reflect-journal-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="reflect-journal-cover-ph">📖</div>`}
            </div>
            <div class="reflect-journal-entry-body">
              <div class="reflect-journal-book">${bTitle(b)}</div>
              <div class="reflect-journal-author">${bAuthor(b)}</div>
              <div class="reflect-journal-ratings">
                ${b.rating?`<span>${toStars(b.rating)}</span>`:''}
                ${b.retro_rating?`<span class="reflect-journal-retro">${toStars(b.retro_rating)} retrospective</span>`:''}
                ${changeStr?`<span style="font-size:11px;color:${changeCol};font-weight:500">${changeStr}</span>`:''}
              </div>
              ${snippet?`<div class="reflect-journal-snippet">"${snippet}${snippet.length>=120?'…':''}"</div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>`).join('')}`;
}

let insightsGenerated = false;
async function genReflectInsights() {
  const btn = document.getElementById('reflect-insights-btn');
  const result = document.getElementById('reflect-insights-result');
  if (!btn || !result) return;

  btn.disabled = true; btn.textContent = 'Thinking…';
  result.innerHTML = `<div style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--tx1);padding:12px 0"><div class="spinner"></div>Analysing your reflections…</div>`;

  const done = books.filter(b => b.retro_rating || b.retro_thoughts);
  const context = done.map(b => {
    const answers = (b.retro_thoughts||'').split('\n').filter(l=>l.trim()&&!l.trim().endsWith('?')).join(' ');
    return `"${bTitle(b)}" — Initial: ${b.rating||'?'}/10, Retrospective: ${b.retro_rating||'?'}/10${answers?' — '+answers.slice(0,100):''}`;
  }).join('\n');

  try {
    const text = await callClaude(`You are analysing ${done.length} book reflections for a reader. Here is their reflection data:

${context}

Write 3-4 warm, insightful observations about their reading patterns. Look for: how their opinions change over time, genres or themes they return to, books that surprised them, emotional patterns in their writing. Write in second person ("You tend to…"). Keep it personal, specific, and under 200 words total. Use their actual book titles.`, 400);
    result.innerHTML = `<div class="reflect-insights-box">${text.replace(/\n/g,'<br>')}</div>`;
    btn.textContent = '✦ Regenerate insights';
    btn.disabled = false;
    insightsGenerated = true;
  } catch(e) {
    result.innerHTML = `<div style="font-size:13px;color:var(--coral);padding:8px 0">Could not generate insights: ${e.message}</div>`;
    btn.textContent = '✦ Generate insights';
    btn.disabled = false;
  }
}

async function saveReflection(bookId) {
  const b = books.find(x=>x.id===bookId); if (!b) return;
  const rating = parseFloat(document.getElementById(`rr-${bookId}`).value)||null;
  // Combine all prompt answers into retro_thoughts
  const thoughts = REFLECT_PROMPTS.map(p => {
    const val = document.getElementById(`rp-${bookId}-${p.id}`)?.value.trim();
    return val ? `${p.q}\n${val}` : '';
  }).filter(Boolean).join('\n\n');
  b.retro_rating = rating;
  b.retro_thoughts = thoughts || b.retro_thoughts;
  await saveBook(b);
  // Replace card with success message
  const card = document.getElementById(`reflect-card-${bookId}`);
  if (card) {
    card.style.borderColor='var(--teal)';
    card.innerHTML=`<div style="display:flex;align-items:center;gap:12px;padding:4px 0">
      <div style="font-size:24px">✓</div>
      <div><div style="font-family:'Lora',serif;font-size:15px;font-weight:500;margin-bottom:3px">${bTitle(b)}</div>
      <div style="font-size:13px;color:var(--teal)">Reflection saved${rating?' · '+toStars(parseFloat(rating)):''}</div></div>
    </div>`;
  }
  chartsDrawn=false;
  renderRetroDue();
  renderBooks();
}

function skipReflection(bookId) {
  const card = document.getElementById(`reflect-card-${bookId}`);
  if (card) card.style.display='none';
}

// renderReflectTimeline replaced by renderReflectJournal

/* ── STATS ─────────────────────────────────────────────────────────────── */
function drawGenreTreemap(data) {
  const canvas = document.getElementById('cGenreTreemap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 800;
  const H = canvas.offsetHeight || 300;
  // Scale canvas for high-DPI screens
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const total = data.reduce((s,d) => s+d.count, 0);
  if (!total) return;

  // Simple squarified treemap
  const items = data.map(d => ({...d, area: d.count/total}));
  const rects = squarify(items, 0, 0, W, H);

  rects.forEach(r => {
    // Fill
    ctx.fillStyle = r.color + 'cc';
    ctx.beginPath();
    ctx.roundRect(r.x+2, r.y+2, r.w-4, r.h-4, 6);
    ctx.fill();

    // Label if big enough
    if (r.w > 45 && r.h > 28) {
      ctx.fillStyle = '#fff';
      ctx.font = `500 ${Math.min(13, r.w/8)}px "DM Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = r.label.length > r.w/7 ? r.label.slice(0, Math.floor(r.w/7))+'…' : r.label;
      ctx.fillText(label, r.x + r.w/2, r.y + r.h/2 - (r.h>44?8:0));
      if (r.h > 44) {
        ctx.font = `400 ${Math.min(11, r.w/9)}px "DM Sans", sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${r.count} books · ${r.avg}`, r.x + r.w/2, r.y + r.h/2 + 10);
      }
    }
  });

  // Tooltip on hover (desktop) and tap (mobile)
  let tipTimeout;
  function showTreemapTip(e) {
    const rect = canvas.getBoundingClientRect();
    const isTouch = e.touches;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    const mx = (clientX - rect.left) * (W/rect.width);
    const my = (clientY - rect.top) * (H/rect.height);
    const hit = rects.find(r => mx>=r.x && mx<=r.x+r.w && my>=r.y && my<=r.y+r.h);
    // Remove old tooltip
    const old = document.getElementById('treemap-tip');
    if (old) old.remove();
    if (!hit) return;
    const tip = document.createElement('div');
    tip.id = 'treemap-tip';
    tip.style.cssText = `position:fixed;background:#1a1a2e;color:#fff;padding:7px 12px;border-radius:8px;font-size:12px;font-family:"DM Sans",sans-serif;pointer-events:none;z-index:9999;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.3)`;
    tip.textContent = `${hit.label}: ${hit.count} book${hit.count!==1?'s':''} · avg ${hit.avg}`;
    tip.style.left = Math.min(clientX + 10, window.innerWidth - 200) + 'px';
    tip.style.top = (clientY - 40) + 'px';
    document.body.appendChild(tip);
    clearTimeout(tipTimeout);
    tipTimeout = setTimeout(() => tip.remove(), isTouch ? 2000 : 3000);
    if (isTouch) e.preventDefault();
  }
  canvas.onmousemove = showTreemapTip;
  canvas.ontouchstart = showTreemapTip;
  canvas.onmouseleave = () => { const t = document.getElementById('treemap-tip'); if(t) t.remove(); };
}

function squarify(items, x, y, w, h) {
  if (!items.length) return [];
  if (items.length === 1) {
    return [{...items[0], x, y, w, h}];
  }
  // Split into two halves by count
  const total = items.reduce((s,i) => s+i.count, 0);
  let acc = 0, split = 0;
  for (let i = 0; i < items.length; i++) {
    acc += items[i].count;
    if (acc >= total/2) { split = i+1; break; }
  }
  split = Math.max(1, Math.min(split, items.length-1));
  const left = items.slice(0, split);
  const right = items.slice(split);
  const leftTotal = left.reduce((s,i) => s+i.count, 0)/total;
  if (w >= h) {
    const lw = Math.round(w * leftTotal);
    return [...squarify(left, x, y, lw, h), ...squarify(right, x+lw, y, w-lw, h)];
  } else {
    const lh = Math.round(h * leftTotal);
    return [...squarify(left, x, y, w, lh), ...squarify(right, x, y+lh, w, h-lh)];
  }
}

function drawStats(){
  if(chartsDrawn)return;chartsDrawn=true;
  const fin=books.filter(b=>b.status==='finished');
  if(!fin.length){document.getElementById('stats-strip').innerHTML='<div class="stat"><div class="stat-l">No finished books yet</div></div>';return;}

  const rated=fin.filter(b=>b.rating>0);
  const avg=rated.length?(rated.reduce((s,b)=>s+b.rating,0)/rated.length).toFixed(1):'—';
  const totalPages=fin.reduce((s,b)=>s+bPages(b),0);
  const daysArr=fin.filter(b=>bDays(b)>0);
  const avgDays=daysArr.length?(daysArr.reduce((s,b)=>s+bDays(b),0)/daysArr.length).toFixed(1):'—';
  const pagesArr=fin.filter(b=>bPages(b)>0);
  const avgPages=pagesArr.length?Math.round(pagesArr.reduce((s,b)=>s+bPages(b),0)/pagesArr.length):'—';
  const ppdArr=fin.filter(b=>bPPD(b)>0);
  const avgPPD=ppdArr.length?Math.round(ppdArr.reduce((s,b)=>s+bPPD(b),0)/ppdArr.length):'—';
  const tbr=books.filter(b=>b.status==='tbr').length;

  // Top strip
  document.getElementById('stats-strip').innerHTML=`
    <div class="stat"><div class="stat-l">Books finished</div><div class="stat-v">${fin.length}</div></div>
    <div class="stat"><div class="stat-l">Total pages</div><div class="stat-v">${totalPages.toLocaleString()}</div></div>
    <div class="stat"><div class="stat-l">Avg rating</div><div class="stat-v">${avg}</div><div class="stat-s">out of 10</div></div>
    <div class="stat"><div class="stat-l">Avg days/book</div><div class="stat-v">${avgDays}</div></div>
    <div class="stat"><div class="stat-l">Avg pages/day</div><div class="stat-v">${avgPPD}</div></div>
    <div class="stat"><div class="stat-l">Avg page count</div><div class="stat-v">${avgPages}</div></div>
    <div class="stat"><div class="stat-l">TBR remaining</div><div class="stat-v">${tbr}</div></div>`;

  // ── GENRE DATA (shared between chart + treemap) ─────────────────────────
  const genreMap={};
  fin.forEach(b=>{
    parseTags(bGenre(b)).forEach(g=>{
      if(!g)return;
      if(!genreMap[g])genreMap[g]={count:0,total:0,rated:0};
      genreMap[g].count++;
      if(b.rating){genreMap[g].total+=b.rating;genreMap[g].rated++;}
    });
  });
  const genreSorted=Object.entries(genreMap).sort((a,b)=>b[1].count-a[1].count);
  const maxGenreCount=genreSorted[0]?.[1]?.count||1;

  // ── GENRE HORIZONTAL BAR CHART ───────────────────────────────────────────
  const genreChartData=genreSorted.slice(0,12).map(([g,v])=>{
    const avgR=v.rated>0?v.rated>0?(v.total/v.rated):0:0;
    const color=avgR>=8?'#1D9E75':avgR>=6?'#BA7517':'#D85A30';
    return{label:g,count:v.count,avg:avgR>0?avgR.toFixed(1):'—',color};
  });

  // Render as custom HTML bars (more control than Chart.js for this layout)
  document.getElementById('genre-chart-wrap').innerHTML=genreChartData.map(d=>`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="width:130px;font-size:12px;font-weight:500;text-align:right;flex-shrink:0;color:var(--tx0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${d.label}">${d.label}</div>
      <div style="flex:1;height:18px;background:var(--bg2);border-radius:4px;overflow:hidden;position:relative">
        <div style="width:${Math.round(d.count/maxGenreCount*100)}%;height:100%;background:${d.color};border-radius:4px;transition:width .4s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:6px">
          ${d.count>=3?`<span style="font-size:11px;color:#fff;font-weight:500">${d.count}</span>`:''}
        </div>
        ${d.count<3?`<span style="position:absolute;left:calc(${Math.round(d.count/maxGenreCount*100)}% + 6px);top:50%;transform:translateY(-50%);font-size:11px;color:var(--tx1);font-weight:500">${d.count}</span>`:''}
      </div>
      <div style="width:36px;text-align:right;font-size:11px;font-weight:500;flex-shrink:0;color:${d.avg>=8?'var(--teal)':d.avg>=6?'var(--amber)':'var(--coral)'}">${d.avg}</div>
    </div>`).join('')||'<div style="font-size:13px;color:var(--tx1)">No genre data yet</div>';

  // ── GENRE TREEMAP ────────────────────────────────────────────────────────
  drawGenreTreemap(genreChartData);

  // ── RATING DISTRIBUTION ──────────────────────────────────────────────────
  const bkt=Array(10).fill(0);
  rated.forEach(b=>{if(b.rating>=1&&b.rating<=10)bkt[Math.round(b.rating)-1]++;});
  new Chart(document.getElementById('cRating'),{type:'bar',data:{labels:['1','2','3','4','5','6','7','8','9','10'],datasets:[{data:bkt,backgroundColor:bkt.map((_,i)=>i>=7?'#1D9E75':i>=5?'#BA7517':'#D85A30'),borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{ticks:{stepSize:1},grid:{color:'rgba(128,128,128,0.1)'}}}}});

  // ── BOOKS PER MONTH ──────────────────────────────────────────────────────
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yearSet=new Set(fin.filter(b=>b.end_date).map(b=>new Date(b.end_date).getFullYear()));
  const years=[...yearSet].sort();
  const yearColors=['#534AB7','#1D9E75','#D85A30','#1A6FA8','#BA7517'];

  // Data table
  const bpmData={};
  years.forEach(y=>{bpmData[y]=Array(12).fill(0);});
  fin.forEach(b=>{
    if(!b.end_date)return;
    const d=new Date(b.end_date);
    const y=d.getFullYear(),m=d.getMonth();
    if(bpmData[y])bpmData[y][m]++;
  });
  const tableRows=MONTHS.map((mo,mi)=>{
    const cells=years.map(y=>`<td style="text-align:center;padding:7px 10px;font-weight:${bpmData[y][mi]>0?'500':'400'};color:${bpmData[y][mi]>0?'var(--tx0)':'var(--tx2)'}">${bpmData[y][mi]||'—'}</td>`).join('');
    return`<tr style="border-bottom:0.5px solid var(--bd)"><td style="padding:7px 12px;font-weight:500;color:var(--tx1)">${mo}</td>${cells}</tr>`;
  }).join('');
  const totalRow=years.map(y=>`<td style="text-align:center;padding:7px 10px;font-weight:600;color:var(--amber)">${bpmData[y].reduce((s,v)=>s+v,0)}</td>`).join('');
  document.getElementById('bpm-table-body').innerHTML=tableRows+`<tr style="background:var(--bg2)"><td style="padding:7px 12px;font-weight:600">Total</td>${totalRow}</tr>`;
  document.getElementById('bpm-table-head').innerHTML=`<tr><th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--tx1)">Month</th>${years.map((y,i)=>`<th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:${yearColors[i%yearColors.length]}">${y}</th>`).join('')}</tr>`;

  // Line chart
  new Chart(document.getElementById('cBPM'),{
    type:'line',
    data:{
      labels:MONTHS,
      datasets:years.map((y,i)=>({
        label:String(y),
        data:bpmData[y],
        borderColor:yearColors[i%yearColors.length],
        backgroundColor:yearColors[i%yearColors.length]+'22',
        pointBackgroundColor:yearColors[i%yearColors.length],
        tension:.3,fill:false,pointRadius:4,pointHoverRadius:6,borderWidth:2
      }))
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},padding:12,usePointStyle:true}}},scales:{x:{grid:{color:'rgba(128,128,128,0.08)'}},y:{ticks:{stepSize:1},grid:{color:'rgba(128,128,128,0.1)'},min:0}}}
  });

  // ── DECADE PUBLISHED ─────────────────────────────────────────────────────
  const decadeMap={};
  fin.forEach(b=>{
    const y=bYear(b);if(!y)return;
    const dec=Math.floor(y/10)*10;
    const k=dec+'s';
    if(!decadeMap[k])decadeMap[k]={count:0,total:0,rated:0};
    decadeMap[k].count++;
    if(b.rating){decadeMap[k].total+=b.rating;decadeMap[k].rated++;}
  });
  const decLabels=Object.keys(decadeMap).sort();
  const decCounts=decLabels.map(k=>decadeMap[k].count);
  const decAvgs=decLabels.map(k=>decadeMap[k].rated?+(decadeMap[k].total/decadeMap[k].rated).toFixed(1):0);
  new Chart(document.getElementById('cDecade'),{
    type:'bar',
    data:{labels:decLabels,datasets:[
      {label:'Books read',data:decCounts,backgroundColor:'#534AB7',borderRadius:4,borderSkipped:false,yAxisID:'y'},
      {label:'Avg rating',data:decAvgs,type:'line',borderColor:'#BA7517',backgroundColor:'transparent',pointBackgroundColor:'#BA7517',tension:.3,borderWidth:2,pointRadius:4,yAxisID:'y2'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},padding:10,usePointStyle:true}}},scales:{x:{grid:{display:false}},y:{ticks:{stepSize:1},grid:{color:'rgba(128,128,128,0.1)'},title:{display:true,text:'Books',font:{size:10}}},y2:{position:'right',min:0,max:10,grid:{display:false},title:{display:true,text:'Avg rating',font:{size:10}}}}}
  });

  // ── AVG RATING BY ORIGIN ─────────────────────────────────────────────────
  const originMap={};
  fin.forEach(b=>{
    // origin is stored in notes for imported books — skip if blank
    // We look for it in the book data; for now group by import_source as proxy
    const src=b.import_source||'Manual';
    if(!originMap[src])originMap[src]={count:0,total:0};
    originMap[src].count++;
    if(b.rating)originMap[src].total+=b.rating;
  });
  const originRows=Object.entries(originMap)
    .sort((a,b)=>b[1].count-a[1].count)
    .map(([src,v])=>{
      const avg=v.count>0?(v.total/v.count).toFixed(1):'—';
      const label=src==='goodreads'?'Goodreads import':src==='storygraph'?'StoryGraph import':src==='pageturner'?'PageTurner import':'Manually added';
      return`<tr style="border-bottom:0.5px solid var(--bd)">
        <td style="padding:8px 12px;font-weight:500">${label}</td>
        <td style="padding:8px 12px;text-align:center;color:var(--tx1)">${v.count}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:500;color:${parseFloat(avg)>=8?'var(--teal)':parseFloat(avg)>=6?'var(--amber)':'var(--coral)'}">${avg}</td>
      </tr>`;
    }).join('');
  document.getElementById('origin-table-body').innerHTML=originRows;

  // ── RETRO SCATTER ────────────────────────────────────────────────────────
  const retroData=fin.filter(b=>b.rating&&b.retro_rating);
  if(retroData.length){
    new Chart(document.getElementById('cRetro'),{type:'scatter',data:{datasets:[
      {label:'Books',data:retroData.map(b=>({x:b.rating,y:b.retro_rating,t:bTitle(b)})),backgroundColor:'#BA7517',pointRadius:6,pointHoverRadius:8},
      {label:'No change',data:[{x:1,y:1},{x:10,y:10}],type:'line',borderColor:'rgba(128,128,128,0.3)',borderDash:[4,4],pointRadius:0,fill:false}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw.t?`${c.raw.t} (${c.raw.x}→${c.raw.y})`:''}}},scales:{x:{title:{display:true,text:'Initial rating',font:{size:11}},min:0,max:11},y:{title:{display:true,text:'Retrospective',font:{size:11}},min:0,max:11}}}});
  } else {
    document.getElementById('cRetro').parentElement.innerHTML='<div style="font-size:13px;color:var(--tx1);font-style:italic;padding:20px">No retrospective ratings yet — they appear one year after finishing a book.</div>';
  }
}

/* ── TABS ──────────────────────────────────────────────────────────────── */
/* ── DUPLICATE DETECTION ───────────────────────────────────────────────── */
function findDuplicates() {
  const seen = {}, dupes = [];
  books.forEach(b => {
    const key = (bTitle(b) + '|' + bAuthor(b)).toLowerCase();
    if (seen[key]) dupes.push(b);
    else seen[key] = b;
  });
  return dupes;
}

function showDuplicatesModal() {
  const dupes = findDuplicates();
  if (!dupes.length) { alert('No duplicates found in your library!'); return; }
  const modal = document.getElementById('del-body');
  modal.innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">Duplicate books found</div>
    <p style="font-size:13px;color:var(--tx1);margin-bottom:14px">Found ${dupes.length} possible duplicate${dupes.length!==1?'s':''}. Review and remove as needed.</p>
    <div style="max-height:340px;overflow-y:auto;border:0.5px solid var(--bd);border-radius:var(--r);margin-bottom:14px">
      ${dupes.map(b => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:0.5px solid var(--bd);gap:10px">
        <div>
          <div style="font-family:'Lora',serif;font-size:13px;font-weight:500">${bTitle(b)}</div>
          <div style="font-size:11px;color:var(--tx1);margin-top:2px">${bAuthor(b)} · ${b.status} · Rating: ${b.rating||'—'}</div>
        </div>
        <button onclick="removeDupe('${b.id}',this)" style="padding:5px 10px;background:var(--coral);color:#fff;border:none;border-radius:var(--r);font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0">Remove</button>
      </div>`).join('')}
    </div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Done</button>
      <button class="btn-danger" onclick="removeAllDupes()">Remove all ${dupes.length}</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

async function removeDupe(bookId, btn) {
  btn.disabled = true; btn.textContent = 'Removing…';
  const ok = await deleteBookById(bookId);
  if (ok) {
    books = books.filter(x => x.id !== bookId);
    btn.closest('div[style]').style.opacity = '0.4';
    btn.textContent = 'Removed';
    renderLibrary();
  } else {
    btn.disabled = false; btn.textContent = 'Remove';
  }
}

async function removeAllDupes() {
  const dupes = findDuplicates();
  if (!confirm(`Remove all ${dupes.length} duplicates? This cannot be undone.`)) return;
  for (const b of dupes) {
    await deleteBookById(b.id);
    books = books.filter(x => x.id !== b.id);
  }
  document.getElementById('del-modal').classList.remove('on');
  chartsDrawn = false; renderLibrary();
}

function showToast(msg, duration=2000) {
  let toast = document.getElementById('pt-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pt-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#ffffff;padding:9px 18px;border-radius:100px;font-size:13px;font-family:"DM Sans",sans-serif;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.style.opacity = '0', duration);
}

function resetLibrary() {
  // Reset all filters and sort to defaults
  const gf = document.getElementById('gf');
  // mf (mood filter) removed
  const sortSel = document.getElementById('sort-sel');
  if (gf) gf.value = '';
  if (mf) mf.value = '';
  if (sortSel) sortSel.value = 'recent';
  sort = 'recent';
  // Reset view to shelf - must also remove list-mode class
  window.libraryView = 'shelf';
  const shelf = document.getElementById('shelf');
  if (shelf) shelf.classList.remove('list-mode');
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('on', b.dataset.view === 'shelf'));
  go('library');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function go(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(b=>b.classList.remove('on'));
  document.getElementById('p-'+name)?.classList.add('on');
  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.add('on');
  document.querySelector(`.mobile-nav-btn[data-tab="${name}"]`)?.classList.add('on');
  if(name==='library'){renderLibrary();}
  if(name==='discover'){renderDiscoverTBR();renderDiscoverSeries();}
  if(name==='reflect'){renderReflect();}
}

function toggleStats(){
  // Stats moved to overlay - redirect to openStatsOverlay
  openStatsOverlay();
}

/* ── CHAT ──────────────────────────────────────────────────────────────── */
// saveKey removed - use saveApiKey() in settings drawer

async function sendMsg(){
  const inp=document.getElementById('chat-in');const msg=inp.value.trim();if(!msg)return;
  // API key optional - proxy handles requests if no personal key set
  addMsg(msg,'u');inp.value='';document.getElementById('send-btn').disabled=true;
  const typing=addTyping();chatHistory.push({role:'user',content:msg});
  const sys=`You are Book Bot — a warm, enthusiastic reading companion who knows this reader's taste inside out. You're like that friend who always knows exactly what book to press into someone's hands next.

READING HISTORY:
${booksCtxStr()}

HOW TO RESPOND:
- Be warm, conversational, and genuinely enthusiastic — you love books and love matching people with the right ones
- Reference specific books from their history to show you really know them ("given how much you loved X...")
- Use their ratings and reading pace as signals: high ratings and fast pace means they loved it, low ratings or slow pace means they struggled
- Their notes and reflections reveal what really resonated — lean on these heavily
- NEVER recommend books they are currently reading or have on their TBR list
- NEVER recommend books already in their finished library
- NEVER mention retrospective ratings — only reference their star ratings
- When recommending, always explain WHY this specific reader would enjoy it
- Estimate a likely rating (1–10) when it feels natural
- Keep responses warm and readable — not too long, but never thin
- When recommending a specific book, ALWAYS format it as [[Title by Author]] so the reader can instantly add it to their TBR. Example: I think you'd love [[The Fifth Season by N.K. Jemisin]]
- You ONLY exist to talk about books and reading. If someone asks for help with anything else — homework, math, coding, writing essays, general advice — do not help with the task itself. Instead, warmly redirect by recommending a book related to the subject. Example: if asked for math help, recommend a great book about mathematics or mathematical thinking. If asked to write an essay, recommend a book on the topic. Always find the book angle.`;
  try{
    const useProxy = !apiKey;
  const chatUrl = useProxy ? 'https://pageturner-bay.vercel.app/api/chat' : 'https://api.anthropic.com/v1/messages';
  const chatHeaders = useProxy
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  const r=await fetch(chatUrl,{method:'POST',headers:chatHeaders,body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:sys,messages:chatHistory})});
    const d=await r.json();if(d.error)throw new Error(d.error.message);
    const reply=d.content?.map(c=>c.text||'').join('')||'Sorry, something went wrong.';
    chatHistory.push({role:'assistant',content:reply});saveChatHistory();typing.remove();addMsg(reply,'a');
  }catch(e){typing.remove();addMsg(`Error: ${e.message}`,'a');}
  document.getElementById('send-btn').disabled=false;
}

function renderChatText(text) {
  return text
    .replace(/\n/g,'<br>')
    .replace(/\[\[([^\]]+) by ([^\]]+)\]\]/g, (match, title, author) => {
      const inLib = books.find(b => bTitle(b).toLowerCase() === title.toLowerCase());
      if (inLib && inLib.status === 'finished') {
        return `<span class="chat-book-tag">${title} <em>by ${author}</em> <span class="chat-book-in-lib">✓ Already read</span></span>`;
      }
      if (inLib && inLib.status === 'reading') {
        return `<span class="chat-book-tag">${title} <em>by ${author}</em> <span class="chat-book-in-lib">Currently reading</span></span>`;
      }
      if (inLib && inLib.status === 'tbr') {
        return `<span class="chat-book-tag">${title} <em>by ${author}</em> <span class="chat-book-in-lib" style="color:var(--amber)">📚 On your TBR — now's a good time!</span></span>`;
      }
      const safeTitle = title.replace(/'/g,"\\'");
      const safeAuthor = author.replace(/'/g,"\\'");
      return `<span class="chat-book-tag">${title} <em>by ${author}</em> <button class="chat-tbr-btn" onclick="chatAddTBR('${safeTitle}','${safeAuthor}',this)">+ TBR</button></span>`;
    });
}

async function chatAddTBR(title, author, btn) {
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1&fields=key,title,author_name,cover_i,isbn`);
    const d = await r.json();
    const doc = d.docs?.[0];
    const isbn = doc?.isbn?.[0] || null;
    const olKey = doc?.key || null;
    // Add without redirecting - stay in chat
    const exists = books.find(b =>
      (isbn && b.isbn === isbn) ||
      (olKey && b.ol_key === olKey) ||
      bTitle(b).toLowerCase() === title.toLowerCase()
    );
    if (exists) {
      btn.textContent = exists.status==='tbr' ? '✓ On TBR' : '✓ Already read';
      btn.style.background = 'var(--teal)';
      return;
    }
    const newBook = { isbn: isbn||null, ol_key: olKey||null, google_id: null,
      status: 'tbr', start_date: null, end_date: null, rating: null,
      retro_rating: null, notes: '', retro_thoughts: '', mood: '', themes: '',
      manual_title: title, manual_author: author, import_source: '' };
    await saveBook(newBook);
    books.unshift(newBook);
    btn.textContent = '✓ Added to TBR';
    btn.style.background = 'var(--teal)';
    // Silently update library in background without navigating
    renderCRTBR();
  } catch(e) {
    btn.disabled = false; btn.textContent = '+ TBR';
    showToast('Could not add: ' + e.message);
  }
}

function addMsg(text,role){
  const c=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className=`msg msg-${role}`;
  d.innerHTML=`<div class="bubble">${renderChatText(text)}</div><div class="msg-lbl">${role==='u'?'You':'Book Bot'}</div>`;
  c.appendChild(d);
  if(role==='u'){
    // User message: scroll to bottom so they see their message
    c.scrollTop=c.scrollHeight;
  } else {
    // Bot message: scroll so the TOP of the response is visible
    d.scrollIntoView({behavior:'smooth',block:'start'});
  }
  return d;
}
function addTyping(){const c=document.getElementById('chat-msgs');const d=document.createElement('div');d.className='msg msg-a';d.innerHTML=`<div class="bubble"><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;c.appendChild(d);c.scrollTop=c.scrollHeight;return d;}
function chip(t){document.getElementById('chat-in').value=t;sendMsg();}
function chatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
