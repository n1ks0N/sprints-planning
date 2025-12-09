package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.QuarterDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterCreateRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterUpdateRequest;
import com.sber.isu.sprints_planning.service.QuarterService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class QuarterController {

    private final QuarterService quarterService;

    public QuarterController(QuarterService quarterService) {
        this.quarterService = quarterService;
    }

    @GetMapping("/quarters")
    public List<QuarterDto> getQuarters(@PathVariable String teamKey) {
        return quarterService.findAll(TeamKeyNormalizer.normalize(teamKey));
    }

    @PostMapping("/quarters")
    public QuarterDto createQuarter(@PathVariable String teamKey, @RequestBody @Valid QuarterCreateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return quarterService.create(normalizedTeamKey, request);
    }

    @PostMapping("/quarters/update")
    public QuarterDto updateQuarter(@PathVariable String teamKey, @RequestBody @Valid QuarterUpdateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return quarterService.update(normalizedTeamKey, request);
    }

    @PostMapping("/quarters/delete")
    public QuarterDto deleteQuarter(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return quarterService.delete(normalizedTeamKey, request);
    }
}
