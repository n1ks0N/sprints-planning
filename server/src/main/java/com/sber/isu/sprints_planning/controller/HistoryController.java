package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ApiSessionHistoryDto;
import com.sber.isu.sprints_planning.service.ApiHistoryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HistoryController {

    private final ApiHistoryService apiHistoryService;

    public HistoryController(ApiHistoryService apiHistoryService) {
        this.apiHistoryService = apiHistoryService;
    }

    @GetMapping("/history")
    public List<ApiSessionHistoryDto> getHistory() {
        return apiHistoryService.getHistory();
    }
}
