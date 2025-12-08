package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.RunVacationDto;
import com.sber.isu.sprints_planning.dto.request.RunVacationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.RunVacationUpsertRequest;
import com.sber.isu.sprints_planning.service.RunVacationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class RunVacationController {

    private final RunVacationService runVacationService;

    public RunVacationController(RunVacationService runVacationService) {
        this.runVacationService = runVacationService;
    }

    @GetMapping("/runvac")
    public List<RunVacationDto> getRunVacation(@PathVariable String teamKey, @RequestParam("quarterId") String quarterId) {
        return runVacationService.findByQuarter(UUID.fromString(quarterId));
    }

    @PostMapping("/runvac")
    public RunVacationDto upsertRunVacation(@PathVariable String teamKey,
        @RequestBody @Valid RunVacationUpsertRequest request) {
        return runVacationService.upsert(request);
    }

    @PostMapping("/runvac/bulk")
    public Map<String, Boolean> bulkRunVacation(@PathVariable String teamKey,
        @RequestBody @Valid RunVacationBulkRequest request) {
        runVacationService.bulk(request);
        return Map.of("ok", Boolean.TRUE);
    }
}
