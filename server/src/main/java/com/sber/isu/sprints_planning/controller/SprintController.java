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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class SprintController {

    private final SprintService sprintService;

    public SprintController(SprintService sprintService) {
        this.sprintService = sprintService;
    }

    @GetMapping("/sprints")
    public List<SprintDto> getSprints(@PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId) {
        return sprintService.findAll(teamKey, quarterId != null ? UUID.fromString(quarterId) : null);
    }

    @PostMapping("/sprints")
    public SprintDto createSprint(@PathVariable String teamKey, @RequestBody @Valid SprintCreateRequest request) {
        return sprintService.create(teamKey, request);
    }

    @PostMapping("/sprints/update")
    public SprintDto updateSprint(@PathVariable String teamKey, @RequestBody @Valid SprintUpdateRequest request) {
        return sprintService.update(teamKey, request);
    }

    @PostMapping("/sprints/delete")
    public SprintDto deleteSprint(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        return sprintService.delete(teamKey, request);
    }
}
