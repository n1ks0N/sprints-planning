package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.SprintDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.SprintCreateRequest;
import com.sber.isu.sprints_planning.dto.request.SprintUpdateRequest;
import com.sber.isu.sprints_planning.service.SprintService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SprintController {

    private final SprintService sprintService;

    public SprintController(SprintService sprintService) {
        this.sprintService = sprintService;
    }

    @GetMapping("/sprints")
    public List<SprintDto> getSprints(@RequestParam(value = "quarterId", required = false) String quarterId) {
        return sprintService.findAll(quarterId != null ? UUID.fromString(quarterId) : null);
    }

    @PostMapping("/sprints")
    public SprintDto createSprint(@RequestBody @Valid SprintCreateRequest request) {
        return sprintService.create(request);
    }

    @PostMapping("/sprints/update")
    public SprintDto updateSprint(@RequestBody @Valid SprintUpdateRequest request) {
        return sprintService.update(request);
    }

    @PostMapping("/sprints/delete")
    public SprintDto deleteSprint(@RequestBody @Valid IdRequest request) {
        return sprintService.delete(request);
    }
}
