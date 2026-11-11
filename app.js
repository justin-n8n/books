/* 阿輝的書房 — 03 書單的手機 App（2026-11-11 起）
   資料：03 正本 xlsx → 04 的「產生App資料.py」寫進 04/06.App資料/小輝給App/書單.json 的 shelf、ext
        → 借用 04「愈讀樂讀-同步」Apps Script 的 meta/books 讀回來（網址與密語跟 04 App 一樣）。
   只能看、不能改；書單有變只改 03 的 xlsx。 */
const APP_VERSION = 'v0.1.0';
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
function index() {
  byTitle = new Map(shelf.map(b => [b.t, b]));
  for (const b of shelf) b._k = norm(b.t + ' ' + (b.a || '') + ' ' + (b.f || ''));   // 法鼓書系名也搜得到
}
async function loadLocal() {
  const d = await kvGet('books');
  shelf = d?.shelf || []; ext = d?.ext || {}; dataSrc = d?.src || '';
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
  await kvSet('books', { src: r.data.src, shelf: r.data.shelf, ext: r.data.ext || {} });
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
  return `<div class="notice">👋 第一次使用：到 <a href="#settings">⚙️ 設定</a> 填<b>寫心得 App（愈讀樂讀）</b>的雲端網址和密語，按「儲存並更新書單」就會把 ${'03'} 書單抓下來。之後沒有網路也能查。</div>`;
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
      <div class="small">上次更新：${fetchedAt ? new Date(fetchedAt).toLocaleString('zh-TW', { hour12: false }) : '—'}；每 6 小時自動更新一次</div>
      <div class="row"><button class="sub" id="now">立刻更新書單</button></div>
    </div>
    <p class="small">版本 ${APP_VERSION}。這個 App 只能看；要加書、改分類，跟小輝說「幫我加書」。<br>
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
view.addEventListener('click', e => { const el = e.target.closest('.book[data-o]'); if (el) openBook(shelf.find(x => x.o === +el.dataset.o)); });

/* ---------------- 換頁 ---------------- */
let lastTab = '#find';
async function route() {
  let h = location.hash || '#find';
  if (h === '#book') return;
  if (!$('#sheet').hidden) $('#sheet').hidden = true;
  if (!['#find', '#new', '#stats', '#settings'].includes(h)) h = '#find';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === h));
  if (h === '#find') await renderFind();
  else if (h === '#new') renderNew();
  else if (h === '#stats') renderStats();
  else await renderSettings();
  if (h !== lastTab) window.scrollTo(0, 0);
  lastTab = h;
}
window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { if (location.hash !== '#book' && !$('#sheet').hidden) { $('#sheet').hidden = true; } });

(async () => {
  await loadLocal();
  await route();
  try { if (await refresh(false) && ['#find', '#new', '#stats', ''].includes(location.hash)) route(); }
  catch (e) { if (shelf.length) toast('書單沒更新（' + e.message + '），先用手機裡的'); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
