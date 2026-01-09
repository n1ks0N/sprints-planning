# Sprints Planning Platform — Frontend

Фронтенд проекта для планирования спринтов. Основные технологии: **React 18**, **TypeScript**, **Redux Toolkit + RTK Query**, **Webpack**, **Material UI**.

## Ключевое

- Планирование спринтов и кварталов.
- Управление участниками команд и их ролями.
- Учет RUN-нагрузки и нормированных отпусков.
- Расчет доступной емкости по спринтам и кварталам.

## Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Локальный фронтенд + локальный бэкенд

DevServer проксирует запросы на локальный бэкенд (`http://localhost:8080`).

```bash
npm run dev:local
```

По умолчанию используется API-префикс `/api/v1/sprints-planning`.

### Локальный фронтенд + удаленный бэкенд

Если нужно ходить в удаленный бэкенд, укажите абсолютный `API_URL`:

```bash
API_URL=https://<ваш-домен> npm run dev:remote
```

Если `API_URL` относительный, DevServer будет проксировать запросы на `http://localhost:8080`.

### Сборка

```bash
API_URL=https://<ваш-домен> npm run build
```

### TypeScript typecheck

```bash
npm run typecheck
```

## Структура проекта

```text
.
├── public/                  # HTML-шаблон
├── src/
│   ├── app/                  # store, slices, RTK Query API
│   ├── components/           # переиспользуемые UI-компоненты
│   ├── constants/            # константы
│   ├── views/                # страницы приложения
│   ├── bootstrap.tsx         # инициализация приложения
│   ├── index.ts              # точка входа webpack
│   ├── teams.ts              # данные/утилиты по командам
│   ├── theme.ts              # MUI-тема
│   └── types.ts              # общие типы
├── webpack.config.js         # dev-конфигурация (DevServer)
├── webpack.common.js         # общие настройки сборки
└── webpack.build.js          # прод-сборка
```

## Бэкенд

Инструкции по запуску и структуре бэкенда находятся в `server/README.md`.
