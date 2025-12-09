package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
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
public class TaskWorkloadController {

    private final TaskService taskService;

    public TaskWorkloadController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping("/taskload")
    public TaskDto upsertLoad(@PathVariable String teamKey, @RequestBody @Valid TaskLoadRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return taskService.upsertLoad(normalizedTeamKey, request);
    }
}
