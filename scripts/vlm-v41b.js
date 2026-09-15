const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const S = '/tmp/my-project/android-runtime/state';
  for (const [f, label] of [
    ['scr-launch.png', 'v41b scr-launch: shot right after 10s render wait'],
    ['scrolled-1.png', 'v41b scrolled-1: after input swipe (bright screen)'],
  ]) {
    try {
      const b64 = fs.readFileSync(`${S}/${f}`).toString('base64');
      const res = await zai.chat.completions.createVision({
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Android emulator screenshot 320x640, MQ Player app (Russian UI, LIGHT theme). Image: ${label}. Describe exactly what is on screen: is it a splash or the login screen? List every visible text and button. For each clickable element give approximate center pixel coords (x,y) in 320x640 space. Especially: the footer row with two text links (left one is "Демо-режим") and where it sits vertically. Also state whether an email/password form card is visible and its vertical extent.`
              },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
            ]
          }
        ],
        temperature: 0.1
      });
      console.log(`\n===== ${f} =====`);
      console.log(res.choices[0].message.content);
    } catch (e) {
      console.error(`${f} FAILED: ${e.message}`);
    }
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
