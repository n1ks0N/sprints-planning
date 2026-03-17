package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.JiraExportBatchStartDto;
import com.sber.isu.sprints_planning.dto.JiraExportBatchStatusDto;
import com.sber.isu.sprints_planning.dto.request.JiraIssueExportRequest;
import com.sber.isu.sprints_planning.dto.request.JiraIssueManualConfirmRequest;
import com.sber.isu.sprints_planning.service.JiraIssueExportService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}/jira")
public class JiraController {

    private final JiraIssueExportService jiraIssueExportService;

    public JiraController(JiraIssueExportService jiraIssueExportService) {
        this.jiraIssueExportService = jiraIssueExportService;
    }

    @PostMapping("/issues")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JiraExportBatchStartDto exportIssues(
        @PathVariable String teamKey,
        @RequestBody @Valid JiraIssueExportRequest request,
        HttpServletRequest httpRequest
    ) {
        return jiraIssueExportService.startExport(
            TeamKeyNormalizer.normalize(teamKey),
            request,
            httpRequest.getHeader("X-Session-Id"),
            httpRequest.getHeader("X-User-Name")
        );
    }

    @GetMapping("/issues/batches/{batchId}")
    public JiraExportBatchStatusDto getExportBatchStatus(
        @PathVariable String teamKey,
        @PathVariable String batchId
    ) {
        return jiraIssueExportService.getBatchStatus(TeamKeyNormalizer.normalize(teamKey), batchId);
    }

    @PostMapping("/issues/items/{taskJiraIssueId}/confirm-created")
    public JiraExportBatchStatusDto confirmCreated(
        @PathVariable String teamKey,
        @PathVariable String taskJiraIssueId,
        @RequestBody @Valid JiraIssueManualConfirmRequest request,
        @RequestParam(required = false) String batchId,
        HttpServletRequest httpRequest
    ) {
        return jiraIssueExportService.confirmCreated(
            TeamKeyNormalizer.normalize(teamKey),
            taskJiraIssueId,
            request,
            batchId,
            httpRequest.getHeader("X-Session-Id"),
            httpRequest.getHeader("X-User-Name")
        );
    }

    @PostMapping("/issues/items/{taskJiraIssueId}/confirm-not-created")
    public JiraExportBatchStatusDto confirmNotCreated(
        @PathVariable String teamKey,
        @PathVariable String taskJiraIssueId,
        @RequestParam(required = false) String batchId,
        HttpServletRequest httpRequest
    ) {
        return jiraIssueExportService.confirmNotCreated(
            TeamKeyNormalizer.normalize(teamKey),
            taskJiraIssueId,
            batchId,
            httpRequest.getHeader("X-Session-Id"),
            httpRequest.getHeader("X-User-Name")
        );
    }
}
