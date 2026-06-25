package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.model.TeamEntity;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.regex.Pattern;
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
    private final ApiHistoryService apiHistoryService;
    private static final Pattern KEY_PATTERN = Pattern.compile("^[a-z0-9_-]+$");

    public TeamService(
        TeamRepository teamRepository,
        TeamCleanupService teamCleanupService,
        ApiHistoryService apiHistoryService
    ) {
        this.teamRepository = teamRepository;
        this.teamCleanupService = teamCleanupService;
        this.apiHistoryService = apiHistoryService;
    }

    public TeamEntity getTeamOrThrow(String teamKey) {
        return teamRepository.findById(teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Team not found"));
    }

    public List<TeamEntity> findAll() {
        return teamRepository.findAll(Sort.by("key"));
    }

    public TeamEntity createTeam(String key, String name, Long jiraBoardId) {
        String normalizedKey = normalizeKey(key);
        validateKey(normalizedKey);
        validateName(name);
        validateJiraBoardId(jiraBoardId);
        if (teamRepository.existsById(normalizedKey)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Команда уже существует");
        }
        TeamEntity entity = new TeamEntity();
        entity.setKey(normalizedKey);
        entity.setName(name.trim());
        entity.setJiraBoardId(jiraBoardId);
        return teamRepository.save(entity);
    }

    public TeamEntity updateTeam(String key, String name, Long jiraBoardId) {
        String normalizedKey = normalizeKey(key);
        validateKey(normalizedKey);
        validateName(name);
        validateJiraBoardId(jiraBoardId);
        TeamEntity entity = getTeamOrThrow(normalizedKey);
        entity.setName(name.trim());
        entity.setJiraBoardId(jiraBoardId);
        return teamRepository.save(entity);
    }

    @Transactional
    public void deleteTeam(String key, boolean deleteData) {
        String normalizedKey = normalizeKey(key);
        validateKey(normalizedKey);
        if (!teamRepository.existsById(normalizedKey)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Команда не найдена");
        }

        apiHistoryService.markTeamDeletionInProgress(normalizedKey);
        try {
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
        } finally {
            apiHistoryService.clearTeamDeletionInProgress(normalizedKey);
        }
    }

    private String normalizeKey(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ключ команды обязателен");
        }
        return raw.trim().toLowerCase();
    }

    private void validateKey(String key) {
        if (!KEY_PATTERN.matcher(key).matches()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Ключ может содержать только строчные буквы, цифры, дефис и нижнее подчёркивание"
            );
        }
    }

    private void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Название команды обязательно");
        }
    }

    private void validateJiraBoardId(Long jiraBoardId) {
        if (jiraBoardId != null && jiraBoardId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Jira boardId должен быть положительным числом");
        }
    }
}
