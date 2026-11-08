# Sprints Planning Platform — Backend

Spring Boot-сервис для планирования спринтов. Основные технологии: **Java 17**, **Spring Boot 3**, **Spring Web + Jetty**, **Spring Data JPA**, **Liquibase**, **PostgreSQL**.

## Ключевое

- REST API с префиксом `/api/v1/sprints-planning`.
- Хранение данных в PostgreSQL.
- Миграции через Liquibase (`database/changelog.yml`).
- Актюаторные эндпоинты: `health`, `info`, `metrics`.

## Запуск

### В Docker (рекомендуемый вариант)

Из корня репозитория:

```bash
docker compose up --build
```

Контейнеры:
- `backend` — порт `8080`.
- `db` — PostgreSQL на `5432`.

Остановить:

```bash
docker compose down
```

### Локально (Maven + PostgreSQL)

1. Установите и запустите PostgreSQL.
2. Проверьте настройки подключения в `server/src/main/resources/application.yml`:
   - `spring.datasource.url`
   - `spring.datasource.username`
   - `spring.datasource.password`
3. Запустите приложение:

```bash
mvn -Drevision=0.1.0 spring-boot:run
```

По умолчанию сервис доступен на `http://localhost:8080/api/v1/sprints-planning`.

## Миграции базы данных

Liquibase использует `database/changelog.yml`.
- В обычном профиле указан путь `classpath:database/changelog.yml`, как и в Docker; идентификаторы миграций сохраняются при смене способа запуска.
- В docker-профиле используется `classpath:database/changelog.yml`.

При изменении схемы добавляйте новые changeset-файлы в `database/` и обновляйте `changelog.yml`.

## Структура проекта

```text
server/
├── database/                       # Liquibase changelog и миграции
├── src/main/java/com/sber/isu/sprints_planning/
│   ├── config/                     # конфигурация Spring
│   ├── controller/                 # REST-контроллеры
│   ├── dto/                        # DTO и запросы
│   ├── mapper/                     # мапперы
│   ├── model/                      # JPA-сущности
│   ├── repository/                 # репозитории
│   ├── service/                    # бизнес-логика
│   └── util/                       # утилиты
├── src/main/resources/
│   ├── application.yml             # базовая конфигурация
│   └── application-docker.yml      # docker-профиль
├── Dockerfile                       # сборка контейнера
└── pom.xml                          # зависимости Maven
```

## Проверка дорожной карты и бэклога локально

Запустить PostgreSQL командой `docker compose up -d db` из корня. Для backend требуется Java 17 или новее.
Из `server/` выполнить `APP_JIRA_MOCK_ENABLED=true mvn -Drevision=0.1.0 spring-boot:run`;
из корня — `npm run dev:e2e` (http://localhost:4173).
Проверка готовности: http://localhost:8080/api/v1/sprints-planning/actuator/health.

Дорожная карта: `/#/customlab/`, отдельный бэклог: `/#/customlab/backlog`, планирование: `/#/customlab/planning`.
Режим Jira mock позволяет проверить интерфейс экспорта без создания задач во внешней Jira.
`npm run e2e:real -- --workers=1` запускает реальные сценарии на отдельных временных командах и удаляет их данные после проверки.

## Проверка нестандартной схемы PostgreSQL

Native SQL планирования и создания релиза использует `{h-schema}`, чтобы учитывать `hibernate.default_schema`
так же, как JPQL. Проверка `PlanningWorkbenchSchemaIntegrationTest` требует отдельную тестовую базу с
мигрированной схемой `planning_review`, которая отсутствует в `search_path` подключения:

```bash
PLANNING_SCHEMA_TEST_URL=jdbc:postgresql://localhost:5432/planning_schema_test \
  mvn -Drevision=0.1.0 -Dtest=PlanningWorkbenchSchemaIntegrationTest test
```

Тест проверяет пустой список, фильтры, все сортировки, пагинацию и ручное создание даты релиза;
его изменения данных откатываются транзакцией. Без переменной окружения тест пропускается.
