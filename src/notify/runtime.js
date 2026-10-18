// Uygulama içi hatırlatma zamanlayıcısı. YALNIZCA uygulama açıkken çalışır (sekme/PWA bellekteyken). İzin
// verilmemişse hiçbir bildirim gösterilmez. Gösterilen olayların kimliği tekrarlanmasın diye saklanır.

import { getStore } from '../scan/store.js';
import { dueEvents, message } from './schedule.js';
import { dayKey, adaptiveGoal } from '../activity/steps.js';

let timer = null;

export function planContext(st) {
  return { planDays: (st.trainer?.plan?.sessions ?? []).map((s) => s.dow) };
}

function info(st, now = new Date()) {
  const days = st.activity?.days ?? {};
  const goal = st.activity?.goalMode === 'manual' && st.activity?.goal ? st.activity.goal : adaptiveGoal(days, now, { goalType: st.profile?.goal }).goal;
  const today = days[dayKey(now)]?.steps ?? 0;
  const dow = (now.getDay() + 6) % 7;
  const ses = st.trainer?.plan?.sessions.find((s) => s.dow === dow);
  return { goal: goal.toLocaleString('tr-TR'), remaining: Math.max(0, goal - today), workout: ses && ses.status !== 'tamamlandi' ? ses.estMinutes : null };
}

/** Bir bildirim gösterir (izin varsa). @returns {Promise<boolean>} */
export async function notify({ title, body, tag }) {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#/bugun' } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* SW yok: doğrudan */ }
  try { new Notification(title, opts); return true; } catch { return false; }
}

export async function tick(now = new Date()) {
  const store = getStore();
  const st = store.state;
  if (!st.notify?.enabled) return [];
  const due = dueEvents(st.notify, st.notify.fired, now, planContext(st));
  const shown = [];
  for (const e of due) {
    const m = message(e.type, info(st, now));
    if (e.type === 'yuruyus' && info(st, now).remaining === 0) { shown.push(e.id); continue; } // hedef tamam: rahatsız etme
    if (await notify({ ...m, tag: e.type })) shown.push(e.id);
    else shown.push(e.id); // izin yoksa da işaretle (sonradan toplu gösterim olmasın)
  }
  if (due.length) store.update('notify', (n) => ({ ...n, fired: [...(n.fired ?? []), ...shown].slice(-60) }));
  window.__icgorNotify = { lastTick: now.toISOString(), shown };
  return shown;
}

export function start() {
  stop();
  tick();
  timer = setInterval(() => tick(), 30000);
  document.addEventListener('visibilitychange', onVisible);
}
export function stop() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
function onVisible() { if (document.visibilityState === 'visible') tick(); }
