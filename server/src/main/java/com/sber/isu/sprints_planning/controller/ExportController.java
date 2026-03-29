package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.service.ExportService;
import com.sber.isu.sprints_planning.service.TaskFilter;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}/export")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping("/excel")
    public ResponseEntity<ByteArrayResource> exportExcel(
        @PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId,
        @RequestParam(value = "priority", required = false) String priority,
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "releaseDateId", required = false) String releaseDateId,
        @RequestParam(value = "stream", required = false) String stream,
        @RequestParam(value = "withoutStream", required = false) String withoutStream,
        @RequestParam(value = "customer", required = false) String customer,
        @RequestParam(value = "withoutCustomer", required = false) String withoutCustomer,
        @RequestParam(value = "search", required = false) String search,
        @RequestParam(value = "participantId", required = false) String participantId,
        @RequestParam(value = "role", required = false) String role,
        @RequestParam(value = "userStream", required = false) String userStream,
        @RequestParam(value = "withoutQuarter", required = false) String withoutQuarter,
        @RequestParam(value = "id", required = false) String pinnedTaskId
    ) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        TaskFilter filter = TaskFilter.from(
            quarterId,
            priority,
            status,
            releaseDateId,
            stream,
            withoutStream,
            customer,
            withoutCustomer,
            participantId,
            role,
            userStream,
            search,
            withoutQuarter,
            pinnedTaskId
        );
        byte[] bytes = exportService.exportToExcel(normalizedTeamKey, filter);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sprints-planning.xlsx\"")
            .contentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .contentLength(bytes.length)
            .body(new ByteArrayResource(bytes));
    }
}
