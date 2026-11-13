import { chromium } from 'playwright';
import { appendFile } from 'node:fs/promises';
const target = process.env.TARGET_DATE || '2026-11-29';
if(!/^\d{4}-\d{2}-\d{2}$/.test(target))throw new Error('Invalid target date');
const url = 'https://www.pokepark-kanto.co.jp/ppark/ticket/dateSelect/index';
const browser = await chromium.launch({channel:'chrome',headless:false});
let result;
try {
 const page = await browser.newPage({locale:'ja-JP',timezoneId:'Asia/Tokyo'});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 const cell = page.locator(`#calendar [data-date="${target}"]`);
 try { await cell.locator('img').first().waitFor({state:'attached',timeout:60000}); }
 catch { throw new Error(`在庫を取得できません。ページタイトル: ${await page.title()}`); }
 const expectedMonth = `${target.slice(0,4)}年${Number(target.slice(5,7))}月`;
 if((await page.locator('#calendar .fc-toolbar-title').innerText()).trim()!==expectedMonth)throw new Error('表示月が一致しません');
 const icons = await cell.locator('img').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')?.split('/').pop()));
 const statuses = {'icon-cross.png':'sold_out','icon-circle.png':'available','icon-triangle.png':'few','icon-hyphen.png':'unreleased'};
 if(icons.length!==1 || !statuses[icons[0]])throw new Error('在庫画像が不明です');
 result = {target,status:statuses[icons[0]],icon:icons[0],checkedAt:new Date().toISOString()};
} catch(error) {
 result = {target,status:'unknown',error:String(error.message).split('\n')[0],checkedAt:new Date().toISOString()};
 process.exitCode = 1;
} finally { await browser.close(); }
console.log(JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## チケット確認\n\n\`\`\`json\n${JSON.stringify(result,null,2)}\n\`\`\`\n`);
