package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import jakarta.validation.Valid;
import java.util.List;
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
    public List<TaskDto> getTasks(@PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId) {
        return taskService.findAll(teamKey, quarterId != null ? UUID.fromString(quarterId) : null);
    }

    @PostMapping("/tasks")
    public TaskDto createTask(@PathVariable String teamKey, @RequestBody @Valid TaskCreateRequest request) {
        return taskService.create(teamKey, request);
    }

    @PostMapping("/tasks/update")
    public TaskDto updateTask(@PathVariable String teamKey, @RequestBody @Valid TaskUpdateRequest request) {
        return taskService.update(teamKey, request);
    }

    @PostMapping("/tasks/delete")
    public TaskDto deleteTask(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        return taskService.delete(teamKey, request);
    }

}
