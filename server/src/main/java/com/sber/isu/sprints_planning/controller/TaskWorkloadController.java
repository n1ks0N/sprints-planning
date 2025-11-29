package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaskWorkloadController {

    private final TaskService taskService;

    public TaskWorkloadController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping("/taskload")
    public TaskDto upsertLoad(@RequestBody @Valid TaskLoadRequest request) {
        return taskService.upsertLoad(request);
    }
}
