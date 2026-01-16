
# Sprint Planner Starter (Frontend)

Стек: React + TypeScript + RTK Query + Redux + Webpack + Material UI (зелёная палитра в стиле Sber).
Три страницы MVP:
- **Спринты и кварталы** — ввод/генерация спринтов (3 недели) и кварталов (3 месяца), вычисление рабочих дней (Пн–Пт).
- **Участники** — ФИО, роль (UI/FE/BE/QA/BA/CA/PY), ставка (1/0.75/0.5).
- **Нагрузка** — расчёт:
  - `base = workingDays × rate × 0.75`
  - `available = base`
  Показаны значения на спринт и суммарно за квартал.

## Запуск
DevServer проксирует `/api` → `http://localhost:8080`.
```bash
npm run dev:api
```
Откроется http://localhost:5173 — данные читаются и сохраняются через backend.
