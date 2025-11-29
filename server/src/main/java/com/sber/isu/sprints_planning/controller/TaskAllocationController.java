package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaskAllocationController {

    private final TaskService taskService;

    public TaskAllocationController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping("/taskalloc")
    public TaskDto upsertAllocation(@RequestBody @Valid TaskAllocationRequest request) {
        return taskService.upsertAllocation(request);
    }

    @PostMapping("/taskalloc/bulk")
    public TaskDto upsertAllocations(@RequestBody @Valid TaskAllocationBulkRequest request) {
        return taskService.upsertAllocations(request);
    }
}
