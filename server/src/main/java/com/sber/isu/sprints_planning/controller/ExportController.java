package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.service.ExportService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}/export")
public class ExportController {

    private static final DateTimeFormatter FILE_TS_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping("/excel")
    public ResponseEntity<ByteArrayResource> exportExcel(@PathVariable String teamKey) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        byte[] bytes = exportService.exportToExcel(normalizedTeamKey);
        String timestamp = LocalDateTime.now().format(FILE_TS_FORMATTER);
        String filename = "sprints-planning-%s.xlsx".formatted(timestamp);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"%s\"".formatted(filename))
            .contentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .contentLength(bytes.length)
            .body(new ByteArrayResource(bytes));
    }
}
