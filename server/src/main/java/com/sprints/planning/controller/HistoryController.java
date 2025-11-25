package com.sprints.planning.controller;

import com.sprints.planning.dto.HistoryGroupDto;
import com.sprints.planning.dto.request.HistoryChangeRequest;
import com.sprints.planning.dto.request.HistoryDescriptionRequest;
import com.sprints.planning.dto.request.HistoryLockRequest;
import com.sprints.planning.dto.request.HistoryRollbackRequest;
import com.sprints.planning.service.HistoryService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HistoryController {

    private final HistoryService historyService;

    public HistoryController(HistoryService historyService) {
        this.historyService = historyService;
    }

    @GetMapping("/history")
    public List<HistoryGroupDto> getHistory() {
        return historyService.list();
    }

    @PostMapping("/history/change")
    public List<HistoryGroupDto> recordChange(@RequestBody @Valid HistoryChangeRequest request) {
        return historyService.recordChange(request);
    }

    @PostMapping("/history/description")
    public List<HistoryGroupDto> updateDescription(@RequestBody @Valid HistoryDescriptionRequest request) {
        return historyService.updateDescription(request);
    }

    @PostMapping("/history/lock")
    public List<HistoryGroupDto> updateLock(@RequestBody @Valid HistoryLockRequest request) {
        return historyService.updateLock(request);
    }

    @PostMapping("/history/rollback")
    public List<HistoryGroupDto> rollback(@RequestBody @Valid HistoryRollbackRequest request) {
        return historyService.markRolledBack(request);
    }
}
