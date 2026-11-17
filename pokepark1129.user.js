// ==UserScript==
// @name         ポケパーク 11/29 先着チケット監視（トレーナーズパス）
// @namespace    pokepark-watch
// @version      2.0
// @description  購入カレンダーのページを60秒ごとに再読み込みし、11/29に空きが出たらスマホ(ntfy)とMacに通知
// @match        https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index*
// @match        https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/error*
// @match        https://www.pokepark-kanto.co.jp/ppark/*error*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      ntfy.sh
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// ==/UserScript==

(async () => {
  // サイトのエラーページに飛ばされたら、3分後に監視ページへ戻る（30分以上続いたら一度だけ通知）
  if (!location.pathname.includes("/dateSelect/index")) {
    const since = Number(localStorage.getItem("pp_err_since") || 0) || Date.now();
    localStorage.setItem("pp_err_since", String(since));
    const b = document.createElement("div");
    b.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:#a00;color:#fff;padding:6px 10px;border-radius:8px;font:12px sans-serif";
    b.textContent = `監視：エラーページ。3分後に自動で戻ります（${new Date().toLocaleTimeString("ja-JP")}）`;
    document.body.appendChild(b);
    if (Date.now() - since > 30 * 60 * 1000 && !localStorage.getItem("pp_err_notified")) {
      localStorage.setItem("pp_err_notified", "1");
      GM_xmlhttpRequest({ method: "POST", url: "https://ntfy.sh/pokepark1129-676239f978",
        data: "ポケパーク監視：サイトのエラーが30分以上続いています" });
    }
    setTimeout(() => location.replace("https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index"), 3 * 60 * 1000);
    return;
  }
  // URL末尾に #test=2026-12-01 のように付けると、その日付で1回だけテスト(必ず通知)して通常監視に戻る
  const testDate = (location.hash.match(/#test=(\d{4}-\d{2}-\d{2})/) || [])[1];
  const TARGET = testDate || "2026-11-29";
  const TOPIC = "pokepark1129-676239f978";
  const MIN_STOCK = 2;  // 2名分買うので残2以上で通知
  const INTERVAL = 60 * 1000;
  const RENOTIFY = 30 * 60 * 1000;
  const BUY_URL = "https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index";
  if (location.hash === "#reset") {  // メール送信用URLを入れ直す（URLから#resetを消して、再読み込みで繰り返さないようにする）
    GM_setValue("gas_url", "");
    history.replaceState(null, "", location.pathname);
  }
  let gasUrl = GM_getValue("gas_url", "");
  if (!gasUrl) {
    gasUrl = (prompt("ポケパーク監視：メール送信用のGASのURL(https://script.google.com/macros/s/.../exec)を入力（メール不要なら空欄）") || "").trim();
    GM_setValue("gas_url", gasUrl || "-");
  }
  if (!gasUrl.startsWith("https://script.google.com/")) gasUrl = "";
  const GAS_KEY = "hUUELMWcrSkLrl4V";
  const WANT = "トレーナーズパス";

  // 「種類を選ぶ」画面を裏で読み込み、券種ごとの残り表示(○△×)を取得
  const passStock = async (dateStr) => {
    // CSRFトークンは使い回すと弾かれるので毎回取り直す
    const idx = new DOMParser().parseFromString(
      await (await fetch("/ppark/ticket/dateSelect/index", { credentials: "same-origin" })).text(), "text/html");
    const csrf = idx.querySelector('#ticketPurchaseCommand input[name="_csrf"]')?.value;
    if (!csrf) throw new Error("csrf not found");
    const res = await fetch("/ppark/ticket/dateSelect/next", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ selectDate: dateStr, _csrf: csrf }),
    });
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const result = {};
    for (const el of doc.querySelectorAll(".ticket-stock")) {
      let card = el;
      while (card.parentElement && card.parentElement.querySelectorAll(".ticket-stock").length <= 2) card = card.parentElement;
      const t = card.textContent.replace(/\s/g, "");
      const name = t.includes("エリートトレーナーズパス") ? "エリートトレーナーズパス"
        : t.includes("トレーナーズパス") ? "トレーナーズパス" : t.includes("タウンパス") ? "タウンパス" : null;
      if (name) result[name] = el.textContent.replace(/\s|残り/g, "");
    }
    return result;  // 例: {エリートトレーナーズパス:"×", トレーナーズパス:"△", タウンパス:"×"}
  };

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
    send(base);  // スマホ(ntfy)へプッシュ
    if (gasUrl) {   // Gmailへメール(GAS経由)
      GM_xmlhttpRequest({
        method: "POST", url: gasUrl,
        data: JSON.stringify({ key: GAS_KEY, subject: title, body: `${msg}\n\n今すぐ購入: ${BUY_URL}` }),
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        onload: (r) => console.log("[pokepark] mail", r.status, r.responseText),
      });
    }
    GM_notification({ title, text: msg });
    try { new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play(); } catch (e) {}
  };

  if (location.hash === "#test") {  // 通知経路だけのテスト
    history.replaceState(null, "", location.pathname);
    notify("PokePark テスト通知", "ブラウザ監視は正常に動いています");
  }

  try {
    const res = await fetch(`/ppark/ticket/dateSelect/select?yearMonth=${TARGET.slice(0, 7)}&isScheduleRequest=0&_=${Date.now()}`,
      { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.result !== "OK") throw new Error(`サイト応答NG ${json.resultCode || ""}`);
    localStorage.removeItem("pp_err_since"); localStorage.removeItem("pp_err_notified");
    const day = json.dates.find((d) => d.date === TARGET);
    const stock = day?.stockCount || 0;
    const open = day?.linkFlg === 1 && day?.closedFlg === 0;
    show(`残${stock}（${now()}）`);
    const last = Number(localStorage.getItem("pp_last_sent") || 0);
    let mark = "-";
    if (open && stock >= MIN_STOCK) {
      const passes = await passStock(TARGET);
      mark = passes[WANT] || "?";
      show(`残${stock} / ${WANT}${mark}（${now()}）`);
    }
    if (mark === "○" || mark === "△") {
      const label = mark === "○" ? "残りあり" : "残りわずか";
      if (testDate) {
        notify(`【テスト】${WANT}空き！ポケパーク ${TARGET}`, `${WANT}：${label}（テスト通知です）`);
      } else if (Date.now() - last >= RENOTIFY) {
        notify(`${WANT}空き！ポケパーク ${TARGET}`, `${WANT}：${label}。今すぐ購入してください`);
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
