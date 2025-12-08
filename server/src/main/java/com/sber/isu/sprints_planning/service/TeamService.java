package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.model.TeamEntity;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class TeamService {

    private final TeamRepository teamRepository;

    public TeamService(TeamRepository teamRepository) {
        this.teamRepository = teamRepository;
    }

    public TeamEntity getTeamOrThrow(String teamKey) {
        return teamRepository.findById(teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Team not found"));
    }
}
