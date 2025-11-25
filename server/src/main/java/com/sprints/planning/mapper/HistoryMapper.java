package com.sprints.planning.mapper;

import com.sprints.planning.dto.HistoryChangeDto;
import com.sprints.planning.dto.HistoryGroupDto;
import com.sprints.planning.model.HistoryChangeEntity;
import com.sprints.planning.model.HistoryGroupEntity;
import java.util.List;

public final class HistoryMapper {

    private HistoryMapper() {
    }

    public static HistoryGroupDto toHistoryGroupDto(HistoryGroupEntity entity) {
        List<HistoryChangeDto> changes = entity.getChanges().stream()
            .map(HistoryMapper::toHistoryChangeDto)
            .toList();

        return new HistoryGroupDto(
            entity.getId(),
            entity.getUserName(),
            entity.getCreatedAt(),
            entity.getDescription(),
            entity.isLocked(),
            entity.getRolledBackAt(),
            changes
        );
    }

    private static HistoryChangeDto toHistoryChangeDto(HistoryChangeEntity entity) {
        return new HistoryChangeDto(
            entity.getId(),
            entity.getAction(),
            entity.getCreatedAt(),
            entity.getUndo()
        );
    }
}
