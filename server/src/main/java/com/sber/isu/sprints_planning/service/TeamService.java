package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.model.TeamEntity;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TeamService {

    private final TeamRepository teamRepository;
    private final TeamCleanupService teamCleanupService;

    public TeamService(TeamRepository teamRepository, TeamCleanupService teamCleanupService) {
        this.teamRepository = teamRepository;
        this.teamCleanupService = teamCleanupService;
    }

    public TeamEntity getTeamOrThrow(String teamKey) {
        return teamRepository.findById(teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Team not found"));
    }

    public List<TeamEntity> findAll() {
        return teamRepository.findAll(Sort.by("key"));
    }

    public TeamEntity createTeam(String key, String name) {
        String normalizedKey = normalizeKey(key);
        validateName(name);
        if (teamRepository.existsById(normalizedKey)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Команда уже существует");
        }
        TeamEntity entity = new TeamEntity();
        entity.setKey(normalizedKey);
        entity.setName(name.trim());
        return teamRepository.save(entity);
    }

    public TeamEntity updateTeam(String key, String name) {
        validateName(name);
        TeamEntity entity = getTeamOrThrow(normalizeKey(key));
        entity.setName(name.trim());
        return teamRepository.save(entity);
    }

    @Transactional
    public void deleteTeam(String key, boolean deleteData) {
        String normalizedKey = normalizeKey(key);
        if (!teamRepository.existsById(normalizedKey)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Команда не найдена");
        }

        if (deleteData) {
            teamCleanupService.deleteTeamData(normalizedKey);
        } else {
            long usage = teamCleanupService.countTeamData(normalizedKey);
            if (usage > 0) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Невозможно удалить команду с существующими данными без очистки"
                );
            }
        }

        try {
            teamRepository.deleteById(normalizedKey);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Не удалось удалить команду из-за связанных данных",
                ex
            );
        }
    }

    private String normalizeKey(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ключ команды обязателен");
        }
        return raw.trim().toLowerCase();
    }

    private void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Название команды обязательно");
        }
    }
}
