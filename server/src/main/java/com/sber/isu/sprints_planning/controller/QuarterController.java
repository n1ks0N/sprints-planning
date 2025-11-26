package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.QuarterDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterCreateRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterUpdateRequest;
import com.sber.isu.sprints_planning.service.QuarterService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QuarterController {

    private final QuarterService quarterService;

    public QuarterController(QuarterService quarterService) {
        this.quarterService = quarterService;
    }

    @GetMapping("/quarters")
    public List<QuarterDto> getQuarters() {
        return quarterService.findAll();
    }

    @PostMapping("/quarters")
    public QuarterDto createQuarter(@RequestBody @Valid QuarterCreateRequest request) {
        return quarterService.create(request);
    }

    @PostMapping("/quarters/update")
    public QuarterDto updateQuarter(@RequestBody @Valid QuarterUpdateRequest request) {
        return quarterService.update(request);
    }

    @PostMapping("/quarters/delete")
    public QuarterDto deleteQuarter(@RequestBody @Valid IdRequest request) {
        return quarterService.delete(request);
    }
}
