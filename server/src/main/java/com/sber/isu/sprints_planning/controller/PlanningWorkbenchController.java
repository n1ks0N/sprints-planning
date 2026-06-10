package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.PlanningWorkbenchPreviewDto;
import com.sber.isu.sprints_planning.dto.PlanningWorkbenchItemDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchItemRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchPreviewRequest;
import com.sber.isu.sprints_planning.service.PlanningWorkbenchService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}/planning-workbench")
public class PlanningWorkbenchController {

    private final PlanningWorkbenchService planningWorkbenchService;

    public PlanningWorkbenchController(PlanningWorkbenchService planningWorkbenchService) {
        this.planningWorkbenchService = planningWorkbenchService;
    }

    @GetMapping("/backlog")
    public List<PlanningWorkbenchItemDto> getBacklog(@PathVariable String teamKey) {
        return planningWorkbenchService.getBacklogCandidates(TeamKeyNormalizer.normalize(teamKey));
    }

    @PostMapping("/items")
    public PlanningWorkbenchItemDto createItem(
        @PathVariable String teamKey,
        @RequestBody @Valid PlanningWorkbenchItemRequest request
    ) {
        return planningWorkbenchService.createItem(TeamKeyNormalizer.normalize(teamKey), request);
    }

    @PutMapping("/items/{itemId}")
    public PlanningWorkbenchItemDto updateItem(
        @PathVariable String teamKey,
        @PathVariable String itemId,
        @RequestBody @Valid PlanningWorkbenchItemRequest request
    ) {
        return planningWorkbenchService.updateItem(TeamKeyNormalizer.normalize(teamKey), itemId, request);
    }

    @DeleteMapping("/items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteItem(
        @PathVariable String teamKey,
        @PathVariable String itemId
    ) {
        planningWorkbenchService.deleteItem(TeamKeyNormalizer.normalize(teamKey), itemId);
    }

    @PostMapping("/preview")
    public PlanningWorkbenchPreviewDto preview(
        @PathVariable String teamKey,
        @RequestBody @Valid PlanningWorkbenchPreviewRequest request
    ) {
        return planningWorkbenchService.preview(TeamKeyNormalizer.normalize(teamKey), request);
    }

    @PostMapping("/apply")
    public List<TaskDto> apply(
        @PathVariable String teamKey,
        @RequestBody @Valid PlanningWorkbenchApplyRequest request,
        @RequestHeader(value = "X-Session-Id", required = false) String sessionId,
        @RequestHeader(value = "X-User-Name", required = false) String userName
    ) {
        return planningWorkbenchService.apply(TeamKeyNormalizer.normalize(teamKey), request, sessionId, userName);
    }
}
