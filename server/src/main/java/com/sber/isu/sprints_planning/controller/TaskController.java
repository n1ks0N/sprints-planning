package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.service.TaskFilter;
import com.sber.isu.sprints_planning.service.TaskService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping("/tasks")
    public Page<TaskDto> getTasks(@PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId,
        @RequestParam(value = "priority", required = false) String priority,
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "releaseDate", required = false) String releaseDate,
        @RequestParam(value = "stream", required = false) String stream,
        @RequestParam(value = "page", required = false) Integer page,
        @RequestParam(value = "size", required = false) Integer size) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        TaskFilter filter = TaskFilter.from(quarterId, priority, status, releaseDate, stream);
        return taskService.findPage(normalizedTeamKey, filter, page, size);
    }

    @GetMapping("/tasks/{id}")
    public TaskDto getTask(@PathVariable String teamKey, @PathVariable UUID id) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.findById(normalizedTeamKey, id);
    }

    @PostMapping("/tasks")
    public TaskDto createTask(@PathVariable String teamKey, @RequestBody @Valid TaskCreateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.create(normalizedTeamKey, request);
    }

    @PostMapping("/tasks/update")
    public TaskDto updateTask(@PathVariable String teamKey, @RequestBody @Valid TaskUpdateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.update(normalizedTeamKey, request);
    }

    @PostMapping("/tasks/delete")
    public TaskDto deleteTask(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.delete(normalizedTeamKey, request);
    }

}
