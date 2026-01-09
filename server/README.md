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
mvn spring-boot:run
```

По умолчанию сервис доступен на `http://localhost:8080/api/v1/sprints-planning`.

## Миграции базы данных

Liquibase использует `database/changelog.yml`.
- В обычном профиле указан путь `file:./database/changelog.yml`.
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
