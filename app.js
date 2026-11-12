/* 阿輝的書房 — 03 書單的手機 App（2026-11-11 起）
   資料：03 正本 xlsx → 04 的「產生App資料.py」寫進 04/06.App資料/小輝給App/書單.json 的 shelf、ext
        → 借用 04「愈讀樂讀-同步」Apps Script 的 meta/books 讀回來（網址與密語跟 04 App 一樣）。
   只能看、不能改；書單有變只改 03 的 xlsx。
   v0.2.0（11/12）：「🎙️ 歐陽讀書會」分頁＝08 的 books.json＋notes.json，由同一支 產生App資料.py 放進書單.json 的 club。 */
const APP_VERSION = 'v0.2.2';   // v0.2.1（11/12）：底部分頁名改回 Justin Q10 選的「歐陽讀書會」；v0.2.2：說明頁加「🎙️ 歐陽加書」
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600); }

const CATS = ['心理/自我成長', '商業/管理/職場', '投資/理財', '英文/語言學習', '親子/教養', '健康/醫療', '科技/科普', '小說/文學', '其他'];
const ICON = { '心理/自我成長': '🧠', '商業/管理/職場': '💼', '投資/理財': '💰', '英文/語言學習': '📖', '親子/教養': '👨‍👩‍👧', '健康/醫療': '🏥', '科技/科普': '🔬', '小說/文學': '📚', '其他': '📋', '法鼓文化': '🏔️' };
const SRC_NAME = s => ({ 'Kobo購買書單': 'Kobo 購買', '中華電信_網路書城_書單': '中華電信', '博客來_電子書': '博客來電子書' }[s] || s || '—');

/* ---------------- 資料 ---------------- */
let shelf = [], ext = {}, byTitle = new Map(), dataSrc = '', fetchedAt = 0;
let club = { books: [], synced: '' };   // v0.2.0：08 歐陽讀書會（書單.json 的 club）
function index() {
  byTitle = new Map(shelf.map(b => [b.t, b]));
  for (const b of shelf) b._k = norm(b.t + ' ' + (b.a || '') + ' ' + (b.f || ''));   // 法鼓書系名也搜得到
}
async function loadLocal() {
  const d = await kvGet('books');
  shelf = d?.shelf || []; ext = d?.ext || {}; dataSrc = d?.src || '';
  club = d?.club?.books ? d.club : { books: [], synced: '' };
  for (const c of club.books) c._k = norm([c.t, ...c.q, ...Object.values(c.note || {}).flat()].join(' '));
  fetchedAt = (await kvGet('fetchedAt')) || 0;
  index();
}
async function api(action, data = {}, timeoutMs = 60000) {
  const cfg = await kvGet('cfg');
  if (!cfg?.url) throw new Error('還沒填網址');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ pass: cfg.pass, action, ...data }), signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '雲端回了錯誤');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('等太久沒有回應');
    if (e instanceof TypeError) throw new Error('連不上雲端');
    throw e;
  } finally { clearTimeout(t); }
}
/** 6 小時抓一次；設定頁「立刻更新」會強制抓 */
async function refresh(force) {
  const cfg = await kvGet('cfg');
  if (!cfg?.url || !navigator.onLine) return false;
  if (!force && Date.now() - fetchedAt < 6 * 3600e3) return false;
  const r = await api('meta', { what: 'books' });
  if (!r.data?.shelf) throw new Error('雲端書單還沒有完整資料（請小輝重跑產生App資料.py）');
  await kvSet('books', { src: r.data.src, shelf: r.data.shelf, ext: r.data.ext || {}, club: r.data.club || null });
  await kvSet('fetchedAt', Date.now());
  await loadLocal();
  return true;
}

/* ---------------- 搜尋 ---------------- */
// 全形轉半形、去空白和標點，大小寫不分：打「i人理財」「I 人 理財」都找得到
function norm(s) {
  return String(s || '').replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase()
    .replace(/[\s:：，,、。．.·・!！?？「」『』【】\[\]()（）《》〈〉<>\-—–_~～'"“”‘’\/|]/g, '');
}
function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const words = q.trim().split(/\s+/).filter(Boolean).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return t;
  try { return t.replace(new RegExp('(' + words.join('|') + ')', 'gi'), '<mark>$1</mark>'); } catch { return t; }
}
const state = { q: '', cat: '全部', src: '全部', limit: 60 };
function filtered() {
  const words = state.q.trim().split(/\s+/).map(norm).filter(Boolean);
  return shelf.filter(b =>
    (state.cat === '全部' || (state.cat === '法鼓文化' ? !!b.f : (b.c === state.cat && !b.f))) &&
    (state.src === '全部' || b.s === state.src) &&
    words.every(w => b._k.includes(w)));
}

/* ---------------- 畫面 ---------------- */
function bookRow(b, q) {
  const cat = b.f ? `<span class="tag fg">🏔️ 法鼓・${esc(b.f)}</span>` : `<span class="tag">${ICON[b.c] || ''} ${esc(b.c)}</span>`;
  return `<button class="book" data-o="${b.o}"><div class="t">${hl(b.t, q)}</div>
    <div class="m">${b.a ? `<span>${hl(b.a, q)}</span>` : ''}${cat}<span>${esc(SRC_NAME(b.s))}</span>${b.d ? `<span>🆕 ${esc(b.d.slice(5).replace('-', '/'))}</span>` : ''}</div></button>`;
}
function setupNotice() {
  return `<div class="notice">👋 第一次使用：到 <a href="#settings">⚙️ 設定</a> 填<b>寫心得 App（愈讀樂讀）</b>的雲端網址和密語，按「儲存並更新書單」就會把 03 書單抓下來。之後沒有網路也能查。<br><small>怎麼用、怎麼加書，看下面的 <a href="#help" data-h="use">❓ 說明</a>。</small></div>`;
}
async function renderFind() {
  const total = shelf.length;
  const cats = ['全部', '法鼓文化', ...CATS];
  const srcs = ['全部', ...[...new Set(shelf.map(b => b.s))].sort((a, b) => shelf.filter(x => x.s === b).length - shelf.filter(x => x.s === a).length)];
  view.innerHTML = `
    <div class="hero"><img src="ahui-study.webp" alt="阿輝在書房看書">
      <div class="cap"><b>阿輝的書房</b><span>${total ? `共 ${total.toLocaleString()} 本書${dataSrc ? `｜書單 ${esc(dataSrc.match(/(\d{8})/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') || '')}` : ''}` : '還沒抓書單'}</span></div></div>
    ${total ? '' : setupNotice()}
    <div class="searchbar"><input id="q" type="search" placeholder="🔍 打書名或作者，查我有沒有這本" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search">
      <button class="clear" id="clr" aria-label="清除" ${state.q ? '' : 'hidden'}>✕</button></div>
    <div class="chips" id="cats">${cats.map(c => `<button class="chip ${state.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === '全部' ? '全部分類' : (ICON[c] || '') + ' ' + esc(c)}</button>`).join('')}</div>
    <div class="chips" id="srcs">${srcs.map(s => `<button class="chip ${state.src === s ? 'on' : ''}" data-src="${esc(s)}">${s === '全部' ? '全部來源' : esc(SRC_NAME(s))}</button>`).join('')}</div>
    <div class="count" id="cnt"></div><div class="list" id="list"></div>`;
  const draw = () => {
    const rows = filtered();
    $('#cnt').textContent = !total ? '' : (state.q ? `找到 ${rows.length} 本` : `${rows.length.toLocaleString()} 本`) + (rows.length > state.limit ? `，先顯示 ${state.limit} 本` : '');
    $('#list').innerHTML = !total ? '' : rows.length
      ? rows.slice(0, state.limit).map(b => bookRow(b, state.q)).join('') + (rows.length > state.limit ? `<button class="more" id="more">再顯示 60 本</button>` : '')
      : `<div class="empty">📭 書單裡沒有「${esc(state.q)}」${state.cat !== '全部' || state.src !== '全部' ? '<br><small>（目前有篩選分類或來源，試試「全部」）</small>' : '<br><small>可能還沒買過，或書名寫法不一樣，試試少打幾個字</small>'}</div>`;
    $('#more')?.addEventListener('click', () => { state.limit += 60; draw(); });
  };
  draw();
  view.querySelector('.hero').addEventListener('click', () => {   // 點封面看整張阿輝在書房
    const p = document.createElement('div');
    p.className = 'photo'; p.innerHTML = '<img src="ahui-study.webp" alt="阿輝在書房看書">';
    p.addEventListener('click', () => p.remove());
    document.body.appendChild(p);
  });
  const q = $('#q');
  q.addEventListener('input', () => { state.q = q.value; state.limit = 60; $('#clr').hidden = !q.value; draw(); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') q.blur(); });
  $('#clr').addEventListener('click', () => { state.q = ''; q.value = ''; $('#clr').hidden = true; state.limit = 60; draw(); q.focus(); });
  $('#cats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (!c) return; state.cat = c.dataset.cat; state.limit = 60; renderFind(); });
  $('#srcs').addEventListener('click', e => { const c = e.target.closest('[data-src]'); if (!c) return; state.src = c.dataset.src; state.limit = 60; renderFind(); });
}
function renderNew() {
  if (!shelf.length) { view.innerHTML = setupNotice(); return; }
  const dated = shelf.filter(b => b.d).sort((a, b) => b.d.localeCompare(a.d) || b.o - a.o);
  const groups = {};
  dated.forEach(b => (groups[b.d] ||= []).push(b));
  view.innerHTML = `<h2>🆕 最近新增（${dated.length} 本）</h2>`
    + Object.entries(groups).map(([d, bs]) => `<div class="day">${d.replace(/-/g, '/')}　加了 ${bs.length} 本</div><div class="list">${bs.map(b => bookRow(b)).join('')}</div>`).join('')
    + `<p class="small" style="margin-top:16px">2026/10/4 之前加的 ${(shelf.length - dated.length).toLocaleString()} 本沒有記新增日期，到「🔍 找書」查。</p>`;
}
function renderStats() {
  if (!shelf.length) { view.innerHTML = setupNotice(); return; }
  const fg = shelf.filter(b => b.f), gen = shelf.filter(b => !b.f);
  const count = (arr, key) => { const m = {}; arr.forEach(b => { const k = key(b); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bars = (rows, kind) => { const max = Math.max(...rows.map(r => r[1])); return `<div class="bars">${rows.map(([k, n]) =>
    `<div class="bar" data-${kind}="${esc(k)}"><span>${kind === 'cat' ? (ICON[k] || '') + ' ' : ''}${esc(kind === 'src' ? SRC_NAME(k) : k)}</span><i style="width:${Math.max(4, n / max * 100)}%"></i><em>${n}</em></div>`).join('')}</div>`; };
  const series = {};
  fg.forEach(b => b.f.split('、').forEach(s => { series[s] = (series[s] || 0) + 1; }));
  view.innerHTML = `
    <div class="stat-top"><div><b>${shelf.length.toLocaleString()}</b><span>全部</span></div><div><b>${gen.length.toLocaleString()}</b><span>一般書</span></div><div><b>${fg.length}</b><span>法鼓文化</span></div></div>
    <h2>依分類 <span class="small">（點一列看那類的書）</span></h2>${bars([...count(gen, b => b.c), ['法鼓文化', fg.length]].sort((a, b) => b[1] - a[1]), 'cat')}
    <h2>依來源</h2>${bars(count(shelf, b => b.s), 'src')}
    <h2>法鼓文化書系（${Object.keys(series).length} 個）</h2>${bars(Object.entries(series).sort((a, b) => b[1] - a[1]), 'series')}`;
  view.querySelectorAll('.bar').forEach(el => el.addEventListener('click', () => {
    state.q = ''; state.limit = 60;
    if (el.dataset.cat) { state.cat = el.dataset.cat; state.src = '全部'; }
    else if (el.dataset.src) { state.src = el.dataset.src; state.cat = '全部'; }
    else { state.cat = '法鼓文化'; state.src = '全部'; state.q = el.dataset.series; }
    location.hash = '#find';
  }));
}
/* ---------------- 🎙️ 歐陽讀書會（v0.2.0） ---------------- */
const SEASON_ICON = n => ({ 5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟', 11: '1️⃣1️⃣', 12: '1️⃣2️⃣', 13: '1️⃣3️⃣' }[n] || '🎙️');
const thumb = (c, size = 'mqdefault') => c.y ? `https://i.ytimg.com/vi/${encodeURIComponent(c.y)}/${size}.jpg` : '';
const NOTE_PART = [['quote', '💎 金句摘錄'], ['mine', '🧠 我的理解'], ['act', '🎯 行動方案'], ['review', '🔄 之後回看']];
const hasNote = c => c.note && Object.keys(c.note).length > 0;
const cstate = { q: '', season: '全部' };
function clubRow(c, i, q) {
  const img = thumb(c);
  return `<button class="club" data-i="${i}">
    ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="noimg">🎙️</div>'}
    <div><div class="t">${hl(c.t, q)}</div>
    <div class="m"><span>${esc(c.d.replace(/-/g, '/'))}</span>${c.o ? '<span class="tag">📗 書單有</span>' : ''}${hasNote(c) ? '<span class="tag note">📝 有筆記</span>' : ''}${c.y ? '' : '<span>影片已下架</span>'}</div></div></button>`;
}
function renderClub() {
  if (!shelf.length) { view.innerHTML = setupNotice(); return; }
  const all = club.books;
  if (!all.length) {
    view.innerHTML = `<h2>🎙️ 歐陽讀書會</h2><div class="notice">雲端書單裡還沒有讀書會資料。到 ⚙️ 設定按「立刻更新書單」；還是沒有，請小輝在筆電說「<b>同步讀書會筆記</b>」。</div>`;
    return;
  }
  const latest = all[0];
  const seasons = [...new Map(all.map(c => [c.s, c.n])).entries()].sort((a, b) => b[1] - a[1]);
  view.innerHTML = `
    <button class="latest" data-i="0">
      ${thumb(latest, 'hqdefault') ? `<img src="${thumb(latest, 'hqdefault')}" alt="">` : '<div class="noimg big">🎙️</div>'}
      <div class="cap"><small>🎙️ 最新一場｜${esc(latest.s)}・${esc(latest.d.replace(/-/g, '/'))}</small><b>${esc(latest.t)}</b></div></button>
    <div class="searchbar"><input id="cq" type="search" placeholder="🔍 書名、關鍵問題、我的筆記" value="${esc(cstate.q)}" autocomplete="off" enterkeyhint="search">
      <button class="clear" id="cclr" aria-label="清除" ${cstate.q ? '' : 'hidden'}>✕</button></div>
    <div class="chips" id="seasons">${[['全部', 0], ...seasons].map(([s, n]) => `<button class="chip ${cstate.season === s ? 'on' : ''}" data-s="${esc(s)}">${s === '全部' ? `全部 ${all.length} 場` : SEASON_ICON(n) + ' ' + esc(s)}</button>`).join('')}</div>
    <div class="count" id="ccnt"></div><div id="clist"></div>`;
  // 打字時只重畫清單，不重畫搜尋框（手機注音輸入選字中重畫會打斷）
  const draw = () => {
    const words = cstate.q.trim().split(/\s+/).map(norm).filter(Boolean);
    const rows = all.map((c, i) => [c, i]).filter(([c]) => (cstate.season === '全部' || c.s === cstate.season) && words.every(w => c._k.includes(w)));
    const groups = [];
    for (const [c, i] of rows) { let g = groups.find(x => x.s === c.s); if (!g) groups.push(g = { s: c.s, n: c.n, items: [] }); g.items.push([c, i]); }
    $('#ccnt').textContent = `${cstate.q ? `找到 ${rows.length} 場` : `${rows.length} 場`}｜📗 書單有 ${all.filter(c => c.o).length} 本・📝 有筆記 ${all.filter(hasNote).length} 本`;
    $('#clist').innerHTML = groups.length ? groups.map(g => `<div class="day">${SEASON_ICON(g.n)} ${esc(g.s)}（${g.items.length} 場）</div><div class="list">${g.items.map(([c, i]) => clubRow(c, i, cstate.q)).join('')}</div>`).join('')
      : `<div class="empty">📭 讀書會裡沒有「${esc(cstate.q)}」<br><small>試試少打幾個字${cstate.season !== '全部' ? '，或選「全部」季' : ''}</small></div>`;
  };
  draw();
  const q = $('#cq');
  q.addEventListener('input', () => { cstate.q = q.value; $('#cclr').hidden = !q.value; draw(); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') q.blur(); });
  $('#cclr').addEventListener('click', () => { cstate.q = ''; q.value = ''; $('#cclr').hidden = true; draw(); q.focus(); });
  $('#seasons').addEventListener('click', e => { const c = e.target.closest('[data-s]'); if (!c) return; cstate.season = c.dataset.s; renderClub(); });
}
function openClub(c) {
  const img = thumb(c, 'hqdefault');
  const ans = c.note?.ans || [];
  const parts = NOTE_PART.filter(([k]) => c.note?.[k]);
  const own = c.o ? shelf.find(x => x.o === c.o) : null;
  $('#sheet .sheet-card').innerHTML = `<div class="grip"></div>
    ${img ? `<a class="vthumb" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.y)}" target="_blank" rel="noopener"><img src="${img}" alt="看直播回放"><span>▶</span></a>` : ''}
    <h3>${esc(c.t)}</h3><div class="au">${esc(c.s)}・${esc(c.d.replace(/-/g, '/'))}${c.w ? `（${esc(c.w)}）` : ''}</div>
    <div class="small">🤔 三個關鍵問題（先想一想，再看影片）</div>
    <ol class="qs">${c.q.map((x, i) => `<li><b>${esc(x)}</b>${ans[i] ? `<div class="ans">${esc(ans[i])}</div>` : ''}</li>`).join('')}</ol>
    <div class="small">📝 我的讀書筆記</div>
    ${parts.length ? parts.map(([k, n]) => `<div class="npart"><b>${n}</b><div>${esc(c.note[k])}</div></div>`).join('')
      : `<div class="nonote">還沒寫。在筆電的 Notion 寫好後，跟小輝說「同步讀書會筆記」，這裡就看得到。</div>`}
    ${own ? `<button class="own" data-o="${own.o}">📗 書單裡有這本：${esc(own.t)} ›</button>` : ''}
    <div class="btns">${c.y ? `<a class="btn main" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.y)}" target="_blank" rel="noopener">▶️ 看影片</a>` : '<span class="btn sub off">影片已下架</span>'}
      ${c.p ? `<a class="btn sub" href="https://www.notion.so/${encodeURIComponent(c.p)}" target="_blank" rel="noopener">開 Notion ↗</a>` : ''}</div>
    <div class="btns" style="margin-top:10px"><button class="btn sub" id="close">關閉</button></div>`;
  $('#sheet').hidden = false;
  $('#sheet .sheet-card').scrollTop = 0;
  $('#close').addEventListener('click', closeBook);
  $('#sheet .own')?.addEventListener('click', e => openBook(shelf.find(x => x.o === +e.currentTarget.dataset.o)));
  if (location.hash !== '#book') history.pushState({ book: 1 }, '', '#book');
}

async function renderSettings() {
  const cfg = (await kvGet('cfg')) || {};
  view.innerHTML = `<h2>⚙️ 設定</h2>
    <div class="form">
      <div class="small">書單跟<b>寫心得 App（愈讀樂讀）</b>用同一個雲端，網址和密語填一樣的就好。</div>
      <label>雲端網址</label><input id="url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">
      <label>密語</label><input id="pass" type="password" value="${esc(cfg.pass || '')}" autocomplete="off">
      <div class="row"><button id="save">儲存並更新書單</button></div>
    </div>
    <div class="form">
      <div>書單：${shelf.length ? `${shelf.length.toLocaleString()} 本（${esc(dataSrc)}）` : '還沒抓'}</div>
      <div class="small">🎙️ 歐陽讀書會：${club.books.length ? `${club.books.length} 場${club.synced ? `；筆記同步到 ${esc(club.synced)}` : ''}` : '還沒有'}</div>
      <div class="small">上次更新：${fetchedAt ? new Date(fetchedAt).toLocaleString('zh-TW', { hour12: false }) : '—'}；每 6 小時自動更新一次</div>
      <div class="row"><button class="sub" id="now">立刻更新書單</button></div>
    </div>
    <p class="small">版本 ${APP_VERSION}。這個 App 只能看；要加書、改分類，看 <a href="#help" data-h="add">❓ 說明 → 加書</a>。<br>
    同一個網址底下還有修行、英文、日記、寫心得 App：<b>不要清除這個網站的資料</b>，會連它們一起清掉。</p>`;
  const go = async () => {
    try { toast('更新中…'); await refresh(true); toast(`書單更新好了：${shelf.length.toLocaleString()} 本`); renderSettings(); }
    catch (e) { toast('沒更新成功：' + e.message); }
  };
  $('#save').addEventListener('click', async () => {
    const url = $('#url').value.trim(), pass = $('#pass').value;
    if (!/^https:\/\//.test(url)) return toast('網址要以 https:// 開頭');
    await kvSet('cfg', { url, pass });
    go();
  });
  $('#now').addEventListener('click', go);
}

/* ---------------- ❓ 說明（內容在 help.js，由 03 號 文件說明 的 .md 產生，不要手改 help.js） ---------------- */
const HELP_TABS = [['use', '📱 怎麼用'], ['add', '➕ 加書'], ['club', '🎙️ 歐陽加書'], ['maint', '🔧 維護']];   // club：v0.2.2 起，08 加書SOP
async function renderHelp() {
  const which = (await kvGet('helpTab')) || 'use';
  const has = typeof HELP === 'object';
  view.innerHTML = `<div class="chips help-tabs">${HELP_TABS.map(([k, n]) => `<button class="chip ${k === which ? 'on' : ''}" data-h="${k}">${n}</button>`).join('')}</div>
    <div class="help">${has ? HELP[which] : '<p>說明還沒載入，連上網路再打開一次。</p>'}</div>`;
  view.querySelectorAll('[data-h]').forEach(b => b.onclick = async () => { await kvSet('helpTab', b.dataset.h); renderHelp(); window.scrollTo(0, 0); });
}
// 其他頁的「❓ 說明 → 加書」連結：先記要開哪一頁
document.addEventListener('click', async e => { const a = e.target.closest('a[href="#help"][data-h]'); if (a) await kvSet('helpTab', a.dataset.h); }, true);

/* ---------------- 書的詳細 ---------------- */
function openBook(b) {
  const link = b.l || `https://search.books.com.tw/search/query/key/${encodeURIComponent(b.t)}/cat/all`;
  const rel = ext[b.t] || [];
  $('#sheet .sheet-card').innerHTML = `<div class="grip"></div>
    <h3>${esc(b.t)}</h3><div class="au">${esc(b.a || '（作者未填）')}</div>
    <dl class="kv">
      <dt>分類</dt><dd>${b.f ? `🏔️ 法鼓文化・${esc(b.f)}` : `${ICON[b.c] || ''} ${esc(b.c)}`}</dd>
      <dt>來源</dt><dd>${esc(SRC_NAME(b.s))}</dd>
      ${b.p ? `<dt>出版社</dt><dd>${esc(b.p)}</dd>` : ''}
      <dt>加入</dt><dd>${b.d ? esc(b.d.replace(/-/g, '/')) : '2026/10/4 以前'}</dd>
    </dl>
    ${rel.length ? `<div class="small">📎 延伸閱讀（小輝挑的相近書）</div><ul class="ext">${rel.map(t => {
      const hit = byTitle.get(t) || shelf.find(x => x.t.startsWith(t));
      return `<li><button ${hit ? `data-o="${hit.o}"` : 'disabled'}>${esc(t)}${hit ? '' : '（書單裡找不到）'}</button></li>`; }).join('')}</ul>` : ''}
    <div class="btns"><a class="btn main" href="${esc(link)}" target="_blank" rel="noopener">到博客來 ↗</a><button class="btn sub" id="close">關閉</button></div>`;
  $('#sheet').hidden = false;
  $('#sheet .sheet-card').scrollTop = 0;
  $('#close').addEventListener('click', closeBook);
  $('#sheet .ext')?.addEventListener('click', e => { const o = e.target.closest('[data-o]'); if (o) openBook(shelf.find(x => x.o === +o.dataset.o)); });
  if (location.hash !== '#book') history.pushState({ book: 1 }, '', '#book');   // 手機「返回」鍵先關卡片
}
function closeBook() { if (!$('#sheet').hidden) { $('#sheet').hidden = true; if (location.hash === '#book') history.back(); } }
$('#sheet .sheet-bg').addEventListener('click', closeBook);
view.addEventListener('click', e => {
  const el = e.target.closest('.book[data-o]');
  if (el) return openBook(shelf.find(x => x.o === +el.dataset.o));
  const c = e.target.closest('.club[data-i], .latest[data-i]');
  if (c) openClub(club.books[+c.dataset.i]);
});

/* ---------------- 換頁 ---------------- */
let lastTab = '#find';
async function route() {
  let h = location.hash || '#find';
  if (h === '#book') return;
  if (!$('#sheet').hidden) $('#sheet').hidden = true;
  if (!['#find', '#new', '#club', '#stats', '#help', '#settings'].includes(h)) h = '#find';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === h));
  if (h === '#find') await renderFind();
  else if (h === '#new') renderNew();
  else if (h === '#club') renderClub();
  else if (h === '#stats') renderStats();
  else if (h === '#help') await renderHelp();
  else await renderSettings();
  if (h !== lastTab) window.scrollTo(0, 0);
  lastTab = h;
}
window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { if (location.hash !== '#book' && !$('#sheet').hidden) { $('#sheet').hidden = true; } });

(async () => {
  await loadLocal();
  await route();
  // v0.2.0：舊版存的書單沒有讀書會，第一次打開就馬上抓，不用等 6 小時
  try { if (await refresh(shelf.length > 0 && !club.books.length) &&['#find', '#new', '#club', '#stats', ''].includes(location.hash)) route(); }
  catch (e) { if (shelf.length) toast('書單沒更新（' + e.message + '），先用手機裡的'); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
