package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.FiltersDto;
import com.sber.isu.sprints_planning.service.FiltersService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class FiltersController {

    private final FiltersService filtersService;

    public FiltersController(FiltersService filtersService) {
        this.filtersService = filtersService;
    }

    @GetMapping("/filters")
    public FiltersDto getFilters(@PathVariable String teamKey) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return filtersService.getFilters(normalizedTeamKey);
    }
}
