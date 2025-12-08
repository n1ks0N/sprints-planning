package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ReleaseDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseUpdateRequest;
import com.sber.isu.sprints_planning.service.ReleaseService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class ReleaseController {

    private final ReleaseService releaseService;

    public ReleaseController(ReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping("/releases")
    public List<ReleaseDto> getReleases(@PathVariable String teamKey) {
        return releaseService.findAll();
    }

    @PostMapping("/releases")
    public ReleaseDto createRelease(@PathVariable String teamKey, @RequestBody @Valid ReleaseCreateRequest request) {
        return releaseService.create(request);
    }

    @PostMapping("/releases/update")
    public ReleaseDto updateRelease(@PathVariable String teamKey, @RequestBody @Valid ReleaseUpdateRequest request) {
        return releaseService.update(request);
    }

    @PostMapping("/releases/delete")
    public ReleaseDto deleteRelease(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        return releaseService.delete(request);
    }
}
