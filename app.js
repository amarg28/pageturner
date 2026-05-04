/* ── CONFIG ────────────────────────────────────────────────────────────── */
const SUPABASE_URL = 'https://ifpljbwwperpjzlmoust.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pXCqvV-FD4kS9simoOWJwQ_QukAxvgu';

/* ── TAG DEFINITIONS ───────────────────────────────────────────────────── */
const GENRES = ['Science Fiction','Fantasy','Horror','Literary Fiction','Mystery','Thriller','Romance','Historical Fiction','Nonfiction','Memoir','Young Adult','Graphic Novel','Magical Realism','Dystopian','Short Stories','Biography','Queer Fiction'];
const MOODS  = ['Dark','Cozy','Tense','Melancholic','Funny','Hopeful','Unsettling','Dreamy','Gritty','Propulsive','Atmospheric','Whimsical','Intense','Slow-burn','Heartwarming'];
const THEMES = ['Found family','Identity','Grief','Power','Survival','Colonialism','Queerness','Religion','Class','Nature','Memory','Trauma','Redemption','Coming of age','Love','War','Technology','Death','Friendship'];

/* ── STATE ─────────────────────────────────────────────────────────────── */
let books = [], currentUser = null, sort = 'date', chartsDrawn = false, chatHistory = [];
let apiKey = localStorage.getItem('pt_ak') || '';
let olResults = [], selResult = null, editions = [], selEdition = null, edFilt = 'all';
let authMode = 'signin', pendingImport = null;
let gsearchTimer = null, gsearchResults = [], gsearchIdx = -1;

/* ── UTILS ─────────────────────────────────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const cUrl = (id, s='M') => id ? `https://covers.openlibrary.org/b/id/${id}-${s}.jpg` : null;
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
const esc  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escQ = s => s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

// Retro due: one year after end date, no retro rating yet
const isRetroDue = b => {
  if (b.status !== 'finished' || !b.end || b.retro) return false;
  const due = new Date(b.end);
  due.setFullYear(due.getFullYear() + 1);
  return new Date() >= due;
};

/* ── AUTH ──────────────────────────────────────────────────────────────── */
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
    const res = authMode === 'signin'
      ? await sb.auth.signInWithPassword({ email, password: pw })
      : await sb.auth.signUp({ email, password: pw });
    if (res.error) throw res.error;
    if (authMode === 'signup' && !res.data?.session) {
      const ok = document.getElementById('auth-success');
      ok.textContent = 'Account created! Check your email to confirm, then sign in.';
      ok.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Create account'; return;
    }
  } catch(e) {
    showAErr(e.message || 'Something went wrong.');
    btn.disabled = false;
    btn.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  }
}

function showAErr(m) {
  const el = document.getElementById('auth-error');
  el.textContent = m; el.style.display = 'block';
}

async function signOut() {
  await sb.auth.signOut();
  books = []; chartsDrawn = false; chatHistory = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

sb.auth.onAuthStateChange(async (ev, session) => {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('uavatar').textContent = currentUser.email.slice(0,1).toUpperCase();
    if (apiKey) document.getElementById('ak').value = apiKey;
    await loadBooks();
  } else {
    currentUser = null;
  }
});

/* ── DATABASE ──────────────────────────────────────────────────────────── */
async function loadBooks() {
  document.getElementById('shelf').innerHTML =
    `<div class="loading-wrap"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div><span>Loading your library…</span></div>`;
  const { data, error } = await sb.from('books').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  books = (data || []).map(dbToBook);
  renderLibrary();
  enrichMissing();
}

function dbToBook(r) {
  return {
    id: r.id, num: r.num || 0, title: r.title, author: r.author || '',
    rating: r.rating || 0, retro: r.retro || 0, pages: r.pages || 0, year: r.year || 0,
    format: r.format || 'Print', genre: r.genre || '', mood: r.mood || '', themes: r.themes || '',
    fiction: r.fiction || 'Fiction', series: r.series || 'Stand-alone',
    notes: r.notes || '', start: r.start_date || '', end: r.end_date || '',
    days: r.days || 0, ppd: r.ppd || 0, origin: r.origin || '',
    retroThoughts: r.retro_thoughts || '', coverId: r.cover_id || null,
    olKey: r.ol_key || null, isbn: r.isbn || '', description: r.description || '',
    status: r.status || 'finished', importSource: r.import_source || '',
    _enriched: !!r.cover_id
  };
}

function bookToDb(b) {
  const nn = v => (v === '' || v === 0 || v === null || v === undefined) ? null : v;
  const ns = v => v || '';
  return {
    user_id: currentUser.id, num: nn(b.num), title: b.title, author: ns(b.author),
    rating: nn(b.rating), retro: nn(b.retro), pages: nn(b.pages), year: nn(b.year),
    format: ns(b.format), genre: ns(b.genre), mood: ns(b.mood), themes: ns(b.themes),
    fiction: ns(b.fiction), series: ns(b.series), notes: ns(b.notes),
    start_date: nn(b.start), end_date: nn(b.end), days: nn(b.days), ppd: nn(b.ppd),
    origin: ns(b.origin), retro_thoughts: ns(b.retroThoughts),
    cover_id: nn(b.coverId), ol_key: nn(b.olKey), isbn: ns(b.isbn),
    description: ns(b.description), status: b.status || 'finished',
    import_source: ns(b.importSource)
  };
}

async function saveBook(b) {
  if (b.id && typeof b.id === 'string' && b.id.includes('-')) {
    const { error } = await sb.from('books').update(bookToDb(b)).eq('id', b.id);
    if (error) console.error('Update:', error);
  } else {
    const { data, error } = await sb.from('books').insert(bookToDb(b)).select().single();
    if (error) { console.error('Insert:', error); return; }
    b.id = data.id;
  }
}

async function deleteBook(id) {
  const { error } = await sb.from('books').delete().eq('id', id);
  if (error) { console.error('Delete:', error); return false; }
  return true;
}

/* ── ENRICHMENT ────────────────────────────────────────────────────────── */
async function enrichMissing() {
  const needs = books.filter(b => !b.coverId && !b._enriching);
  if (!needs.length) return;
  document.getElementById('enrich-bar').style.display = 'flex';
  for (let i = 0; i < needs.length; i++) {
    const b = needs[i]; b._enriching = true;
    document.getElementById('enrich-msg').textContent = `Fetching covers… ${i+1}/${needs.length}`;
    try {
      const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(b.author)}&limit=1`);
      const d = await r.json(); const doc = d.docs?.[0];
      if (doc) {
        b.coverId = doc.cover_i || null; b.olKey = doc.key || null;
        b.description = doc.first_sentence?.value || b.description || '';
        b._enriched = true; await saveBook(b); renderBooks();
      }
    } catch(e) {}
    await new Promise(res => setTimeout(res, 150));
  }
  document.getElementById('enrich-bar').style.display = 'none';
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
  const avg = (fin.reduce((s,b) => s+b.rating, 0) / fin.length).toFixed(1);
  const pb  = fin.filter(b => b.ppd > 0);
  const avgPace = pb.length ? Math.round(pb.reduce((s,b) => s+b.ppd, 0) / pb.length) : 0;
  document.getElementById('quick-stats').innerHTML = `
    <div class="stat"><div class="stat-l">Finished</div><div class="stat-v">${fin.length}</div></div>
    <div class="stat"><div class="stat-l">Reading</div><div class="stat-v">${books.filter(b=>b.status==='reading').length}</div></div>
    <div class="stat"><div class="stat-l">To read</div><div class="stat-v">${books.filter(b=>b.status==='tbr').length}</div></div>
    <div class="stat"><div class="stat-l">Avg rating</div><div class="stat-v">${avg}</div><div class="stat-s">out of 10</div></div>
    <div class="stat"><div class="stat-l">Pages read</div><div class="stat-v">${fin.reduce((s,b)=>s+b.pages,0).toLocaleString()}</div></div>
    <div class="stat"><div class="stat-l">Avg pace</div><div class="stat-v">${avgPace}</div><div class="stat-s">p/day</div></div>`;
}

/* ── RETRO DUE SECTION ─────────────────────────────────────────────────── */
function renderRetroDue() {
  const due = books.filter(isRetroDue);
  const sec = document.getElementById('retro-due-section');
  if (!due.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `
    <div class="retro-due-section">
      <div class="retro-due-header">
        <div class="retro-due-label">Due for reflection</div>
        <div class="retro-due-badge">${due.length}</div>
      </div>
      <div class="retro-due-strip">
        ${due.map(b => {
          const cid = b.coverId;
          const yearAgo = new Date(b.end);
          yearAgo.setFullYear(yearAgo.getFullYear() + 1);
          const daysOverdue = Math.floor((new Date() - yearAgo) / 86400000);
          const overdueTxt = daysOverdue <= 7
            ? 'Just hit one year'
            : `${Math.floor(daysOverdue/30) || 1} month${Math.floor(daysOverdue/30)!==1?'s':''} overdue`;
          return `<div class="retro-due-card" onclick="openBookPage('${b.id}')">
            <div class="retro-dot"></div>
            ${cid
              ? `<img class="retro-due-cover" src="${cUrl(cid)}" alt="" loading="lazy" onerror="this.style.display='none'">`
              : `<div class="retro-due-cover-ph">📖</div>`}
            <div>
              <div class="retro-due-title">${b.title}</div>
              <div class="retro-due-author">${b.author}</div>
              <div class="retro-due-info">Rated ${b.rating}/10 · ${overdueTxt}</div>
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
  sec.innerHTML = `
    <div class="sec-label" style="margin-bottom:8px">Currently reading</div>
    <div class="cr-strip">
      ${reading.map(b => {
        const cid = b.coverId;
        return `<div class="cr-card" onclick="openBookPage('${b.id}')">
          ${cid ? `<img class="cr-cover" src="${cUrl(cid)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="cr-cover-ph">📖</div>`}
          <div><div class="cr-title">${b.title}</div><div class="cr-author">${b.author}</div><div class="cr-pill">Reading</div></div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderTBR() {
  const tbr = books.filter(b => b.status === 'tbr');
  const sec = document.getElementById('tbr-section');
  if (!tbr.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `
    <div class="sec-label" style="margin-bottom:8px">To be read <span style="font-weight:400;color:var(--tx2)">(${tbr.length})</span></div>
    <div class="tbr-strip">
      ${tbr.map(b => {
        const cid = b.coverId;
        return `<div class="tbr-item" onclick="openBookPage('${b.id}')">
          <div class="tbr-cover">
            ${cid ? `<img src="${cUrl(cid)}" alt="" loading="lazy">` : `<div class="tbr-cover-ph"><span>${b.title}</span></div>`}
          </div>
          <div class="tbr-badge">TBR</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderBooks() {
  const q   = (document.getElementById('q')?.value || '').toLowerCase();
  const gf  = document.getElementById('gf')?.value || '';
  const mf  = document.getElementById('mf')?.value || '';
  const ff  = document.getElementById('ff')?.value || '';
  const fin = books.filter(b => b.status === 'finished');

  // Rebuild filter dropdowns
  const genres = new Set(); fin.forEach(b => parseTags(b.genre).forEach(g => genres.add(g)));
  const moods  = new Set(); fin.forEach(b => parseTags(b.mood).forEach(m => moods.add(m)));
  const gsel = document.getElementById('gf'); const gcur = gsel.value;
  gsel.innerHTML = '<option value="">All genres</option>';
  [...genres].sort().forEach(g => { const o = document.createElement('option'); o.value=g; o.textContent=g; if(g===gcur)o.selected=true; gsel.appendChild(o); });
  const msel = document.getElementById('mf'); const mcur = msel.value;
  msel.innerHTML = '<option value="">All moods</option>';
  [...moods].sort().forEach(m => { const o = document.createElement('option'); o.value=m; o.textContent=m; if(m===mcur)o.selected=true; msel.appendChild(o); });

  let list = fin.filter(b =>
    (!q  || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) &&
    (!gf || b.genre.toLowerCase().includes(gf.toLowerCase())) &&
    (!mf || b.mood.toLowerCase().includes(mf.toLowerCase())) &&
    (!ff || b.format === ff)
  );
  if (sort === 'rating') list.sort((a,b) => b.rating - a.rating);
  else if (sort === 'speed') list.sort((a,b) => b.ppd - a.ppd);
  else list.sort((a,b) => new Date(b.end) - new Date(a.end));

  if (!list.length) {
    document.getElementById('shelf').innerHTML = `<div class="empty"><div class="empty-icon">📚</div>${
      !q&&!gf&&!mf&&!ff
        ? 'Your finished library is empty.<br><br><span style="font-size:12px">Go to <strong>Add Book</strong> to get started.</span>'
        : 'No books match your filters.'
    }</div>`;
    return;
  }

  document.getElementById('shelf').innerHTML = list.map(b => {
    const cid  = b.coverId;
    const due  = isRetroDue(b);
    const cover = cid
      ? `<img src="${cUrl(cid)}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${b.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const ph = `<div class="cover-ph"${cid?' style="display:none"':''}><span>${b.title}</span></div>`;
    const iflag = b.importSource === 'goodreads'
      ? `<span class="import-flag" style="background:var(--amber-l);color:var(--amber)">GR</span>`
      : b.importSource === 'storygraph'
      ? `<span class="import-flag" style="background:var(--purple-l);color:var(--purple)">SG</span>` : '';
    const date = b.end ? new Date(b.end).toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '';
    return `<div class="book-card">
      ${due ? '<div class="retro-due-dot" title="Due for reflection"></div>' : ''}
      <div class="card-acts">
        <button class="cact cact-edit" onclick="event.stopPropagation();openEdit('${b.id}')" title="Edit">✎</button>
        <button class="cact cact-del" onclick="event.stopPropagation();openDel('${b.id}')" title="Delete">✕</button>
      </div>
      <div class="cover-wrap" onclick="openBookPage('${b.id}')">${cover}${ph}
        <div class="rpip ${pipC(b.rating)}">${b.rating||'—'}</div>
      </div>
      <div onclick="openBookPage('${b.id}')">
        <div class="card-title">${b.title}${iflag}</div>
        <div class="card-author">${b.author}</div>
        ${b.rating ? `<div class="card-stars">${toStars(b.rating)}</div>` : ''}
        ${date ? `<div class="card-date">${date}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function setSort(s) {
  sort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('sb-'+s).classList.add('on');
  renderBooks();
}

/* ── GLOBAL SEARCH ─────────────────────────────────────────────────────── */
let gsearchDebounce = null;

function gsearchInput() {
  const q = document.getElementById('gsearch-input').value.trim();
  const clearBtn = document.getElementById('gsearch-clear');
  clearBtn.classList.toggle('visible', q.length > 0);
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
  document.getElementById('gsearch-input').value = '';
  document.getElementById('gsearch-clear').classList.remove('visible');
  closeGsearch();
}

function closeGsearch() {
  document.getElementById('gsearch-results').classList.remove('open');
  gsearchResults = []; gsearchIdx = -1;
}

async function doGsearch(q) {
  const box = document.getElementById('gsearch-results');
  box.innerHTML = `<div class="gsearch-loading"><div class="spinner"></div>Searching…</div>`;
  box.classList.add('open');
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=7&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median`);
    const d = await r.json();
    gsearchResults = d.docs || [];
    if (!gsearchResults.length) {
      box.innerHTML = `<div class="gsearch-empty">No results found.</div>`;
      return;
    }
    box.innerHTML = gsearchResults.map((res, i) => {
      const inLib = books.find(b => b.olKey === res.key || b.title.toLowerCase() === res.title.toLowerCase());
      const cid = res.cover_i;
      const author = (res.author_name || []).slice(0,2).join(', ') || 'Unknown author';
      return `<div class="gsearch-result" id="gsr-${i}" onclick="gsearchSelect(${i})">
        ${cid
          ? `<img class="gsearch-result-cover" src="${cUrl(cid,'S')}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="gsearch-result-cover-ph">📖</div>`}
        <div style="flex:1;min-width:0">
          <div class="gsearch-result-title">${res.title}</div>
          <div class="gsearch-result-author">${author}</div>
          <div class="gsearch-result-meta">${[res.first_publish_year, res.number_of_pages_median ? '~'+res.number_of_pages_median+' pages' : ''].filter(Boolean).join(' · ')}</div>
          ${inLib ? `<div class="gsearch-in-lib">In your library${inLib.rating?' · '+inLib.rating+'/10':''}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    box.innerHTML = `<div class="gsearch-empty">Search failed. Check your connection.</div>`;
  }
}

function gsearchKey(e) {
  const results = document.getElementById('gsearch-results');
  if (!results.classList.contains('open')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    gsearchIdx = Math.min(gsearchIdx + 1, gsearchResults.length - 1);
    highlightGsearch();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    gsearchIdx = Math.max(gsearchIdx - 1, 0);
    highlightGsearch();
  } else if (e.key === 'Enter' && gsearchIdx >= 0) {
    e.preventDefault();
    gsearchSelect(gsearchIdx);
  } else if (e.key === 'Escape') {
    closeGsearch();
  }
}

function highlightGsearch() {
  document.querySelectorAll('.gsearch-result').forEach((el, i) => {
    el.style.background = i === gsearchIdx ? 'var(--amber-l)' : '';
  });
}

function gsearchSelect(i) {
  const res = gsearchResults[i]; if (!res) return;
  closeGsearch();
  document.getElementById('gsearch-input').value = '';
  document.getElementById('gsearch-clear').classList.remove('visible');
  // Check if already in library
  const inLib = books.find(b => b.olKey === res.key || b.title.toLowerCase() === res.title.toLowerCase());
  if (inLib) {
    openBookPage(inLib.id);
  } else {
    openUnreadBookPage(res);
  }
}

// Close search when clicking outside
document.addEventListener('click', e => {
  if (!document.getElementById('gsearch-wrap')?.contains(e.target)) closeGsearch();
});

/* ── UNREAD BOOK PAGE ──────────────────────────────────────────────────── */
async function openUnreadBookPage(olBook) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.getElementById('p-book').classList.add('on');

  const author = (olBook.author_name || []).slice(0,2).join(', ') || 'Unknown author';
  const coverSrc = olBook.cover_i ? cUrl(olBook.cover_i, 'L') : null;

  document.getElementById('p-book').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="go('library')">← Back</div>
    </div>
    <div class="bp-unread-banner">
      <div class="bp-unread-text">This book isn't in your library yet.</div>
      <div class="bp-add-btns">
        <button class="bp-add-btn bp-add-btn-tbr" onclick="quickAddBook('tbr','${esc(olBook.key)}','${esc(olBook.title)}','${esc(author)}',${olBook.cover_i||'null'},${olBook.first_publish_year||'null'},${olBook.number_of_pages_median||'null'})">+ Add to TBR</button>
        <button class="bp-add-btn bp-add-btn-reading" onclick="quickAddBook('reading','${esc(olBook.key)}','${esc(olBook.title)}','${esc(author)}',${olBook.cover_i||'null'},${olBook.first_publish_year||'null'},${olBook.number_of_pages_median||'null'})">+ Currently reading</button>
        <button class="bp-add-btn bp-add-btn-finished" onclick="go('add')">+ Add as finished</button>
      </div>
    </div>
    <div class="bp-hero">
      <div class="bp-img">
        ${coverSrc ? `<img src="${coverSrc}" alt="${esc(olBook.title)}" loading="lazy">` : `<div class="bp-img-ph"><span>${esc(olBook.title)}</span></div>`}
      </div>
      <div>
        <div class="bp-title">${esc(olBook.title)}</div>
        <div class="bp-author">${esc(author)}${olBook.first_publish_year ? ' · ' + olBook.first_publish_year : ''}</div>
        <div id="unread-desc" style="font-size:14px;line-height:1.7;color:var(--tx1);margin-top:10px">Loading description…</div>
      </div>
    </div>
    <div class="bp-body">
      <div>
        <div class="ai-sec">
          <div class="ai-head">
            <div class="ai-t">Would you like this book?</div>
            <button class="ai-btn" id="ai-gen-btn" onclick="genUnreadAnalysis('${esc(olBook.key)}','${esc(olBook.title)}','${esc(author)}')">✦ Analyse for me</button>
          </div>
          <div id="ai-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click to get a personalised take based on your reading history.</div></div>
        </div>
        <div class="sim-sec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="ai-t">Similar books in your library</div>
          </div>
          <div id="sim-result">${renderSimilarFromLibrary(olBook.title, author)}</div>
        </div>
      </div>
      <div>
        <div class="scard"><div class="scard-t">Open Library data</div><div id="ol-data"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
      </div>
    </div>
  </div>`;

  loadUnreadOLData(olBook);
}

function renderSimilarFromLibrary(title, author) {
  // Show books by same author or same genre as a starting point
  const sameAuthor = books.filter(b =>
    b.author.toLowerCase().includes(author.split(' ').slice(-1)[0].toLowerCase()) &&
    b.status === 'finished'
  ).slice(0, 3);
  if (!sameAuthor.length) return `<div style="font-size:13px;color:var(--tx1);font-style:italic">Use "Find similar" on books in your library to discover related reads.</div>`;
  return sameAuthor.map(b => {
    return `<div class="sim-book" onclick="openBookPage('${b.id}')">
      ${b.coverId ? `<img class="sim-cover" src="${cUrl(b.coverId,'S')}" alt="" loading="lazy">` : `<div class="sim-cover-ph">📖</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Lora',serif;font-size:13px;font-weight:500;margin-bottom:2px">${b.title}</div>
        <div style="font-size:11px;color:var(--tx1);margin-bottom:3px">${b.author}</div>
        <span class="sim-inlib">In your library · ${b.rating}/10</span>
      </div>
    </div>`;
  }).join('');
}

async function loadUnreadOLData(olBook) {
  try {
    if (!olBook.key) return;
    const r = await fetch(`https://openlibrary.org${olBook.key}.json`);
    const work = await r.json();
    const desc = typeof work.description === 'string'
      ? work.description : (work.description?.value || '');
    if (desc) {
      document.getElementById('unread-desc').textContent = desc.slice(0, 500) + (desc.length > 500 ? '…' : '');
    } else {
      document.getElementById('unread-desc').textContent = 'No description available.';
    }
    const ra = work.ratings_average ? parseFloat(work.ratings_average).toFixed(1) : null;
    const rc = work.ratings_count ? work.ratings_count.toLocaleString() : null;
    document.getElementById('ol-data').innerHTML =
      `${ra ? `<div style="margin-bottom:10px"><div style="font-size:30px;font-family:'Lora',serif;font-weight:500;color:var(--amber)">${ra}<span style="font-size:14px;opacity:.5">/5</span></div><div style="font-size:12px;color:var(--tx1)">On Open Library${rc ? ' · '+rc+' ratings' : ''}</div></div>` : ''}
       ${work.first_publish_date ? `<div class="ol-row"><span style="color:var(--tx2)">First published</span><span style="font-weight:500">${work.first_publish_date}</span></div>` : ''}`;
  } catch(e) {
    document.getElementById('ol-data').innerHTML = '<div style="font-size:12px;color:var(--tx1)">Could not load data.</div>';
    if (document.getElementById('unread-desc'))
      document.getElementById('unread-desc').textContent = 'Could not load description.';
  }
}

async function quickAddBook(status, olKey, title, author, coverId, year, pages) {
  const newBook = {
    num: books.length + 1, title, author,
    rating: 0, retro: 0,
    pages: pages || 0, year: year || 0,
    format: 'Print', genre: '', mood: '', themes: '',
    fiction: 'Fiction', series: 'Stand-alone',
    notes: '', start: '', end: '', days: 0, ppd: 0,
    origin: '', retroThoughts: '',
    coverId: coverId || null, olKey: olKey || null,
    isbn: '', description: '', status, importSource: ''
  };
  await saveBook(newBook);
  books.unshift(newBook);
  renderLibrary();
  go('library');
}

async function genUnreadAnalysis(olKey, title, author) {
  if (!apiKey) { alert('Add your Anthropic API key in the Ask AI tab first.'); return; }
  const btn = document.getElementById('ai-gen-btn');
  btn.disabled = true; btn.textContent = 'Generating…';
  document.getElementById('ai-result').innerHTML = `<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Analysing your history…</div>`;
  const hist = books.filter(x => x.status === 'finished').map(bk =>
    `"${bk.title}" by ${bk.author}: ${bk.rating}/10 (retro:${bk.retro}/10). Genre:${bk.genre}. Notes:"${bk.notes||'none'}"`
  ).join('\n');
  let desc = document.getElementById('unread-desc')?.textContent || '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:600, messages:[{ role:'user', content:
        `Would this reader enjoy "${title}" by ${author}?\nDescription: ${desc}\nTheir reading history:\n${hist}\nProvide:\nPREDICTED: [1-10]\nANALYSIS: [3-4 sentences referencing specific books from history]`
      }]})
    });
    const data = await r.json(); if (data.error) throw new Error(data.error.message);
    const text = data.content?.map(c => c.text||'').join('') || '';
    const pred = text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)/i);
    const anal = text.match(/ANALYSIS:\s*([\s\S]+)/i);
    document.getElementById('ai-result').innerHTML =
      `${pred ? `<div class="ai-pred"><span>Predicted rating</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>` : ''}
       <div style="font-size:14px;line-height:1.7">${(anal ? anal[1].trim() : text).replace(/\n/g,'<br>')}</div>`;
  } catch(e) {
    document.getElementById('ai-result').innerHTML = `<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`;
  }
  btn.disabled = false; btn.innerHTML = '✦ Regenerate';
}

/* ── BOOK PAGE (library books) ─────────────────────────────────────────── */
async function openBookPage(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.getElementById('p-book').classList.add('on');
  const coverSrc = b.coverId ? cUrl(b.coverId, 'L') : null;
  const gtags = parseTags(b.genre).map(g => `<span class="bptag bptag-g">${g}</span>`).join('');
  const mtags = parseTags(b.mood).map(m => `<span class="bptag bptag-m">${m}</span>`).join('');
  const ttags = parseTags(b.themes).map(t => `<span class="bptag bptag-t">${t}</span>`).join('');
  const ibadge = b.importSource === 'goodreads'
    ? '<span style="font-size:10px;background:var(--amber-l);color:var(--amber);padding:2px 8px;border-radius:100px;display:inline-block;margin-bottom:10px">Imported from Goodreads — rating converted from 5-star scale</span>'
    : b.importSource === 'storygraph'
    ? '<span style="font-size:10px;background:var(--purple-l);color:var(--purple);padding:2px 8px;border-radius:100px;display:inline-block;margin-bottom:10px">Imported from StoryGraph</span>' : '';
  const due = isRetroDue(b);

  document.getElementById('p-book').innerHTML = `<div class="bp">
    <div class="bp-nav">
      <div class="bp-back" onclick="go('library')">← Back</div>
      <button class="bp-edit-btn" onclick="openEdit('${b.id}')">Edit</button>
    </div>
    ${ibadge}
    ${due ? `<div class="retro-prompt" id="retro-prompt-box">
      <div class="retro-prompt-head"><span class="retro-prompt-icon">✦</span><div class="retro-prompt-title">Time for a retrospective</div></div>
      <div class="retro-prompt-sub">It's been a year since you finished <em>${b.title}</em>. How do you feel about it now?</div>
      <div class="retro-form">
        <div class="retro-rating-row">
          <span class="retro-rating-label">Retrospective rating</span>
          <input class="retro-rating-input" type="number" id="retro-rating-inp" min="1" max="10" placeholder="1–10" value="${b.rating}">
          <span style="font-size:12px;color:var(--tx1)">out of 10</span>
        </div>
        <textarea class="retro-textarea" id="retro-thoughts-inp" placeholder="What do you remember? Has your opinion changed?">${b.retroThoughts || ''}</textarea>
        <button class="retro-save-btn" onclick="saveRetro('${b.id}')">Save reflection</button>
      </div>
    </div>` : ''}
    <div class="bp-hero">
      <div class="bp-img">
        ${coverSrc ? `<img src="${coverSrc}" alt="${b.title}" loading="lazy">` : `<div class="bp-img-ph"><span>${b.title}</span></div>`}
      </div>
      <div>
        <div class="bp-title">${b.title}</div>
        <div class="bp-author">${b.author}${b.year ? ' · '+b.year : ''}</div>
        <div class="bp-tags">${gtags}${mtags}${ttags}<span class="bptag">${b.format}</span><span class="bptag">${b.series}</span></div>
        <div class="bp-scores">
          <div class="bps"><div class="bps-l">Your rating</div><div class="bps-v ${scC(b.rating)}">${b.rating||'—'}<span style="font-size:12px;opacity:.6">${b.rating?'/10':''}</span></div>${b.rating?`<div class="bps-stars">${toStars(b.rating)}</div>`:''}</div>
          <div class="bps"><div class="bps-l">Retrospective</div><div class="bps-v ${scC(b.retro)}">${b.retro||'—'}<span style="font-size:12px;opacity:.6">${b.retro?'/10':''}</span></div>${b.retro?`<div class="bps-stars">${toStars(b.retro)}</div>`:''}</div>
          <div class="bps"><div class="bps-l">Pages</div><div class="bps-v">${b.pages||'—'}</div></div>
          <div class="bps"><div class="bps-l">Pace</div><div class="bps-v">${b.ppd?Math.round(b.ppd):'—'}<span style="font-size:10px;opacity:.6">${b.ppd?' p/d':''}</span></div></div>
        </div>
        <div class="bp-ri">
          ${b.start?`<div class="bp-ri-item"><div class="bp-ri-l">Started</div><div>${new Date(b.start).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>`:''}
          ${b.end?`<div class="bp-ri-item"><div class="bp-ri-l">Finished</div><div>${new Date(b.end).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>`:''}
          ${b.days?`<div class="bp-ri-item"><div class="bp-ri-l">Duration</div><div>${b.days} days</div></div>`:''}
          ${b.origin?`<div class="bp-ri-item"><div class="bp-ri-l">Source</div><div>${b.origin}</div></div>`:''}
        </div>
      </div>
    </div>
    <div class="bp-body">
      <div>
        ${b.description?`<div class="bpsec"><div class="bpsec-t">About this book</div><div style="font-size:14px;line-height:1.7">${b.description}</div></div>`:''}
        ${b.notes?`<div class="bpsec"><div class="bpsec-t">Notes while reading</div><div style="font-size:14px;line-height:1.7">${b.notes}</div></div>`:''}
        ${b.retroThoughts?`<div class="bpsec"><div class="retro-pill">Retrospective</div><div style="font-size:14px;line-height:1.7;margin-top:6px">${b.retroThoughts}</div></div>`:''}
        <div class="ai-sec">
          <div class="ai-head"><div class="ai-t">AI analysis for you</div><button class="ai-btn" id="ai-gen-btn" onclick="genAnalysis('${b.id}')">✦ Generate analysis</button></div>
          <div id="ai-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click "Generate analysis" for a personalised take based on your reading history.</div></div>
        </div>
        <div class="sim-sec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="ai-t">Similar books you might enjoy</div>
            <button class="ai-btn" id="sim-btn" onclick="genSimilar('${b.id}')" style="background:var(--purple)">✦ Find similar</button>
          </div>
          <div id="sim-result"><div style="font-size:13px;color:var(--tx1);font-style:italic">Click "Find similar" for AI-curated recommendations.</div></div>
        </div>
      </div>
      <div>
        <div class="scard"><div class="scard-t">Open Library data</div><div id="ol-data"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
        <div class="scard"><div class="scard-t">Also by ${b.author.split(' ').slice(-1)[0]}</div><div id="also-by"><div style="font-size:12px;color:var(--tx1)">Loading…</div></div></div>
      </div>
    </div>
  </div>`;
  loadOLData(b); loadAlsoBy(b);
}

/* ── RETRO SAVE ────────────────────────────────────────────────────────── */
async function saveRetro(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  const rating = parseFloat(document.getElementById('retro-rating-inp').value) || 0;
  const thoughts = document.getElementById('retro-thoughts-inp').value.trim();
  b.retro = rating; b.retroThoughts = thoughts;
  await saveBook(b);
  document.getElementById('retro-prompt-box').innerHTML =
    `<div style="padding:14px;font-size:13px;color:var(--teal);background:var(--teal-l);border-radius:var(--rl)">✓ Reflection saved. Retrospective rating: ${rating}/10</div>`;
  chartsDrawn = false;
  renderRetroDue();
  renderBooks();
}

/* ── OL DATA ───────────────────────────────────────────────────────────── */
async function loadOLData(b) {
  try {
    if (!b.olKey) {
      const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(b.author)}&limit=1`);
      const d = await r.json(); const doc = d.docs?.[0];
      if (doc) { b.olKey = doc.key||null; b.coverId = b.coverId||doc.cover_i||null; await saveBook(b); }
    }
    if (!b.olKey) { document.getElementById('ol-data').innerHTML = '<div style="font-size:12px;color:var(--tx1)">Not found on Open Library.</div>'; return; }
    const r2 = await fetch(`https://openlibrary.org${b.olKey}.json`); const work = await r2.json();
    const desc = typeof work.description === 'string' ? work.description : (work.description?.value||'');
    if (desc && !b.description) { b.description = desc.slice(0,400)+(desc.length>400?'…':''); await saveBook(b); }
    const ra = work.ratings_average ? parseFloat(work.ratings_average).toFixed(1) : null;
    const rc = work.ratings_count ? work.ratings_count.toLocaleString() : null;
    document.getElementById('ol-data').innerHTML =
      `${ra?`<div style="margin-bottom:10px"><div style="font-size:30px;font-family:'Lora',serif;font-weight:500;color:var(--amber)">${ra}<span style="font-size:14px;opacity:.5">/5</span></div><div style="font-size:12px;color:var(--tx1)">On Open Library${rc?' · '+rc+' ratings':''}</div></div>`:''}
       ${work.first_publish_date?`<div class="ol-row"><span style="color:var(--tx2)">First published</span><span style="font-weight:500">${work.first_publish_date}</span></div>`:''}
       ${b.isbn?`<div class="ol-row"><span style="color:var(--tx2)">ISBN</span><span style="font-family:monospace;font-size:11px">${b.isbn}</span></div>`:''}`;
  } catch(e) { document.getElementById('ol-data').innerHTML = '<div style="font-size:12px;color:var(--tx1)">Could not load data.</div>'; }
}

async function loadAlsoBy(b) {
  try {
    const r = await fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(b.author)}&limit=6&fields=key,title,cover_i,first_publish_year`);
    const d = await r.json();
    const others = (d.docs||[]).filter(x => x.title.toLowerCase() !== b.title.toLowerCase()).slice(0,4);
    if (!others.length) { document.getElementById('also-by').innerHTML = '<div style="font-size:12px;color:var(--tx1)">No other works found.</div>'; return; }
    document.getElementById('also-by').innerHTML = others.map(w => {
      const inLib = books.find(x => x.title.toLowerCase() === w.title.toLowerCase());
      return `<div style="display:flex;gap:9px;padding:7px 0;border-bottom:0.5px solid var(--bd)">
        ${w.cover_i?`<img src="${cUrl(w.cover_i,'S')}" style="width:26px;height:39px;object-fit:cover;border-radius:3px;flex-shrink:0" loading="lazy">`:`<div style="width:26px;height:39px;background:var(--bg2);border-radius:3px;flex-shrink:0"></div>`}
        <div>
          <div style="font-family:'Lora',serif;font-size:12px;font-weight:500;line-height:1.3">${w.title}</div>
          ${w.first_publish_year?`<div style="font-size:10px;color:var(--tx2);margin-top:1px">${w.first_publish_year}</div>`:''}
          ${inLib?`<div style="font-size:10px;background:var(--teal-l);color:var(--teal);padding:1px 5px;border-radius:100px;display:inline-block;margin-top:2px">In library · ${inLib.rating}/10</div>`:''}
        </div>
      </div>`;
    }).join('');
  } catch(e) { document.getElementById('also-by').innerHTML = '<div style="font-size:12px;color:var(--tx1)">Could not load.</div>'; }
}

/* ── AI ────────────────────────────────────────────────────────────────── */
async function genAnalysis(bookId) {
  if (!apiKey) { alert('Add your Anthropic API key in the Ask AI tab first.'); return; }
  const b = books.find(x => x.id === bookId); if (!b) return;
  const btn = document.getElementById('ai-gen-btn'); btn.disabled=true; btn.textContent='Generating…';
  document.getElementById('ai-result').innerHTML = `<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Analysing your history…</div>`;
  const hist = books.filter(x => x.status==='finished').map(bk =>
    `"${bk.title}" by ${bk.author}: ${bk.rating}/10 (retro:${bk.retro}/10). Genre:${bk.genre}. Mood:${bk.mood}. Notes:"${bk.notes||'none'}"`
  ).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:`Analyse whether this reader will enjoy "${b.title}" by ${b.author}.\nHistory:\n${hist}\nGenre:${b.genre} Mood:${b.mood}\nDescription:${b.description||'N/A'}\nProvide:\nPREDICTED: [1-10]\nANALYSIS: [3-4 sentences referencing specific books from history]`}]})});
    const data = await r.json(); if (data.error) throw new Error(data.error.message);
    const text = data.content?.map(c=>c.text||'').join('')||'';
    const pred = text.match(/PREDICTED:\s*(\d+(?:\.\d+)?)/i);
    const anal = text.match(/ANALYSIS:\s*([\s\S]+)/i);
    document.getElementById('ai-result').innerHTML =
      `${pred?`<div class="ai-pred"><span>Predicted rating</span><span class="ai-pred-n">${parseFloat(pred[1])}</span><span style="opacity:.6">/10</span><span style="color:var(--amber);margin-left:4px">${toStars(parseFloat(pred[1]))}</span></div>`:''}
       <div style="font-size:14px;line-height:1.7">${(anal?anal[1].trim():text).replace(/\n/g,'<br>')}</div>`;
  } catch(e) { document.getElementById('ai-result').innerHTML = `<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`; }
  btn.disabled=false; btn.innerHTML='✦ Regenerate';
}

async function genSimilar(bookId) {
  if (!apiKey) { alert('Add your Anthropic API key in the Ask AI tab first.'); return; }
  const b = books.find(x => x.id === bookId); if (!b) return;
  const btn = document.getElementById('sim-btn'); btn.disabled=true; btn.textContent='Finding…';
  document.getElementById('sim-result').innerHTML = `<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--tx1)"><div class="spinner"></div>Finding recommendations…</div>`;
  const hist = books.filter(x => x.status==='finished').map(bk => `"${bk.title}" by ${bk.author}: ${bk.rating}/10`).join(', ');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:`Suggest 4 books similar to "${b.title}" by ${b.author} for this reader.\nLibrary:${hist}\nGenre:${b.genre} Mood:${b.mood}\nDo NOT suggest books in their library.\nRespond ONLY with JSON:\n[{"title":"...","author":"...","reason":"one sentence why"}]`}]})});
    const data = await r.json(); if (data.error) throw new Error(data.error.message);
    let recs = []; try { recs = JSON.parse(data.content?.map(c=>c.text||'').join('').replace(/```json|```/g,'').trim()); } catch(e) {}
    if (!recs.length) { document.getElementById('sim-result').innerHTML='<div style="font-size:13px;color:var(--tx1)">Could not generate recommendations.</div>'; return; }
    document.getElementById('sim-result').innerHTML = '<div id="sim-list"></div>';
    for (const rec of recs) {
      const inLib = books.find(x => x.title.toLowerCase() === rec.title.toLowerCase());
      let coverId = inLib?.coverId || null;
      if (!coverId) { try { const sr=await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(rec.title)}&author=${encodeURIComponent(rec.author)}&limit=1&fields=cover_i`);const sd=await sr.json();coverId=sd.docs?.[0]?.cover_i||null; } catch(e){} }
      const card = document.createElement('div'); card.className='sim-book';
      if (inLib) card.onclick = () => openBookPage(inLib.id);
      card.innerHTML = `${coverId?`<img class="sim-cover" src="${cUrl(coverId,'S')}" alt="" loading="lazy">`:`<div class="sim-cover-ph">📖</div>`}<div style="flex:1;min-width:0"><div style="font-family:'Lora',serif;font-size:13px;font-weight:500;margin-bottom:2px">${rec.title}</div><div style="font-size:11px;color:var(--tx1);margin-bottom:3px">${rec.author}</div><div style="font-size:11px;color:var(--tx2);line-height:1.4">${rec.reason}</div>${inLib?`<span class="sim-inlib">In library · ${inLib.rating}/10</span>`:''}</div>`;
      document.getElementById('sim-list')?.appendChild(card);
    }
  } catch(e) { document.getElementById('sim-result').innerHTML=`<div style="font-size:13px;color:var(--coral)">Error: ${e.message}</div>`; }
  btn.disabled=false; btn.innerHTML='✦ Regenerate';
}

/* ── EDIT / DELETE MODALS ──────────────────────────────────────────────── */
function openEdit(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  document.getElementById('edit-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('edit-modal').classList.remove('on')">×</button>
    <div class="modal-title">Edit — ${b.title}</div>
    <div class="fgrid" style="margin-bottom:12px">
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="e-status">
          <option value="finished"${b.status==='finished'?' selected':''}>Finished</option>
          <option value="reading"${b.status==='reading'?' selected':''}>Currently Reading</option>
          <option value="tbr"${b.status==='tbr'?' selected':''}>To Be Read</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Rating (1–10)</label><input class="fi" type="number" id="e-rating" min="1" max="10" value="${b.rating||''}"></div>
      <div class="fg"><label class="fl">Retrospective rating</label><input class="fi" type="number" id="e-retro" min="1" max="10" value="${b.retro||''}"></div>
      <div class="fg"><label class="fl">Format</label>
        <select class="fi" id="e-format">${['Print','Paperback','Hardcover','EBook','Audiobook'].map(f=>`<option${b.format===f?' selected':''}>${f}</option>`).join('')}</select>
      </div>
      <div class="fg"><label class="fl">Start date</label><input class="fi" type="date" id="e-start" value="${b.start||''}"></div>
      <div class="fg"><label class="fl">End date</label><input class="fi" type="date" id="e-end" value="${b.end||''}"></div>
    </div>
    <div style="margin-bottom:10px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildTagInput('e-genre',b.genre,'genre',GENRES)}</div>
    <div style="margin-bottom:10px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('e-mood',b.mood,'mood',MOODS)}</div>
    <div style="margin-bottom:12px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('e-themes',b.themes,'theme',THEMES)}</div>
    <div class="fg full" style="margin-bottom:10px"><label class="fl">Notes while reading</label><textarea class="fi fta" id="e-notes">${b.notes}</textarea></div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Retrospective thoughts</label><textarea class="fi fta" id="e-retro-notes">${b.retroThoughts}</textarea></div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('edit-modal').classList.remove('on')">Cancel</button>
      <button class="btn-primary" onclick="saveEdit('${b.id}')">Save changes</button>
    </div>`;
  document.getElementById('edit-modal').classList.add('on');
}

async function saveEdit(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  const start = document.getElementById('e-start').value;
  const end   = document.getElementById('e-end').value;
  b.status = document.getElementById('e-status').value;
  b.rating = parseFloat(document.getElementById('e-rating').value)||0;
  b.retro  = parseFloat(document.getElementById('e-retro').value)||0;
  b.format = document.getElementById('e-format').value;
  b.start = start; b.end = end;
  b.days = (start&&end) ? Math.max(1,Math.round((new Date(end)-new Date(start))/86400000)) : b.days;
  b.ppd  = b.days > 0 ? b.pages/b.days : b.ppd;
  b.genre = getTagVal('e-genre'); b.mood = getTagVal('e-mood'); b.themes = getTagVal('e-themes');
  b.notes = document.getElementById('e-notes').value.trim();
  b.retroThoughts = document.getElementById('e-retro-notes').value.trim();
  await saveBook(b);
  document.getElementById('edit-modal').classList.remove('on');
  chartsDrawn = false; renderLibrary();
}

function openDel(bookId) {
  const b = books.find(x => x.id === bookId); if (!b) return;
  document.getElementById('del-body').innerHTML = `
    <button class="modal-x" onclick="document.getElementById('del-modal').classList.remove('on')">×</button>
    <div class="modal-title">Remove book</div>
    <p style="font-size:13px;line-height:1.6;margin-bottom:18px;color:var(--tx1)">Are you sure you want to remove <strong>${b.title}</strong>? This cannot be undone.</p>
    <div class="form-acts">
      <button class="btn-ghost" onclick="document.getElementById('del-modal').classList.remove('on')">Cancel</button>
      <button class="btn-danger" onclick="confirmDel('${bookId}')">Remove</button>
    </div>`;
  document.getElementById('del-modal').classList.add('on');
}

async function confirmDel(bookId) {
  const ok = await deleteBook(bookId);
  if (ok) books = books.filter(x => x.id !== bookId);
  document.getElementById('del-modal').classList.remove('on');
  chartsDrawn = false; renderLibrary();
}

function maybeClose(e, id) { if (e.target.id === id) document.getElementById(id).classList.remove('on'); }

/* ── TAG SYSTEM ────────────────────────────────────────────────────────── */
function buildTagInput(id, value, type, suggs) {
  const tags = parseTags(value);
  const chips = tags.map(t =>
    `<span class="tchip tchip-${type}" data-tag="${esc(t)}">${esc(t)}<span class="tchip-x" onclick="removeTag('${id}','${escQ(t)}')">×</span></span>`
  ).join('');
  const suggBtns = suggs.filter(s => !tags.includes(s)).slice(0,10).map(s =>
    `<button class="tsugg" onclick="addTag('${id}','${escQ(s)}','${type}')">${esc(s)}</button>`
  ).join('');
  return `<div class="tag-wrap" id="${id}-wrap" onclick="document.getElementById('${id}-in').focus()">${chips}<input class="tag-txt" id="${id}-in" placeholder="Type and press Enter…" onkeydown="tagKey(event,'${id}','${type}')"></div><div class="tag-sugg">${suggBtns}</div>`;
}

function addTag(id, tag, type) {
  const wrap = document.getElementById(id+'-wrap'); if (!wrap) return;
  const existing = [...wrap.querySelectorAll('.tchip')].map(el => el.dataset.tag);
  if (existing.includes(tag)) return;
  const chip = document.createElement('span'); chip.className=`tchip tchip-${type}`; chip.dataset.tag=tag;
  chip.innerHTML = `${esc(tag)}<span class="tchip-x" onclick="removeTag('${id}','${escQ(tag)}')">×</span>`;
  wrap.insertBefore(chip, document.getElementById(id+'-in'));
  const sw = wrap.nextElementSibling;
  if (sw) { const btn=[...sw.querySelectorAll('.tsugg')].find(b=>b.textContent===tag); if(btn)btn.style.display='none'; }
}

function removeTag(id, tag) {
  const wrap = document.getElementById(id+'-wrap'); if (!wrap) return;
  const chip = [...wrap.querySelectorAll('.tchip')].find(c => c.dataset.tag===tag); if(chip)chip.remove();
  const sw = wrap.nextElementSibling;
  if (sw) { const btn=[...sw.querySelectorAll('.tsugg')].find(b=>b.textContent===tag); if(btn)btn.style.display=''; }
}

function tagKey(e, id, type) {
  const inp = e.target;
  if ((e.key==='Enter'||e.key===',') && inp.value.trim()) { e.preventDefault(); addTag(id,inp.value.trim(),type); inp.value=''; }
  if (e.key==='Backspace' && !inp.value) {
    const wrap = document.getElementById(id+'-wrap');
    const chips = [...wrap.querySelectorAll('.tchip')];
    if (chips.length) removeTag(id, chips[chips.length-1].dataset.tag);
  }
}

function getTagVal(id) {
  const wrap = document.getElementById(id+'-wrap'); if (!wrap) return '';
  return joinTags([...wrap.querySelectorAll('.tchip')].map(el => el.dataset.tag));
}

/* ── ADD BOOK (OL SEARCH) ──────────────────────────────────────────────── */
async function olSearch() {
  const q = document.getElementById('ol-q').value.trim(); if (!q) return;
  const btn = document.getElementById('ol-btn'); btn.disabled=true; btn.textContent='Searching…';
  selResult=null; selEdition=null;
  document.getElementById('edition-section').style.display='none';
  document.getElementById('book-form').style.display='none';
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,author_name,cover_i,first_publish_year,subject,number_of_pages_median,edition_count`);
    const d = await r.json(); olResults=d.docs||[]; renderOLR();
  } catch(e) {
    document.getElementById('ol-results').innerHTML='<div style="padding:12px;font-size:13px;color:var(--coral)">Search failed.</div>';
    document.getElementById('ol-results').style.display='block';
  }
  btn.disabled=false; btn.textContent='Search';
}

function renderOLR() {
  const el = document.getElementById('ol-results');
  if (!olResults.length) { el.innerHTML='<div class="rlist" style="padding:14px;font-size:13px;color:var(--tx1)">No results found.</div>'; el.style.display='block'; return; }
  el.innerHTML = `<div class="rlist">${olResults.map((r,i) => `
    <div class="ritem" id="ri-${i}" onclick="selRes(${i})">
      ${r.cover_i?`<img class="rcover" src="${cUrl(r.cover_i,'S')}" alt="" loading="lazy">`:`<div class="rcover-ph">📖</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Lora',serif;font-size:14px;font-weight:500;margin-bottom:2px">${r.title}</div>
        <div style="font-size:12px;color:var(--tx1);margin-bottom:2px">${(r.author_name||[]).slice(0,2).join(', ')||'Unknown'}</div>
        <div style="font-size:11px;color:var(--tx2)">${[r.first_publish_year,r.edition_count?r.edition_count+' editions':'',r.number_of_pages_median?'~'+r.number_of_pages_median+' pages':''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`).join('')}</div>`;
  el.style.display='block';
}

async function selRes(i) {
  document.querySelectorAll('.ritem').forEach(el => el.classList.remove('sel'));
  document.getElementById(`ri-${i}`)?.classList.add('sel');
  selResult=olResults[i]; selEdition=null;
  await loadEds(selResult.key);
}

async function loadEds(key) {
  const sec = document.getElementById('edition-section');
  sec.innerHTML=`<div class="edsec"><div style="font-size:12px;color:var(--tx1)">Loading editions…</div></div>`; sec.style.display='block';
  try {
    const r = await fetch(`https://openlibrary.org${key}/editions.json?limit=40`); const d = await r.json();
    editions = (d.entries||[]).map(e => ({
      key:e.key, publishers:(e.publishers||[]).join(', '), year:e.publish_date||'',
      isbn13:(e.isbn_13||[])[0]||(e.isbn_10||[])[0]||'',
      format:gFmt(e), pages:e.number_of_pages||null, coverId:e.covers?.[0]||null
    }));
    renderEds();
  } catch(e) { sec.innerHTML='<div class="edsec"><div style="font-size:13px;color:var(--coral)">Could not load editions.</div></div>'; }
}

function gFmt(e) {
  const f=(e.physical_format||'').toLowerCase();
  if(f.includes('ebook')||f.includes('digital'))return'EBook';
  if(f.includes('audio'))return'Audiobook';
  if(f.includes('hard'))return'Hardcover';
  if(f.includes('paper')||f.includes('mass'))return'Paperback';
  return'Print';
}

function renderEds() {
  const sec=document.getElementById('edition-section');
  const fil=edFilt==='all'?editions:editions.filter(e=>e.format.toLowerCase().includes(edFilt));
  const fc={}; editions.forEach(e=>{fc[e.format]=(fc[e.format]||0)+1;});
  const fbtns=['all',...Object.keys(fc)].map(f=>`<button class="efilt${edFilt===f?' on':''}" onclick="setEF('${f}')">${f==='all'?'All':f}${f!=='all'?' ('+fc[f]+')':''}</button>`).join('');
  const rows=fil.slice(0,20).map(e=>{
    const p=selEdition&&selEdition.key===e.key;
    return `<div class="edrow${p?' picked':''}" onclick="pickEd(${editions.indexOf(e)})">
      ${e.coverId?`<img class="edrow-cover" src="${cUrl(e.coverId,'S')}" alt="" loading="lazy">`:`<div class="edrow-cover-ph"></div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;margin-bottom:2px">${e.format}${e.year?' · '+e.year:''}</div>
        <div style="font-size:11px;color:var(--tx1)">${e.publishers||'Publisher unknown'}${e.pages?' · '+e.pages+' pages':''}</div>
        ${e.isbn13?`<div class="isbn-mono">ISBN: ${e.isbn13}</div>`:''}
      </div>
    </div>`;
  }).join('');
  sec.innerHTML=`<div class="edsec">
    <div style="font-size:12px;font-weight:500;color:var(--tx1);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Select an edition</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${fbtns}</div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto">${rows||'<div style="font-size:13px;color:var(--tx1)">No editions match.</div>'}</div>
  </div>`;
}

function setEF(f){edFilt=f;renderEds();}
function pickEd(i){selEdition=editions[i];edFilt='all';renderEds();buildForm();}

function buildForm() {
  if (!selResult) return;
  const ed=selEdition||{}; const r=selResult;
  const author=(r.author_name||[]).slice(0,2).join(', ')||'';
  const year=ed.year?.match(/\d{4}/)?.[0]||r.first_publish_year||'';
  const fmt=ed.format||'Print'; const coverId=ed.coverId||r.cover_i||null; const isbn=ed.isbn13||'';
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
      <div class="fg"><label class="fl">Format</label>
        <select class="fi" id="f-format">${['Print','Paperback','Hardcover','EBook','Audiobook'].map(f=>`<option${f===fmt?' selected':''}>${f}</option>`).join('')}</select>
      </div>
      <div class="fg"><label class="fl">Pages</label><input class="fi" type="number" id="f-pages" value="${ed.pages||r.number_of_pages_median||''}"></div>
      <div class="fg"><label class="fl">Fiction / Nonfiction</label><select class="fi" id="f-fiction"><option>Fiction</option><option>Nonfiction</option></select></div>
      <div class="fg"><label class="fl">Series</label><select class="fi" id="f-series"><option>Stand-alone</option><option>Series</option></select></div>
      <div class="fg"><label class="fl">Origin</label><input class="fi" id="f-origin" placeholder="Bookstore, Library…"></div>
    </div>
    <div style="margin:12px 0 8px"><div class="fl" style="margin-bottom:5px">Genre</div>${buildTagInput('f-genre',(r.subject||[]).slice(0,3).join(', '),'genre',GENRES)}</div>
    <div style="margin-bottom:8px"><div class="fl" style="margin-bottom:5px">Mood</div>${buildTagInput('f-mood','','mood',MOODS)}</div>
    <div style="margin-bottom:14px"><div class="fl" style="margin-bottom:5px">Themes</div>${buildTagInput('f-themes','','theme',THEMES)}</div>
    <div class="fg full" style="margin-bottom:10px"><label class="fl">Notes while reading</label><textarea class="fi fta" id="f-notes" placeholder="Thoughts while reading…"></textarea></div>
    <div class="fg full" style="margin-bottom:14px"><label class="fl">Retrospective thoughts</label><textarea class="fi fta" id="f-retro" placeholder="How do you feel about it now?"></textarea></div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="resetAdd()">Clear</button>
      <button class="btn-primary" id="submit-book-btn" onclick="submitBook()">Add to library</button>
    </div>
  </div>`;
  document.getElementById('book-form').style.display='block';
  document.getElementById('book-form').dataset.title=r.title;
  document.getElementById('book-form').dataset.author=author;
  document.getElementById('book-form').dataset.year=year;
  document.getElementById('book-form').dataset.coverId=coverId||'';
  document.getElementById('book-form').dataset.olKey=r.key||'';
  document.getElementById('book-form').dataset.genre=(r.subject||[]).slice(0,3).join(', ')||'';
  document.getElementById('book-form').dataset.isbn=isbn;
}

async function submitBook() {
  const fd = document.getElementById('book-form').dataset;
  const title = fd.title; if (!title) { alert('No book selected.'); return; }
  const start = document.getElementById('f-start').value;
  const end   = document.getElementById('f-end').value;
  const pages = parseInt(document.getElementById('f-pages').value)||0;
  const days  = (start&&end) ? Math.max(1,Math.round((new Date(end)-new Date(start))/86400000)) : 0;
  const rating = parseFloat(document.getElementById('f-rating').value)||0;
  const btn = document.getElementById('submit-book-btn');
  btn.disabled=true; btn.textContent='Saving…';
  const newBook = {
    num: books.length+1, title, author: fd.author, rating, retro: rating,
    pages, year: parseInt(fd.year)||new Date().getFullYear(),
    format: document.getElementById('f-format').value,
    genre: getTagVal('f-genre'), mood: getTagVal('f-mood'), themes: getTagVal('f-themes'),
    fiction: document.getElementById('f-fiction').value,
    series: document.getElementById('f-series').value,
    notes: document.getElementById('f-notes').value.trim(),
    start, end, days, ppd: days>0?pages/days:0,
    origin: document.getElementById('f-origin').value.trim(),
    retroThoughts: document.getElementById('f-retro').value.trim(),
    coverId: fd.coverId?parseInt(fd.coverId):null,
    olKey: fd.olKey||null, isbn: fd.isbn||'', description: '',
    status: document.getElementById('f-status').value, importSource: ''
  };
  await saveBook(newBook);
  books.unshift(newBook);
  resetAdd(); renderLibrary(); go('library');
}

function resetAdd() {
  olResults=[]; selResult=null; editions=[]; selEdition=null;
  document.getElementById('ol-q').value='';
  document.getElementById('ol-results').style.display='none';
  document.getElementById('edition-section').style.display='none';
  document.getElementById('book-form').style.display='none';
}

/* ── CSV IMPORT ────────────────────────────────────────────────────────── */
function handleImport(event, platform) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try { const parsed=parseCSV(e.target.result,platform); pendingImport={books:parsed,platform}; showImportPreview(parsed,platform); }
    catch(err) { alert('Could not parse this file: '+err.message); }
  };
  reader.readAsText(file); event.target.value='';
}

function parseFullCSV(text) {
  const rows=[]; let row=[]; let cur=''; let inQ=false;
  const t=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for (let i=0;i<t.length;i++) {
    const ch=t[i];
    if (inQ) {
      if (ch==='"'&&t[i+1]==='"') { cur+='"'; i++; }
      else if (ch==='"') { inQ=false; }
      else { cur+=ch; }
    } else {
      if (ch==='"') { inQ=true; }
      else if (ch===',') { row.push(cur); cur=''; }
      else if (ch==='\n') { row.push(cur); cur=''; if(row.some(c=>c.trim()))rows.push(row); row=[]; }
      else { cur+=ch; }
    }
  }
  row.push(cur); if(row.some(c=>c.trim()))rows.push(row);
  return rows;
}

function parseCSV(text, platform) {
  const allRows=parseFullCSV(text); if(!allRows.length) return [];
  const headers=allRows[0].map(h=>h.trim().toLowerCase());
  const cm={}; headers.forEach((h,i)=>cm[h]=i);
  const get=(row,name)=>{const i=cm[name];return i!==undefined?(row[i]||'').trim():''};
  const results=[];
  for (let i=1;i<allRows.length;i++) {
    const row=allRows[i]; let b=null;
    if (platform==='goodreads') {
      const title=get(row,'title'); if(!title) continue;
      const grR=parseFloat(get(row,'my rating'))||0; const rating=grR>0?grR*2:0;
      const shelf=(get(row,'exclusive shelf')||get(row,'bookshelves')||'').toLowerCase();
      const status=shelf.includes('currently')||shelf.includes('reading')?'reading':shelf.includes('to-read')||shelf.includes('to read')?'tbr':'finished';
      b={title,author:get(row,'author')||get(row,'author l-f'),rating,retro:rating,
        pages:parseInt(get(row,'number of pages'))||0,
        year:parseInt(get(row,'year published'))||parseInt(get(row,'original publication year'))||0,
        format:'Print',genre:'',mood:'',themes:'',fiction:'Fiction',series:'Stand-alone',
        notes:get(row,'my review')||'',start:'',end:fmtDate(get(row,'date read')||''),
        days:0,ppd:0,origin:'Goodreads',retroThoughts:'',coverId:null,olKey:null,
        isbn:get(row,'isbn13')||get(row,'isbn')||'',description:'',
        status,importSource:'goodreads',_ratingConverted:grR>0};
    } else if (platform==='storygraph') {
      const title=get(row,'title'); if(!title) continue;
      const sgR=parseFloat(get(row,'star rating'))||parseFloat(get(row,'my rating'))||0; const rating=sgR>0?sgR*2:0;
      const rs=(get(row,'read status')||get(row,'shelf')||'').toLowerCase();
      const status=rs.includes('currently')||rs==='reading'?'reading':rs.includes('to-read')||rs==='want to read'?'tbr':'finished';
      b={title,author:get(row,'authors')||get(row,'author'),rating,retro:rating,
        pages:parseInt(get(row,'pages read'))||parseInt(get(row,'pages'))||parseInt(get(row,'number of pages'))||0,
        year:parseInt(get(row,'publication year'))||0,format:'Print',
        genre:get(row,'genres')||get(row,'tags')||'',mood:get(row,'moods')||'',themes:'',
        fiction:'Fiction',series:'Stand-alone',notes:get(row,'review')||'',
        start:fmtDate(get(row,'date started')||''),
        end:fmtDate(get(row,'date finished')||get(row,'date read')||''),
        days:0,ppd:0,origin:'StoryGraph',retroThoughts:'',coverId:null,olKey:null,
        isbn:'',description:'',status,importSource:'storygraph',_ratingConverted:sgR>0};
    } else {
      const title=get(row,'title'); if(!title) continue;
      b={title,author:get(row,'author'),
        rating:parseFloat(get(row,'rating'))||0,
        retro:parseFloat(get(row,'retrospective rating'))||parseFloat(get(row,'rating'))||0,
        pages:parseInt(get(row,'pages'))||0,year:parseInt(get(row,'year published'))||0,
        format:get(row,'format')||'Print',genre:get(row,'genre')||'',mood:'',themes:'',
        fiction:get(row,'fiction / nonfiction')||'Fiction',
        series:get(row,'stand-alone or series')||'Stand-alone',
        notes:get(row,'notes')||'',
        start:fmtDate(get(row,'start date')||''),
        end:fmtDate(get(row,'end date')||''),
        days:parseInt(get(row,'days spent reading'))||0,
        ppd:parseFloat(get(row,'pages per day'))||0,
        origin:get(row,'origin of book')||'',
        retroThoughts:get(row,'retrospective thoughts')||'',
        coverId:null,olKey:null,isbn:'',description:'',
        status:'finished',importSource:'pageturner'};
      if (b.start&&b.end&&b.pages&&!b.days) {
        b.days=Math.max(1,Math.round((new Date(b.end)-new Date(b.start))/86400000));
        b.ppd=b.pages/b.days;
      }
    }
    if (b && b.title) results.push(b);
  }
  return results;
}

function fmtDate(s) {
  if (!s||s==='None') return null;
  const d=new Date(s); if(isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}

function showImportPreview(parsed, platform) {
  const fin=parsed.filter(b=>b.status==='finished');
  const reading=parsed.filter(b=>b.status==='reading');
  const tbr=parsed.filter(b=>b.status==='tbr');
  const converted=parsed.filter(b=>b._ratingConverted);
  const platformName=platform==='goodreads'?'Goodreads':platform==='storygraph'?'StoryGraph':'PageTurner';
  const preview=document.getElementById('import-preview');
  preview.style.display='block';
  preview.innerHTML=`<div class="import-preview">
    <div style="font-size:14px;font-weight:500;margin-bottom:3px">Import preview — ${platformName}</div>
    <div style="font-size:12px;color:var(--tx1);margin-bottom:14px">Review before importing.${converted.length?' '+converted.length+' ratings converted from 1–5 to 1–10 scale.':''}</div>
    <div class="ip-stats">
      <div class="ip-stat"><strong>${parsed.length}</strong>Total</div>
      <div class="ip-stat"><strong>${fin.length}</strong>Finished</div>
      <div class="ip-stat"><strong>${reading.length}</strong>Reading</div>
      <div class="ip-stat"><strong>${tbr.length}</strong>TBR</div>
    </div>
    ${converted.length?`<div class="ip-warn">⚠ ${converted.length} ratings multiplied by 2 (5-star → 10-point). You can edit after import.</div>`:''}
    <div class="ip-legend">
      <span><span class="ip-swatch" style="background:var(--bg0);border:0.5px solid var(--bd)"></span>Finished</span>
      <span><span class="ip-swatch" style="background:var(--teal-l)"></span>Reading</span>
      <span><span class="ip-swatch" style="background:var(--purple-l)"></span>TBR</span>
      ${converted.length?`<span><span class="ip-swatch" style="background:#fff8e6"></span>Rating converted</span>`:''}
    </div>
    <div class="ip-table-wrap">
      <table class="ip-table">
        <thead><tr><th>Title</th><th>Author</th><th>Rating</th><th>Status</th></tr></thead>
        <tbody>${parsed.slice(0,50).map(b=>{
          const cls=b.status==='reading'?'ip-read':b.status==='tbr'?'ip-tbr':b._ratingConverted?'ip-conv':'ip-fin';
          return`<tr class="${cls}"><td>${b.title}</td><td>${b.author}</td><td>${b.rating?b.rating+'/10':'-'}</td><td>${b.status==='reading'?'Reading':b.status==='tbr'?'TBR':'Finished'}</td></tr>`;
        }).join('')}${parsed.length>50?`<tr><td colspan="4" style="text-align:center;color:var(--tx1);padding:10px">…and ${parsed.length-50} more</td></tr>`:''}</tbody>
      </table>
    </div>
    <div class="form-acts">
      <button class="btn-ghost" onclick="cancelImport()">Cancel</button>
      <button class="btn-primary" id="confirm-import-btn" onclick="confirmImport()">Import ${parsed.length} book${parsed.length!==1?'s':''}</button>
    </div>
  </div>`;
  preview.scrollIntoView({ behavior:'smooth', block:'start' });
}

function cancelImport() { pendingImport=null; document.getElementById('import-preview').style.display='none'; }

async function confirmImport() {
  if (!pendingImport) return;
  const btn = document.getElementById('confirm-import-btn');
  btn.disabled=true; btn.textContent='Importing…';
  const toInsert = pendingImport.books.map((b,i) => ({...bookToDb({...b, num:books.length+i+1})}));
  const chunkSize = 50;
  let inserted = 0;
  for (let i=0;i<toInsert.length;i+=chunkSize) {
    const chunk = toInsert.slice(i, i+chunkSize);
    const { data, error } = await sb.from('books').insert(chunk).select();
    if (error) {
      console.error('Batch insert error:', error);
      alert('Import failed: '+error.message+'\n\nCheck the browser console for details.');
      btn.disabled=false; btn.textContent='Try again'; return;
    }
    (data||[]).forEach((row,j) => { books.push({...pendingImport.books[i+j], id:row.id, num:row.num}); });
    inserted += chunk.length;
    btn.textContent = `Importing… ${inserted}/${toInsert.length}`;
  }
  pendingImport=null;
  document.getElementById('import-preview').style.display='none';
  renderLibrary(); go('library'); enrichMissing();
  alert(`Imported ${inserted} book${inserted!==1?'s':''} successfully!`);
}

/* ── STATS ─────────────────────────────────────────────────────────────── */
function drawStats() {
  if (chartsDrawn) return; chartsDrawn=true;
  const fin=books.filter(b=>b.status==='finished');
  if (!fin.length) { document.getElementById('stats-cards').innerHTML='<div class="stat"><div class="stat-l">No finished books yet</div></div>'; return; }
  const avg=(fin.reduce((s,b)=>s+b.rating,0)/fin.length).toFixed(1);
  const top=fin.reduce((a,b)=>b.retro>a.retro?b:a);
  const fastArr=fin.filter(b=>b.ppd>0);
  const fast=fastArr.length?fastArr.reduce((a,b)=>b.ppd>a.ppd?b:a):{ppd:0,title:'—'};
  document.getElementById('stats-cards').innerHTML=`
    <div class="stat"><div class="stat-l">Avg rating</div><div class="stat-v">${avg}</div><div class="stat-s">out of 10</div></div>
    <div class="stat"><div class="stat-l">Top retro</div><div class="stat-v" style="font-size:13px">${top.title}</div><div class="stat-s">${top.retro}/10</div></div>
    <div class="stat"><div class="stat-l">Fastest read</div><div class="stat-v" style="font-size:13px">${fast.title}</div><div class="stat-s">${fast.ppd?Math.round(fast.ppd)+' p/day':''}</div></div>
    <div class="stat"><div class="stat-l">Authors</div><div class="stat-v">${new Set(fin.map(b=>b.author)).size}</div></div>`;
  const bkt=Array(10).fill(0); fin.forEach(b=>{if(b.rating>=1&&b.rating<=10)bkt[Math.round(b.rating)-1]++;});
  new Chart(document.getElementById('cRating'),{type:'bar',data:{labels:['1','2','3','4','5','6','7','8','9','10'],datasets:[{data:bkt,backgroundColor:bkt.map((_,i)=>i>=7?'#1D9E75':i>=5?'#BA7517':'#D85A30'),borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{ticks:{stepSize:1},grid:{color:'rgba(128,128,128,0.1)'}}}}});
  const s=[...fin].sort((a,b)=>new Date(a.end)-new Date(b.end)).filter(b=>b.ppd>0);
  new Chart(document.getElementById('cPace'),{type:'bar',data:{labels:s.map(b=>b.title.length>10?b.title.slice(0,10)+'…':b.title),datasets:[{data:s.map(b=>Math.round(b.ppd)),backgroundColor:'#534AB7',borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:'rgba(128,128,128,0.1)'}}}}});
  const fc={}; fin.forEach(b=>{fc[b.format]=(fc[b.format]||0)+1;});
  new Chart(document.getElementById('cFmt'),{type:'doughnut',data:{labels:Object.keys(fc),datasets:[{data:Object.values(fc),backgroundColor:['#1D9E75','#534AB7','#D85A30','#1A6FA8'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:8}}}}});
  new Chart(document.getElementById('cRetro'),{type:'scatter',data:{datasets:[{label:'Books',data:fin.filter(b=>b.rating&&b.retro).map(b=>({x:b.rating,y:b.retro,t:b.title})),backgroundColor:'#BA7517',pointRadius:6,pointHoverRadius:8},{label:'No change',data:[{x:1,y:1},{x:10,y:10}],type:'line',borderColor:'rgba(128,128,128,0.3)',borderDash:[4,4],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw.t?`${c.raw.t} (${c.raw.x}→${c.raw.y})`:''}}},scales:{x:{title:{display:true,text:'Initial rating',font:{size:11}},min:0,max:11},y:{title:{display:true,text:'Retrospective',font:{size:11}},min:0,max:11}}}});
}

/* ── TABS ──────────────────────────────────────────────────────────────── */
function go(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.getElementById('p-'+name).classList.add('on');
  const names=['library','stats','add','chat'];
  document.querySelectorAll('.tab')[names.indexOf(name)]?.classList.add('on');
  if (name==='stats') { chartsDrawn=false; drawStats(); }
  if (name==='library') renderLibrary();
}

/* ── CHAT ──────────────────────────────────────────────────────────────── */
function saveKey() {
  apiKey=document.getElementById('ak').value.trim();
  localStorage.setItem('pt_ak',apiKey);
  document.getElementById('chat-status').textContent=apiKey?'Ready':'Add API key above';
  if(apiKey) alert('Key saved.');
}

function booksCtx() {
  return books.filter(b=>b.status==='finished').map(b=>
    `"${b.title}" by ${b.author}: ${b.rating}/10 (retro:${b.retro}/10). Genre:${b.genre}. Mood:${b.mood}. Themes:${b.themes}. Notes:"${b.notes||'none'}". Thoughts:"${b.retroThoughts||'none'}"`
  ).join('\n');
}

async function sendMsg() {
  const inp=document.getElementById('chat-in'); const msg=inp.value.trim(); if(!msg) return;
  if(!apiKey){alert('Add your Anthropic API key above first.');return;}
  addMsg(msg,'u'); inp.value=''; document.getElementById('send-btn').disabled=true;
  const typing=addTyping(); chatHistory.push({role:'user',content:msg});
  const sys=`You are a personal book advisor with full knowledge of the user's reading history:\n\n${booksCtx()}\n\nThis reader values: rich worldbuilding, developed characters, satisfying narratives. Dislikes: shallow writing, declining series, filler. Be direct, specific, conversational. When recommending, explain WHY and estimate a likely rating (1–10).`;
  try {
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:sys,messages:chatHistory})});
    const d=await r.json(); if(d.error)throw new Error(d.error.message);
    const reply=d.content?.map(c=>c.text||'').join('')||'Sorry, something went wrong.';
    chatHistory.push({role:'assistant',content:reply}); typing.remove(); addMsg(reply,'a');
  } catch(e) { typing.remove(); addMsg(`Error: ${e.message}`,'a'); }
  document.getElementById('send-btn').disabled=false;
}

function addMsg(text, role) {
  const c=document.getElementById('chat-msgs');
  const d=document.createElement('div'); d.className=`msg msg-${role}`;
  d.innerHTML=`<div class="bubble">${text.replace(/\n/g,'<br>')}</div><div class="msg-lbl">${role==='u'?'You':'Book Advisor'}</div>`;
  c.appendChild(d); c.scrollTop=c.scrollHeight; return d;
}

function addTyping() {
  const c=document.getElementById('chat-msgs');
  const d=document.createElement('div'); d.className='msg msg-a';
  d.innerHTML=`<div class="bubble"><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
  c.appendChild(d); c.scrollTop=c.scrollHeight; return d;
}

function chip(t) { document.getElementById('chat-in').value=t; sendMsg(); }
function chatKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }
