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
