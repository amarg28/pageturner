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
// Fiction genres
const FICTION_GENRES = ['Adventure',"Children's",'Classics','Crime','Dystopian','Fantasy','Gothic','Graphic Novel','Historical Fiction','Horror','Literary Fiction','Magical Realism','Mystery','Psychological Fiction','Queer Fiction','Romance','Satire','Science Fiction','Short Stories','Speculative Fiction','Thriller','Young Adult'];
// Nonfiction genres
const NONFICTION_GENRES = ['Art & Design','Biography','Essay Collection','Food & Cooking','History','Memoir','Nature','Philosophy','Politics','Science','Self-Help','Travel','True Crime'];
// Combined for backwards compat
const GENRES = [...FICTION_GENRES, ...NONFICTION_GENRES];
const MOODS  = ['Dark','Cozy','Tense','Melancholic','Funny','Hopeful','Unsettling','Dreamy','Gritty','Propulsive','Atmospheric','Whimsical','Intense','Slow-burn','Heartwarming'];
const THEMES = ['Found family','Identity','Grief','Power','Survival','Colonialism','Queerness','Religion','Class','Nature','Memory','Trauma','Redemption','Coming of age','Love','War','Technology','Death','Friendship'];

// Genre canonicalisation — maps messy OL/Google tags to our clean list
const GENRE_MAP = {
  'science fiction':'Science Fiction','sci-fi':'Science Fiction','sf':'Science Fiction',
  'fantasy':'Fantasy','epic fantasy':'Fantasy','urban fantasy':'Fantasy','dark fantasy':'Fantasy',
  'horror':'Horror','ghost stories':'Horror','supernatural fiction':'Horror',
  'mystery':'Mystery','detective':'Mystery','whodunit':'Mystery',
  'thriller':'Thriller','suspense':'Thriller','espionage':'Thriller',
  'romance':'Romance','love stories':'Romance','romantic fiction':'Romance',
  'historical fiction':'Historical Fiction','historical novel':'Historical Fiction',
  'historical fantasy':'Fantasy', // before 'historical' so it doesn't map to History
  'literary fiction':'Literary Fiction','literary':'Literary Fiction','contemporary fiction':'Literary Fiction',
  'magical realism':'Magical Realism','magic realism':'Magical Realism',
  'dystopian':'Dystopian','dystopia':'Dystopian','post-apocalyptic':'Dystopian',
  'young adult':'Young Adult','ya':'Young Adult','teen fiction':'Young Adult',
  'graphic novel':'Graphic Novel','comics':'Graphic Novel','manga':'Graphic Novel',
  'short stories':'Short Stories','short story collection':'Short Stories',
  'memoir':'Memoir','autobiography':'Memoir','personal narrative':'Memoir',
  'biography':'Biography','biographies':'Biography',
  'true crime':'True Crime','crime nonfiction':'True Crime',
  'history':'History', // note: 'historical' intentionally removed - too greedy, catches 'historical fiction'
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
  'queer':'Queer Fiction','lgbtq':'Queer Fiction','lgbt':'Queer Fiction','queer literature':'Queer Fiction',
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
  const displayName = localStorage.getItem('pt_display_name');
  document.getElementById('uavatar').textContent = (displayName || currentUser.email).slice(0,1).toUpperCase();
  updateApiNotice();
  go('library');
  loadBooks();
  // Show tour on first ever sign-in
  const toured = localStorage.getItem('pt_toured');
  if (!toured) {
    setTimeout(() => showTour(), 1200);
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
let booksLoaded = false;

async function loadBooks() {
  booksLoaded = false;
  document.getElementById('shelf').innerHTML =
    `<div class="loading-wrap"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div><span>Loading your library…</span></div>`;
  try {
    const data = await sbSelect('books', `user_id=eq.${currentUser.id}&order=created_at.desc`);
    books = data || [];
    booksLoaded = true;
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
    series_number: nn(b.series_number)
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
  const tbr = books.filter(b => b.status === 'tbr');
  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">To be read (${tbr.length})</div>
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
          ${b.series_name?`<div style="font-size:9px;color:var(--tx2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.series_name}${b.series_number?' #'+b.series_number:''}</div>`:''}
          ${b.rating?`<div class="card-stars">${toStars(b.rating)}</div>`:''}
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
        <button class="bp-add-btn bp-add-btn-finished" onclick="openAddFinishedForm('${esc(isbn||'')}','${esc(olBook.key||'')}','${esc(olBook.title)}','${esc(author)}',${olBook.cover_i||'null'},${olBook.first_publish_year||'null'})">+ Add as finished</button>
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
      <div class="bp-back" onclick="closeBookModal()">← Back</div>
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
        <div class="fg"><label class="fl">Format</label>
          <select class="fi" id="af-format">
            <option>Print</option><option>Paperback</option><option>Hardcover</option><option>EBook</option><option>Audiobook</option>
          </select>
        </div>
        <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="af-start"></div>
        <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="af-end"></div>
      </div>
      <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('af-mood','','mood',MOODS)}</div>
      <div style="margin-bottom:14px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('af-themes','','theme',THEMES)}</div>
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
    retro_thoughts: '',
    mood: getTagVal('af-mood'),
    themes: getTagVal('af-themes'),
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
      <button class="bp-remove-btn" onclick="openDel('${b.id}')">Remove</button>
      <button class="bp-refresh-btn" onclick="refreshBookMeta('${b.id}')" title="Refresh cover and metadata">↻</button>
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
        ${desc?`<div class="bpsec"><div class="bpsec-t">About this book</div>
          <div id="desc-text-${b.id}" style="font-size:14px;line-height:1.7;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical">${desc}</div>
          ${desc.length>300?`<button onclick="var el=document.getElementById('desc-text-${b.id}');el.style.webkitLineClamp='unset';el.style.display='block';this.style.display='none'" style="margin-top:6px;background:none;border:none;font-size:12px;color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;padding:0">Read more ↓</button>`:''}
        </div></div>`:''}
        ${b.notes?`<div class="bpsec"><div class="bpsec-t">Initial thoughts</div><div style="margin-top:6px">${formatRetroThoughts(b.notes)}</div></div>`:''}
        ${(b.retro_rating||b.retro_thoughts)?`<div class="bpsec">
          <div class="retro-pill">Retrospective${b.retro_rating?' · '+b.retro_rating+'/10':''}</div>
          ${b.retro_thoughts?`<div style="margin-top:10px">${formatRetroThoughts(b.retro_thoughts)}</div>`:''}
        </div>`:''}
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
        ${b.series_name||b.ol_key?`<div class="scard"><div class="scard-t">Series</div><div id="series-section"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>`:''}
        <div class="scard"><div class="scard-t">Series</div><div id="series-section"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
        <div class="scard"><div class="scard-t">Open Library data</div><div id="ol-data"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
        <div class="scard"><div class="scard-t">Books by ${author.split(' ').slice(-1)[0]}</div><div id="also-by"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
      </div>
    </div>
  </div>`;
  loadOLData(b); loadAlsoBy(b); loadSeriesSection(b);
  if (b.series_name || b.ol_key) loadSeriesSection(b, 'series-section');
}

function openBookModal() {
  const modal = document.getElementById('book-modal');
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  // Reset scroll to top
  const inner = document.getElementById('book-modal-inner');
  if (inner) inner.scrollTop = 0;
  // Note: no swipe-to-close on book modal - too easy to accidentally trigger
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

function closeBookModal() {
  document.getElementById('book-modal').classList.remove('on');
  document.body.style.overflow = '';
}

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
    `<div style="padding:14px;font-size:13px;color:var(--teal);background:var(--teal-l);border-radius:var(--rl)">✓ Reflection saved. Retrospective rating: ${b.retro_rating}/10</div>`;
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

async function loadSeriesSection(b, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const olKey = b.ol_key;
  const seriesName = bSeriesName(b);

  // Try to get series from OL if we don't have it stored
  let series = null;
  if (seriesName) {
    series = { name: seriesName, number: bSeriesNumber(b) };
  } else if (olKey) {
    el.innerHTML = '<div style="font-size:12px;color:var(--tx1)">Loading series info…</div>';
    series = await fetchSeriesFromOL(olKey);
    if (series && !b.series_name) {
      // Auto-save the series data
      b.series_name = series.name;
      b.series_number = series.number;
      await saveBook(b);
    }
  }

  if (!series) {
    el.innerHTML = '<div style="font-size:12px;color:var(--tx1)">Not part of a series, or series data unavailable.</div>';
    return;
  }

  // Find all books in same series in library
  const inLib = books.filter(x => x.series_name && x.series_name.toLowerCase() === series.name.toLowerCase())
    .sort((a,b) => (a.series_number||999) - (b.series_number||999));

  // Search OL for all books in this series
  el.innerHTML = '<div style="font-size:12px;color:var(--tx1)">Loading series books…</div>';
  let seriesBooks = [];
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(series.name)}&fields=key,title,author_name,cover_i,first_publish_year&limit=12`);
    const d = await r.json();
    // Filter to likely series books
    seriesBooks = (d.docs||[]).filter(x =>
      x.title.toLowerCase().includes(series.name.toLowerCase().split(' ')[0]) ||
      series.name.toLowerCase().includes(x.title.toLowerCase().split(' ')[0])
    ).slice(0, 8);
  } catch(e) {}

  // Render series header + book list
  el.innerHTML = `
    <div style="font-family:'Lora',serif;font-size:14px;font-weight:500;margin-bottom:4px">${series.name}</div>
    ${series.number ? `<div style="font-size:11px;color:var(--tx2);margin-bottom:12px">This is book ${series.number} in the series</div>` : '<div style="margin-bottom:12px"></div>'}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${inLib.map(sb => `
        <div style="display:flex;gap:10px;align-items:center;padding:8px;border:0.5px solid var(--teal-l);border-radius:var(--r);background:var(--teal-l);cursor:pointer" onclick="closeBookModal();setTimeout(()=>openBookPage('${sb.id}'),50)">
          ${bCover(sb) ? `<img src="${bCover(sb)}" style="width:28px;height:42px;object-fit:cover;border-radius:3px;flex-shrink:0">` : `<div style="width:28px;height:42px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--tx2)">${sb.series_number ? 'Book '+sb.series_number : ''}</div>
            <div style="font-family:'Lora',serif;font-size:12px;font-weight:500">${bTitle(sb)}</div>
            ${sb.rating ? `<div style="font-size:10px;color:var(--teal)">${toStars(sb.rating)} ${sb.rating}/10</div>` : ''}
          </div>
          <div style="font-size:10px;color:var(--teal);flex-shrink:0">In library</div>
        </div>`).join('')}
      ${seriesBooks.filter(sb => !inLib.find(x => bTitle(x).toLowerCase() === sb.title.toLowerCase())).map(sb => {
        const olData = {key:sb.key,title:sb.title,author_name:sb.author_name,cover_i:sb.cover_i,first_publish_year:sb.first_publish_year};
        const idx = window._seriesBooks ? window._seriesBooks.length : 0;
        if (!window._seriesBooks) window._seriesBooks = [];
        window._seriesBooks.push(olData);
        return `<div style="display:flex;gap:10px;align-items:center;padding:8px;border:0.5px solid var(--bd);border-radius:var(--r);cursor:pointer" onclick="openUnreadBookPage(window._seriesBooks[${idx}])" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          ${sb.cover_i ? `<img src="${cUrl(sb.cover_i,'S')}" style="width:28px;height:42px;object-fit:cover;border-radius:3px;flex-shrink:0" loading="lazy">` : `<div style="width:28px;height:42px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Lora',serif;font-size:12px;font-weight:500">${sb.title}</div>
            <div style="font-size:10px;color:var(--tx2)">${sb.first_publish_year||''}</div>
          </div>
          <button onclick="event.stopPropagation();quickAddBook('tbr','','${sb.key||''}','${sb.title.replace(/'/g,"\'")}','${(sb.author_name||[])[0]?.replace(/'/g,"\'")||''}')" style="font-size:10px;padding:3px 8px;background:var(--purple-l);color:var(--purple);border:none;border-radius:100px;cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0">+ TBR</button>
        </div>`;
      }).join('')}
    </div>
    <button onclick="openEditSeriesModal('${b.id}')" style="margin-top:10px;font-size:11px;padding:4px 10px;border:0.5px solid var(--bd2);border-radius:100px;background:none;cursor:pointer;color:var(--tx1);font-family:'DM Sans',sans-serif">Edit series info</button>`;
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
  loadSeriesSection(b, 'series-section');
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
  const reading = books.filter(b=>b.status==='reading').map(b=>`"${bTitle(b)}" by ${bAuthor(b)}`);
  const tbr = books.filter(b=>b.status==='tbr').map(b=>`"${bTitle(b)}" by ${bAuthor(b)}`);
  const finished = books.filter(b=>b.status==='finished').map(b => {
    const parts = [];
    parts.push(`"${bTitle(b)}" by ${bAuthor(b)}`);
    parts.push(`Rating: ${b.rating||'?'}/10`);
    if (bGenre(b)) parts.push(`Genre: ${bGenre(b)}`);
    if (b.mood) parts.push(`Mood: ${b.mood}`);
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
    const text = await callClaude(`Based on this reader's history, will they enjoy "${bTitle(b)}" by ${bAuthor(b)}?\nHistory:\n${booksCtxStr()}\nGenre:${bGenre(b)}\nDescription:${bDesc(b)||'N/A'}\n\nRespond warmly in 2-3 sentences max. Reference 1-2 specific books from their history. End with PREDICTED: [number]/10.`, 300);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const analysis = text.replace(/PREDICTED:.*$/im,'').trim();
    const html = `${pred?`<div class="ai-pred"><span>Book Bot thinks</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>`:''}
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
    const text = await callClaude(`Based on this reader's history, will they enjoy "${title}" by ${author}?\nHistory:\n${booksCtxStr()}\n\nRespond warmly in 2-3 sentences max. Reference 1-2 specific books from their history. End with PREDICTED: [number]/10.`, 300);
    const pred=text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const analysis = text.replace(/PREDICTED:.*$/im,'').trim();
    const html = `${pred?`<div class="ai-pred"><span>Book Bot thinks</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>`:''}
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
          <option value="dnf"${b.status==='dnf'?' selected':''}>Did Not Finish</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="e-rating" min="1" max="10" value="${b.rating||''}"></div>
      <div class="fg"><label class="fl">Retrospective rating</label><input class="fi" type="number" id="e-retro" min="1" max="10" value="${b.retro_rating||''}"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="e-start" value="${b.start_date||''}"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="e-end" value="${b.end_date||''}"></div>
      ${b.status==='reading'?`<div class="fg"><label class="fl">Pages read so far</label><input class="fi" type="number" id="e-pages-read" min="0" value="${b.pages_read||''}"></div>`:''}
      <div class="fg"><label class="fl">Series name</label><input class="fi" type="text" id="e-series-name" placeholder="e.g. The Broken Earth" value="${b.series_name||''}" list="series-datalist"><datalist id="series-datalist">${[...new Set(books.filter(x=>x.series_name).map(x=>x.series_name))].map(s=>`<option value="${s}">`).join('')}</datalist></div>
      <div class="fg"><label class="fl">Book number</label><input class="fi" type="number" id="e-series-num" min="1" step="0.5" placeholder="e.g. 1" value="${b.series_number||''}"></div>
    </div>
    <div class="fgrid" style="margin-bottom:12px">
      <div class="fg full"><label class="fl">Series name</label><input class="fi" id="e-series-name" value="${b.series_name||''}" placeholder="e.g. The Broken Earth"></div>
      <div class="fg"><label class="fl">Book number in series</label><input class="fi" type="number" id="e-series-num" value="${b.series_number||''}" placeholder="e.g. 1"></div>
    </div>
    <div style="margin-bottom:10px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('e-mood',b.mood||'','mood',MOODS)}</div>
    <div style="margin-bottom:12px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('e-themes',b.themes||'','theme',THEMES)}</div>
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
  b.mood=getTagVal('e-mood');b.themes=getTagVal('e-themes');
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
  await saveBook(b);
  document.getElementById('edit-modal').classList.remove('on');
  chartsDrawn=false;renderLibrary();
  // Brief save confirmation toast
  showToast('Changes saved ✓');
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
  const newBook={isbn:fd.isbn||null,ol_key:fd.olKey||null,google_id:null,status:document.getElementById('f-status').value,start_date:document.getElementById('f-start').value||null,end_date:document.getElementById('f-end').value||null,rating:parseFloat(document.getElementById('f-rating').value)||null,retro_rating:null,notes:INITIAL_PROMPTS.map(p=>{const v=document.getElementById('f-ip-'+p.id)?.value.trim();return v?p.q+'\n'+v:'';}).filter(Boolean).join('\n\n'),retro_thoughts:document.getElementById('f-retro').value.trim(),mood:getTagVal('f-mood'),themes:getTagVal('f-themes'),manual_title:null,manual_author:null,import_source:''};
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
      // Extract genres from bookshelves - filter out shelf names, keep genre-like tags
      const grShelves = get(row,'bookshelves')||get(row,'bookshelves with positions')||'';
      const grGenres = grShelves.split(',').map(s=>s.trim())
        .filter(s=>s && !['read','to-read','currently-reading','owned','favorites','did-not-finish','dnf'].includes(s.toLowerCase()))
        .map(s=>canonicaliseGenre(s)).filter(Boolean);
      const grGenreStr = [...new Set(grGenres)].join(', ');
      b={isbn:get(row,'isbn13')||get(row,'isbn')||null,ol_key:null,google_id:null,status,start_date:null,end_date:fmtDate(get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:get(row,'my review')||'',retro_thoughts:'',mood:'',themes:'',manual_title:title,manual_author:get(row,'author')||get(row,'author l-f')||null,import_source:'goodreads',_ratingConverted:grR>0,_importGenre:grGenreStr};
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
      b={isbn:null,ol_key:null,google_id:null,status,start_date:fmtDate(get(row,'date started')||''),end_date:fmtDate(get(row,'date finished')||get(row,'date read')||''),rating:rating||null,retro_rating:null,notes:get(row,'review')||'',retro_thoughts:'',mood:sgMoods,themes:'',manual_title:title,manual_author:get(row,'authors')||get(row,'author')||null,import_source:'storygraph',_ratingConverted:sgR>0,_importGenre:sgGenreStr};
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
          return`<tr class="${cls}" style="${b._isDupe?'opacity:.5':''}"><td>${b.manual_title||'—'}</td><td>${b.manual_author||'—'}</td><td>${b.rating?b.rating+'/10':'—'}</td><td>${b.status==='reading'?'Reading':b.status==='tbr'?'TBR':'Finished'}</td><td style="font-size:11px">${dates||'—'}</td><td style="font-size:11px;color:var(--amber)">${b._isDupe?'Already in library':''}</td></tr>`;
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
  const toInsert=pendingImport.books.filter(b=>!b._isDupe).map(b=>({...bookToRow({...b,id:null})}));
  if(!toInsert.length){alert('No new books to import.');pendingImport=null;document.getElementById('import-preview').style.display='none';return;}
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
    const s = b.series_name;
    if (!seriesMap[s]) seriesMap[s] = [];
    seriesMap[s].push(b);
  });

  if (!Object.keys(seriesMap).length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--tx1)">No series tracked yet. Add series info to books via Edit.</div>';
    return;
  }

  el.innerHTML = Object.entries(seriesMap)
    .sort((a,b) => b[1].length - a[1].length)
    .map(([name, sBooks]) => {
      const sorted = sBooks.sort((a,b) => (a.series_number||0)-(b.series_number||0));
      const finished = sBooks.filter(b=>b.status==='finished').length;
      const avgRating = sBooks.filter(b=>b.rating>0).reduce((s,b)=>s+b.rating,0) / (sBooks.filter(b=>b.rating>0).length||1);
      return `<div class="series-card">
        <div class="series-card-header">
          <div>
            <div class="series-card-name">${name}</div>
            <div class="series-card-meta">${finished} book${finished!==1?'s':''} read${sBooks.filter(b=>b.rating>0).length?` · avg ${avgRating.toFixed(1)}/10`:''}</div>
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
              <div style="margin-top:10px;font-size:10px;color:${statusColor};text-align:center">${b.status==='finished'?b.rating?b.rating+'/10':'✓':b.status==='reading'?'Reading':'TBR'}</div>
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
    notice.style.background = 'var(--teal-l)';
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
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" id="m-rating" type="number" min="1" max="10" placeholder="e.g. 8"></div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" id="m-start" type="date"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" id="m-end" type="date"></div>
    </div>
    <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildTagInput('m-genre','','genre',GENRES)}</div>
    <div style="margin-bottom:12px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('m-mood','','mood',MOODS)}</div>
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
  const mood  = getTagVal('m-mood');

  // Cache metadata manually since there's no API to fetch from
  const cacheKey = title;
  setMeta(cacheKey, {
    title, author,
    year,
    pages,
    genre: genre || '',
    description: '',
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
    mood, themes: '',
    manual_title:  title,
    manual_author: author,
    import_source: 'manual',
    pages_read: null, series_name: null, series_number: null
  };

  try {
    await saveBook(newBook);
    books.unshift(newBook);
    closeManualEntry();
    document.getElementById('ol-q').value = '';
    renderLibrary();
    go('library');
    showToast(`"${title}" added to your library ✓`);
  } catch(e) {
    showToast('Could not save: ' + e.message);
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
function renderDiscover() {
  renderDiscoverTBR();
  renderDiscoverSeries();
  updateApiNotice();
}

function renderDiscoverTBR() {
  const tbr = books.filter(b => b.status === 'tbr');
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
  document.querySelectorAll('.gsearch-result').forEach((el,i) => { el.style.background=i===discoverIdx?'var(--amber-l)':''; });
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
          ${inLib?`<div class="gsearch-in-lib">In your library${inLib.rating?' · '+inLib.rating+'/10':''}</div>`:''}
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
  renderReflectDue();
  renderReflectTimeline();
}

function renderReflectDue() {
  const due = books.filter(isRetroDue);
  const sec = document.getElementById('reflect-due-section');
  const emptyEl = document.getElementById('reflect-empty');

  if (!booksLoaded || books.length === 0) {
    sec.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `<div class="reflect-empty">
        <div class="reflect-empty-icon">✦</div>
        <div style="font-weight:500;margin-bottom:8px">Your reflection journal is waiting</div>
        <div style="margin-bottom:16px">Once you've read and logged books, they'll appear here once enough time has passed — you can set your preferred wait period in Settings.</div>
        <button class="btn-primary" onclick="go('discover')">Add your first book →</button>
      </div>`;
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  if (!due.length) {
    sec.innerHTML = `<div class="reflect-empty"><div class="reflect-empty-icon">✦</div><div style="font-weight:500;margin-bottom:6px">No reflections due yet</div><div>Books appear here after your chosen wait period. You can adjust this in <button onclick="openSettings()" style="background:none;border:none;color:var(--amber);cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;padding:0;text-decoration:underline">Settings</button>.</div></div>`;
    return;
  }
  sec.innerHTML = `
    <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--tx2);margin-bottom:14px">Due for reflection <span style="background:var(--amber);color:#fff;padding:2px 8px;border-radius:100px;font-size:10px;margin-left:6px">${due.length}</span></div>
    ${due.map(b => renderReflectCard(b)).join('')}`;
}

function renderReflectCard(b) {
  const cover = bCover(b);
  const yearAgo = new Date(b.end_date); yearAgo.setMonth(yearAgo.getMonth() + getReflectWaitMonths());
  const daysOver = Math.floor((new Date()-yearAgo)/86400000);
  const when = daysOver<=7?'Just hit one year':`${Math.floor(daysOver/30)||1} month${Math.floor(daysOver/30)!==1?'s':''} ago`;
  return `<div class="reflect-due-card" id="reflect-card-${b.id}">
    <div class="reflect-due-header">
      ${cover?`<img class="reflect-due-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="reflect-due-cover-ph">📖</div>`}
      <div style="flex:1">
        <div class="reflect-due-title">${bTitle(b)}</div>
        <div class="reflect-due-author">${bAuthor(b)}</div>
        <div class="reflect-due-meta">Rated ${b.rating||'—'}/10 · Finished ${when}</div>
      </div>
    </div>
    <div class="reflect-prompts">
      ${REFLECT_PROMPTS.map(p=>`
        <div class="reflect-prompt">
          <div class="reflect-prompt-q">${p.q}</div>
          <textarea class="reflect-prompt-ta" id="rp-${b.id}-${p.id}" placeholder="Optional — answer as much or as little as you like…"></textarea>
        </div>`).join('')}
    </div>
    <div class="reflect-rating-row">
      <span class="reflect-rating-label">Retrospective rating</span>
      <input class="reflect-rating-in" type="number" id="rr-${b.id}" min="1" max="10" placeholder="1–10" value="${b.rating||''}">
      <span style="font-size:12px;color:var(--tx1)">/ 10</span>
      <span style="font-size:11px;color:var(--tx2)">How do you feel about it now?</span>
    </div>
    <div class="form-acts" style="justify-content:flex-start;gap:8px">
      <button class="reflect-save-btn" onclick="saveReflection('${b.id}')">Save reflection</button>
      <button class="reflect-skip-btn" onclick="skipReflection('${b.id}')">Skip for now</button>
    </div>
  </div>`;
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
      <div style="font-size:13px;color:var(--teal)">Reflection saved${rating?' · '+rating+'/10':''}</div></div>
    </div>`;
  }
  chartsDrawn=false;
  renderRetroDue();
  renderBooks();
  renderReflectTimeline();
}

function skipReflection(bookId) {
  const card = document.getElementById(`reflect-card-${bookId}`);
  if (card) card.style.display='none';
}

function renderReflectTimeline() {
  const withRetro = books.filter(b => b.status==='finished' && (b.retro_rating||b.retro_thoughts))
    .sort((a,b) => new Date(b.end_date)-new Date(a.end_date));
  const sec = document.getElementById('reflect-timeline-section');
  if (!withRetro.length) { sec.innerHTML=''; return; }
  sec.innerHTML = `
    <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--tx2);margin:28px 0 14px">Your reflections <span style="font-weight:400">(${withRetro.length})</span></div>
    ${withRetro.map(b => {
      const date = b.end_date ? new Date(b.end_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';
      const thoughts = b.retro_thoughts?.slice(0,200)+(b.retro_thoughts?.length>200?'…':'') || '';
      return `<div class="reflect-timeline-entry" onclick="openBookPage('${b.id}')">
        <div class="reflect-timeline-date">Finished ${date}</div>
        <div class="reflect-timeline-book">${bTitle(b)}</div>
        <div class="reflect-timeline-author">${bAuthor(b)}</div>
        <div class="reflect-timeline-ratings">
          ${b.rating?`<span class="reflect-timeline-rating">Initial: <strong>${b.rating}/10</strong></span>`:''}
          ${b.retro_rating?`<span class="reflect-timeline-rating">Retrospective: <strong>${b.retro_rating}/10</strong></span>`:''}
        </div>
        ${thoughts?`<div class="reflect-timeline-thoughts">"${thoughts}"</div>`:''}
      </div>`;
    }).join('')}`;
}

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

  // Tooltip on hover
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W/rect.width);
    const my = (e.clientY - rect.top) * (H/rect.height);
    const hit = rects.find(r => mx>=r.x && mx<=r.x+r.w && my>=r.y && my<=r.y+r.h);
    canvas.title = hit ? `${hit.label}: ${hit.count} books · avg ${hit.avg}/10` : '';
  };
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
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--tx0);color:#fff;padding:9px 18px;border-radius:100px;font-size:13px;font-family:"DM Sans",sans-serif;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap';
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
  const mf = document.getElementById('mf');
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
function saveKey(){apiKey=document.getElementById('ak').value.trim();localStorage.setItem('pt_ak',apiKey);document.getElementById('chat-status').textContent=apiKey?'Ready':'Add API key above';if(apiKey)alert('Key saved.');}

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
    chatHistory.push({role:'assistant',content:reply});typing.remove();addMsg(reply,'a');
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
