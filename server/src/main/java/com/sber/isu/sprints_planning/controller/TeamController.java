package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.model.TeamEntity;
import com.sber.isu.sprints_planning.service.TeamService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/teams")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public List<TeamEntity> getTeams() {
        return teamService.findAll();
    }

    public record CreateTeamRequest(
        @NotBlank(message = "Ключ обязателен")
        @jakarta.validation.constraints.Pattern(
            regexp = "^[a-z0-9_-]+$",
            message = "Ключ может содержать только строчные буквы, цифры, дефис и нижнее подчёркивание"
        )
        String key,

        @NotBlank(message = "Название обязательно") String name,

        Long jiraBoardId
    ) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeamEntity createTeam(@RequestBody @Valid CreateTeamRequest request) {
        return teamService.createTeam(request.key(), request.name(), request.jiraBoardId());
    }

    public record UpdateTeamRequest(@NotBlank String name, Long jiraBoardId) {}

    @PutMapping("/{teamKey}")
    public TeamEntity updateTeam(
        @PathVariable String teamKey,
        @RequestBody @Valid UpdateTeamRequest request
    ) {
        return teamService.updateTeam(teamKey, request.name(), request.jiraBoardId());
    }

    @DeleteMapping("/{teamKey}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTeam(
        @PathVariable String teamKey,
        @RequestParam(name = "deleteData", defaultValue = "false") boolean deleteData
    ) {
        teamService.deleteTeam(teamKey, deleteData);
    }
}
