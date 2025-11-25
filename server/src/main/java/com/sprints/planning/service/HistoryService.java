package com.sprints.planning.service;

import com.sprints.planning.dto.HistoryGroupDto;
import com.sprints.planning.dto.request.HistoryChangeRequest;
import com.sprints.planning.dto.request.HistoryDescriptionRequest;
import com.sprints.planning.dto.request.HistoryLockRequest;
import com.sprints.planning.dto.request.HistoryRollbackRequest;
import com.sprints.planning.mapper.HistoryMapper;
import com.sprints.planning.model.HistoryChangeEntity;
import com.sprints.planning.model.HistoryGroupEntity;
import com.sprints.planning.repository.HistoryGroupRepository;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class HistoryService {

    private final HistoryGroupRepository groupRepository;

    public HistoryService(HistoryGroupRepository groupRepository) {
        this.groupRepository = groupRepository;
    }

    @Transactional
    public List<HistoryGroupDto> recordChange(HistoryChangeRequest request) {
        String user = normalizeUser(request.getUser());
        Instant changeTime = parseInstant(request.getCreatedAt());

        HistoryGroupEntity group = resolveGroupForUser(user, changeTime);
        HistoryChangeEntity change = new HistoryChangeEntity();
        change.setAction(request.getAction());
        change.setCreatedAt(changeTime);
        change.setUndo(request.getUndo());
        change.setGroup(group);
        group.getChanges().add(change);

        groupRepository.save(group);
        return list();
    }

    @Transactional
    public List<HistoryGroupDto> updateDescription(HistoryDescriptionRequest request) {
        HistoryGroupEntity group = loadGroup(request.getId());
        group.setDescription(request.getDescription());
        groupRepository.save(group);
        return list();
    }

    @Transactional
    public List<HistoryGroupDto> updateLock(HistoryLockRequest request) {
        HistoryGroupEntity group = loadGroup(request.getId());
        group.setLocked(request.isLocked());
        groupRepository.save(group);
        return list();
    }

    @Transactional
    public List<HistoryGroupDto> markRolledBack(HistoryRollbackRequest request) {
        HistoryGroupEntity group = loadGroup(request.getId());
        group.setRolledBackAt(Instant.now());
        groupRepository.save(group);
        return list();
    }

    @Transactional
    public List<HistoryGroupDto> list() {
        return groupRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(HistoryMapper::toHistoryGroupDto)
            .toList();
    }

    private HistoryGroupEntity resolveGroupForUser(String user, Instant createdAt) {
        Optional<HistoryGroupEntity> latest = groupRepository.findTopByOrderByCreatedAtDesc();
        if (latest.isPresent()) {
            HistoryGroupEntity group = latest.get();
            if (user.equals(group.getUserName()) && !group.isLocked() && group.getRolledBackAt() == null) {
                return group;
            }
        }

        HistoryGroupEntity group = new HistoryGroupEntity();
        group.setUserName(user);
        group.setLocked(false);
        group.setCreatedAt(createdAt);
        return group;
    }

    private HistoryGroupEntity loadGroup(UUID id) {
        return groupRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("History group not found"));
    }

    private String normalizeUser(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "Аноним";
        }
        return raw.trim();
    }

    private Instant parseInstant(String iso) {
        try {
            return Instant.parse(iso);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Invalid timestamp: " + iso, ex);
        }
    }
}
