# Epitome

Luxury site for **Epitome**, a Sri Lankan highland Arabica house. One product: Premium Arabica Coffee, 500 g, whole bean, medium roast. Product of Sri Lanka.

The previous amateur page was retired. This is a new editorial site — crest, bag, and lifestyle stills — with a working reserve form.

## Run locally

PHP 8.1+ is required (`php-cli`). From the repo root:

```bash
EPITOME_MAIL_MODE=mock php -S 127.0.0.1:47183 -t .
```

Open [http://127.0.0.1:47183](http://127.0.0.1:47183).

On localhost the form does **not** send real email. Each reserve is appended as JSON lines under `data/orders/` (gitignored). CSRF still runs through `token.php`.

## Production mail

Set `EPITOME_MAIL_MODE=send` on a host where PHP `mail()` is configured for `epitomearabica.com`. Orders go to `support@epitomearabica.com`, with a confirmation to the customer.

| Mode | Behaviour |
| --- | --- |
| `auto` (default) | Mock on localhost; elsewhere `mail()`, then mock if `mail()` fails |
| `mock` | Write `data/orders/YYYY-MM-DD.jsonl` only |
| `send` | PHP `mail()` only — no file fallback |

Optional paths: `EPITOME_RATE_DIR`, `EPITOME_ORDER_DIR`. Rate limits live in `data/rate-limits/` (5 posts / 10 minutes / IP).

No SMTP passwords belong in this repo. Configure mail at the host, not in these files.

## Form contract

`GET token.php` → `{ "token": "<hex>" }`

`POST mail.php` fields: `firstName`, `lastName`, `email`, `country`, `grind`, `quantity`, `notes`, `_csrf`, `_gotcha`

Success `{ "ok": true }`. Errors `{ "ok": false, "error": "..." }` or `{ "ok": false, "errors": ["..."] }`.

## Layout

- `index.html` — the site
- `token.php` / `mail.php` — CSRF + order mail
- `inc/bootstrap.php` — session and JSON helpers
- `assets/` — crest, product, and lifestyle images, plus CSS/JS
