// Використання:
//   SITE_URL=https://... ADMIN_KEY=... npm run status
//   SITE_URL=https://... ADMIN_KEY=... npm run draw
const cmd = process.argv[2];
const SITE = (process.env.SITE_URL || 'http://localhost:8787').replace(/\/$/, '');
const KEY = process.env.ADMIN_KEY;
if (!KEY) {
  console.error('❌ Задай ADMIN_KEY, напр.: ADMIN_KEY=... SITE_URL=https://... npm run draw');
  process.exit(1);
}

const routes = {
  status: ['GET', '/api/admin/status'],
  draw: ['POST', '/api/admin/draw'],
  redraw: ['POST', '/api/admin/draw?force=1'],
  reset: ['POST', '/api/admin/reset'],
};
if (!routes[cmd]) {
  console.error('Команди: status | draw | redraw | reset');
  process.exit(1);
}

const [method, path] = routes[cmd];
const res = await fetch(SITE + path, { method, headers: { 'x-admin-key': KEY } });
const data = await res.json().catch(() => ({}));

if (cmd === 'status' && res.ok) {
  console.log(`\n🎅 Учасники (${data.participants.length}):`);
  for (const p of data.participants) {
    console.log(`  ${p.profileDone ? '✅' : '⏳'} ${p.name}${p.partner ? '  ❤  ' + p.partner : ''}`);
  }
  console.log(data.drawnAt ? `\n🎲 Жеребкування: ${new Date(data.drawnAt).toLocaleString('uk-UA')}` : '\n🎲 Жеребкування ще не було');
  console.log(data.ready ? '✅ Все готово до жеребкування!' : '⚠️  Не готово:\n  - ' + data.problems.join('\n  - '));
} else if (res.ok) {
  console.log(cmd === 'reset' ? '🔄 Результати жеребкування скинуто.' : `🎉 Готово! Розподілено ${data.participants} учасників. Кожен бачить свого отримувача в кабінеті.`);
} else {
  console.error(`❌ ${data.error || res.status}`);
  if (data.problems) console.error('  - ' + data.problems.join('\n  - '));
  process.exit(1);
}
