// ==UserScript==
// @name         ポケパーク 11/29 先着チケット監視
// @namespace    pokepark-watch
// @version      1.0
// @description  購入カレンダーのページを60秒ごとに再読み込みし、11/29に空きが出たらスマホ(ntfy)とMacに通知
// @match        https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      ntfy.sh
// @run-at       document-idle
// ==/UserScript==

(async () => {
  const TARGET = "2026-11-29";
  const TOPIC = "pokepark1129-676239f978";
  const INTERVAL = 60 * 1000;
  const RENOTIFY = 30 * 60 * 1000;
  const BUY_URL = "https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index";
  const now = () => new Date().toLocaleTimeString("ja-JP");

  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:#222;color:#fff;padding:6px 10px;border-radius:8px;font:12px sans-serif;opacity:.85";
  document.body.appendChild(badge);
  const show = (t) => { badge.textContent = `監視中 ${TARGET}: ${t}`; console.log("[pokepark]", t); };

  const notify = (title, msg) => {
    GM_xmlhttpRequest({
      method: "POST", url: `https://ntfy.sh/${TOPIC}`, data: `${title}\n${msg}`,
      headers: { Title: `PokePark ${TARGET}`, Priority: "urgent", Tags: "ticket", Click: BUY_URL },
    });
    GM_notification({ title, text: msg });
    try { new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play(); } catch (e) {}
  };

  if (location.hash === "#test") {
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
    if (open && stock > 0) {
      if (Date.now() - last >= RENOTIFY) {
        notify(`空きあり！ポケパーク ${TARGET}`, `残${stock}枚。今すぐ購入してください`);
        localStorage.setItem("pp_last_sent", String(Date.now()));
      }
    } else {
      localStorage.removeItem("pp_last_sent");
    }
  } catch (e) {
    show(`取得エラー ${e.message}（${now()}）`);
  }
  setTimeout(() => location.reload(), INTERVAL);
})();
