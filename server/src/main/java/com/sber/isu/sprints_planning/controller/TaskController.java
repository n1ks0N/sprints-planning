package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public List<TaskDto> getTasks(@RequestParam(value = "quarterId", required = false) String quarterId) {
        return taskService.findAll(quarterId != null ? UUID.fromString(quarterId) : null);
    }

    @PostMapping
    public TaskDto createTask(@RequestBody @Valid TaskCreateRequest request) {
        return taskService.create(request);
    }

    @PatchMapping("/{id}")
    public TaskDto updateTask(
        @PathVariable("id") String id, @RequestBody @Valid TaskUpdateRequest request) {
        return taskService.update(UUID.fromString(id), request);
    }

    @PostMapping("/delete")
    public TaskDto deleteTask(@RequestBody @Valid IdRequest request) {
        return taskService.delete(request);
    }

    @PostMapping("/taskalloc")
    public TaskDto upsertAllocation(@RequestBody @Valid TaskAllocationRequest request) {
        return taskService.upsertAllocation(request);
    }

    @PostMapping("/taskalloc/bulk")
    public TaskDto upsertAllocations(@RequestBody @Valid TaskAllocationBulkRequest request) {
        return taskService.upsertAllocations(request);
    }

    @PostMapping("/taskload")
    public TaskDto upsertLoad(@RequestBody @Valid TaskLoadRequest request) {
        return taskService.upsertLoad(request);
    }
}
