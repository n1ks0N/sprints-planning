package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryItemDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.service.ApiHistoryService;
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
    private final ApiHistoryService apiHistoryService;

    public TaskController(TaskService taskService, ApiHistoryService apiHistoryService) {
        this.taskService = taskService;
        this.apiHistoryService = apiHistoryService;
    }

    @GetMapping("/tasks")
    public Page<TaskDto> getTasks(@PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId,
        @RequestParam(value = "priority", required = false) String priority,
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "releaseDateId", required = false) String releaseDateId,
        @RequestParam(value = "stream", required = false) String stream,
        @RequestParam(value = "withoutStream", required = false) String withoutStream,
        @RequestParam(value = "customer", required = false) String customer,
        @RequestParam(value = "withoutCustomer", required = false) String withoutCustomer,
        @RequestParam(value = "search", required = false) String search,
        @RequestParam(value = "participantId", required = false) String participantId,
        @RequestParam(value = "role", required = false) String role,
        @RequestParam(value = "userStream", required = false) String userStream,
        @RequestParam(value = "withoutQuarter", required = false) String withoutQuarter,
        @RequestParam(value = "id", required = false) String pinnedTaskId,
        @RequestParam(value = "sortBy", required = false) String sortBy,
        @RequestParam(value = "sortDirection", required = false) String sortDirection,
        @RequestParam(value = "page", defaultValue = "0") Integer page,
        @RequestParam(value = "size", defaultValue = "50") Integer size) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        TaskFilter filter = TaskFilter.from(
            quarterId,
            priority,
            status,
            releaseDateId,
            stream,
            withoutStream,
            customer,
            withoutCustomer,
            participantId,
            role,
            userStream,
            search,
            withoutQuarter,
            pinnedTaskId
        );
        return taskService.findPage(normalizedTeamKey, filter, page, size, sortBy, sortDirection);
    }

    @GetMapping("/tasks/{id}")
    public TaskDto getTask(@PathVariable String teamKey, @PathVariable UUID id) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.findById(normalizedTeamKey, id);
    }

    @GetMapping("/tasks/{id}/history")
    public Page<TaskHistoryItemDto> getTaskHistory(
        @PathVariable String teamKey,
        @PathVariable UUID id,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "30") int size
    ) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return apiHistoryService.getTaskHistory(normalizedTeamKey, id, page, size);
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
