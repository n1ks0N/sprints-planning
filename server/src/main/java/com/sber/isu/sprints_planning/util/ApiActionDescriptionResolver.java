package com.sber.isu.sprints_planning.util;

import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ApiActionDescriptionResolver {

    private final Map<String, String> actions = new HashMap<>();

    public ApiActionDescriptionResolver() {
        actions.put("GET /participants", "Получен список участников");
        actions.put("POST /participants", "Добавлен участник");
        actions.put("POST /participants/update", "Обновлен участник");
        actions.put("POST /participants/delete", "Удален участник");
        actions.put("POST /participants/reorder", "Изменен порядок участников");

        actions.put("GET /quarters", "Получен список кварталов");
        actions.put("POST /quarters", "Добавлен квартал");
        actions.put("POST /quarters/update", "Обновлен квартал");
        actions.put("POST /quarters/delete", "Удален квартал");

        actions.put("GET /sprints", "Получен список спринтов");
        actions.put("POST /sprints", "Добавлен спринт");
        actions.put("POST /sprints/update", "Обновлен спринт");
        actions.put("POST /sprints/delete", "Удален спринт");

        actions.put("GET /tasks", "Получен список задач");
        actions.put("GET /tasks/{id}", "Получена задача");
        actions.put("POST /tasks", "Добавлена задача");
        actions.put("POST /tasks/update", "Изменена задача");
        actions.put("POST /tasks/delete", "Удалена задача");

        actions.put("POST /taskload", "Обновлена нагрузка задачи");
        actions.put("POST /taskalloc", "Обновлено распределение задачи");
        actions.put("POST /taskalloc/bulk", "Массовое обновление распределения задач");

        actions.put("GET /runvac", "Получены отпуска и забеги");
        actions.put("POST /runvac", "Обновлены отпуска и забеги");
        actions.put("POST /runvac/bulk", "Массовое обновление отпусков и забегов");

        actions.put("GET /capacity", "Получена таблица нагрузки");

        actions.put("GET /releases", "Получен список релизов");
        actions.put("POST /releases", "Добавлен релиз");
        actions.put("POST /releases/update", "Обновлен релиз");
        actions.put("POST /releases/delete", "Удален релиз");

        actions.put("GET /history", "Просмотр истории действий");

        actions.put("GET /export/excel", "Экспорт плана в Excel");
    }

    public String resolve(String method, String path) {
        String normalized = "%s %s".formatted(method.toUpperCase(), path);
        return actions.getOrDefault(normalized, "Запрос " + normalized);
    }
}
