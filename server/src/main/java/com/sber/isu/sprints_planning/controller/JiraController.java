package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.JiraIssueExportResponseDto;
import com.sber.isu.sprints_planning.dto.request.JiraIssueExportRequest;
import com.sber.isu.sprints_planning.service.JiraIssueExportService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}/jira")
public class JiraController {

    private final JiraIssueExportService jiraIssueExportService;

    public JiraController(JiraIssueExportService jiraIssueExportService) {
        this.jiraIssueExportService = jiraIssueExportService;
    }

    @PostMapping("/issues")
    public JiraIssueExportResponseDto exportIssues(
        @PathVariable String teamKey,
        @RequestBody @Valid JiraIssueExportRequest request
    ) {
        return jiraIssueExportService.export(TeamKeyNormalizer.normalize(teamKey), request);
    }
}
