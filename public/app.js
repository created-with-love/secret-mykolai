(() => {
  const view = document.getElementById('view');
  let state = null;
  let editing = false;

  // ---------- utils ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast'), 3200);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Помилка');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function withBusy(btn, fn) {
    btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  // ---------- snow ----------
  (function snow() {
    const box = document.getElementById('snow');
    const n = window.innerWidth < 600 ? 22 : 40;
    for (let i = 0; i < n; i++) {
      const f = document.createElement('span');
      f.className = 'flake';
      f.textContent = Math.random() > 0.5 ? '❄' : '•';
      f.style.left = Math.random() * 100 + 'vw';
      f.style.fontSize = 6 + Math.random() * 14 + 'px';
      f.style.opacity = 0.3 + Math.random() * 0.6;
      f.style.animationDuration = 8 + Math.random() * 14 + 's';
      f.style.animationDelay = -Math.random() * 20 + 's';
      f.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
      box.appendChild(f);
    }
  })();

  // ---------- load ----------
  async function load() {
    try {
      state = await api('/api/me');
    } catch (e) {
      if (e.status === 401) return renderAuth();
      view.innerHTML = `<div class="card center"><p>${esc(e.message)}</p></div>`;
      return;
    }
    if (!state.me.profileDone || editing) renderProfile();
    else renderDashboard();
  }

  // ---------- auth ----------
  function renderAuth(mode = 'login') {
    const isReg = mode === 'register';
    view.innerHTML = `
      <div class="card">
        <div class="tabs">
          <button class="tab ${!isReg ? 'active' : ''}" data-mode="login">Вхід</button>
          <button class="tab ${isReg ? 'active' : ''}" data-mode="register">Реєстрація</button>
        </div>
        <h2>${isReg ? 'Привіт, новий Миколаю! ✨' : 'З поверненням! 🎄'}</h2>
        <p class="sub">${isReg ? 'Створи акаунт — код запрошення тобі скаже організатор.' : 'Увійди, щоб побачити свій кабінет.'}</p>
        <form id="authForm" autocomplete="on">
          <label class="field"><span>Логін</span>
            <input name="username" required minlength="2" maxlength="30" autocomplete="username" placeholder="напр. vova" />
          </label>
          <label class="field"><span>Пароль</span>
            <input name="password" type="password" required minlength="${isReg ? 6 : 1}" autocomplete="${isReg ? 'new-password' : 'current-password'}" placeholder="${isReg ? 'щонайменше 6 символів' : '••••••'}" />
          </label>
          ${isReg ? `<label class="field"><span>Код запрошення</span><input name="invite" required placeholder="від організатора" /></label>` : ''}
          <button class="btn block" type="submit">${isReg ? 'Створити акаунт' : 'Увійти'}</button>
        </form>
      </div>`;
    view.querySelectorAll('.tab').forEach((t) => (t.onclick = () => renderAuth(t.dataset.mode)));
    const form = document.getElementById('authForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      withBusy(form.querySelector('button[type=submit]'), async () => {
        await api(isReg ? '/api/register' : '/api/login', { method: 'POST', body });
        await load();
      });
    };
  }

  // ---------- profile ----------
  function renderProfile() {
    const { me, participants, drawnAt } = state;
    const first = !me.profileDone;
    const others = participants.filter((p) => p.id !== me.id);
    const options = others
      .map((p) => {
        const taken = p.partnerId !== null && p.partnerId !== me.id;
        const name = p.name || 'учасник без імені';
        return `<option value="${p.id}" ${p.id === me.partnerId ? 'selected' : ''} ${taken ? 'disabled' : ''}>${esc(name)}${taken ? ' (вже в парі)' : ''}</option>`;
      })
      .join('');
    const links = me.links.length ? me.links : [{ title: '', url: '' }];

    view.innerHTML = `
      <div class="card">
        ${first ? `<div class="steps"><span class="on"></span><span class="on"></span><span></span></div>` : ''}
        <h2>${first ? 'Розкажи про себе 🎁' : 'Мій профіль'}</h2>
        <p class="sub">${first ? 'Заповни профіль — так твій Таємний Миколай знатиме, що тебе порадує.' : 'Побажання можна змінювати будь-коли — твій Миколай одразу побачить оновлення.'}</p>
        <form id="profileForm">
          <label class="field"><span>Як тебе звати?</span>
            <input name="displayName" required maxlength="40" value="${esc(me.displayName)}" placeholder="напр. Вова" />
          </label>
          <label class="field"><span>Твоя половинка ❤️</span>
            <select name="partnerId" ${drawnAt ? 'disabled' : ''}>
              <option value="">— ще не зареєструвалась(вся) —</option>
              ${options}
            </select>
            <small>${drawnAt ? 'Жеребкування вже відбулося, пару змінити не можна.' : 'Ви не зможете випасти одне одному. Якщо половинки ще немає в списку — збережи профіль і зайди пізніше. Коли хтось із пари обирає іншого, пара встановлюється для обох.'}</small>
          </label>
          <label class="field"><span>Побажання щодо подарунку</span>
            <textarea name="wishes" maxlength="3000" placeholder="Що тебе порадує? Розмір одягу, улюблені кольори, хобі, чого точно не треба…">${esc(me.wishes)}</textarea>
          </label>
          <div class="field">
            <span style="display:block;font-weight:700;font-size:14px;margin-bottom:6px">Посилання на вішліст / магазини</span>
            <div id="linkRows"></div>
            <button type="button" class="btn ghost small" id="addLink">+ Додати посилання</button>
          </div>
          <div class="actions">
            <button class="btn" type="submit">${first ? 'Зберегти та продовжити' : 'Зберегти'}</button>
            ${first ? '' : '<button class="btn ghost" type="button" id="cancelEdit">Скасувати</button>'}
          </div>
        </form>
      </div>
      ${first ? '<div class="actions" style="justify-content:center"><button class="btn ghost small" id="logoutBtn">Вийти</button></div>' : ''}`;

    const rows = document.getElementById('linkRows');
    const addRow = (l = { title: '', url: '' }) => {
      const r = document.createElement('div');
      r.className = 'link-row';
      r.innerHTML = `
        <input class="lr-title" maxlength="100" placeholder="Назва (необов'язково)" value="${esc(l.title)}" />
        <input class="lr-url" type="url" placeholder="https://…" value="${esc(l.url)}" />
        <button type="button" class="icon-btn" title="Видалити">×</button>`;
      r.querySelector('.icon-btn').onclick = () => r.remove();
      rows.appendChild(r);
    };
    links.forEach(addRow);
    document.getElementById('addLink').onclick = () => addRow();
    const cancel = document.getElementById('cancelEdit');
    if (cancel) cancel.onclick = () => { editing = false; renderDashboard(); };
    const lo = document.getElementById('logoutBtn');
    if (lo) lo.onclick = logout;

    const form = document.getElementById('profileForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {
        displayName: fd.get('displayName'),
        partnerId: drawnAt ? me.partnerId : fd.get('partnerId') || null,
        wishes: fd.get('wishes'),
        links: [...rows.querySelectorAll('.link-row')]
          .map((r) => ({ title: r.querySelector('.lr-title').value, url: r.querySelector('.lr-url').value.trim() }))
          .filter((l) => l.url),
      };
      withBusy(form.querySelector('button[type=submit]'), async () => {
        await api('/api/me', { method: 'PUT', body });
        editing = false;
        toast('Збережено ✨');
        await load();
      });
    };
  }

  // ---------- dashboard ----------
  function linksHtml(links) {
    if (!links.length) return '<p class="muted">Посилань немає.</p>';
    return `<ul class="links">${links
      .map(
        (l) =>
          `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.title || host(l.url) || l.url)}<span class="host">${esc(host(l.url))}</span></a></li>`
      )
      .join('')}</ul>`;
  }

  function wishesHtml(w) {
    return w ? `<p class="wishes">${esc(w)}</p>` : '<p class="muted">Побажань поки немає.</p>';
  }

  function renderDashboard() {
    const { me, participants, expected, drawnAt, assignment } = state;
    const ready = participants.filter((p) => p.profileDone && p.partnerId !== null).length;
    const partner = participants.find((p) => p.id === me.partnerId);

    const chips =
      participants
        .map((p) => {
          const cls = ['chip', p.id === me.id ? 'me' : '', p.profileDone && p.partnerId !== null ? 'ok' : ''].join(' ');
          return `<span class="${cls}">${p.profileDone && p.partnerId !== null ? '✅' : '⏳'} ${esc(p.name || 'новачок')}</span>`;
        })
        .join('') +
      Array.from({ length: Math.max(0, expected - participants.length) })
        .map(() => '<span class="chip empty">• очікуємо</span>')
        .join('');

    let main;
    if (drawnAt && assignment) {
      main = `
        <div class="reveal" id="reveal" role="button" tabindex="0" aria-label="Відкрити подарунок">
          <div class="reveal-inner">
            <div class="face front"><div class="tap"><span class="big">🎁</span>Натисни, щоб дізнатися,<br/>кому ти даруєш</div></div>
            <div class="face back">
              <div>
                <div class="label">Ти — Таємний Миколай для</div>
                <div class="who">${esc(assignment.name)}</div>
                <div class="label">🤫 Тільки нікому не кажи!<br/>Вручаємо 5 грудня 🎄</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card" id="giftInfo" hidden>
          <p class="meet" style="margin-top:0">📅 Зустрічаємось <strong>5 грудня</strong> — не забудь подарунок!</p>
          <h3>🎄 Що порадує ${esc(assignment.name)}</h3>
          ${wishesHtml(assignment.wishes)}
          <h3>🛍️ Вішліст</h3>
          ${linksHtml(assignment.links)}
        </div>`;
    } else {
      main = `
        <div class="card">
          <div class="waiting">
            <div class="big">🎲</div>
            <h2>Жеребкування ще попереду</h2>
            <p class="sub">Щойно всі зареєструються, ми запустимо розподіл — і тут з'явиться твій отримувач подарунка.</p>
            <p class="meet">📅 Зустрічаємось <strong>5 грудня</strong> — подарунки вручаємо разом!</p>
          </div>
          <div class="row-between"><strong>Готові учасники</strong><span class="muted">${ready} / ${expected}</span></div>
          <div class="progress"><div style="width:${Math.min(100, (ready / expected) * 100)}%"></div></div>
          <div class="people">${chips}</div>
        </div>`;
    }

    view.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <p class="hello">Привіт, ${esc(me.displayName)}! 👋</p>
            <p class="muted" style="margin:2px 0 0">${partner ? `Половинка: ${esc(partner.name || '…')} ❤️` : '⚠️ Половинку не вказано'}</p>
          </div>
          <button class="btn ghost small" id="logoutBtn">Вийти</button>
        </div>
      </div>
      ${main}
      <div class="card">
        <div class="row-between" style="margin-bottom:12px">
          <h3 style="margin:0">⭐ Мої побажання</h3>
          <button class="btn ghost small" id="editBtn">Редагувати</button>
        </div>
        ${wishesHtml(me.wishes)}
        ${linksHtml(me.links)}
      </div>`;

    document.getElementById('logoutBtn').onclick = logout;
    document.getElementById('editBtn').onclick = () => { editing = true; renderProfile(); };

    const reveal = document.getElementById('reveal');
    if (reveal) {
      const open = () => {
        if (reveal.classList.contains('open')) return;
        reveal.classList.add('open');
        setTimeout(() => {
          const info = document.getElementById('giftInfo');
          info.hidden = false;
          confetti();
        }, 650);
      };
      reveal.onclick = open;
      reveal.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open());
    }
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state = null;
    editing = false;
    renderAuth();
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = ['🎉', '✨', '❄️', '🎁', '⭐'];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      s.textContent = items[i % items.length];
      Object.assign(s.style, {
        position: 'fixed', left: '50%', top: '40%', fontSize: 16 + Math.random() * 14 + 'px',
        pointerEvents: 'none', zIndex: 20, transition: 'transform 1.4s cubic-bezier(.1,.7,.3,1), opacity 1.4s',
      });
      document.body.appendChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 220;
      requestAnimationFrame(() => {
        s.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 120}px) rotate(${Math.random() * 360}deg)`;
        s.style.opacity = '0';
      });
      setTimeout(() => s.remove(), 1500);
    }
  }

  load();
})();
