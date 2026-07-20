package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import org.springframework.data.domain.Page;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface TaskRepositoryCustom {

    List<TaskEntity> findFilteredWithDetails(String teamKey, TaskFilter filter);

    Page<TaskEntity> findFilteredPageWithDetails(String teamKey, TaskFilter filter, int page, int size);

    List<ParticipantWorkloadTaskFlatRow> findParticipantWorkloadRows(
        String teamKey,
        TaskFilter filter,
        Set<UUID> participantIds
    );

    Page<TaskEntity> findFilteredPageWithDetails(
        String teamKey,
        TaskFilter filter,
        int page,
        int size,
        String sortBy,
        String sortDirection
    );
}
