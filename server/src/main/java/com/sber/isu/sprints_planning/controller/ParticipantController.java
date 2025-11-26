package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantReorderRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantUpdateRequest;
import com.sber.isu.sprints_planning.service.ParticipantService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ParticipantController {

    private final ParticipantService participantService;

    public ParticipantController(ParticipantService participantService) {
        this.participantService = participantService;
    }

    @GetMapping("/participants")
    public List<ParticipantDto> getParticipants() {
        return participantService.findAll();
    }

    @PostMapping("/participants")
    public ParticipantDto createParticipant(@RequestBody @Valid ParticipantCreateRequest request) {
        return participantService.create(request);
    }

    @PostMapping("/participants/update")
    public ParticipantDto updateParticipant(@RequestBody @Valid ParticipantUpdateRequest request) {
        return participantService.update(request);
    }

    @PostMapping("/participants/delete")
    public ParticipantDto deleteParticipant(@RequestBody @Valid IdRequest request) {
        return participantService.delete(request);
    }

    @PostMapping("/participants/reorder")
    public Map<String, Boolean> reorderParticipants(@RequestBody @Valid ParticipantReorderRequest request) {
        participantService.reorder(request);
        return Map.of("ok", Boolean.TRUE);
    }
}
