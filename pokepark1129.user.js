// ==UserScript==
// @name         ポケパーク 11/29 先着チケット監視
// @namespace    pokepark-watch
// @version      1.5
// @description  購入カレンダーのページを60秒ごとに再読み込みし、11/29に空きが出たらスマホ(ntfy)とMacに通知
// @match        https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      ntfy.sh
// @run-at       document-idle
// ==/UserScript==

(async () => {
  // URL末尾に #test=2026-12-01 のように付けると、その日付で1回だけテスト(必ず通知)して通常監視に戻る
  const testDate = (location.hash.match(/#test=(\d{4}-\d{2}-\d{2})/) || [])[1];
  const TARGET = testDate || "2026-11-29";
  const TOPIC = "pokepark1129-676239f978";
  const MIN_STOCK = 2;  // 2名分買うので残2以上で通知
  const INTERVAL = 60 * 1000;
  const RENOTIFY = 30 * 60 * 1000;
  const BUY_URL = "https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index";
  let email = GM_getValue("email", "");
  if (!email) {
    email = (prompt("ポケパーク監視：通知を受け取るメールアドレスを入力（不要なら空欄でOK）") || "").trim();
    GM_setValue("email", email || "-");
  }
  if (email === "-") email = "";
  // メール通知にはntfyアカウント(メール認証済み)のアクセストークンが必要
  let token = GM_getValue("ntfy_token", "");
  if (!token) {
    token = (prompt("ポケパーク監視：ntfyのアクセストークン(tk_で始まる)を入力（メール不要なら空欄）") || "").trim();
    GM_setValue("ntfy_token", token || "-");
  }
  if (token === "-") token = "";
  const now = () => new Date().toLocaleTimeString("ja-JP");

  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:#222;color:#fff;padding:6px 10px;border-radius:8px;font:12px sans-serif;opacity:.85";
  document.body.appendChild(badge);
  const show = (t) => { badge.textContent = `監視中 ${TARGET}: ${t}`; console.log("[pokepark]", t); };

  const notify = (title, msg) => {
    const base = { Title: `PokePark ${TARGET}`, Priority: "urgent", Tags: "ticket", Click: BUY_URL };
    const send = (headers, onFail) => GM_xmlhttpRequest({
      method: "POST", url: `https://ntfy.sh/${TOPIC}`, data: `${title}\n${msg}`, headers,
      onload: (r) => { console.log("[pokepark] ntfy", r.status, r.responseText); if (r.status >= 300 && onFail) onFail(); },
      onerror: () => onFail && onFail(),
    });
    if (token) {
      // メール付きで送信。失敗したらメールなしでプッシュだけ送り直す
      send(Object.assign({ Authorization: `Bearer ${token}`, Email: "yes" }, base), () => send(base));
    } else {
      send(base);  // 匿名ではメール送信不可(付けると通知ごと拒否される)
    }
    GM_notification({ title, text: msg });
    try { new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play(); } catch (e) {}
  };

  if (location.hash === "#test") {  // 通知経路だけのテスト
    notify("PokePark テスト通知", "ブラウザ監視は正常に動いています");
  }

  try {
    const res = await fetch(`/ppark/ticket/dateSelect/select?yearMonth=${TARGET.slice(0, 7)}&isScheduleRequest=0&_=${Date.now()}`,
      { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const day = (await res.json()).dates.find((d) => d.date === TARGET);
    const stock = day?.stockCount || 0;
    const open = day?.linkFlg === 1 && day?.closedFlg === 0;
    show(`残${stock}（${now()}）`);
    const last = Number(localStorage.getItem("pp_last_sent") || 0);
    if (open && stock >= MIN_STOCK) {
      if (testDate) {
        notify(`【テスト】空きあり！ポケパーク ${TARGET}`, `残${stock}枚（テスト通知です）`);
      } else if (Date.now() - last >= RENOTIFY) {
        notify(`空きあり！ポケパーク ${TARGET}`, `残${stock}枚。今すぐ購入してください`);
        localStorage.setItem("pp_last_sent", String(Date.now()));
      }
    } else if (!testDate) {
      localStorage.removeItem("pp_last_sent");
    }
  } catch (e) {
    show(`取得エラー ${e.message}（${now()}）`);
  }
  if (testDate) setTimeout(() => location.replace(BUY_URL), 15000);  // テスト後は通常の11/29監視へ
  else setTimeout(() => location.reload(), INTERVAL);
})();
