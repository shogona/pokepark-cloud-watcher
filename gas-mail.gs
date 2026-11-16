// ポケパーク監視のメール送信用(Google Apps Script)
// 自分のGmailアドレス宛てに送ります。KEYはユーザースクリプトと同じ値にしてください
const KEY = "hUUELMWcrSkLrl4V";

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.key !== KEY) return ContentService.createTextOutput("forbidden");
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), p.subject, p.body);
  return ContentService.createTextOutput("ok");
}

// エディタで実行して権限を許可し、テストメールが届くか確認する用
function test() {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "【テスト】ポケパーク監視", "メール送信の設定は正常です");
}
