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
const GENRES = ['Science Fiction','Fantasy','Horror','Literary Fiction','Mystery','Thriller','Romance','Historical Fiction','Nonfiction','Memoir','Young Adult','Graphic Novel','Magical Realism','Dystopian','Short Stories','Biography','Queer Fiction'];
const MOODS  = ['Dark','Cozy','Tense','Melancholic','Funny','Hopeful','Unsettling','Dreamy','Gritty','Propulsive','Atmospheric','Whimsical','Intense','Slow-burn','Heartwarming'];
const THEMES = ['Found family','Identity','Grief','Power','Survival','Colonialism','Queerness','Religion','Class','Nature','Memory','Trauma','Redemption','Coming of age','Love','War','Technology','Death','Friendship'];

/* ── STATE ─────────────────────────────────────────────────────────────── */
let books = [], currentUser = null, sessionToken = null;
let sort = 'recent', chartsDrawn = false, chatHistory = [];
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
const isRetroDue = b => {
  if (b.status !== 'finished' || !b.end_date || b.retro_rating) return false;
  const due = new Date(b.end_date); due.setFullYear(due.getFullYear() + 1);
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
function switchAuthTab(m) {
  authMode = m;
  document.querySelectorAll('.auth-tab').forEach((t,i) =>
    t.classList.toggle('on', (i===0&&m==='signin') || (i===1&&m==='signup')));
  document.getElementById('auth-btn').textContent = m === 'signin' ? 'Sign in' : 'Create account';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-success').style.display = 'none';
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

function onSignedIn() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('uavatar').textContent = currentUser.email.slice(0,1).toUpperCase();
  if (apiKey) document.getElementById('ak').value = apiKey;
  loadBooks();
}

async function signOut() {
  await signOutREST();
  sessionToken = null; currentUser = null; books = [];
  chartsDrawn = false; chatHistory = [];
  localStorage.removeItem('pt_session');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

/* ── INIT ──────────────────────────────────────────────────────────────── */
window.addEventListener('load', async () => {
  if (apiKey) document.getElementById('ak').value = apiKey;
  if (loadSavedSession()) {
    onSignedIn();
  } else {
    // Try to refresh
    const ok = await refreshSession();
    if (ok) onSignedIn();
  }
});

/* ── DATABASE ──────────────────────────────────────────────────────────── */
async function loadBooks() {
  document.getElementById('shelf').innerHTML =
    `<div class="loading-wrap"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div><span>Loading your library…</span></div>`;
  try {
    const data = await sbSelect('books', `user_id=eq.${currentUser.id}&order=created_at.desc`);
    books = data || [];
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
    import_source: b.import_source || ''
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
      meta.genre       = (doc.subject||[]).slice(0,5).join(', ');
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
        if (!meta.genre)       meta.genre       = item.categories?.join(', ') || '';
        if (!meta.coverId)     meta.googleCover = item.imageLinks?.thumbnail?.replace('http://','https://') || null;
        if (!b.google_id)      b.google_id      = d.items?.[0]?.id || null;
      }
    } catch(e) {}
  }

  if (Object.keys(meta).length) setMeta(ck, meta);
}

/* ── LIBRARY ───────────────────────────────────────────────────────────── */
function renderLibrary() {
  renderQuickStats(); renderRetroDue(); renderCR(); renderTBR(); renderBooks();
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
        const yearAgo = new Date(b.end_date); yearAgo.setFullYear(yearAgo.getFullYear()+1);
        const daysOver = Math.floor((new Date()-yearAgo)/86400000);
        const txt = daysOver<=7?'Just hit one year':`${Math.floor(daysOver/30)||1} month${Math.floor(daysOver/30)!==1?'s':''} ago`;
        return `<div class="retro-due-card" onclick="openBookPage('${b.id}')">
          <div class="retro-dot"></div>
          ${cover?`<img class="retro-due-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="retro-due-cover-ph">📖</div>`}
          <div>
            <div class="retro-due-title">${bTitle(b)}</div>
            <div class="retro-due-author">${bAuthor(b)}</div>
            <div class="retro-due-info">Rated ${b.rating}/10 · ${txt}</div>
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
  sec.innerHTML = `<div class="sec-label" style="margin-bottom:8px">Currently reading</div>
    <div class="cr-strip">
      ${reading.map(b => {
        const cover = bCover(b);
        return `<div class="cr-card" onclick="openBookPage('${b.id}')">
          ${cover?`<img class="cr-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="cr-cover-ph">📖</div>`}
          <div><div class="cr-title">${bTitle(b)}</div><div class="cr-author">${bAuthor(b)}</div><div class="cr-pill">Reading</div></div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderTBR() {
  const tbr = books.filter(b => b.status === 'tbr');
  const sec = document.getElementById('tbr-section');
  if (!tbr.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `<div class="sec-label" style="margin-bottom:8px">To be read <span style="font-weight:400;color:var(--tx2)">(${tbr.length})</span></div>
    <div class="tbr-strip">
      ${tbr.map(b => {
        const cover = bCover(b);
        return `<div class="tbr-item" onclick="openBookPage('${b.id}')">
          <div class="tbr-cover">${cover?`<img src="${cover}" alt="" loading="lazy">`:`<div class="tbr-cover-ph"><span>${bTitle(b)}</span></div>`}</div>
          <div class="tbr-badge">TBR</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderBooks() {
  const q  = (document.getElementById('q')?.value||'').toLowerCase();
  const gf = document.getElementById('gf')?.value||'';
  const mf = document.getElementById('mf')?.value||'';
  const fin = books.filter(b => b.status==='finished');

  // Rebuild dropdowns from cached metadata
  const genres = new Set(); fin.forEach(b => parseTags(bGenre(b)).forEach(g=>genres.add(g)));
  const moods  = new Set(); fin.forEach(b => parseTags(b.mood||'').forEach(m=>moods.add(m)));
  const gsel = document.getElementById('gf'); const gcur=gsel.value;
  gsel.innerHTML='<option value="">All genres</option>';
  [...genres].sort().forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;if(g===gcur)o.selected=true;gsel.appendChild(o);});
  const msel = document.getElementById('mf'); const mcur=msel.value;
  msel.innerHTML='<option value="">All moods</option>';
  [...moods].sort().forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;if(m===mcur)o.selected=true;msel.appendChild(o);});

  let list = fin.filter(b =>
    (!q || bTitle(b).toLowerCase().includes(q) || bAuthor(b).toLowerCase().includes(q)) &&
    (!gf || bGenre(b).toLowerCase().includes(gf.toLowerCase())) &&
    (!mf || (b.mood||'').toLowerCase().includes(mf.toLowerCase()))
  );

  if (sort==='rating-hi') list.sort((a,b)=>b.rating-a.rating);
  else if (sort==='rating-lo') list.sort((a,b)=>a.rating-b.rating);
  else if (sort==='first') list.sort((a,b)=>new Date(a.end_date)-new Date(b.end_date));
  else list.sort((a,b)=>new Date(b.end_date)-new Date(a.end_date));

  const shelf = document.getElementById('shelf');
  if (!list.length) {
    shelf.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>${!q&&!gf&&!mf?'Your finished library is empty.<br><br><span style="font-size:12px">Go to <strong>Add Book</strong> to get started.</span>':'No books match your filters.'}</div>`;
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
        const ratingCol = b.rating ? `<span style="color:${b.rating>=8?'var(--teal)':b.rating>=6?'var(--amber)':'var(--coral)'};font-weight:500">${b.rating}/10</span><div style="font-size:10px;color:var(--amber)">${toStars(b.rating)}</div>` : '—';
        const retroCol  = b.retro_rating ? `<span style="font-weight:500">${b.retro_rating}/10</span><div style="font-size:10px;color:var(--amber)">${toStars(b.retro_rating)}</div>` : '—';
        const genreList = bGenre(b).split(',').slice(0,3).map(g=>g.trim()).filter(Boolean).map(g=>`<span style="font-size:10px;background:var(--purple-l);color:var(--purple);padding:1px 6px;border-radius:100px;display:inline-block;margin:1px">${g}</span>`).join('');
        return `<tr onclick="openBookPage('${b.id}')" class="list-row">
          <td><span class="list-title">${bTitle(b)}${due?'<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-left:6px;vertical-align:middle" title="Due for reflection"></span>':''}</span></td>
          <td style="color:var(--tx1)">${bAuthor(b)}</td>
          <td>${ratingCol}</td>
          <td>${retroCol}</td>
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
      const iflag = b.import_source==='goodreads'?`<span class="import-flag" style="background:var(--amber-l);color:var(--amber)">GR</span>`:b.import_source==='storygraph'?`<span class="import-flag" style="background:var(--purple-l);color:var(--purple)">SG</span>`:'';
      const date = b.end_date ? new Date(b.end_date).toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '';
      return `<div class="book-card">
        ${due?'<div class="retro-due-dot" title="Due for reflection"></div>':''}
        <div class="card-acts">
          <button class="cact cact-edit" onclick="event.stopPropagation();openEdit('${b.id}')" title="Edit">✎</button>
          <button class="cact cact-del" onclick="event.stopPropagation();openDel('${b.id}')" title="Delete">✕</button>
        </div>
        <div class="cover-wrap" onclick="openBookPage('${b.id}')">
          ${cover?`<img src="${cover}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bTitle(b)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:''}<div class="cover-ph"${cover?' style="display:none"':''}><span>${bTitle(b)}</span></div>
          <div class="rpip ${pipC(b.rating)}">${b.rating||'—'}</div>
        </div>
        <div onclick="openBookPage('${b.id}')">
          <div class="card-title">${bTitle(b)}${iflag}</div>
          <div class="card-author">${bAuthor(b)}</div>
          ${b.rating?`<div class="card-stars">${toStars(b.rating)}</div>`:''}
          ${date?`<div class="card-date">${date}</div>`:''}
        </div>
      </div>`;
    }).join('');
  }
}

function setSort(s) { sort=s; renderBooks(); }
function setView(v) {
  document.getElementById('shelf').classList.toggle('list-mode', v==='list');
  window.libraryView=v;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('on',b.dataset.view===v));
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
  const q = document.getElementById('gsearch-input').value.trim();
  if (q.length >= 2) document.getElementById('gsearch-results').classList.add('open');
}

function gsearchClear() {
  document.getElementById('gsearch-input').value='';
  document.getElementById('gsearch-clear').classList.remove('visible');
  closeGsearch();
}

function closeGsearch() {
  document.getElementById('gsearch-results').classList.remove('open');
  gsearchResults=[]; gsearchIdx=-1;
}

async function doGsearch(q) {
  const box = document.getElementById('gsearch-results');
  box.innerHTML=`<div class="gsearch-loading"><div class="spinner"></div>Searching…</div>`;
  box.classList.add('open');
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=7&fields=key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median`);
    const d = await r.json();
    gsearchResults = d.docs||[];
    if (!gsearchResults.length) { box.innerHTML=`<div class="gsearch-empty">No results found.</div>`; return; }
    box.innerHTML = gsearchResults.map((res,i) => {
      const inLib = books.find(b => (b.isbn && res.isbn?.includes(b.isbn)) || b.ol_key===res.key || bTitle(b).toLowerCase()===res.title.toLowerCase());
      const author = (res.author_name||[]).slice(0,2).join(', ')||'Unknown author';
      return `<div class="gsearch-result" id="gsr-${i}" onclick="gsearchSelect(${i})">
        ${res.cover_i?`<img class="gsearch-result-cover" src="${cUrl(res.cover_i,'S')}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="gsearch-result-cover-ph">📖</div>`}
        <div style="flex:1;min-width:0">
          <div class="gsearch-result-title">${res.title}</div>
          <div class="gsearch-result-author">${author}</div>
          <div class="gsearch-result-meta">${[res.first_publish_year,res.number_of_pages_median?'~'+res.number_of_pages_median+' pages':''].filter(Boolean).join(' · ')}</div>
          ${inLib?`<div class="gsearch-in-lib">In your library${inLib.rating?' · '+inLib.rating+'/10':''}</div>`:''}
        </div>
      </div>`;
    }).join('');
  } catch(e) { box.innerHTML=`<div class="gsearch-empty">Search failed.</div>`; }
}

function gsearchKey(e) {
  const box = document.getElementById('gsearch-results');
  if (!box.classList.contains('open')) return;
  if (e.key==='ArrowDown'){e.preventDefault();gsearchIdx=Math.min(gsearchIdx+1,gsearchResults.length-1);highlightGsearch();}
  else if (e.key==='ArrowUp'){e.preventDefault();gsearchIdx=Math.max(gsearchIdx-1,0);highlightGsearch();}
  else if (e.key==='Enter'&&gsearchIdx>=0){e.preventDefault();gsearchSelect(gsearchIdx);}
  else if (e.key==='Escape') closeGsearch();
}

function highlightGsearch() {
  document.querySelectorAll('.gsearch-result').forEach((el,i) => { el.style.background=i===gsearchIdx?'var(--amber-l)':''; });
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
  const author = (olBook.author_name||[]).slice(0,2).join(', ')||'Unknown author';
  const isbn = olBook.isbn?.[0]||null;
  const coverSrc = olBook.cover_i ? cUrl(olBook.cover_i,'L') : null;

  // Pre-cache metadata for this book
  const ck = isbn || olBook.key || olBook.title;
  if (!bMeta({isbn, ol_key: olBook.key, manual_title: olBook.title})?.title) {
    const fakeBook = { isbn, ol_key: olBook.key, manual_title: olBook.title, manual_author: author };
    await fetchMetaForBook(fakeBook);
  }
  const fakeB = {isbn, ol_key: olBook.key, manual_title: olBook.title};
  const desc = bDesc(fakeB) || '';

  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav"><div class="bp-back" onclick="closeBookModal()">← Back</div></div>
    <div class="bp-unread-banner">
      <div class="bp-unread-text">This book isn't in your library yet.</div>
      <div class="bp-add-btns">
        <button class="bp-add-btn bp-add-btn-tbr" onclick="quickAddBook('tbr','${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(olBook.title)}','${esc(author)}')">+ Add to TBR</button>
        <button class="bp-add-btn bp-add-btn-reading" onclick="quickAddBook('reading','${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(olBook.title)}','${esc(author)}')">+ Currently reading</button>
        <button class="bp-add-btn bp-add-btn-finished" onclick="go('add')">+ Add as finished</button>
      </div>
    </div>
    <div class="bp-hero">
      <div class="bp-img">${coverSrc?`<img src="${coverSrc}" alt="${esc(olBook.title)}" loading="lazy">`:`<div class="bp-img-ph"><span>${esc(olBook.title)}</span></div>`}</div>
      <div>
        <div class="bp-title">${esc(olBook.title)}</div>
        <div class="bp-author">${esc(author)}${olBook.first_publish_year?' · '+olBook.first_publish_year:''}</div>
        ${desc?`<div style="font-size:14px;line-height:1.7;color:var(--tx1);margin-top:10px">${desc}</div>`:'<div id="unread-desc-loading" style="font-size:13px;color:var(--tx1);margin-top:10px">Loading description…</div>'}
      </div>
    </div>
    <div class="bp-body">
      <div>
        <div class="ai-sec">
          <div class="ai-head"><div class="ai-t">Would you like this book?</div>
            <button class="ai-btn" id="ai-gen-btn" onclick="genUnreadAnalysis('${esc(olBook.key||'')}','${esc(olBook.title)}','${esc(author)}')">✦ Analyse for me</button>
          </div>
          <div id="ai-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click to get a personalised take based on your reading history.</div></div>
        </div>
      </div>
      <div>
        <div class="scard"><div class="scard-t">Open Library data</div><div id="ol-data"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
      </div>
    </div>
  </div>`;
  loadUnreadOLData(olBook);
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

async function quickAddBook(status, isbn, olKey, title, author) {
  const newBook = { isbn: isbn||null, ol_key: olKey||null, google_id: null, status, start_date: null, end_date: null, rating: null, retro_rating: null, notes: '', retro_thoughts: '', mood: '', themes: '', manual_title: title||null, manual_author: author||null, import_source: '' };
  try {
    await saveBook(newBook);
    books.unshift(newBook);
    closeBookModal(); renderLibrary(); go('library');
  } catch(e) { alert('Could not add book: '+e.message); }
}

/* ── BOOK PAGE ─────────────────────────────────────────────────────────── */
async function openBookPage(bookId) {
  const b = books.find(x=>x.id===bookId); if (!b) return;
  openBookModal();

  const cover = bCover(b);
  const coverLg = b.isbn && getMeta(b.isbn)?.coverId ? cUrl(getMeta(b.isbn).coverId,'L') : (getMeta(b.isbn)?.googleCover || cover);
  const title = bTitle(b), author = bAuthor(b), year = bYear(b);
  const desc = bDesc(b), genre = bGenre(b);
  const pages = bPages(b), days = bDays(b), ppd = bPPD(b);
  const due = isRetroDue(b);
  const gtags = parseTags(genre).map(g=>`<span class="bptag bptag-g">${g}</span>`).join('');
  const mtags = parseTags(b.mood||'').map(m=>`<span class="bptag bptag-m">${m}</span>`).join('');
  const ttags = parseTags(b.themes||'').map(t=>`<span class="bptag bptag-t">${t}</span>`).join('');
  const ibadge = b.import_source==='goodreads'?'<span style="font-size:10px;background:var(--amber-l);color:var(--amber);padding:2px 8px;border-radius:100px;display:inline-block;margin-bottom:10px">Imported from Goodreads — rating converted from 5-star scale</span>':b.import_source==='storygraph'?'<span style="font-size:10px;background:var(--purple-l);color:var(--purple);padding:2px 8px;border-radius:100px;display:inline-block;margin-bottom:10px">Imported from StoryGraph</span>':'';

  document.getElementById('book-modal-body').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="closeBookModal()">← Back</div>
      <button class="bp-edit-btn" onclick="openEdit('${b.id}')">Edit</button>
    </div>
    ${ibadge}
    ${due?`<div class="retro-prompt" id="retro-prompt-box">
      <div class="retro-prompt-head"><span class="retro-prompt-icon">✦</span><div class="retro-prompt-title">Time for a retrospective</div></div>
      <div class="retro-prompt-sub">It's been a year since you finished <em>${title}</em>. How do you feel about it now?</div>
      <div class="retro-form">
        <div class="retro-rating-row">
          <span class="retro-rating-label">Retrospective rating</span>
          <input class="retro-rating-input" type="number" id="retro-rating-inp" min="1" max="10" placeholder="1–10" value="${b.rating||''}">
          <span style="font-size:12px;color:var(--tx1)">out of 10</span>
        </div>
        <textarea class="retro-textarea" id="retro-thoughts-inp" placeholder="What do you remember? Has your opinion changed?">${b.retro_thoughts||''}</textarea>
        <button class="retro-save-btn" onclick="saveRetro('${b.id}')">Save reflection</button>
      </div>
    </div>`:''}
    <div class="bp-hero">
      <div class="bp-img">${coverLg?`<img src="${coverLg}" alt="${title}" loading="lazy">`:`<div class="bp-img-ph"><span>${title}</span></div>`}</div>
      <div>
        <div class="bp-title">${title}</div>
        <div class="bp-author">${author}${year?' · '+year:''}</div>
        <div class="bp-tags">${gtags}${mtags}${ttags}</div>
        <div class="bp-scores">
          <div class="bps"><div class="bps-l">Your rating</div><div class="bps-v ${scC(b.rating)}">${b.rating||'—'}<span style="font-size:12px;opacity:.6">${b.rating?'/10':''}</span></div>${b.rating?`<div class="bps-stars">${toStars(b.rating)}</div>`:''}</div>
          <div class="bps"><div class="bps-l">Pages</div><div class="bps-v">${pages||'—'}</div></div>
          <div class="bps"><div class="bps-l">Pace</div><div class="bps-v">${ppd||'—'}<span style="font-size:10px;opacity:.6">${ppd?' p/d':''}</span></div></div>
        </div>
        <div class="bp-ri">
          ${b.start_date?`<div class="bp-ri-item"><div class="bp-ri-l">Started</div><div>${new Date(b.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>`:''}
          ${b.end_date?`<div class="bp-ri-item"><div class="bp-ri-l">Finished</div><div>${new Date(b.end_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>`:''}
          ${days?`<div class="bp-ri-item"><div class="bp-ri-l">Duration</div><div>${days} days</div></div>`:''}
        </div>
      </div>
    </div>
    <div class="bp-body">
      <div>
        ${desc?`<div class="bpsec"><div class="bpsec-t">About this book</div><div id="desc-text" style="font-size:14px;line-height:1.7;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical">${desc}</div>${desc.length>300?`<button onclick="document.getElementById('desc-text').style.webkitLineClamp='unset';this.style.display='none'" style="margin-top:6px;background:none;border:none;font-size:12px;color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;padding:0">Read more ↓</button>`:''}</div></div>`:''}
        ${b.notes?`<div class="bpsec"><div class="bpsec-t">Notes while reading</div><div style="font-size:14px;line-height:1.7">${b.notes}</div></div>`:''}
        ${(b.retro_rating||b.retro_thoughts)?`<div class="bpsec"><div class="retro-pill">Retrospective${b.retro_rating?' · '+b.retro_rating+'/10':''}</div>${b.retro_thoughts?`<div style="font-size:14px;line-height:1.7;margin-top:6px">${b.retro_thoughts}</div>`:''}</div>`:''}
        <div class="ai-sec">
          <div class="ai-head"><div class="ai-t">AI analysis for you</div><button class="ai-btn" id="ai-gen-btn" onclick="genAnalysis('${b.id}')">✦ Generate analysis</button></div>
          <div id="ai-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click for a personalised take based on your reading history.</div></div>
        </div>
        <div class="sim-sec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="ai-t">Similar books you might enjoy</div>
            <button class="ai-btn" id="sim-btn" onclick="genSimilar('${b.id}')" style="background:var(--purple)">✦ Find similar</button>
          </div>
          <div id="sim-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click for AI-curated recommendations.</div></div>
        </div>
      </div>
      <div>
        <div class="scard"><div class="scard-t">Open Library data</div><div id="ol-data"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
        <div class="scard"><div class="scard-t">Books by ${author.split(' ').slice(-1)[0]}</div><div id="also-by"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
      </div>
    </div>
  </div>`;
  loadOLData(b); loadAlsoBy(b);
}

function openBookModal() {
  document.getElementById('book-modal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeBookModal() {
  document.getElementById('book-modal').classList.remove('on');
  document.body.style.overflow = '';
}

function bookModalClick(e) {
  // Close if clicking the overlay backdrop (not the inner content)
  if (e.target.id === 'book-modal') closeBookModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('book-modal')?.classList.contains('on')) {
    closeBookModal();
  }
});

async function saveRetro(bookId) {
  const b = books.find(x=>x.id===bookId); if (!b) return;
  b.retro_rating = parseFloat(document.getElementById('retro-rating-inp').value)||0;
  b.retro_thoughts = document.getElementById('retro-thoughts-inp').value.trim();
  await saveBook(b);
  document.getElementById('retro-prompt-box').innerHTML =
    `<div style="padding:14px;font-size:13px;color:var(--teal);background:var(--teal-l);border-radius:var(--rl)">✓ Reflection saved. Retrospective rating: ${b.retro_rating}/10</div>`;
  chartsDrawn=false; renderRetroDue(); renderBooks();
}

async function loadOLData(b) {
  const olKey = b.ol_key || getMeta(b.isbn)?.olKey;
  try {
    if (!olKey) { document.getElementById('ol-data').innerHTML='<div style="font-size:12px;color:var(--tx1)">Not found on Open Library.</div>'; return; }
    const r = await fetch(`https://openlibrary.org${olKey}.json`); const work = await r.json();
    const ra = work.ratings_average?parseFloat(work.ratings_average).toFixed(1):null;
    const rc = work.ratings_count?work.ratings_count.toLocaleString():null;
    document.getElementById('ol-data').innerHTML =
      `${ra?`<div style="margin-bottom:10px"><div style="font-size:30px;font-family:'Lora',serif;font-weight:500;color:var(--amber)">${ra}<span style="font-size:14px;opacity:.5">/5</span></div><div style="font-size:12px;color:var(--tx1)">On Open Library${rc?' · '+rc+' ratings':''}</div></div>`:''}
       ${work.first_publish_date?`<div class="ol-row"><span style="color:var(--tx2)">First published</span><span style="font-weight:500">${work.first_publish_date}</span></div>`:''}
       ${b.isbn?`<div class="ol-row"><span style="color:var(--tx2)">ISBN</span><span style="font-family:monospace;font-size:11px">${b.isbn}</span></div>`:''}`;
  } catch(e) { document.getElementById('ol-data').innerHTML='<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
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
      return `<div style="display:flex;gap:9px;padding:7px 6px;border-bottom:0.5px solid var(--bd);cursor:pointer;border-radius:var(--r);margin:0 -6px" onclick="${clickFn}" onmouseenter="this.style.background='var(--amber-l)'" onmouseleave="this.style.background=''">
        ${w.cover_i?`<img src="${cUrl(w.cover_i,'S')}" style="width:26px;height:39px;object-fit:cover;border-radius:3px;flex-shrink:0" loading="lazy">`:`<div style="width:26px;height:39px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Lora',serif;font-size:12px;font-weight:500;line-height:1.3">${w.title}</div>
          ${w.first_publish_year?`<div style="font-size:10px;color:var(--tx2);margin-top:1px">${w.first_publish_year}</div>`:''}
          ${inLib?`<div style="font-size:10px;background:var(--teal-l);color:var(--teal);padding:1px 5px;border-radius:100px;display:inline-block;margin-top:2px">In library · ${inLib.rating}/10</div>`:`<div style="font-size:10px;color:var(--amber);margin-top:2px">Tap to view →</div>`}
        </div>
      </div>`;
    }).join('');
  } catch(e) { document.getElementById('also-by').innerHTML='<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
}

/* ── AI ────────────────────────────────────────────────────────────────── */
function booksCtxStr() {
  return books.filter(b=>b.status==='finished').map(b=>
    `"${bTitle(b)}" by ${bAuthor(b)}: ${b.rating||'?'}/10 (retro:${b.retro_rating||'?'}/10). Genre:${bGenre(b)}. Mood:${b.mood||''}. Notes:"${b.notes||'none'}"`
  ).join('\n');
}

async function callClaude(prompt, maxTokens=600) {
  const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:maxTokens,messages:[{role:'user',content:prompt}]})});
  const data = await r.json(); if (data.error) throw new Error(data.error.message);
  return data.content?.map(c=>c.text||'').join('')||'';
}

async function genAnalysis(bookId) {
  if (!apiKey){alert('Add your Anthropic API key in the Ask AI tab first.');return;}
  const b=books.find(x=>x.id===bookId);if(!b)return;
  const btn=document.getElementById('ai-gen-btn');btn.disabled=true;btn.textContent='Generating…';
  document.getElementById('ai-result').innerHTML=`<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Analysing your history…</div>`;
  try {
    const text = await callClaude(`Analyse whether this reader will enjoy "${bTitle(b)}" by ${bAuthor(b)}.\nHistory:\n${booksCtxStr()}\nGenre:${bGenre(b)} Mood:${b.mood||''}\nDescription:${bDesc(b)||'N/A'}\nProvide:\nPREDICTED: [1-10]\nANALYSIS: [3-4 sentences referencing specific books from history]`);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)/i);const anal=text.match(/ANALYSIS:\s*([\s\S]+)/i);
    document.getElementById('ai-result').innerHTML=
      `${pred?`<div class="ai-pred"><span>Predicted rating</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>`:''}
       <div style="font-size:14px;line-height:1.7">${(anal?anal[1].trim():text).replace(/\n/g,'<br>')}</div>`;
  }catch(e){document.getElementById('ai-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false;btn.innerHTML='✦ Regenerate';
}

async function genUnreadAnalysis(olKey, title, author) {
  if (!apiKey){alert('Add your Anthropic API key in the Ask AI tab first.');return;}
  const btn=document.getElementById('ai-gen-btn');btn.disabled=true;btn.textContent='Generating…';
  document.getElementById('ai-result').innerHTML=`<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Analysing…</div>`;
  try {
    const text = await callClaude(`Would this reader enjoy "${title}" by ${author}?\nHistory:\n${booksCtxStr()}\nProvide:\nPREDICTED: [1-10]\nANALYSIS: [3-4 sentences referencing specific books from history]`);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)/i);const anal=text.match(/ANALYSIS:\s*([\s\S]+)/i);
    document.getElementById('ai-result').innerHTML=
      `${pred?`<div class="ai-pred"><span>Predicted rating</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>`:''}
       <div style="font-size:14px;line-height:1.7">${(anal?anal[1].trim():text).replace(/\n/g,'<br>')}</div>`;
  }catch(e){document.getElementById('ai-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false;btn.innerHTML='✦ Regenerate';
}

async function genSimilar(bookId) {
  if (!apiKey){alert('Add your Anthropic API key in the Ask AI tab first.');return;}
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
      if(!coverUrl){try{const sr=await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(rec.title)}&author=${encodeURIComponent(rec.author)}&limit=1&fields=cover_i`);const sd=await sr.json();const cid=sd.docs?.[0]?.cover_i;if(cid)coverUrl=cUrl(cid,'S');}catch(e){}}
      const card=document.createElement('div');card.className='sim-book';
      if(inLib)card.onclick=()=>openBookPage(inLib.id);
      card.innerHTML=`${coverUrl?`<img class="sim-cover" src="${coverUrl}" alt="" loading="lazy">`:`<div class="sim-cover-ph">📖</div>`}<div style="flex:1;min-width:0"><div style="font-family:'Lora',serif;font-size:13px;font-weight:500;margin-bottom:2px">${rec.title}</div><div style="font-size:11px;color:var(--tx1);margin-bottom:3px">${rec.author}</div><div style="font-size:11px;color:var(--tx2);line-height:1.4">${rec.reason}</div>${inLib?`<span class="sim-inlib">In library · ${inLib.rating}/10</span>`:''}</div>`;
      document.getElementById('sim-list')?.appendChild(card);
    }
  }catch(e){document.getElementById('sim-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;}
  btn.disabled=false;btn.innerHTML='✦ Regenerate';
}

/* ── EDIT / DELETE MODALS ──────────────────────────────────────────────── */
function openEdit(bookId) {
  const b=books.find(x=>x.id===bookId);if(!b)return;
  const title=bTitle(b);
  document.getElementById('edit-body').innerHTML=`
    <button class="modal-x" onclick="document.getElementById('edit-modal').classList.remove('on')">×</button>
    <div class="modal-title">Edit — ${title}</div>
    <div class="fgrid" style="margin-bottom:12px">
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="e-status">
          <option value="finished"${b.status==='finished'?' selected':''}>Finished</option>
          <option value="reading"${b.status==='reading'?' selected':''}>Currently Reading</option>
          <option value="tbr"${b.status==='tbr'?' selected':''}>To Be Read</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="e-rating" min="1" max="10" value="${b.rating||''}"></div>
      <div class="fg"><label class="fl">Retrospective rating</label><input class="fi" type="number" id="e-retro" min="1" max="10" value="${b.retro_rating||''}"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="e-start" value="${b.start_date||''}"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="e-end" value="${b.end_date||''}"></div>
    </div>
    <div style="margin-bottom:10px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('e-mood',b.mood||'','mood',MOODS)}</div>
    <div style="margin-bottom:12px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('e-themes',b.themes||'','theme',THEMES)}</div>
    <div class="fg full" style="margin-bottom:10px"><label class="fl">Notes while reading</label><textarea class="fi fta" id="e-notes">${b.notes||''}</textarea></div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Retrospective thoughts</label><textarea class="fi fta" id="e-retro-notes">${b.retro_thoughts||''}</textarea></div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('edit-modal').classList.remove('on')">Cancel</button>
      <button class="btn-primary" onclick="saveEdit('${b.id}')">Save changes</button>
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
  b.mood=getTagVal('e-mood');b.themes=getTagVal('e-themes');
  b.notes=document.getElementById('e-notes').value.trim();
  b.retro_thoughts=document.getElementById('e-retro-notes').value.trim();
  await saveBook(b);
  document.getElementById('edit-modal').classList.remove('on');
  chartsDrawn=false;renderLibrary();
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
async function olSearch() {
  const q=document.getElementById('ol-q').value.trim();if(!q)return;
  const btn=document.getElementById('ol-btn');btn.disabled=true;btn.textContent='Searching…';
  selResult=null;selEdition=null;
  document.getElementById('edition-section').style.display='none';
  document.getElementById('book-form').style.display='none';
  try{
    const r=await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median,edition_count`);
    const d=await r.json();olResults=d.docs||[];renderOLR();
  }catch(e){document.getElementById('ol-results').innerHTML='<div style="padding:12px;font-size:13px;color:var(--coral)">Search failed.</div>';document.getElementById('ol-results').style.display='block';}
  btn.disabled=false;btn.textContent='Search';
}

function renderOLR(){
  const el=document.getElementById('ol-results');
  if(!olResults.length){el.innerHTML='<div class="rlist" style="padding:14px;font-size:13px;color:var(--tx1)">No results found.</div>';el.style.display='block';return;}
  el.innerHTML=`<div class="rlist">${olResults.map((r,i)=>`
    <div class="ritem" id="ri-${i}" onclick="selRes(${i})">
      ${r.cover_i?`<img class="rcover" src="${cUrl(r.cover_i,'S')}" alt="" loading="lazy">`:`<div class="rcover-ph">📖</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Lora',serif;font-size:14px;font-weight:500;margin-bottom:2px">${r.title}</div>
        <div style="font-size:12px;color:var(--tx1);margin-bottom:2px">${(r.author_name||[]).slice(0,2).join(', ')||'Unknown'}</div>
        <div style="font-size:11px;color:var(--tx2)">${[r.first_publish_year,r.edition_count?r.edition_count+' editions':'',r.number_of_pages_median?'~'+r.number_of_pages_median+' pages':''].filter(Boolean).join(' · ')}</div>
        ${r.isbn?.[0]?`<div style="font-size:10px;color:var(--tx2);font-family:monospace;margin-top:2px">ISBN: ${r.isbn[0]}</div>`:''}
      </div>
    </div>`).join('')}</div>`;
  el.style.display='block';
}

async function selRes(i){
  document.querySelectorAll('.ritem').forEach(el=>el.classList.remove('sel'));
  document.getElementById(`ri-${i}`)?.classList.add('sel');
  selResult=olResults[i];selEdition=null;
  await loadEds(selResult.key);
}

async function loadEds(key){
  const sec=document.getElementById('edition-section');
  sec.innerHTML=`<div class="edsec"><div style="font-size:12px;color:var(--tx1)">Loading editions…</div></div>`;sec.style.display='block';
  try{
    const r=await fetch(`https://openlibrary.org${key}/editions.json?limit=40`);const d=await r.json();
    editions=(d.entries||[]).map(e=>({key:e.key,publishers:(e.publishers||[]).join(', '),year:e.publish_date||'',isbn:(e.isbn_13||[])[0]||(e.isbn_10||[])[0]||'',format:gFmt(e),pages:e.number_of_pages||null,coverId:e.covers?.[0]||null}));
    renderEds();
  }catch(e){sec.innerHTML='<div class="edsec"><div style="font-size:13px;color:var(--coral)">Could not load editions.</div></div>';}
}

function gFmt(e){const f=(e.physical_format||'').toLowerCase();if(f.includes('ebook')||f.includes('digital'))return'EBook';if(f.includes('audio'))return'Audiobook';if(f.includes('hard'))return'Hardcover';if(f.includes('paper')||f.includes('mass'))return'Paperback';return'Print';}

function renderEds(){
  const sec=document.getElementById('edition-section');
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
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="f-rating" min="1" max="10" placeholder="e.g. 8"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="f-start"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="f-end"></div>
    </div>
    <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('f-mood','','mood',MOODS)}</div>
    <div style="margin-bottom:14px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('f-themes','','theme',THEMES)}</div>
    <div class="fg full" style="margin-bottom:10px"><label class="fl">Notes while reading</label><textarea class="fi fta" id="f-notes" placeholder="Thoughts while reading…"></textarea></div>
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
  const newBook={isbn:fd.isbn||null,ol_key:fd.olKey||null,google_id:null,status:document.getElementById('f-status').value,start_date:document.getElementById('f-start').value||null,end_date:document.getElementById('f-end').value||null,rating:parseFloat(document.getElementById('f-rating').value)||null,retro_rating:null,notes:document.getElementById('f-notes').value.trim(),retro_thoughts:document.getElementById('f-retro').value.trim(),mood:getTagVal('f-mood'),themes:getTagVal('f-themes'),manual_title:null,manual_author:null,import_source:''};
  try{await saveBook(newBook);books.unshift(newBook);resetAdd();renderLibrary();go('library');}
  catch(e){alert('Could not save: '+e.message);btn.disabled=false;btn.textContent='Add to library';}
}

function resetAdd(){
  olResults=[];selResult=null;editions=[];selEdition=null;
  document.getElementById('ol-q').value='';
  document.getElementById('ol-results').style.display='none';
  document.getElementById('edition-section').style.display='none';
  document.getElementById('book-form').style.display='none';
}

/* ── CSV IMPORT ────────────────────────────────────────────────────────── */
function handleImport(event,platform){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{try{const parsed=parseCSV(e.target.result,platform);pendingImport={books:parsed,platform};showImportPreview(parsed,platform);}catch(err){alert('Could not parse: '+err.message);}};
  reader.readAsText(file);event.target.value='';
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
      b={isbn:get(row,'isbn13')||get(row,'isbn')||null,ol_key:null,google_id:null,status,start_date:null,end_date:fmtDate(get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:get(row,'my review')||'',retro_thoughts:'',mood:'',themes:'',manual_title:title,manual_author:get(row,'author')||get(row,'author l-f')||null,import_source:'goodreads',_ratingConverted:grR>0};
    }else if(platform==='storygraph'){
      const title=get(row,'title');if(!title)continue;
      const sgR=parseFloat(get(row,'star rating'))||parseFloat(get(row,'my rating'))||0;const rating=sgR>0?sgR*2:0;
      const rs=(get(row,'read status')||get(row,'shelf')||'').toLowerCase();
      const status=rs.includes('currently')||rs==='reading'?'reading':rs.includes('to-read')||rs==='want to read'?'tbr':'finished';
      b={isbn:null,ol_key:null,google_id:null,status,start_date:fmtDate(get(row,'date started')||''),end_date:fmtDate(get(row,'date finished')||get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:get(row,'review')||'',retro_thoughts:'',mood:get(row,'moods')||'',themes:'',manual_title:title,manual_author:get(row,'authors')||get(row,'author')||null,import_source:'storygraph',_ratingConverted:sgR>0};
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
  const preview=document.getElementById('import-preview');
  preview.style.display='block';
  preview.innerHTML=`<div class="import-preview">
    <div style="font-size:14px;font-weight:500;margin-bottom:3px">Import preview — ${platformName}</div>
    <div style="font-size:12px;color:var(--tx1);margin-bottom:14px">Review before importing.${converted.length?' '+converted.length+' ratings converted from 1–5 to 1–10.':''}</div>
    <div class="ip-stats">
      <div class="ip-stat"><strong>${parsed.length}</strong>Total</div>
      <div class="ip-stat"><strong>${fin.length}</strong>Finished</div>
      <div class="ip-stat"><strong>${reading.length}</strong>Reading</div>
      <div class="ip-stat"><strong>${tbr.length}</strong>TBR</div>
    </div>
    ${converted.length?`<div class="ip-warn">⚠ ${converted.length} ratings multiplied by 2 (5-star → 10-point). Edit after import if needed.</div>`:''}
    <div class="ip-legend">
      <span><span class="ip-swatch" style="background:var(--bg0);border:0.5px solid var(--bd)"></span>Finished</span>
      <span><span class="ip-swatch" style="background:var(--teal-l)"></span>Reading</span>
      <span><span class="ip-swatch" style="background:var(--purple-l)"></span>TBR</span>
      ${converted.length?`<span><span class="ip-swatch" style="background:#fff8e6"></span>Rating converted</span>`:''}
    </div>
    <div class="ip-table-wrap">
      <table class="ip-table">
        <thead><tr><th>Title</th><th>Author</th><th>Rating</th><th>Status</th><th>Dates</th></tr></thead>
        <tbody>${parsed.slice(0,50).map(b=>{
          const cls=b.status==='reading'?'ip-read':b.status==='tbr'?'ip-tbr':b._ratingConverted?'ip-conv':'ip-fin';
          const dates=[b.start_date,b.end_date].filter(Boolean).join(' → ');
          return`<tr class="${cls}"><td>${b.manual_title||'—'}</td><td>${b.manual_author||'—'}</td><td>${b.rating?b.rating+'/10':'—'}</td><td>${b.status==='reading'?'Reading':b.status==='tbr'?'TBR':'Finished'}</td><td style="font-size:11px">${dates||'—'}</td></tr>`;
        }).join('')}${parsed.length>50?`<tr><td colspan="5" style="text-align:center;color:var(--tx1);padding:10px">…and ${parsed.length-50} more</td></tr>`:''}</tbody>
      </table>
    </div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="cancelImport()">Cancel</button>
      <button class="btn-primary" id="confirm-import-btn" onclick="confirmImport()">Import ${parsed.length} book${parsed.length!==1?'s':''}</button>
    </div>
  </div>`;
  preview.scrollIntoView({behavior:'smooth',block:'start'});
}

function cancelImport(){pendingImport=null;document.getElementById('import-preview').style.display='none';}

async function confirmImport(){
  if(!pendingImport)return;
  const btn=document.getElementById('confirm-import-btn');
  btn.disabled=true;btn.textContent='Importing…';
  const toInsert=pendingImport.books.map(b=>({...bookToRow({...b,id:null})}));
  const chunkSize=50;let inserted=0;
  for(let i=0;i<toInsert.length;i+=chunkSize){
    const chunk=toInsert.slice(i,i+chunkSize);
    try{
      const rows=await sbInsert('books',chunk);
      rows.forEach((row,j)=>{books.push({...pendingImport.books[i+j],id:row.id});});
      inserted+=chunk.length;btn.textContent=`Importing… ${inserted}/${toInsert.length}`;
    }catch(e){
      console.error('Import error:',e);
      alert(`Import failed at row ${inserted+1}: ${e.message}`);
      btn.disabled=false;btn.textContent='Try again';return;
    }
  }
  pendingImport=null;document.getElementById('import-preview').style.display='none';
  // Fetch metadata for all imported books in background
  fetchMissingMeta(books);
  renderLibrary();go('library');
  alert(`Imported ${inserted} book${inserted!==1?'s':''} successfully!`);
}

function bookToRow(b){
  const nn=v=>(v===''||v===null||v===undefined)?null:v;
  return{user_id:currentUser.id,isbn:nn(b.isbn),ol_key:nn(b.ol_key),google_id:nn(b.google_id),status:b.status||'finished',start_date:nn(b.start_date),end_date:nn(b.end_date),rating:nn(b.rating),retro_rating:nn(b.retro_rating),notes:b.notes||'',retro_thoughts:b.retro_thoughts||'',mood:b.mood||'',themes:b.themes||'',manual_title:nn(b.manual_title),manual_author:nn(b.manual_author),import_source:b.import_source||''};
}

/* ── STATS ─────────────────────────────────────────────────────────────── */
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

  // ── GENRE TABLE ──────────────────────────────────────────────────────────
  const genreMap={};
  fin.forEach(b=>{
    parseTags(bGenre(b)).forEach(g=>{
      if(!g)return;
      if(!genreMap[g])genreMap[g]={count:0,total:0};
      genreMap[g].count++;
      if(b.rating)genreMap[g].total+=b.rating;
    });
  });
  const genreRows=Object.entries(genreMap)
    .sort((a,b)=>b[1].count-a[1].count)
    .map(([g,v])=>{
      const avg=v.count>0?(v.total/v.count).toFixed(1):'—';
      const pct=Math.round(v.count/fin.length*100);
      return`<tr>
        <td style="font-weight:500;padding:8px 12px">${g}</td>
        <td style="padding:8px 12px;text-align:center">${v.count}</td>
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--amber);border-radius:3px"></div>
            </div>
            <span style="font-size:11px;color:var(--tx1);width:28px;text-align:right">${pct}%</span>
          </div>
        </td>
        <td style="padding:8px 12px;text-align:center;color:${parseFloat(avg)>=8?'var(--teal)':parseFloat(avg)>=6?'var(--amber)':'var(--coral)'};font-weight:500">${avg}</td>
      </tr>`;
    }).join('');
  document.getElementById('genre-table-body').innerHTML=genreRows||'<tr><td colspan="4" style="padding:12px;color:var(--tx1)">No genre data yet</td></tr>';

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

function go(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('p-'+name).classList.add('on');
  const names=['library','stats','add','chat'];
  document.querySelectorAll('.tab')[names.indexOf(name)]?.classList.add('on');
  if(name==='stats'){chartsDrawn=false;drawStats();}
  if(name==='library')renderLibrary();
}

/* ── CHAT ──────────────────────────────────────────────────────────────── */
function saveKey(){apiKey=document.getElementById('ak').value.trim();localStorage.setItem('pt_ak',apiKey);document.getElementById('chat-status').textContent=apiKey?'Ready':'Add API key above';if(apiKey)alert('Key saved.');}

async function sendMsg(){
  const inp=document.getElementById('chat-in');const msg=inp.value.trim();if(!msg)return;
  if(!apiKey){alert('Add your Anthropic API key above first.');return;}
  addMsg(msg,'u');inp.value='';document.getElementById('send-btn').disabled=true;
  const typing=addTyping();chatHistory.push({role:'user',content:msg});
  const sys=`You are a personal book advisor with full knowledge of the user's reading history:\n\n${booksCtxStr()}\n\nThis reader values: rich worldbuilding, developed characters, satisfying narratives. Dislikes: shallow writing, declining series, filler. Be direct, specific, conversational. When recommending, explain WHY and estimate a likely rating (1–10).`;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:sys,messages:chatHistory})});
    const d=await r.json();if(d.error)throw new Error(d.error.message);
    const reply=d.content?.map(c=>c.text||'').join('')||'Sorry, something went wrong.';
    chatHistory.push({role:'assistant',content:reply});typing.remove();addMsg(reply,'a');
  }catch(e){typing.remove();addMsg(`Error: ${e.message}`,'a');}
  document.getElementById('send-btn').disabled=false;
}

function addMsg(text,role){const c=document.getElementById('chat-msgs');const d=document.createElement('div');d.className=`msg msg-${role}`;d.innerHTML=`<div class="bubble">${text.replace(/\n/g,'<br>')}</div><div class="msg-lbl">${role==='u'?'You':'Book Advisor'}</div>`;c.appendChild(d);c.scrollTop=c.scrollHeight;return d;}
function addTyping(){const c=document.getElementById('chat-msgs');const d=document.createElement('div');d.className='msg msg-a';d.innerHTML=`<div class="bubble"><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;c.appendChild(d);c.scrollTop=c.scrollHeight;return d;}
function chip(t){document.getElementById('chat-in').value=t;sendMsg();}
function chatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
