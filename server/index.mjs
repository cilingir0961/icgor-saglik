// İçGör sunucusu: node server/index.mjs [--port 8000] [--lan]
// Varsayılan yalnızca bu bilgisayar (127.0.0.1). --lan: aynı ağdaki telefon testi için (kamera HTTPS ister;
// bkz. docs/DEVICE-TEST.md). Ücretli AI yalnızca ICGOR_AI_PROVIDER=openai + OPENAI_API_KEY + ICGOR_AI_ENABLE_PAID=1.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';
import { loadConfig, publicStatus } from './ai/config.mjs';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || process.env.PORT || 8000);
const host = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const cfg = loadConfig({ ...process.env, ICGOR_USAGE_FILE: process.env.ICGOR_USAGE_FILE ?? resolve(import.meta.dirname, 'data/usage.json') });
const app = createApp({ root: resolve(import.meta.dirname, '..'), cfg });
createServer(app).listen(port, host, () => {
  const st = publicStatus(cfg);
  console.log(`İçGör: http://${host === '0.0.0.0' ? '<bu-bilgisayarın-IP-adresi>' : 'localhost'}:${port}/`);
  console.log(`AI: ${st.demo ? `demo (${st.reason})` : `OpenAI ${st.model} — günlük bütçe ${cfg.dailyBudgetUsd} USD`}`);
});
