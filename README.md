# 🎅 Таємний Миколай

Cloudflare Workers + D1. Безкоштовний тариф Cloudflare повністю покриває такий сайт.

## Деплой (один раз)

```bash
cd ~/secret-mykolai
npx wrangler login                          # відкриє браузер, увійти/зареєструватись у Cloudflare
npx wrangler d1 create secret-mykolai       # скопіювати database_id у wrangler.toml
npm run db:init:remote                      # створити таблиці
npx wrangler secret put INVITE_CODE         # код запрошення для друзів
npx wrangler secret put ADMIN_KEY           # секретний ключ для жеребкування (довгий, випадковий)
npm run deploy                              # покаже адресу сайту *.workers.dev
```

## Як користуватись

1. Надіслати друзям посилання + код запрошення.
2. Кожен реєструється, вказує ім'я, половинку, побажання та посилання.
3. Перевірити готовність:
   ```bash
   SITE_URL=https://secret-mykolai.<акаунт>.workers.dev ADMIN_KEY=... npm run status
   ```
4. Запустити жеребкування:
   ```bash
   SITE_URL=... ADMIN_KEY=... npm run draw
   ```
   Команда не показує, хто кому дарує — це видно лише кожному в його кабінеті.

Інші команди: `npm run redraw` (перекинути жереб заново), `npm run reset-draw` (скасувати жеребкування).

## Правила жеребкування
- ніхто не дарує сам собі;
- ніхто не дарує своїй половинці;
- пара встановлюється взаємно (досить, щоб її обрав один із пари);
- після жеребкування пару змінити не можна, а побажання — можна (отримувач бачить їх одразу).

## Локальний запуск
```bash
npm install
npm run db:init:local
npm run dev            # http://localhost:8787 (секрети беруться з .dev.vars)
```
