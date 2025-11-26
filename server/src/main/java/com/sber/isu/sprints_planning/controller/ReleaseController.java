package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ReleaseDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseUpdateRequest;
import com.sber.isu.sprints_planning.service.ReleaseService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReleaseController {

    private final ReleaseService releaseService;

    public ReleaseController(ReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping("/releases")
    public List<ReleaseDto> getReleases() {
        return releaseService.findAll();
    }

    @PostMapping("/releases")
    public ReleaseDto createRelease(@RequestBody @Valid ReleaseCreateRequest request) {
        return releaseService.create(request);
    }

    @PostMapping("/releases/update")
    public ReleaseDto updateRelease(@RequestBody @Valid ReleaseUpdateRequest request) {
        return releaseService.update(request);
    }

    @PostMapping("/releases/delete")
    public ReleaseDto deleteRelease(@RequestBody @Valid IdRequest request) {
        return releaseService.delete(request);
    }
}
