package com.sprints.planning.controller;

import com.sprints.planning.dto.TaskDto;
import com.sprints.planning.dto.request.IdRequest;
import com.sprints.planning.dto.request.TaskAllocationRequest;
import com.sprints.planning.dto.request.TaskCreateRequest;
import com.sprints.planning.dto.request.TaskLoadRequest;
import com.sprints.planning.dto.request.TaskUpdateRequest;
import com.sprints.planning.service.TaskService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping("/tasks")
    public List<TaskDto> getTasks(@RequestParam(value = "quarterId", required = false) String quarterId) {
        return taskService.findAll(quarterId != null ? UUID.fromString(quarterId) : null);
    }

    @PostMapping("/tasks")
    public TaskDto createTask(@RequestBody @Valid TaskCreateRequest request) {
        return taskService.create(request);
    }

    @PostMapping("/tasks/update")
    public TaskDto updateTask(@RequestBody @Valid TaskUpdateRequest request) {
        return taskService.update(request);
    }

    @PostMapping("/tasks/delete")
    public TaskDto deleteTask(@RequestBody @Valid IdRequest request) {
        return taskService.delete(request);
    }

    @PostMapping("/taskalloc")
    public TaskDto upsertAllocation(@RequestBody @Valid TaskAllocationRequest request) {
        return taskService.upsertAllocation(request);
    }

    @PostMapping("/taskload")
    public TaskDto upsertLoad(@RequestBody @Valid TaskLoadRequest request) {
        return taskService.upsertLoad(request);
    }
}
