# 🎅 Таємний Миколай

Невеликий сайт для жеребкування подарунків на День Святого Миколая (або Secret Santa) для компанії друзів.

- 🔐 реєстрація за кодом запрошення — сторонні не зайдуть;
- 💑 кожен вказує свою половинку — пари ніколи не дарують одне одному;
- 🎁 профіль з побажаннями та посиланнями на магазини / вішліст;
- 🎲 жеребкування запускає організатор командою, а результат бачить **лише сам учасник** у своєму кабінеті (з анімацією відкриття подарунка);
- ✏️ побажання можна оновлювати будь-коли — «Миколай» одразу бачить зміни;
- 📱 адаптивний святковий інтерфейс українською.

Стек: **Cloudflare Workers + D1** (SQLite) + чистий HTML/CSS/JS, без фреймворків. Безкоштовного тарифу Cloudflare вистачає з запасом.

> **English:** a tiny Secret Santa site for a group of friends (UI in Ukrainian). Invite-code sign-up, profiles with wishlists, couples are never matched with each other, and each person sees only their own match. Runs on Cloudflare Workers + D1 free tier. See deployment steps below — commands are the same in any language.

## Розгорнути у себе

Потрібні Node.js 18+ та безкоштовний акаунт [Cloudflare](https://dash.cloudflare.com/sign-up).

```bash
git clone https://github.com/<you>/secret-mykolai.git
cd secret-mykolai
npm install

npx wrangler login                          # вхід у Cloudflare через браузер
npx wrangler d1 create secret-mykolai       # скопіюйте database_id у wrangler.toml
npm run db:init:remote                      # створити таблиці
npx wrangler secret put INVITE_CODE         # код запрошення для друзів
npx wrangler secret put ADMIN_KEY           # довгий випадковий ключ організатора (напр. `openssl rand -hex 24`)
npm run deploy                              # виведе адресу сайту *.workers.dev
```

> Якщо це перший Worker в акаунті, Cloudflare попросить обрати піддомен `workers.dev` —
> зробіть це в інтерактивному терміналі або в панелі Cloudflare (Workers & Pages → Overview).

### Налаштування під свою компанію

| Що | Де |
|---|---|
| Кількість учасників (за замовчуванням 8 = 4 пари) | `EXPECTED_PARTICIPANTS` у `wrangler.toml` |
| Код запрошення | секрет `INVITE_CODE` |
| Ключ організатора | секрет `ADMIN_KEY` |
| Назва, дата свята, тексти | `public/index.html`, `public/app.js` |
| Кольори та шрифти | змінні на початку `public/style.css` |

Зараз кожен учасник має бути в парі, тож кількість учасників має бути парною.

## Як користуватись

1. Надішліть друзям посилання й код запрошення.
2. Кожен реєструється і заповнює профіль: ім'я, половинка, побажання, посилання.
3. Перевірте готовність:
   ```bash
   SITE_URL=https://secret-mykolai.<subdomain>.workers.dev ADMIN_KEY=... npm run status
   ```
4. Запустіть жеребкування:
   ```bash
   SITE_URL=... ADMIN_KEY=... npm run draw
   ```
   Команда не показує, хто кому дарує — кожен бачить це лише у своєму кабінеті.

Інші команди: `npm run redraw` (перекинути жереб заново), `npm run reset-draw` (скасувати жеребкування).

Зручно зберегти `SITE_URL` і `ADMIN_KEY` у файл `.admin.env` (він у `.gitignore`) і підвантажувати так:
`set -a && . ./.admin.env && set +a && npm run status`

## Правила жеребкування
- ніхто не дарує сам собі;
- ніхто не дарує своїй половинці;
- пара встановлюється взаємно (досить, щоб її обрав один із пари);
- після жеребкування пару змінити не можна, а побажання — можна.

> ℹ️ Власник акаунта Cloudflare технічно може подивитися розподіл у базі D1. Не заглядайте — і сюрприз залишиться і для вас 😉

## Локальний запуск

```bash
npm install
npm run db:init:local
printf 'INVITE_CODE="test"\nADMIN_KEY="local-admin-key"\n' > .dev.vars
npm run dev            # http://localhost:8787
```

## Структура

```
src/worker.js      API: реєстрація, вхід, профіль, жеребкування
public/            фронтенд (index.html, app.js, style.css)
schema.sql         схема бази D1
scripts/admin.mjs  команди організатора (status / draw / redraw / reset)
```

## Ліцензія

[MIT](LICENSE) — беріть, змінюйте, користуйтесь на здоров'я. Веселих свят! 🎄
