// ポスチュアー メンズ（Tatsu / Black 27.0・28.0）の在庫監視
const fs = require('fs');

const PRODUCT_JSON = 'https://arcteryx.jp/products/postour-m.js';
const PAGE_URL = 'https://arcteryx.jp/products/postour-m';
const COLOR = 'Tatsu / Black';
const SIZES = ['27.0', '28.0'];
const TOPIC = process.env.NTFY_TOPIC;
const STATE_FILE = 'state.json';
const LOG_FILE = 'log.csv';

const now = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });

async function notify(title, message, priority = 4, click = PAGE_URL) {
  if (!TOPIC) throw new Error('NTFY_TOPIC が未設定です');
  const res = await fetch('https://ntfy.sh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: TOPIC, title, message, priority, click, tags: ['shoe'] }),
  });
  if (!res.ok) throw new Error(`ntfy 送信失敗: ${res.status}`);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { available: {}, error: false }; }
}

function log(size, status) {
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, 'time_jst,size,status\n');
  fs.appendFileSync(LOG_FILE, `${now()},${size},${status}\n`);
}

async function main() {
  const state = loadState();
  try {
    const res = await fetch(PRODUCT_JSON, {
      headers: { 'User-Agent': 'Mozilla/5.0 (stock-watch)', 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`商品データ取得失敗: HTTP ${res.status}`);
    const product = await res.json();

    for (const size of SIZES) {
      const v = product.variants.find(v => v.title === `${COLOR} / ${size}`);
      if (!v) throw new Error(`${COLOR} / ${size} が見つかりません（ページ構成が変わった可能性）`);
      const was = state.available[size] === true;
      const is = v.available === true;
      console.log(`${size}: ${is ? '在庫あり' : '在庫なし'}`);
      if (is !== was) {
        log(size, is ? 'in_stock' : 'sold_out');
        if (is) await notify(`在庫復活: ポスチュアー ${size}`, `${COLOR} / ${size} が購入可能です。タップで商品ページへ`, 5);
      }
      state.available[size] = is;
    }

    if (state.error) {
      await notify('監視が復旧しました', 'ポスチュアーの在庫チェックが正常に戻りました', 2);
      state.error = false;
    }
  } catch (e) {
    console.error(e.message);
    if (!state.error) {
      await notify('監視エラー', `${e.message}\n（復旧するまで再通知しません）`, 3, 'https://github.com');
      state.error = true;
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
