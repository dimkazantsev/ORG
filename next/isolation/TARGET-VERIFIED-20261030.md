# QWIZ-PARTY — проверка реального целевого Supabase, 30.10.2026

**Статус: ЦЕЛЕВОЙ FREE ПРОЕКТ ДОСТУПЕН, МИГРАЦИЯ НЕ ВЫПОЛНЕНА.**

Этот отчёт составлен после успешного подключения к новому проекту и выполнения read-only SQL. Указанные здесь факты подтверждены подключённым Supabase, а не скриншотами, предположениями или эмуляцией.

## 1. Подтверждённая идентичность целевого проекта

| Свойство | Значение |
|---|---|
| Organization | `QWIZ-PARTY` |
| Organization ID | `vxqczzkvuxlgqwuykrwi` |
| План организации | `free`, tier `tier_free` (вызов `get_organization`) |
| Project ID и ref | `vwsoergltegncrretxnz` |
| Project display name | `richard_alabama@proton.me's Project` (как возвращает API; отображаемое имя можно изменить позднее) |
| Регион | `eu-west-1` |
| Состояние | `ACTIVE_HEALTHY` |
| PostgreSQL | `17.11` (проект сообщает `17.11.0.003`) |
| API URL | `https://vwsoergltegncrretxnz.supabase.co` (по project ref) |
| Старый ГОС.ID | `bderfrcfuhnutuoyudje` / `eu-central-1` / PostgreSQL 17.6 (по предыдущему read-only аудиту) |

Новый QWIZ находится в другой организации, поэтому его PostgreSQL/Auth/Realtime/Storage не разделяют вычислительный инстанс ГОС.ID и организационные лимиты. При этом **Free может быть медленнее** Pro и не гарантирует отсутствие паузы после бездействия. Сравнительное тестирование на 40 студентов остаётся обязательным.

## 2. Прямая SQL-проверка нового PostgreSQL

Успешно выполнены read-only запросы: `SELECT current_database(), current_setting('server_version')`, подсчёты объектов в `pg_tables`, `pg_proc`, `auth.users`, `storage.buckets`, `storage.objects`, `pg_publication_tables`, `pg_extension`.

| Объект/показатель | Фактически |
|---|---:|
| User tables в `public` | **0** |
| Функции `qwiz_*` в `public` | **0** |
| Записи `auth.users` | **0** |
| Storage buckets | **0** |
| Storage objects | **0** |
| Таблицы в `supabase_realtime` publication | **0** |
| История миграций Supabase | **0** |
| Edge Functions | **0** |

Предустановленные расширения: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`. В отличие от исходного проекта здесь не установлены `pg_cron` и `pg_net`; устанавливать их до определения QWIZ зависимости **не нужно**.

Это пустая рабочая база Supabase с поддерживающими служебными схемами; **НЕ** готовый QWIZ backend. Не заливать все SQL из репозитория последовательно.

## 3. Результат проверки доступа к прежнему ГОС.ID

После выбора организации QWIZ, подключённый ChatGPT Supabase connector в `list_organizations` видит только `QWIZ-PARTY`, в `list_projects` только новый проект. `get_project(id='bderfrcfuhnutuoyudje')` возвращает `MCP error -32600: You do not have permission to perform this action`.

Таким образом: новый проект существует и доступен; **одновременный прямой доступ к двум организациям из одного подключения ChatGPT всё ещё НЕ подтверждён**. Переключение connector между организациями не равно второму каналу управления.

Это влияет на следующие этапы: без авторизованного чтения старого live PostgreSQL нельзя получить актуальный список столбцов, индексов, RLS, представлений, RPC и выборочный snapshot QWIZ; нельзя проверить кросс-данные Auth и надёжно перенести их.

## 4. Что было в исходной БД при предыдущем аудите

Снимок от 29–30.10.2026: 36 таблиц `qwiz_*`, 5 `org_next_*`, 16 `org_quiz_*`, 95+10+32 функций, 9 QWIZ/next пользовательских триггеров, 4 legacy views, 23 текстовых обращения `qwiz_*` к `org_quiz_*`, две функции `org_party_*` с упоминаниями QWIZ. Среди выборочных таблиц обнаружены 11 уникальных QWIZ-linked auth IDs из 57 auth accounts, это **не полный список для переноса**. Бакеты: `game-assets` 75 объектов, `game-media` 4, `org-party-media` 0, `teacher-assets` 2; владелец объектов требует проверки.

Данные не были выгружены, это только каталогизация. Изменения за время после аудита возможны.

## 5. Безопасный дальнейший маршрут

1. Обеспечить второй **независимый доступ только на чтение** к старой БД, например из отдельного GitHub Actions workflow с защищённым GitHub Secret `GOS_SOURCE_DB_URL`, без раскрытия подключения в исходном коде или чате. Другой способ — project-scoped Codex MCP для GOS при сохранённом ChatGPT connector QWIZ.
2. Проверить оба endpoint в одном ограниченном read-only smoke test; содержимое DB URL никогда не печатать в логи. Нижеописанный smoke test должен работать только при совпадении обоих ref.
3. Создать **локально/в защищённом хранилище** полный снапшот исходной базы и отдельно проверить возможность восстановления. Для переноса выбрать **только** QWIZ closure, а не клонировать ГОС.ID полностью.
4. Подготовить схемы QWIZ с настоящими определениями RLS/GRANT/RPC, импортировать в пустой QWIZ только после проверки порядка зависимостей. Старый ГОС.ID не изменять.
5. Определить, переносить ли исторические игры и пользователей QWIZ; при переносе сохранить UUID/FK и проверить миграцию Auth; не копировать чужие аккаунты.
6. Перенести подтверждённые QWIZ Storage объекты (байты и policies), Edge Function `org-resolve-image` при необходимости, приватные ключи хранить в защищённой среде.
7. Выполнить функциональные тесты всех экранов, затем **40 реальных клиентов и 40 Realtime соединений**, измерить p50/p95/p99, пропуски и непрерывность.
8. Переключить QWIZ frontend в отдельном утверждённом commit/release при сохранённом плане отката. ГОС.ID не трогать.
9. **Не удалять** старые QWIZ таблицы, учётные записи, объекты из общей БД до отдельной явно подтверждённой операции после проверки.

## 6. Что намеренно не делалось

Не импортировались `next/migration.sql` или исторические `next/migrations/*`, потому что они не представляют подтверждённый live snapshot всей текущей структуры. Не подключался сервисный ключ, не выполнялись production DDL/INSERT/UPDATE/DELETE, не создавались дополнительный платный проект или лишняя Free организация. Не переключались GitHub Pages и Vercel. Не утверждается, что QWIZ уже перенесён.

## 7. Материалы

- Полный исходный аудит: `next/isolation/REPORT-20261030.md`.
- Подготовка раздельных frontend: `next/isolation/build-preview.mjs` и `boundary.mjs`.
- Предыдущий изолированный WS-бенчмарк: PR #111, `next/selfhost/realtime-40.mjs` (это **не** proof для нового backend).
- Официальная миграция Supabase: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

**Следующее состояние, которое разрешено объявить: «экспорт исходной схемы QWIZ проверен». Не «обе базы окончательно разделены».**

## 8. Проверка независимого канала GitHub Actions, 30.10.2026

Для предотвращения постоянной смены авторизации Supabase подготовлен минимальный безопасный канал read-only проверки двух баз:
- `next/isolation/verify-two-databases-readonly.sh` — читает только агрегированные каталожные метрики двух PostgreSQL, выполняет проверку expected project ref, ограничивает SQL в параметрах `default_transaction_read_only=on`, `statement_timeout=10000`, `lock_timeout=2000`. Не печатает SQL-соединения, пользователей или секретные ключи.
- `.github/workflows/qwiz-dual-db-readonly.yml` — workflow с `contents:read`. Значения connection string ожидаются **только** в encrypted GitHub Actions secrets `GOS_SOURCE_DB_URL` и `QWIZ_TARGET_DB_URL`. Их нельзя отправлять в чат, хранить в исходных файлах или писать в issue/PR. Желательно использовать наименьшие достаточные привилегии, а не сервисный ключ с административными правами.

**Фактический запуск:** https://github.com/dimkazantsev/ORG/actions/runs/40930793181 — syntax check SUCCESS; шаг `Read only metadata from both independent projects` SKIPPED: одна либо обе Secret variables отсутствуют. Следовательно, **доступ к старой базе через GitHub Actions пока НЕ работает** и внешняя миграция не выполнялась.

Для следующего этапа владелец репозитория должен добавить два названных секрета через `ORG → Settings → Secrets and variables → Actions`. Источники значений — безопасные PostgreSQL connection strings из соответствующих Supabase Dashboard → Connect, предпочтительно session pooler port 5432 с ограниченным читательским аккаунтом; строки не должны попадать в лог, исходный код или чат. Workflow сравнивает ref `bderfrcfuhnutuoyudje` и `vwsoergltegncrretxnz`. После добавления запускается отдельная проверка. Только успешный реальный SELECT из обоих проектов даст право начать детальное планирование выборочного экспорта.

**Важное ограничение:** проверка metadata не делает резервную копию. Чтобы перенести Auth и игровые данные, понадобится отдельно утверждённый защищённый экспорт/импорт с контрольными суммами и snapshot, без публикации чужих пользовательских данных в общедоступном репозитории.

## 9. Режим с одним секретом и фактический результат 30.10.2026

Для первого этапа в GitHub Actions теперь **достаточно одного** секрета `GOS_SOURCE_DB_URL`, потому что целевой QWIZ доступен напрямую через Supabase connector и проверен read-only SQL. `QWIZ_TARGET_DB_URL` оставлен **необязательным**: пригодится для будущей сквозной проверки двух баз, но не должен задерживать исследование старой.

Workflow `.github/workflows/qwiz-dual-db-readonly.yml` обновлён. Bash-скрипт `next/isolation/verify-two-databases-readonly.sh` строго проверяет **hostname и username** обеих URI (postgres direct или официальный session pooler 5432), project refs, TLS, включённые ограничители `default_transaction_read_only=on` и время SQL; содержимое URI не выводится.

**Контрольный запуск:** https://github.com/dimkazantsev/ORG/actions/runs/40932017810. GitHub Actions завершился успешно только для синтаксиса, а реальная проверка source **SKIPPED**, поскольку секрет `GOS_SOURCE_DB_URL` ещё не обнаружен. Workflow специально пишет явное предупреждение о непроверенном источнике. Не считать этот запуск свидетельством доступа к обоим серверам.

**Один требуемый шаг в веб-интерфейсе:**

1. Перейти в https://github.com/dimkazantsev/ORG/settings/secrets/actions
2. Нажать **New repository secret**.
3. Name: `GOS_SOURCE_DB_URL`.
4. Secret: защищённая PostgreSQL URI **старой базы** `bderfrcfuhnutuoyudje` из https://supabase.com/dashboard/project/bderfrcfuhnutuoyudje (кнопка **Connect**, способ **Session pooler**, порт 5432). Пароль должен содержаться в URI и быть URL-encoded, если включает специальные символы.
5. Нажать **Add secret**. Не писать саму URI в чат или PR/Issues. При возможности использовать отдельно созданную read-only роль без прав изменения, а не основного `postgres`.
6. После создания секрета сообщить **«Секрет GOS_SOURCE_DB_URL добавлен»**, не присылая значение. Workflow запускается при изменении файлов в ветке `isolation/qwiz-independent-supabase-20261030`; я внесу безопасную контрольную фиксацию в эту ветку, чтобы инициировать read-only проверку. Кнопка **Run workflow** для нового workflow может быть скрыта, пока файл не присутствует в ветке `main`, поэтому не следует рассчитывать только на ручной запуск.

Отдельный источник без изменений: GoS.ID рабочий postgres; данные и пользователи **не** выгружались. В новом QWIZ на момент повторного SELECT по-прежнему `0` таблиц, `0` auth.users, `0` buckets и `0` игровых функций. Исходную базу нельзя модифицировать до согласованного экспорта и контрольного восстановления.


## 10. Повторная проверка после добавления секрета — диагностирован шаблон пароля

На скриншоте GitHub `Settings → Secrets and variables → Actions` подтверждено имя `GOS_SOURCE_DB_URL`. После этого агент безопасно перезапустил ранее успешно завершённый job, чтобы он перечитал свежий секрет без правки production:
- Re-run workflow https://github.com/dimkazantsev/ORG/actions/runs/40932017810, job `123657866482`: шаг `Confirm private source connection is configured` успешно прошёл; шаг `Query GOS source and optional QWIZ target metadata` завершился ошибкой `invalid database URL for GOS_SOURCE_DB_URL`. Источник не запрашивался SQL, потому что проверка строки остановилась раньше.
- Уточнён безопасный валидатор: детектирует шаблоны пароля и формат URI, не печатает содержимое секрета.
- Следующий запуск https://github.com/dimkazantsev/ORG/actions/runs/40933638647, job `123658325789`: **точный статус `PASSWORD_PLACEHOLDER`**. В секрете сохранена стандартная заглушка Supabase `[YOUR-PASSWORD]`, вместо настоящего PostgreSQL-пароля.

**Следующее действие владельца:** GitHub → ORG → Settings → Secrets and variables → Actions → редактирование существующего `GOS_SOURCE_DB_URL` (карандаш) → заменить `[YOUR-PASSWORD]` внутри URI на реальный пароль старого PostgreSQL с URL-encoding спецсимволов → **Update secret**. Не сообщать пароль в чат и не использовать кнопку `Reset database password` без отдельного анализа действующих клиентов. После обновления секрет можно проверить повторно тем же безопасным workflow.

**Не выполнено:** подключение к старой базе; экспорт; миграция. Рабочий ГОС.ID и QWIZ не изменены; в логи пароли не выводились.


## 11. Создание отдельного каталожного читателя без пароля postgres

Подготовлен `next/isolation/CREATE-GOS-CATALOG-READER.sql`. Этот скрипт **должен быть запущен владельцем вручную в SQL Editor СТАРОГО GOS.ID**, поскольку текущее ChatGPT Supabase соединение авторизовано только в отдельной Free организации QWIZ.

- Создаёт/при повторном запуске меняет **только** `qwiz_catalog_reader`.
- Новый URL-safe пароль генерируется на сервере из двух `gen_random_uuid()` (64 hex символа), не содержится в SQL-исходнике или GitHub.
- Роль: LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, CONNECTION LIMIT 2; нет явных прав SELECT на игровые таблицы или Auth. Это **читатель системных каталогов**, не готовая роль для дампа пользовательских данных.
- Для защиты установлены default_transaction_read_only, statement_timeout 10s и lock_timeout 2s; также workflow использует явную PostgreSQL READ ONLY transaction.
- SQL выводит **одно значение секрета**: `postgresql://qwiz_catalog_reader.bderfrcfuhnutuoyudje:...@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`. Хост сверить с Supabase Connect; пароль никому не отправлять.
- Роль в принципе может иметь унаследованные PUBLIC права EXECUTE на отдельные функции; ограничения роли не являются абсолютной защитой от всех SECURITY DEFINER побочных эффектов. Тестовый workflow выполняет только catalog SELECT в read-only transaction.
- Изменён `next/isolation/verify-two-databases-readonly.sh`: источник допускает **только** custom role `qwiz_catalog_reader.PROJECT_REF` на session pooler 5432 и отвергает `postgres`, чтобы не хранить основной пароль в GitHub.
- Пройден изолированный тест на PostgreSQL 17 (не в ГОС.ID): https://github.com/dimkazantsev/ORG/actions/runs/40935400933 — роль создана, её атрибуты проверены, подключение работает, записать таблицу нельзя. Это **не** свидетельство доступа к реальной базе.

Далее пользователь должен скопировать `github_secret_GOS_SOURCE_DB_URL` **из своего SQL Editor** в GitHub repository secret `GOS_SOURCE_DB_URL`, заменив прежнее значение (карандаш). Не отправлять результат SQL в чат, screenshots, issues или PR. При необходимости сверить pooler hostname в Supabase Connect.

После этого безопасный source read-only workflow `qwiz-dual-db-readonly.yml` может проверить каталог и запустить следующий этап проектирования выборочного QWIZ экспорта. **Дамп данных, Auth, Storage и реальная миграция ещё не выполнены.**


## 12. Подтверждён живой источник через независимую роль (30 октября 2026)

**Не путать успешное подключение с завершённой миграцией.**

1. После создания пользователем роли `qwiz_catalog_reader` в SQL Editor `gos-sim` и помещения URI в защищённый GitHub Secret `GOS_SOURCE_DB_URL` был повторно запущен read-only workflow: https://github.com/dimkazantsev/ORG/actions/runs/40935266661 (attempt 2). **Завершился SUCCESS.**
2. В GitHub Actions реальный SQL исходной БД вернул `36|5|16|95|17.6`: 36 `qwiz_*`, 5 `org_next_*`, 16 `org_quiz_*`, 95 функций `qwiz_*`, PostgreSQL 17.6. Это подтверждение реального соединения со старой базой, а не только наличие Secret.
3. Добавлен `next/isolation/inspect-source-catalog-readonly.sql` + `.github/workflows/qwiz-source-catalog-audit.yml`. Workflow https://github.com/dimkazantsev/ORG/actions/runs/40936680109 **SUCCESS**, читает только PostgreSQL системные каталоги в `BEGIN READ ONLY`, без вывода тел функций, персональных данных и паролей.

### 12.1. Результаты расширенного аудита старого GOS.ID

| Объекты / признаки | `qwiz_*` | `org_next_*` | `org_quiz_*` |
|---|---:|---:|---:|
| Обычные таблицы | 36 | 5 | 16 |
| Таблицы с RLS | 36 | 5 | 16 |
| Представления | 0 | 0 | 4 |
| Функции | 95 | 10 | 32 |
| Из них SECURITY DEFINER | 79 | 10 | 25 |
| Участники стандартной Realtime publication | 0 | 0 | 5 |

Дополнительно найдены 3 функции с префиксом `org_party_*`, все SECURITY DEFINER, но **только две** из них содержат текстовые упоминания QWIZ/legacy и требуют дальнейшего dependency review.

Суммарно по трём основным семействам: **57 таблиц**, **137 функций**, **114 SECURITY DEFINER**, **111 индексов**, **20 RLS policies**, **9 пользовательских триггеров**. По catalog SQL: **111 FK внутри этих семейств**, **13 FK из семейства к внешним таблицам**, и **все 13 ведут в `auth`**; внешних FK из других таблиц в QWIZ семейство не найдено. `23` функции `qwiz_*` содержат текстовые ссылки на `org_quiz_*`. Это *частичный статический подсчёт*, не полный транзитивный dependency graph.

Исходная БД содержит расширения `pg_cron 1.6.4` и `pg_net 0.20.4`, в отличие от новой базы QWIZ; нельзя переносить cron jobs целиком — прежде необходимо доказать их принадлежность.

### 12.2. Повторная сверка целевой QWIZ Free

Прямой SQL через подключённый Supabase к `vwsoergltegncrretxnz` подтвердил:
- тариф организации `free`, проект `ACTIVE_HEALTHY`, PostgreSQL 17.11;
- `public` таблиц **0**, `auth.users` **0**, Storage buckets **0**, функций `qwiz_*` **0**.

Таким образом, целевой проект готов к *дальнейшему планированию* миграции, но в нём нет ни игровой схемы, ни архивов и учётных записей.

### 12.3. Необходимые следующие этапы

- **Схема:** получить актуальные определения 57 таблиц, 137 функций, 4 views, 111 индексов, 20 policies, триггеров, grants, ownership, types, sequences, helper functions; сопоставить с проверенными зависимостями. Читатель каталогов даёт только метаданные, пока нет подтверждённого полного schema-only snapshot.
- **Данные:** получить отдельный строго ограниченный механизм экспорта QWIZ-строк; каталоговая роль не имеет явных прав SELECT на пользовательские таблицы, поэтому успешный каталоговый тест не означает возможность экспорта. Нельзя распространять пользовательские данные через публичный GitHub repository, job logs или PR.
- **Auth:** выборочный перенос аккаунтов / UUID / identities / credentials, не копировать всех пользователей ГОС.ID; проверить 13 FK и дополнительные динамические ссылки на auth.
- **Storage/Realtime:** определить владельца 81 ранее обнаруженного объекта в четырёх buckets, перенести нужные реальные байты, policies, публикацию пяти legacy таблиц и Broadcast/RPC контракт.
- **Staging:** развернуть QWIZ на новом проекте, проверить login, 40 студенческих сессий, 40 WebSockets, ответы/очки, географию, флаги, секретный код, проектор, reconnect и производительность.
- **Переключение:** только после сохранённых и проверенных резервных копий, окно отсутствия активных игровых сессий, согласованный rollback. Ни ГОС.ID production, ни публичные URL QWIZ до этого не изменять.

**Никаких DDL/DML с игровыми данными источника и целевой базы в рамках текущего этапа не выполнялось.** В источнике предварительно создана единственная ограниченная техроль по отдельному ручному действию пользователя.


## 13. Автоматизированная фиксация реальных определений QWIZ через PostgreSQL catalogs (30.10.2026)

### 13.1. Почему обычный pg_dump не подходит для действующего ограниченного читателя

Создан **отдельный проверочный**, не публикующий дамп workflow `qwiz-schema-only-preflight.yml`:
https://github.com/dimkazantsev/ORG/actions/runs/40937511477

Он запрашивал только схему `public` посредством PostgreSQL 17 `pg_dump --schema-only --format=custom`, без экспорта пользовательских данных. Возникло ожидаемое сообщение `permission denied for table games`: `pg_dump` пытается удерживать `ACCESS SHARE` блокировки всех таблиц публичной схемы, включая таблицы ГОС.ID, а роль `qwiz_catalog_reader` не имеет их разрешений. **Ни копирования данных, ни изменений source не было.** Не повышать права этой роли на все таблицы ГОС.ID ради запуска `pg_dump`.

### 13.2. Безопасный обход через системные каталоги — SUCCESS

Подготовлены `next/isolation/source-schema-catalog-private.sql`, `check-private-schema-manifest.py`, `qwiz-private-catalog-manifest.yml`. Источник — системные `pg_class`, `pg_attribute`, `pg_constraint`, `pg_index`, `pg_trigger`, `pg_policy`, `pg_proc`; функции `pg_get_functiondef`, `pg_get_viewdef`, `pg_get_constraintdef`, `pg_get_indexdef`. **Нет SELECT из пользовательских таблиц или auth.users.** SQL работает в `BEGIN READ ONLY` с timeouts, личные данные отсутствуют.

Подтверждённые успешные запуски:
- https://github.com/dimkazantsev/ORG/actions/runs/40937935395 — определения собрались и были проверены;
- https://github.com/dimkazantsev/ORG/actions/runs/40938426785 — уточнён анализ SECURITY DEFINER и зависимостей.

**Состав приватного временного снимка**: 57 QWIZ/legacy таблиц, 420 колонок, 283 constraints (включая 13 FK на внешние auth объекты), 111 индексов, 9 triggers, 20 RLS policies, 4 views, 137 QWIZ/legacy функций и 2 смежные `org_party_*` функции. Последние две входят в проверку, но третья `org_party_*` функция остаётся на отдельном dependency review.

`SHA256` сериализованных определений:
`3fc6b6bb54afda9165fdfb61f4ed1e8fcf5cceab06f71651b1e54bd73e960167`.

Тела функций и DDL сохранялись **только в приватный временный файл внутри GitHub runner** (без Upload Artifacts, Git commits, распечатки SQL или открытых ссылок), затем временный файл удалялся. Сам SHA — метка воспроизводимости, **не резервная копия и не файл миграции**.

### 13.3. Контроль опасных зависимостей

По статическому текстовому анализу `pg_get_functiondef`:
- 116 функций в выборке используют `SECURITY DEFINER` (114 из трёх основных семейств + 2 дополнительных helper);
- все 116 имеют явное `SET search_path ...` в определениях, что **само по себе не доказывает** безопасность исполнения; значения search_path и RPC permissions необходимо проверять отдельно;
- 64 функции содержат текстовые обращения к `auth.*`;
- прямых текстовых обращений к публичным объектам **вне** перечисленных QWIZ-подсемейств и двух helper не выявлено, но динамический SQL, `search_path` и неявные зависимости не гарантированно обнаруживаются этим методом;
- отдельные 13 FK ведут к объектам `auth` и требуют сохранять UUID и согласовать перенос идентичностей, иначе импорт игровых записей будет неполным.

### 13.4. Что остаётся заблокированным

- **Схема** ещё не экспортирована в окончательный воспроизводимый, полнофункциональный SQL-миграционный пакет: каталоговый JSON содержит проверенные определения, но нет полного переноса последовательностей, привилегий, специальных типов, порядка исполнения и смежных public функций. Он также не сохраняется как открытый артефакт из соображений безопасности.
- **Данные** таблиц QWIZ (включая студентов) не выгружались. Техническая роль остаётся ограниченной каталогами. Потребуется отдельная процедура с подтверждённым доступом **только к QWIZ**, защищённой передачей и обратимым снимком.
- **Auth/Storage/Realtime**, конфигурация клиента, Edge Functions и тест 40 студентов на новом Free проекте не перенесены/не завершены.
- **Текущая production** ГОС.ID остаётся неприкосновенной. **Новый Supabase QWIZ Free** остаётся пустой (последняя read-only проверка: 0 `public` таблиц / пользователей).
- Ошибочно объявлять физическое разделение нагрузки завершённым, пока QWIZ frontend указывает на прежний `bderfrcfuhnutuoyudje`.

### 13.5. Следующие действия реализации

1. Собрать **внутри закрытого временного runner** полный независимый миграционный кандидат с сохранением типов, DEFAULT, RLS, policies, GRANT/EXECUTE и последовательностей, протестировать на disposable Postgres/Supabase; никаких дампов в публичном GitHub.
2. Получить **ограниченный, отзывный и защищённый доступ для передачи только данных QWIZ**, исключив таблицы ГОС.ID. Провести выборочный export/import с отдельным аудитом linked Auth users и Storage.
3. Подготовить тестовую сборку QWIZ на новом endpoint, выполнить 40-участниковые нагрузки и E2E, затем план controlled cutover, и только после отдельного согласования — очищать старые объекты.


## 14. Проверка таблиц, ограничений и индексов на **одноразовой** PostgreSQL 17

**Важно: не является полным переносом, не было записи в новую QWIZ Free или исходную ГОС.ID.**

Созданы скрипты `next/isolation/disposable-table-types.py`, `disposable-table-integrity.py` и workflow `.github/workflows/qwiz-disposable-table-type-test.yml`.

Используется ранее проверенный ограниченный каталоговый доступ к рабочему ГОС.ID только на чтение. Во временном приватном каталоге GitHub runner строится **неразвёртываемый типовой прототип** из точно проверенного QWIZ manifest. Рядом запускается disposable PostgreSQL 17 как GitHub Actions service. Выгрузка данных и пользовательских записей **не выполняется**.

Успешные испытания:
- https://github.com/dimkazantsev/ORG/actions/runs/40938831207 — 57/57 таблиц и 420/420 SQL типов столбцов созданы на disposable PG17; RLS enabled.
- https://github.com/dimkazantsev/ORG/actions/runs/40939058997 — повторно 57/57 таблиц, **283/283 ограничений** (включая внешние ключи с локальным заглушечным `auth.users(id)`) и **34 дополнительных индекса**, остальные индексы создаются автоматически при определении PRIMARY KEY/UNIQUE ключей. Итого исходный catalog учёл 111 индексов. Сервис PostgreSQL уничтожается после job.

Стандартный `pg_dump` предыдущего этапа требовал права `LOCK` на чужие таблицы ГОС.ID, поэтому **вместо повышения прав** используется система каталогов; никакие запросы к персональным данным не делались.

### Принципиальные ограничения этого испытания

Прототип **намеренно не включает** выражения `DEFAULT`, `GENERATED`, `IDENTITY`, физические sequences, исходные RLS policies, сложные разрешения GRANT/REVOKE, все 139 функций, триггеры, 4 представления, настоящие `auth.users`, Auth identities и Storage. Таблицы в нём пустые, и внешние ключи проходят против **фиктивной** структуры auth в disposable DB. Это тест совместимости SQL-типов и базовых ограничений, **не готовый SQL для целевого проекта**.

Связанные SECURITY DEFINER функции: 116 из 139; все 116 имеют `SET search_path` в исходном определении, текстово 64 функции обращаются к `auth.*`. Текстовый поиск не заменяет проверку динамических SQL-вызовов и EXECUTE/GRANT.

Последняя повторная проверка через прямое подключение Supabase показала новый проект `vwsoergltegncrretxnz` в статусе `ACTIVE_HEALTHY` и по-прежнему **0 user tables, 0 auth users, 0 storage buckets, 0 qwiz functions**.

**Состояние реализации:** схема QWIZ реконструируется и тестируется только в одноразовой среде, реальная миграция пока не начиналась. Следующий этап — безопасная проверка SQL-функций и политик в disposable Supabase, формирование обратимого пакета, после чего отдельная защищённая выборочная передача данных, Auth и Storage; только потом перевод frontend.

**Cleanup after experiment:** disabled and removed the failed `qwiz-schema-only-preflight.yml` pg_dump workflow and its unused TOC selector from the PR branch. This prevents further accidental full-public-schema LOCK attempts against GOS.ID. Only the proven catalog-only extraction and disposable PostgreSQL tests remain active; historical failed run is retained in GitHub Actions for audit.


## 15. Все определения 139 SQL-функций зарегистрированы в disposable PostgreSQL 17

Добавлен `next/isolation/disposable-rpc-definitions.py`: собирает через приватный каталоговый manifest ровно **137** функций QWIZ/legacy и **2** относящихся к квизу `org_party_*` helper, выбрасывает неожиданные функции ГОС.ID. Тела SQL не печатаются, хранятся только в одноразовой директории runner.

Проверка https://github.com/dimkazantsev/ORG/actions/runs/40939585837 **SUCCESS**:
- 57 bare таблиц (420 столбцов) зарегистрированы, все с включённым RLS.
- 283 ограничения и 34 дополнительных индекса (остальные индексы создаются constraints) применены.
- **Все 139 `CREATE OR REPLACE FUNCTION` / связанных определений приняты PostgreSQL 17.**
- Ни одна из функций **не вызывалась**; включён `SET check_function_bodies = off`, поэтому **внутренние SQL-зависимости и корректность тел в этом тесте НЕ проверены**.
- **Никаких реальных пользовательских строк, Auth identities и Storage файлов не переносилось**, секреты не попадали в лог. Единственная БД, куда добавлялись SQL-объекты, — disposable PostgreSQL сервис GitHub Actions, удалённый после job.
- Перед переносом в настоящий QWIZ Supabase необходимо дополнить сценарий точными `DEFAULT/GENERATED/IDENTITY`, sequences, view/RLS/GRANT, установить роли, проверить фактическое исполнение RPC и откаты, 40 соединений и 40 ответов.

Состояние после успешного теста: рабочий `gos-sim` и новый `vwsoergltegncrretxnz` **не переключались и не изменялись**. Публикация текущих временных файлов как миграции строго запрещена: они не содержат всего контракта.


## 16. Полная изолированная репетиция схемы и контролируемый шлюз развёртывания (30.10.2026)

**Пользователь попросил продолжить фактическую реализацию. В production QWIZ/ГОС.ID изменений не было, но создан и испытан атомарный schema-only пакет для отдельного Free-проекта.**

### 16.1. Найденные ранее неучтённые объекты

Попытка проверки 151 DEFAULT и 20 RLS policies выявила `schema "quiz_private" does not exist` в **одноразовой** PostgreSQL. Каталоговый read-only аудит обнаружил: `quiz_private.org_quiz_keys`, `quiz_private.qwiz_flags_reset_archive_20261022` (2 таблицы) и 9 приватных функций (is_quiz_admin, combo_multiplier, power_gain_for_streak, шесть org_quiz_*_impl). До этого набора префиксов `qwiz/org_next/org_quiz` **недоставало для точной миграции**.

Созданы `source-quiz-private-catalog.sql`, `disposable-quiz-private.py`, сохранение приватных DEFAULT в scratch. Проверка https://github.com/dimkazantsev/ORG/actions/runs/40941066051 — SUCCESS:
57 public tables, 2 `quiz_private` tables, 139 public functions, 9 private functions, 151 column defaults, 20 RLS policies, 4 views, 9 triggers и 283 constraints прошли SQL registration в disposable PG17. Тела `SECURITY DEFINER` функций **не исполнялись**, ряд SQL-зависимостей требует E2E проверки; частные данные/секреты не выгружались.

### 16.2. Действительные привилегии исходной базы

Чтобы не оставить 116 `SECURITY DEFINER` процедур с неожиданным PostgreSQL default `PUBLIC EXECUTE`, манифест расширен ACL из `pg_class.relacl`, `pg_proc.proacl` и `aclexplode`. По исходной базе:
- 1173 table/view ACL entries на 57 таблиц и 4 views;
- 390 function ACL entries на 139 публичных функций;
- function grants: `PUBLIC` 6, `anon` 14, `authenticated` 92, `service_role` 139, `postgres` 139;
- никаких принудительных `GRANT` действующему ГОС.ID не выполнялось.

`disposable-acls.py` в локальной PostgreSQL проверяет `REVOKE ALL ... FROM PUBLIC` и заново выдаёт исходные точные разрешения: https://github.com/dimkazantsev/ORG/actions/runs/40941815915 (SUCCESS). Это тест синтаксиса разрешений, а не полный аудит безопасности RPC.

### 16.3. Транзакционный schema-only bundle для пустого Free-проекта

Генератор `next/isolation/build-guarded-target-schema.py` собирает приватные source catalog manifests во временном защищённом runner, формирует **один** SQL-файл:
1. `BEGIN` и fail-closed предохранители: PostgreSQL 17+, `postgres` owner, существующая Supabase `auth` и штатные роли, **0 user tables в `public`**, **0 auth.users**, отсутствие `quiz_private`;
2. 57 QWIZ public tables, 420 columns, 283 constraints и 34 дополнительных indexes;
3. 2 private tables + 9 private functions; 139 public functions, 151 defaults;
4. 4 views, 20 RLS policies, 9 triggers;
5. `REVOKE/GRANT` на основе 1173 table/view + 390 function ACL записей, без наследования случайных PUBLIC grants;
6. итоговые SQL COUNT checks, `COMMIT`.

**Не перезаписывает** штатные `auth.uid()`, `auth.jwt()` или `auth.users`. В этот этап не включён перенос Auth пользователей, игровых строк, Storage или Realtime-настроек.

Полная атомарная репетиция в **отдельной одноразовой PostgreSQL 17** с тестовой имитацией Supabase Auth и проверкой нулевых Auth users прошла успешно:
https://github.com/dimkazantsev/ORG/actions/runs/40942270468 .

Вся SQL-композиция удалена вместе со временным runner, исходный код функций/DDL не публиковался в открытом репозитории или логах.

### 16.4. Отдельный предохранитель реального импорта

Добавлена `.github/workflows/qwiz-gated-schema-import.yml`. Она срабатывает только на специальный push изменения `next/isolation/SCHEMA-IMPORT-GATE.md` с **точно** заданным commit message `QWIZ_FREE_SCHEMA_ONLY_IMPORT_APPROVED`, требует шифрованные GitHub Secrets:
- `GOS_SOURCE_DB_URL` — уже работает, отдельный каталоговый читатель исходного ГОС.ID;
- `QWIZ_TARGET_DB_URL` — **ещё не настроен**, PostgreSQL URI от нового QWIZ Free проекта `vwsoergltegncrretxnz`, Session pooler 5432, username `postgres.vwsoergltegncrretxnz`.

Python проверяет hostname/username/ref, запрещает источник, отличный от GOS.ID, запрещает целевой ref, отличный от Free QWIZ, и запрещает одинаковый источник/назначение. База Free должна быть пуста: при расхождении guard аварийно прекращает SQL без изменений.

Первый run после создания workflow: https://github.com/dimkazantsev/ORG/actions/runs/40942534917 — **SKIPPED** по предохранителю, что правильно. Реального импорта в новую базу **НЕ БЫЛО**.

**Критические ограничения:** Repo `dimkazantsev/ORG` публичный. Секреты Actions шифруются, но workflow с правами записи в репозиторий может потенциально использовать сохранённые credentials. Поэтому `QWIZ_TARGET_DB_URL` необходимо сохранить только как GitHub Secret, не отправлять в чат и по завершении миграции **удалить либо ротировать**. Лучше, если возможно, использовать GitHub Environment с требованием подтверждения владельца. Данный workflow не может мигрировать данные/Auth/Storage и не должен использоваться для переключения рабочей игры.

### 16.5. Фактическое состояние на конец проверки

Прямой SELECT через подключённый Supabase подтвердил: Free target `vwsoergltegncrretxnz` **по-прежнему пуст** (`public` 0 таблиц, `auth.users` 0, `qwiz` functions 0, `quiz_private` отсутствует). GOS.ID работает на прежнем `bderfrcfuhnutuoyudje`, квиз пока использует его же.

**Для следующего шага требуется конкретное пользовательское действие:** создать только `QWIZ_TARGET_DB_URL` в https://github.com/dimkazantsev/ORG/settings/secrets/actions с URL PostgreSQL **нового** QWIZ Free проекта. Пароль PostgreSQL нового проекта можно задать/сбросить, если он не известен (новый проект пустой; не трогать пароль старого GOS.ID). После этого сделать read-only проверки подключения из GitHub и лишь затем явно активировать schema-only gate. Не пытаться выполнять data/auth cutover без отдельного защищённого экспорта и backup.

## 17. 30.10.2026: пользователь добавил `QWIZ_TARGET_DB_URL` — целевая авторизация пока не проходит

**Правдивый статус:** новый GitHub Actions Secret `QWIZ_TARGET_DB_URL` присутствует, однако пароль PostgreSQL в нём сервер отклоняет. Заявлять об импортированной схеме или переключении QWIZ нельзя.

Проверки:
- Target Free `vwsoergltegncrretxnz`: Supabase API и read-only SQL подтверждают `ACTIVE_HEALTHY`, PostgreSQL 17.11, **0 public таблиц, 0 auth users, 0 Storage buckets, 0 quiz_private**. Проект не повреждён.
- Повторный запуск старого GitHub Actions workflow использовал устаревшую версию скрипта, поэтому тот результат не применим к текущему состоянию.
- Текущий код ветки, https://github.com/dimkazantsev/ORG/actions/runs/40944078536: `URI_PARSE_FAILED [QWIZ_TARGET_DB_URL]` при стандартном URI parser. Соответствующий источник ранее работал.
- Новый `next/isolation/safe-session-pooler.py` парсит строго project-bound Session pooler URI, передаёт пароль в `PGPASSWORD`, а не в командной строке и не выводит исходную строку.
- https://github.com/dimkazantsev/ORG/actions/runs/40944335053 — `GOS_SOURCE_DB_URL` SELECT-only **SUCCESS**, `QWIZ_TARGET_DB_URL` psql login **FAILURE**.
- https://github.com/dimkazantsev/ORG/actions/runs/40944432084 — причина конкретизирована как `PASSWORD_AUTHENTICATION_FAILED`.
- https://github.com/dimkazantsev/ORG/actions/runs/40944635492 — перепроверены два способа интерпретации процентов (`%xx`) в пароле, итог тот же: **`PASSWORD_AUTHENTICATION_FAILED`**. Значение URL/пароля не отображалось.
- `.github/workflows/qwiz-gated-schema-import.yml` обновлён: перед записью вызывает **оба** SELECT-only probes; если пароль новой базы не принимается, SQL импорт не начинается. Для самого импорта использует безопасный in-memory PGPASSWORD adapter; нет ложных «успехов» и нет утечки secrets.

**Блокер, который нельзя снять средствами установленного подключения:** в GitHub Actions secret новый пароль не совпадает с действующим PostgreSQL-паролем проекта QWIZ-PARTY, либо там неверно вставлен пароль, несмотря на правильную структуру имени проекта и pooler URI. Никакое изменение SQL старого ГОС.ID не исправит пароль новой базы.

**Корректирующий шаг владельца:** в Dashboard именно новой базы `vwsoergltegncrretxnz` установить или подтвердить её текущий Database password; для устранения ошибок кодирования выбрать **сильный случайный пароль из латинских букв и цифр** (например, 32+ символа) через парольный менеджер. В `Connect → Session pooler → URI` заменить `[YOUR-PASSWORD]` на точно этот пароль и обновить только `QWIZ_TARGET_DB_URL` в GitHub Actions Secrets. Старый секрет `GOS_SOURCE_DB_URL` не трогать. Не присылать пароль в чат.

Когда Secret обновлён, `qwiz-dual-db-readonly.yml` нужно повторно запустить на **последнем коммите ветки**, а не повторять старую попытку прошлой версии. При успешной авторизации можно активировать отдельно проверенный guarded schema-only gate; до этого **никаких DDL/DML в Free target и source не было**. Старый QWIZ сайт и ГОС.ID работают на общем исходном Supabase.

Промежуточный блокер — неверная авторизация новой БД, а не состояние её вычислений, наличия проекта или RLS.


## 18. QWIZ Free: schema-only import actually COMMITTED — independently verified (30.10.2026)

**Это первая успешная реальная запись QWIZ-объектов в отдельный Supabase Free проект `vwsoergltegncrretxnz`. Старый production ГОС.ID `bderfrcfuhnutuoyudje` не менялся.**

### 18.1. Исправлена действительная причина GitHub connection failure

Новая target PostgreSQL connection URI содержала обрамление вокруг пароля; прежний read-only Actions показал 42 символа вместо ожидаемых 40, а post-wrapper read-only auth проверка успешно прошла **без изменения GitHub Secrets**:
https://github.com/dimkazantsev/ORG/actions/runs/40946853807

Эта исправленная обработка касается только строго проверенного pooler user `postgres.vwsoergltegncrretxnz` и текущего пустого Free QWIZ project. Пароль и secret URI не печатаются и не коммитятся.

### 18.2. Реальный импорт структуры

Первый gate run https://github.com/dimkazantsev/ORG/actions/runs/40947103680 был остановлен по client-side 25s Python subprocess timeout (не SQL-синтаксис); транзакция была откатана. Supabase SELECT подтвердил после остановки **0** public tables, Auth users и private schema. Adapter ограничен 330s для полного импорта при 25s для SELECT-only probes.

Второй gate run **SUCCESS**:
https://github.com/dimkazantsev/ORG/actions/runs/40947528961

Был использован:
- `GOS_SOURCE_DB_URL` как read-only каталоговый источник PostgreSQL 17.6;
- `QWIZ_TARGET_DB_URL` как ограниченный конкретным project-ref destination PostgreSQL 17.11;
- `build-guarded-target-schema.py` как генератор одной SQL-транзакции, с fail-closed проверкой пустой target;
- подтверждённый private catalog manifest, без вывода SQL definitions в публичные логи.

**Независимый SQL через Supabase MCP к Free target** после успешного GitHub run:

| Объект | Фактическое число |
|---|---:|
| `public` QWIZ/legacy tables | 57 |
| `quiz_private` tables | 2 |
| публичные QWIZ + 2 helper routines | 139 |
| `quiz_private` functions | 9 |
| source RLS policies, `public` | 20 |
| legacy views | 4 |
| 57 таблиц с RLS enabled | 57 |
| columns | 420 |
| column defaults | 151 |
| constraints | 283 |
| indexes | 111 |
| user triggers | 9 |
| SECURITY DEFINER, public 139 functions | 116 |
| function ACL entries | 390 |
| table/view ACL entries | 1173, source count exactly matched |
| `auth.users` | **0** |
| `storage.buckets` | **0** |
| НЕ-QWIZ public tables | **0** |

**No game/user rows or Storage files imported.** Supabase Auth internal schema was never overwritten; frontend endpoint was NOT changed; source ГОС.ID untouched.

### 18.3. Supabase Realtime publication independently matched source

Read-only source catalog job https://github.com/dimkazantsev/ORG/actions/runs/40948568742 identified exactly these 5 source `supabase_realtime` members:
`public.org_quiz_answers`, `public.org_quiz_participants`, `public.org_quiz_power_uses`, `public.org_quiz_sessions`, `public.org_quiz_teams`.

Applied **directly to QWIZ Free target** with official Supabase `apply_migration` API, migration `qwiz_source_realtime_five_tables_20261030`. Subsequent target SELECT from `pg_publication_tables` confirmed exactly those five tables published. This is replication **configuration only**, not a live 40-user WS test.

### 18.4. Security/performance linter on actual target

Security advisor:
- 4 `security_definer_view` findings at **ERROR** severity. These views inherited original source behavior and need an explicit RLS/permissions decision before exposing target to users: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- 14 `anon_security_definer_function_executable` WARN; 83 `authenticated_security_definer_function_executable` WARN. These originate from source ACLs and require RPC-by-RPC authorization review, not blanket revoke (would break game).
- 46 `rls_enabled_no_policy` INFO — fail-closed tables, not immediate data leaks.

Performance advisor:
- 60 `unindexed_foreign_keys` INFO, 33 `unused_index` INFO (new empty target), 7 `multiple_permissive_policies` WARN. Revisit after data load and workload test.

The warnings are **not claims of exploitation**. Existing source permissions were duplicated, target is empty. Avoid premature promotion to production, never grant broad PUBLIC access as a workaround.

### 18.5. Still required to finish physical separation

1. Target data migration: limited source export permissions to **only** 57 QWIZ public tables; current technical catalog reader cannot SELECT user rows due grants/RLS. Exclude unrelated ГОС.ID tables and secret-bearing private tables.
2. Preserve linked user identity UUIDs and decide safe subset of Supabase Auth users/identities with explicit verification of 13 FK. No full cross-project auth copy.
3. Migrate only QWIZ Storage bucket contents, secrets and Realtime channels after privacy review. New target remains 0 Auth users and 0 Storage buckets.
4. Staging client pointing to QWIZ Free plus 40 players, projectors, all game modes, reconnect and WebSocket load tests; fix linter/security issues.
5. Controlled cutover and rollback. Only then remove or archive old source QWIZ objects.

**Do not claim QWIZ is operational on new Free solely because the schema and Realtime publication are now present.**
