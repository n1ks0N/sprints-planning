# Интеграция planning -> Jira

## Базовая схема
Для первой версии используем один вызов Jira:

`POST /rest/api/2/issue`

Дополнительные вызовы базово не используем.

## Что передаем в Jira

### Обязательные поля для create
По фактическому `createmeta` для типа `Задача`:

1. `project`
2. `issuetype`
3. `summary`

В `createmeta` также отмечен `security`, но в нашей схеме его не передаем, так как у проекта есть значение по умолчанию.

### Поля, которые используем в интеграции
1. `project`
   - укажет пользователь в форме
   - в `POST /issue` передается как:
   ```json
   "project": { "id": "56506" }
   ```
   или
   ```json
   "project": { "key": "ISUWEBNAPP" }
   ```

2. `issuetype`
   - фиксированное значение:
   ```json
   "issuetype": { "id": "3" }
   ```

3. `summary`
   - название задачи

4. `description`
   - описание задачи + DoD

5. `assignee`
   - участник задачи
   - передается по `jiraLogin`
   ```json
   "assignee": { "name": "LOGIN" }
   ```

6. `labels`
   - укажет пользователь в форме

7. `storyPoints`
   - нагрузка по задаче в выбранном спринте planning
   - фактическое поле Jira:
   ```json
   "customfield_10002": 3
   ```

8. `sprint`
   - укажет пользователь в форме
   - фактическое поле Jira:
   ```json
   "customfield_10005": 236204
   ```
   Примечание: поле `Sprint` в Jira является custom field. Для первой версии пробуем передавать его сразу в `POST /issue`.

## Целевой payload
```json
{
  "fields": {
    "project": { "id": "PROJECT_ID" },
    "issuetype": { "id": "3" },
    "summary": "Название задачи",
    "description": "Описание задачи\n\nDoD: ...",
    "assignee": { "name": "LOGIN" },
    "labels": ["label-1", "label-2"],
    "customfield_10002": 3,
    "customfield_10005": 236204
  }
}
```

## Что важно
1. `projectIdOrKey` используется в Jira API для meta-запросов, но в `POST /issue` нужно передавать именно объект `project`:
   - либо `project.id`
   - либо `project.key`
2. `issueType` у нас фиксирован: `id = 3`
3. `storyPoints` соответствует `customfield_10002`
4. `sprint` соответствует `customfield_10005`
5. `labels`, `summary`, `description`, `assignee` передаем сразу в `POST /issue`

## Что нужно подтвердить перед реализацией
1. Что `security` действительно можно не передавать
2. Что `customfield_10005` можно выставлять прямо через `POST /issue`
3. Что `assignee.name = jiraLogin` работает для нужных пользователей
4. Что `customfield_10002` принимает числовое значение Story Points
