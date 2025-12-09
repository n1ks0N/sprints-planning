package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantReorderRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantUpdateRequest;
import com.sber.isu.sprints_planning.service.ParticipantService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class ParticipantController {

    private final ParticipantService participantService;

    public ParticipantController(ParticipantService participantService) {
        this.participantService = participantService;
    }

    @GetMapping("/participants")
    public List<ParticipantDto> getParticipants(@PathVariable String teamKey) {
        return participantService.findAll(TeamKeyNormalizer.normalize(teamKey));
    }

    @PostMapping("/participants")
    public ParticipantDto createParticipant(@PathVariable String teamKey,
        @RequestBody @Valid ParticipantCreateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return participantService.create(normalizedTeamKey, request);
    }

    @PostMapping("/participants/update")
    public ParticipantDto updateParticipant(@PathVariable String teamKey,
        @RequestBody @Valid ParticipantUpdateRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return participantService.update(normalizedTeamKey, request);
    }

    @PostMapping("/participants/delete")
    public ParticipantDto deleteParticipant(@PathVariable String teamKey, @RequestBody @Valid IdRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        return participantService.delete(normalizedTeamKey, request);
    }

    @PostMapping("/participants/reorder")
    public Map<String, Boolean> reorderParticipants(@PathVariable String teamKey,
        @RequestBody @Valid ParticipantReorderRequest request) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        participantService.reorder(normalizedTeamKey, request);
        return Map.of("ok", Boolean.TRUE);
    }
}
