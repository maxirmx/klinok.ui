# Klinok

Klinok is a Russian-language, local-first veterinary application with operational email/password authentication and signed P2P authorization.

## Architecture

- `src/` — Vue UI. It starts with `GET /api/auth/session`, keeps private user keys in IndexedDB, and opens P2P databases only for an authenticated, attested device.
- `auth-node/` — Fastify/LevelDB authentication service for credentials, email verification, password recovery, HTTP sessions, device enrollment, and SMTP delivery.
- `p2p-node/` — untrusted OrbitDB storage/transport node. It verifies signed envelopes but receives no passwords or user private keys.
- `packages/protocol/` — shared event contracts, cryptography, authorization rules, and deterministic reducers used by browser and Node runtimes.

The current databases are `klinok-control-v1` and `klinok-medical-v3`. There is no migration or runtime fallback from earlier demo data.

Roles, profiles, pets, grants, and medical records are encrypted signed events in these OrbitDB databases; they are not rows in the authentication LevelDB. The browser keeps an IndexedDB cache and durable outbox. A change is shown as fully saved only after `p2p-node` acknowledges that the event was written to its persistent `/data` volume; offline changes remain visible with a pending-sync status and are retried in dependency order.

## Development

The easiest way to start the complete application locally is Docker Compose:

```sh
./scripts/run-local.sh
```

The script builds the images, provisions a local bootstrap Administrator, connects the
services with the generated trust keys, and waits for the application to become ready.
It prints the local credentials when it finishes. The application is available at
`http://localhost:8080` and Mailpit at `http://localhost:8025`.

After the complete stack is running, rebuild and restart only the UI service with:

```sh
./scripts/rebuild-ui.sh
```

The script preserves the running auth, P2P, and mail services and reuses their current
trust configuration.

### Смешанный режим разработки

Чтобы запустить сервисы аутентификации, P2P и почты в Docker, а интерфейс — через
Vite с горячей перезагрузкой, выполните:

```sh
./scripts/run-mixed-dev.sh
```

Скрипт временно останавливает контейнеры `ui` и `auth`, но сохраняет и переиспользует
те же локальные тома и данные, что и полный Docker-стек. Он выполняет provision при первом запуске,
получает публичные ключи доверия и идентификатор P2P-узла, формирует локальную
runtime-конфигурацию, публикует API приёма P2P-событий только на `127.0.0.1:8091`
и запускает `npm run dev`. Vite перенаправляет `/api/events` в этот API. Интерфейс
доступен по каноническому адресу `http://localhost:8080`, совпадающему с адресом
полного Docker-стека, а Mailpit — по адресу `http://localhost:8025`. Vite и локальный
Nginx перенаправляют запросы с альтернативных имён хоста на канонический адрес до
загрузки приложения, чтобы идентификатор устройства оставался в одном browser origin.
Пока backend-контейнеры продолжают работать, последующие запуски интерфейса можно
выполнять обычной командой `npm run dev`: Vite автоматически использует созданную
конфигурацию из `.klinok-local/`.

После первого запуска сборку backend-образов можно пропустить:

```sh
KLINOK_SKIP_BUILD=true ./scripts/run-mixed-dev.sh
```

Остановить backend-контейнеры можно командой, которую скрипт выводит перед запуском
Vite.

Docker with Compose v2 and `curl` are required. To rebuild less often after the first
run, use `KLINOK_SKIP_BUILD=true ./scripts/run-local.sh`. Stop the stack with:

```sh
COMPOSE_PROJECT_NAME=klinok_local docker compose down
```

If Compose crashes with `SIGBUS` or reports an input/output error under WSL, quit
Docker Desktop, run `wsl --shutdown` in Windows PowerShell, and restart Docker Desktop.

For local Node.js checks outside Docker:

```sh
npm ci
npm test
npm run build
```

## Bootstrap Administrator

Provision exactly once with secrets supplied through the environment or Docker secrets:

```sh
export KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru
export KLINOK_BOOTSTRAP_PASSWORD='a-long-initial-password'
export KLINOK_RECOVERY_PASSPHRASE='a-separate-long-offline-passphrase'
npm run build:auth && npm run auth:provision
```

Store `bootstrap-recovery.bundle.json` offline. The bootstrap account and Administrator role cannot be deleted or revoked. Losing every bootstrap device and the offline recovery bundle requires resetting the operational deployment.

## Ограничение частоты запросов к сервису аутентификации

Сервис аутентификации применяет ограничения до выполнения операций с LevelDB,
Argon2, SMTP и аттестационным ключом. Первый уровень учитывает адрес клиента и
защищает каждый маршрут от перебора и истощения ресурсов. Второй уровень объединяет
запросы по нормализованному адресу электронной почты, хешу токена или идентификатору
аккаунта, поэтому смена адреса клиента не обходит ограничения для одной учётной записи.
Адреса электронной почты и идентификаторы аккаунтов не сохраняются в ключах счётчиков:
для них используется HMAC-SHA-256 со случайным ключом процесса.

Начальные значения ограничений:

| Операция | По адресу клиента | Дополнительное ограничение |
| --- | ---: | ---: |
| Регистрация | 5 запросов в час | 1 письмо в сутки на адрес электронной почты |
| Вход | 30 запросов за 15 минут | 5 неудачных попыток за 15 минут на аккаунт |
| Запрос восстановления пароля | 10 запросов в час | 3 письма в час на аккаунт |
| Подтверждение почты и сброс пароля | 20 запросов за 15 минут | 5 попыток за 15 минут на хеш токена |
| Чтение сессии | 300 запросов в минуту | — |
| Изменение профиля и обычный выход | 60 запросов в минуту | 60 изменений в минуту на аккаунт |
| Выход на всех устройствах, удаление аккаунта и операции с устройствами | 10 запросов в минуту | 10 чувствительных изменений в минуту на аккаунт |

При превышении публичного ограничения сервис отвечает кодом `429`, возвращает
`error.code` со значением `RATE_LIMITED` и заголовок `Retry-After`. Ограничения на
повторную отправку писем не раскрывают существование аккаунта: сервис сохраняет
одинаковый ответ `202 {"accepted":true}`, но не выполняет повторную отправку.
Прежняя сохраняемая в аккаунте блокировка `lockedUntil` больше не используется как
основной механизм защиты; неудачные входы учитываются во временном счётчике.

Сервис по умолчанию не доверяет `X-Forwarded-For`. Параметр
`KLINOK_AUTH_TRUST_PROXY` должен содержать точное число доверенных промежуточных
узлов либо доверенный адрес или диапазон сети. Значение `true` нельзя использовать
при доступности порта сервиса из недоверенной сети. В локальном Docker Compose
установлено значение `1`, поскольку порт контейнера `auth` не опубликован и запросы
приходят только через nginx контейнера `ui`.

Пороговые значения настраиваются переменными окружения:

- `KLINOK_RATE_LIMIT_REGISTRATION_IP_PER_HOUR`;
- `KLINOK_RATE_LIMIT_REGISTRATION_EMAIL_PER_DAY`;
- `KLINOK_RATE_LIMIT_LOGIN_IP_PER_15_MINUTES`;
- `KLINOK_RATE_LIMIT_LOGIN_FAILURES_PER_ACCOUNT_15_MINUTES`;
- `KLINOK_RATE_LIMIT_RECOVERY_IP_PER_HOUR`;
- `KLINOK_RATE_LIMIT_RECOVERY_ACCOUNT_PER_HOUR`;
- `KLINOK_RATE_LIMIT_TOKEN_IP_PER_15_MINUTES`;
- `KLINOK_RATE_LIMIT_TOKEN_PER_15_MINUTES`;
- `KLINOK_RATE_LIMIT_SESSION_IP_PER_MINUTE`;
- `KLINOK_RATE_LIMIT_MUTATION_IP_PER_MINUTE`;
- `KLINOK_RATE_LIMIT_SENSITIVE_MUTATION_IP_PER_MINUTE`;
- `KLINOK_RATE_LIMIT_MUTATION_ACCOUNT_PER_MINUTE`;
- `KLINOK_RATE_LIMIT_SENSITIVE_MUTATION_ACCOUNT_PER_MINUTE`.

Все значения должны быть положительными целыми числами. Счётчики находятся в памяти
процесса. Такая конфигурация рассчитана на один экземпляр `auth-node`; перед запуском
нескольких экземпляров необходимо подключить общее отказоустойчивое хранилище
счётчиков и единый секрет для формирования приватных ключей ограничений.

## Security boundaries

- Roles are `administrator`, `doctor`, and `owner`; users explicitly select one active role for every route and signed write.
- Profiles and medical records are encrypted with AES-GCM. Keys are wrapped with RSA-OAEP-256 and event envelopes are signed with ECDSA P-256.
- Administrators manage accounts and roles but receive no medical key envelopes.
- Revoking pet access rotates the key for future records; historical data already decrypted by a recipient cannot be clawed back.
- Legal document text, versions, retention schedules, SMTP, credentials, and persistent volumes are deployment-owned configuration.
