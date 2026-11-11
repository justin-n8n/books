/* 手機上的資料庫（IndexedDB）。同網域 justin-n8n.github.io 還有 04、34、43、47：名字要不一樣，不碰別人的資料。
   kv：設定（04 的雲端網址與密語）、書單、抓資料的時間。 */
const DB_NAME = 'ahui-books';
let dbConn = null;

function dbOpen() {
  if (dbConn) return Promise.resolve(dbConn);
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv', { keyPath: 'k' });
    r.onsuccess = () => { dbConn = r.result; dbConn.onclose = () => { dbConn = null; }; resolve(dbConn); };
    r.onerror = () => reject(r.error);
  });
}
async function kvDo(mode, fn) {
  const d = await dbOpen();
  return new Promise((resolve, reject) => {
    const t = d.transaction('kv', mode);
    const q = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(q && q.result);
    t.onerror = () => reject(t.error);
  });
}
const kvGet = async k => (await kvDo('readonly', o => o.get(k)))?.v;
const kvSet = (k, v) => kvDo('readwrite', o => o.put({ k, v }));
