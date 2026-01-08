package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ApiSessionHistoryDto;
import com.sber.isu.sprints_planning.service.ApiHistoryService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/{teamKey}/history", produces = MediaType.APPLICATION_JSON_VALUE)
public class HistoryController {

    private final ApiHistoryService apiHistoryService;

    public HistoryController(ApiHistoryService apiHistoryService) {
        this.apiHistoryService = apiHistoryService;
    }

    @GetMapping
    public List<ApiSessionHistoryDto> getHistory(@PathVariable String teamKey,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size) {
        return apiHistoryService.getHistory(TeamKeyNormalizer.normalize(teamKey), page, size);
    }
}
