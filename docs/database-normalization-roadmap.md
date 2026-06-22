# План доработок БД

## Цель

Привести схему ближе к нормальным формам и production best-practice без резкого переписывания приложения.

Основной фокус:

- убрать бизнес-критичные массивы и структуры из `JSONB`
- усилить ссылочную целостность
- формализовать источники истины для нагрузки
- сделать миграции безопасными для старых данных

## Текущее состояние

Сильные стороны текущей схемы:

- основные сущности разделены по таблицам: `tasks`, `participants`, `quarters`, `sprints`, `releases`
- связи задач с участниками, спринтами и нагрузкой вынесены в отдельные таблицы
- `task_allocations` хранит participant-level нагрузку и хорошо подходит как основной источник планирования
- `task_stream_values` и `task_customer_values` уже показывают правильный паттерн нормализации many-to-many
- большинство ключевых таблиц имеют индексы по команде, спринту, участнику или порядку отображения

Основные архитектурные долги:

- `planning_backlog_items` хранит `customers`, `streams`, `planning_demands`, `planning_quarter_ids`, `planning_sprint_ids` в `JSONB`
- `tasks` также хранит `planning_quarter_ids` и `planning_sprint_ids` в `JSONB`
- на значения внутри `JSONB` нельзя поставить обычные `FOREIGN KEY`, `CHECK` и `UNIQUE`
- `planning_backlog_items.team_key` должен иметь явный FK на `teams`
- часть enum-like полей хранится как свободный `TEXT`
- `task_loads` и `task_allocations` должны иметь явно описанный инвариант синхронизации

## Целевое состояние

Целевая модель:

- `task_allocations` остается источником истины для фактической плановой нагрузки по участнику и спринту
- `task_loads` либо удаляется, либо остается только как производный агрегат, пересчитываемый из `task_allocations`
- planning backlog хранит структурированные данные в нормализованных таблицах
- JSONB остается только для audit/snapshot данных, где это действительно оправдано
- все связи с `teams`, `quarters`, `sprints`, `participants`, `releases` защищены FK
- бизнес-ограничения выражены constraint-ами, а не только Java-кодом

## Этап 1. Усилить ограничения без изменения модели

Это самый безопасный этап. Его можно делать до нормализации JSONB.

Добавить constraints:

- `planning_backlog_items.team_key REFERENCES teams(key) ON DELETE CASCADE`
- `planning_backlog_items.priority CHECK (priority IN (1, 2, 3))`
- `tasks.status CHECK (status IN (...))`
- `planning_backlog_items.display_order >= 0`
- `sprints.working_days >= 0`
- `task_loads.days >= 0`
- `task_allocations.days >= 0`
- `planning_backlog_items.created_at <= updated_at`, если эта гарантия нужна на уровне БД

Проверить существующие данные перед добавлением:

```sql
SELECT priority, COUNT(*)
FROM planning_backlog_items
GROUP BY priority
ORDER BY priority;

SELECT status, COUNT(*)
FROM tasks
GROUP BY status
ORDER BY status;

SELECT COUNT(*)
FROM planning_backlog_items p
LEFT JOIN teams t ON t.key = p.team_key
WHERE t.key IS NULL;
```

Риск: низкий.

Основной риск только в том, что старые данные могут содержать значения, которые приложение раньше терпело.

## Этап 2. Нормализовать planning window

Сейчас planning window лежит в JSONB:

- `planning_backlog_items.planning_quarter_ids`
- `planning_backlog_items.planning_sprint_ids`
- `tasks.planning_quarter_ids`
- `tasks.planning_sprint_ids`

Предлагаемая схема:

```sql
CREATE TABLE planning_backlog_item_quarters (
    item_id UUID NOT NULL REFERENCES planning_backlog_items(id) ON DELETE CASCADE,
    quarter_id UUID NOT NULL REFERENCES quarters(id),
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, quarter_id)
);

CREATE TABLE planning_backlog_item_sprints (
    item_id UUID NOT NULL REFERENCES planning_backlog_items(id) ON DELETE CASCADE,
    sprint_id UUID NOT NULL REFERENCES sprints(id),
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, sprint_id)
);
```

Для live tasks аналогично:

```sql
CREATE TABLE task_planning_quarters (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    quarter_id UUID NOT NULL REFERENCES quarters(id),
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, quarter_id)
);

CREATE TABLE task_planning_sprints (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sprint_id UUID NOT NULL REFERENCES sprints(id),
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, sprint_id)
);
```

Порядок миграции:

1. Создать новые таблицы.
2. Переложить данные из JSONB через `jsonb_array_elements_text`.
3. На период совместимости писать и в старые JSONB, и в новые таблицы.
4. Переключить чтение backend на новые таблицы.
5. После стабилизации удалить JSONB-колонки.

Риск: средний.

Главный риск: в JSONB могут быть UUID, которых уже нет в `quarters` или `sprints`. Такие строки нужно заранее найти и решить: удалять, логировать или блокировать миграцию.

## Этап 3. Нормализовать planning demands

Сейчас `planning_backlog_items.planning_demands` хранит набор demand-ов в JSONB. Это самая важная часть для solver-а, поэтому ее лучше вынести в таблицу.

Предлагаемая схема:

```sql
CREATE TABLE planning_backlog_item_demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES planning_backlog_items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('ROLE', 'PARTICIPANT')),
    role_value_id UUID REFERENCES participant_role_values(id),
    participant_id UUID REFERENCES participants(id),
    stream_value_id UUID REFERENCES participant_stream_values(id),
    days NUMERIC(10, 2) NOT NULL CHECK (days > 0),
    display_order INT NOT NULL DEFAULT 0,
    CHECK (
        (kind = 'ROLE' AND role_value_id IS NOT NULL AND participant_id IS NULL)
        OR
        (kind = 'PARTICIPANT' AND participant_id IS NOT NULL AND role_value_id IS NULL)
    )
);
```

Индексы:

```sql
CREATE INDEX planning_demands_item_idx
    ON planning_backlog_item_demands(item_id, display_order);

CREATE INDEX planning_demands_participant_idx
    ON planning_backlog_item_demands(participant_id);

CREATE INDEX planning_demands_role_idx
    ON planning_backlog_item_demands(role_value_id);
```

Порядок миграции:

1. Создать таблицу.
2. Распарсить существующий `planning_demands`.
3. Для role/stream строк сопоставить текстовые значения со справочниками.
4. Временно оставить JSONB как fallback.
5. Перевести `PlanningWorkbenchService` на чтение из таблицы.
6. После проверки удалить JSONB-колонку.

Риск: средний или высокий, если данные в `planning_demands` уже неоднородные.

Этот этап должен быть покрыт тестами миграции на старой БД.

## Этап 4. Нормализовать customers и streams для planning backlog

Сейчас live tasks уже используют справочники и junction-таблицы:

- `task_streams`
- `task_customers`
- `task_stream_values`
- `task_customer_values`

Для planning backlog нужно сделать такой же паттерн:

```sql
CREATE TABLE planning_backlog_item_stream_values (
    item_id UUID NOT NULL REFERENCES planning_backlog_items(id) ON DELETE CASCADE,
    stream_id UUID NOT NULL REFERENCES task_streams(id),
    PRIMARY KEY (item_id, stream_id)
);

CREATE TABLE planning_backlog_item_customer_values (
    item_id UUID NOT NULL REFERENCES planning_backlog_items(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES task_customers(id),
    PRIMARY KEY (item_id, customer_id)
);
```

Риск: средний.

Это менее критично для solver-а, но важно для фильтрации, отчетности и консистентности справочников.

## Этап 5. Зафиксировать источник истины для нагрузки

Текущая модель содержит два уровня:

- `task_allocations`: нагрузка по задаче, участнику и спринту
- `task_loads`: суммарная нагрузка задачи по спринту

Рекомендуемый инвариант:

- `task_allocations` является источником истины
- `task_loads` является производным агрегатом
- любые записи в `task_loads` должны соответствовать сумме `task_allocations`
- прямые записи в `task_loads` допустимы только для задач без участников и без allocations, если такой сценарий остается нужен

Варианты дальнейшего развития:

1. Оставить `task_loads` как кеш.
   - Плюс: меньше изменений UI/API.
   - Минус: нужна строгая синхронизация.

2. Заменить `task_loads` view/materialized view.
   - Плюс: меньше риска рассинхронизации.
   - Минус: больше изменений в репозиториях и API.

3. Удалить `task_loads` из write model.
   - Плюс: наиболее чистая модель.
   - Минус: самый большой объем доработок.

Практичный путь: сначала документировать и тестировать инвариант, потом решить, нужен ли физический `task_loads`.

## Этап 6. Командная целостность

Во многих таблицах есть `team_key`, но FK часто проверяет только `id` связанной сущности. Если приложение ошибется, теоретически можно связать строку одной команды с сущностью другой команды.

Долгосрочно лучше перейти к одному из вариантов:

1. Составные FK с `team_key`.
2. Убрать `team_key` из дочерних таблиц, где команда однозначно выводится через родителя.
3. Оставить текущую модель, но добавить batch validation job и интеграционные тесты.

Пример проверки:

```sql
SELECT COUNT(*)
FROM task_allocations a
JOIN tasks t ON t.id = a.task_id
JOIN participants p ON p.id = a.participant_id
JOIN sprints s ON s.id = a.sprint_id
WHERE a.team_key <> t.team_key
   OR a.team_key <> p.team_key
   OR a.team_key <> s.team_key;
```

Рекомендация: для ближайшего релиза достаточно validation queries и тестов. Составные FK лучше делать отдельной большой миграцией.

## Этап 7. JSONB оставить только для audit/snapshot

JSONB допустим для:

- `api_call_history.changes_json`
- `api_call_history.meta_json`
- `jira_export_batches.items_json`, если это immutable snapshot запроса/ответа
- `jira_export_batches.labels_json`, если labels нужны только как snapshot

JSONB нежелателен для:

- planning demands
- списков FK
- customers/streams, если по ним фильтруем или строим отчеты
- данных, которые должны участвовать в ссылочной целостности

## Рекомендуемый порядок реализации

1. Добавить constraints и validation queries.
2. Нормализовать planning window.
3. Нормализовать planning demands.
4. Нормализовать planning customers/streams.
5. Зафиксировать и протестировать инвариант `task_allocations -> task_loads`.
6. Усилить командную целостность.
7. Удалить старые JSONB-колонки после периода совместимости.

## Что не делать одним большим изменением

Не стоит одной миграцией одновременно:

- менять структуру planning backlog
- удалять JSONB-колонки
- переписывать solver input
- менять apply flow
- менять `task_loads`

Это повысит риск потери данных и усложнит откат.

Лучше идти через expand-and-contract:

1. Expand: добавить новые таблицы и двойную запись.
2. Backfill: переложить старые данные.
3. Switch reads: переключить чтение.
4. Verify: сравнить старый и новый источник.
5. Contract: удалить старые колонки.

## Минимальный набор проверок перед production

- миграция проходит на пустой БД
- миграция проходит на копии старой БД
- counts до/после совпадают для planning items, demands, windows, customers, streams
- orphan references отсутствуют
- автопланирование дает тот же результат на контрольном наборе данных
- `/preview` и `/apply` работают после чтения из новых таблиц
- rollback plan описан до запуска миграции

