# План оптимизации API

## Цель

Снизить время ответа основных API и убрать архитектурные причины деградации при росте количества задач, planning items, участников, спринтов и истории.

План сфокусирован на фактических горячих путях текущего приложения:

- `GET /{teamKey}/tasks`
- `GET /{teamKey}/planning-workbench/backlog`
- `GET /{teamKey}/capacity`
- `GET /{teamKey}/history`
- `GET /{teamKey}/tasks/{id}/history`
- Jira export/status API
- справочники, которые часто запрашиваются фронтом: quarters, sprints, participants, releases, filters

## Наблюдения по текущему состоянию

### Planning backlog

`GET /planning-workbench/backlog` сейчас выглядит самым рискованным endpoint.

Текущая проблема:

- сервис загружает все `planning_backlog_items` команды
- затем фильтрует в Java stream
- затем сортирует в Java
- затем вручную режет страницу через `subList`

Это значит, что добавленная пагинация снижает размер ответа, но не снижает объем работы сервера и БД.

Отдельный риск: фильтр по кварталам вызывает `collectPlanningItemQuarterIds(...)`, а внутри него при наличии `planning_sprint_ids` может выполняться запрос в `sprintRepository` для каждого item. Это N+1-паттерн.

### Tasks backlog

`GET /tasks` уже устроен лучше:

- отдельно считается `count`
- отдельно выбираются ids страницы
- детали грузятся batch-запросами

Но сортировки `load` и `releaseDate` используют correlated subqueries в `ORDER BY`. На небольших данных это допустимо, но на большом наборе задач PostgreSQL будет пересчитывать агрегаты/даты для большого числа строк-кандидатов.

Также поиск через `lower(field) LIKE '%query%'` по `title`, `description`, `dod`, `customer`, `stream` плохо использует обычные B-tree индексы.

### API history

История уже пагинируется, но есть потенциально тяжелые места:

- группировка по `session_id`, `user_name`
- `UPPER(http_method)` в фильтре
- count query поверх grouped subquery
- быстрый рост таблицы `api_call_history`

### Frontend

Фронт усиливает серверную нагрузку:

- на некоторых тяжелых страницах включены `refetchOnMountOrArgChange`, `refetchOnFocus`, `refetchOnReconnect`
- после части мутаций инвалидируется весь список
- несколько страниц одновременно запрашивают одинаковые справочники
- RTK Query cache merge может держать накопленный список, поэтому важно аккуратно сбрасывать cache при смене фильтров

## Целевые показатели

Ориентиры для dev/stage с реалистичным объемом данных:

- `GET /planning-workbench/backlog`: p95 до 300-500 ms
- `GET /tasks`: p95 до 500 ms для обычных фильтров
- `GET /tasks` со сложным поиском: p95 до 800 ms
- `GET /capacity`: p95 до 500 ms
- `GET /history`: p95 до 300 ms
- количество SQL-запросов на list endpoint: не больше 4-6
- размер ответа списков задач снизить минимум на 30%
- после редактирования одного item не перезагружать весь список, если изменение не влияет на фильтры/сортировку

## Этап 0. Измерения и диагностика

Перед оптимизацией нужно зафиксировать baseline, иначе легко оптимизировать не тот слой.

### 0.1. Серверные метрики

Добавить или включить:

- duration каждого HTTP endpoint
- HTTP method, normalized path, teamKey
- query params без чувствительных данных
- status code
- response size
- количество SQL-запросов на request
- суммарное SQL-время на request

Минимальный формат логов:

```text
api_timing method=GET path=/tasks team=customlab status=200 duration_ms=812 sql_count=8 sql_ms=690 response_bytes=145231
```

### 0.2. PostgreSQL диагностика

Включить/проверить:

- `pg_stat_statements`
- `auto_explain` на dev/stage для запросов дольше 300-500 ms
- `EXPLAIN (ANALYZE, BUFFERS)` для горячих запросов

Снять планы для:

```text
GET /customlab/tasks?page=0&size=20
GET /customlab/tasks?sortBy=load&page=0&size=20
GET /customlab/tasks?sortBy=releaseDate&page=0&size=20
GET /customlab/tasks?search=...
GET /customlab/planning-workbench/backlog?page=0&size=20
GET /customlab/planning-workbench/backlog?quarterIds=...&sortBy=releaseDate
GET /customlab/history?page=0&size=10
GET /customlab/capacity?quarterIds=...
```

### 0.3. Клиентские измерения

В браузере замерить:

- сколько запросов уходит при открытии Бэклога
- сколько запросов уходит при открытии Планирования
- сколько повторных запросов уходит при возврате фокуса окна
- размер payload каждого запроса
- время JSON parse/render крупных responses

Результат этапа: таблица `endpoint -> p50/p95 -> sql_count -> sql_ms -> response_bytes -> main bottleneck`.

## Этап 1. Срочно исправить planning backlog

Это самый приоритетный этап, потому что текущая пагинация не уменьшает объем работы backend.

### 1.1. Перенести фильтрацию и пагинацию в БД

Сделать repository-level реализацию по аналогии с `TaskRepositoryImpl`:

- `countPlanningItems(teamKey, filter)`
- `findPlanningItemIdsPage(teamKey, filter, page, size, sort)`
- `loadPlanningItemDetails(ids)`

Алгоритм:

1. Criteria/native query выбирает только ids нужной страницы.
2. Отдельный count query считает общее количество.
3. Детали грузятся только для ids страницы.
4. Порядок восстанавливается по ids страницы.

Не делать:

- не загружать все items команды
- не сортировать полный список в Java
- не вызывать `subList` как основной механизм пагинации

### 1.2. Убрать N+1 по спринтам/кварталам

Сейчас вычисление кварталов planning item может запрашивать спринты на каждый item.

Нужно:

- собрать все `planning_sprint_ids` для items-кандидатов или страницы
- одним запросом загрузить `sprints + quarter`
- построить `Map<sprintId, quarterId>`
- использовать map при фильтрации/DTO mapping

Если фильтр по кварталам переносится в SQL, этот шаг становится временной мерой до нормализации JSONB.

### 1.3. Индексы для текущей JSONB-модели

Пока planning fields лежат в JSONB, рассмотреть временные GIN индексы:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_planning_items_quarter_ids_gin
ON planning_backlog_items USING gin (planning_quarter_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_planning_items_sprint_ids_gin
ON planning_backlog_items USING gin (planning_sprint_ids);
```

Для `streams` и `customers`, если они остаются JSONB/array:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_planning_items_streams_gin
ON planning_backlog_items USING gin (streams);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_planning_items_customers_gin
ON planning_backlog_items USING gin (customers);
```

Важно: `CONCURRENTLY` нельзя запускать внутри обычной Liquibase transaction. Для таких миграций нужно настроить `runInTransaction: false` или выбрать обычный `CREATE INDEX` для локального/dev окружения.

### 1.4. Целевое решение

Долгосрочно лучше нормализовать:

- `planning_backlog_item_quarters`
- `planning_backlog_item_sprints`
- `planning_backlog_item_streams`
- `planning_backlog_item_customers`
- `planning_backlog_item_demands`

Это уже описано в `docs/database-normalization-roadmap.md`, но для API performance эта нормализация критична.

## Этап 2. Ускорить `GET /tasks`

### 2.1. Убрать correlated subqueries из сортировок

Проблемные сортировки:

- `sortBy=load`
- `sortBy=releaseDate`

Варианты решения:

#### Вариант A. Материализованные/денормализованные поля

Добавить в `tasks`:

- `sort_total_load NUMERIC`
- `sort_release_date DATE`

Обновлять:

- при изменении `task_allocations`
- при изменении `task_loads`
- при изменении release/initial quarter/planning window
- при apply planning workbench

Плюсы:

- быстрый `ORDER BY`
- простые индексы
- хорошо работает с пагинацией

Минусы:

- нужно строго поддерживать инварианты пересчета

Индексы:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_team_sort_load
ON tasks(team_key, sort_total_load, display_order, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_team_sort_release_date
ON tasks(team_key, sort_release_date, display_order, id);
```

#### Вариант B. SQL view/materialized view

Создать view с агрегатами:

- task id
- total positive load
- earliest allocation quarter
- earliest load quarter
- release prom date
- final sort date

Для больших данных лучше materialized view с refresh после batch операций.

Плюсы:

- меньше дублирования в `tasks`
- логика сортировки централизована в SQL

Минусы:

- сложнее refresh/invalidation
- materialized view может быть устаревшей между refresh

### 2.2. Индексы под фильтры

Проверить и добавить при необходимости:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_team_status_order
ON tasks(team_key, status, display_order, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_team_priority_order
ON tasks(team_key, priority, display_order, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_team_release_date_order
ON tasks(team_key, release_date_id, display_order, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_allocations_task_sprint_days
ON task_allocations(task_id, sprint_id, days);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_allocations_participant_sprint_task
ON task_allocations(participant_id, sprint_id, task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_loads_task_sprint_days
ON task_loads(task_id, sprint_id, days);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_jira_issues_team_task_status_scope
ON task_jira_issues(team_key, task_id, status, issue_scope);
```

Перед добавлением проверить существующие индексы, чтобы не плодить дубли.

### 2.3. Поиск через trigram

Обычный `LIKE '%query%'` не масштабируется.

Добавить расширение:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Индексы:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_title_trgm
ON tasks USING gin (lower(title) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_description_trgm
ON tasks USING gin (lower(description) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_dod_trgm
ON tasks USING gin (lower(dod) gin_trgm_ops);
```

Лучший вариант: отдельное поле `search_text`, где собраны title/description/dod/customers/streams, и один GIN trigram индекс.

## Этап 3. Уменьшить payload списков

Сейчас карточки задач получают много данных сразу:

- participants
- loads
- allocations
- notes
- jira issues
- customers
- streams
- release-derived fields

Для списка это дорого и по SQL, и по сериализации, и по сети, и по React render.

### 3.1. Ввести lightweight DTO для списков

Например:

```text
TaskListItemDto
- id
- title
- priority
- status
- customers
- streams
- participantIds
- planningQuarterIds
- planningSprintIds
- totalLoadByVisibleSprint или compact loads
- releaseDateId
- releaseSprintId
- jiraStoryIssue summary
- order
- updatedAt
```

Детали:

- `GET /tasks` возвращает list DTO
- `GET /tasks/{id}` возвращает полный `TaskDto`
- карточка подгружает детали при раскрытии/редактировании, если нужны тяжелые поля

### 3.2. Отдельные lightweight DTO для planning backlog

Для `planning-workbench/backlog`:

- список возвращает compact item
- dialog редактирования получает полные planning demands по id
- preview/apply используют полную структуру только для выбранных items

### 3.3. Сжать Jira issue данные

В списке обычно достаточно:

- есть Story или нет
- Story key/url
- есть participant Jira links или нет

Полную map `participant -> sprint -> jiraIssue` можно грузить по требованию в модальном окне ссылок Jira.

## Этап 4. Клиентские refetch и cache invalidation

### 4.1. Ослабить агрессивный refetch

Для тяжелых страниц убрать или ограничить:

- `refetchOnFocus`
- `refetchOnReconnect`
- частый `refetchOnMountOrArgChange`

Рекомендуемое правило:

- справочники можно refetch при reconnect
- тяжелые списки refetch только при изменении фильтров/сортировки/page или явном action пользователя

### 4.2. Точечные cache updates вместо invalidating LIST

Для мутаций:

- редактирование одной задачи
- изменение Jira links
- изменение notes
- изменение allocation cell

Нужно обновлять конкретные cached items, а не всегда инвалидировать весь список.

LIST invalidation оставлять только когда изменение влияет на:

- фильтрацию
- сортировку
- принадлежность странице
- массовый apply
- удаление/создание с изменением total count

### 4.3. Debounce поиска

Для search inputs:

- debounce 300-500 ms
- не отправлять запросы для строк короче 2 символов, если бизнес допускает
- отменять устаревшие запросы

### 4.4. Справочники

Справочники:

- quarters
- sprints
- releases
- participants
- filters

Должны иметь увеличенный `keepUnusedDataFor` и не инвалидироваться после unrelated task updates.

## Этап 5. History API

### 5.1. Нормализовать `http_method`

Сейчас фильтры используют `UPPER(http_method)`.

Лучше:

- хранить метод сразу uppercase
- убрать `UPPER(...)` из WHERE

Это позволит лучше использовать индексы.

### 5.2. Индексы

Проверить/добавить:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_api_history_team_method_entity_created
ON api_call_history(team_key, http_method, entity_type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_api_history_team_session_created
ON api_call_history(team_key, session_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_api_history_task_entity_created
ON api_call_history(team_key, entity_type, entity_id, created_at DESC);
```

### 5.3. Retention

Если история растет быстро:

- ввести retention policy
- архивировать старые rows
- рассмотреть partitioning по месяцу для `api_call_history`

## Этап 6. Capacity API

`GET /capacity` зависит от participant list, sprints и aggregation по allocations.

План:

1. Проверить SQL plan aggregation query.
2. Добавить индексы по:
   - `task_allocations(team_key, participant_id, sprint_id)`
   - `task_allocations(team_key, sprint_id, participant_id)`
3. Не грузить задачи целиком для capacity.
4. Возвращать только агрегированные rows.
5. Кешировать результат на клиенте по `quarterIds`.

Если capacity начинает тормозить после каждого редактирования allocation, рассмотреть server-side short cache на 5-15 секунд для read-only запросов, но только если UX допускает небольшую задержку консистентности.

## Этап 7. Jira API

### 7.1. Jira sprint search

`GET /jira/sprints` ходит во внешнюю Jira, если mock выключен.

Нужно:

- кешировать sprint search по `boardId + query`
- TTL 1-5 минут
- отдельно кешировать lookup по numeric sprint id
- ограничить частоту запросов autocomplete на фронте debounce 400-600 ms

### 7.2. Jira export batch status

`GET /jira/issues/batches/{batchId}` используется с polling.

Оптимизация:

- polling останавливать сразу при terminal status
- не возвращать тяжелый `jiraRequest` body для каждого item в compact status mode
- добавить query param `includeRequestPreview=true`, если preview нужен только для debug/details

## Этап 8. Миграции и безопасность индексов

Индексы на больших таблицах:

- в production создавать через `CREATE INDEX CONCURRENTLY`
- не запускать concurrent index внутри transaction
- проверять lock impact
- добавлять rollback plan

Для Liquibase:

- либо отдельные changesets с `runInTransaction: false`
- либо применять operational migration отдельно

Перед каждым новым индексом:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('tasks', 'planning_backlog_items', 'task_allocations', 'task_loads', 'api_call_history');
```

После:

```sql
EXPLAIN (ANALYZE, BUFFERS)
...
```

## Этап 9. Тесты производительности

Добавить repeatable dataset:

- 2-3 команды
- 20 кварталов
- 150-300 спринтов
- 100 участников
- 5 000-20 000 tasks
- 5 000 planning backlog items
- 100 000 allocations
- 100 000 api history rows

Smoke/performance tests:

- `/tasks` first page
- `/tasks` page 10
- `/tasks` with quarter filter
- `/tasks` with search
- `/tasks` sort by load
- `/tasks` sort by release date
- `/planning-workbench/backlog` first page
- `/planning-workbench/backlog` with filters
- `/capacity`
- `/history`

Acceptance:

- фиксировать p50/p95
- фиксировать SQL count
- фиксировать payload size
- тест должен падать при деградации больше заданного порога

## Рекомендуемый порядок работ

### Sprint 1. Диагностика и быстрые выигрыши

1. Добавить request timing + SQL count logging.
2. Снять baseline.
3. Отключить агрессивный `refetchOnFocus` для тяжелых списков.
4. Добавить debounce поиска, если его нет.
5. Проверить и добавить недостающие простые B-tree индексы.

Ожидаемый эффект: меньше повторных запросов, понятная карта узких мест.

### Sprint 2. Planning backlog query rewrite

1. Переписать `/planning-workbench/backlog` на DB-level filter/sort/page.
2. Убрать N+1 по sprint/quarter.
3. Добавить тесты на корректность фильтров, сортировки и pagination metadata.
4. Сравнить p95 до/после.

Ожидаемый эффект: самый большой прирост.

### Sprint 3. Task sorting/search

1. Ускорить сортировки `load` и `releaseDate`.
2. Добавить trigram/full-text search.
3. Проверить планы `GET /tasks`.
4. Добавить performance regression checks.

Ожидаемый эффект: стабильная работа backlog на больших данных.

### Sprint 4. Payload split

1. Ввести lightweight DTO для task list.
2. Ввести details endpoint loading для тяжелых частей.
3. Аналогично разделить planning backlog list/details.
4. Замерить response size и render time.

Ожидаемый эффект: быстрее сеть, JSON parse и React render.

### Sprint 5. History/Jira/capacity polishing

1. Ускорить history indexes/query.
2. Добавить Jira sprint cache.
3. Оптимизировать batch status payload.
4. Проверить capacity aggregation indexes.

## Риски

- Нормализация JSONB требует аккуратных миграций и проверки старых данных.
- Денормализованные sort fields требуют строгого пересчета при каждом изменении нагрузки/релиза.
- Слишком агрессивный клиентский cache может показывать устаревшие данные.
- `CREATE INDEX CONCURRENTLY` требует отдельного подхода в Liquibase.
- Lightweight DTO меняет API contract и потребует аккуратной адаптации frontend.

## Минимальный Definition of Done

Оптимизация считается завершенной, когда:

- есть baseline и after замеры
- `/planning-workbench/backlog` не загружает все items для одной страницы
- `/tasks` не использует дорогие correlated subqueries для основных сортировок или эти subqueries доказанно быстрые по `EXPLAIN`
- поиск использует индексируемый механизм
- тяжелые списки не refetch-атся при каждом focus/reconnect
- response size списков снижен
- добавлены regression/performance tests или хотя бы scripted smoke benchmark
- все новые индексы имеют проверенный план применения и rollback
