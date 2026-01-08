package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationMultiRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class TaskAllocationController {

    private final TaskService taskService;

    public TaskAllocationController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping("/taskalloc")
    public TaskDto upsertAllocation(@PathVariable String teamKey,
        @RequestBody @Valid TaskAllocationRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.upsertAllocation(normalizedTeamKey, request);
    }

    @PostMapping("/taskalloc/bulk")
    public TaskDto upsertAllocations(@PathVariable String teamKey,
        @RequestBody @Valid TaskAllocationBulkRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.upsertAllocations(normalizedTeamKey, request);
    }

    @PostMapping("/taskalloc/bulk/multi")
    public TaskDto upsertAllocationsMulti(@PathVariable String teamKey,
        @RequestBody @Valid TaskAllocationMultiRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.upsertAllocationsMulti(normalizedTeamKey, request);
    }
}
