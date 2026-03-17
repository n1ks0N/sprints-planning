package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskJiraIssueRepository extends JpaRepository<TaskJiraIssueEntity, UUID> {

    @EntityGraph(attributePaths = {"task", "participant"})
    List<TaskJiraIssueEntity> findAllByTeamKeyAndTaskIdIn(String teamKey, Collection<UUID> taskIds);

    @EntityGraph(attributePaths = {"task", "participant"})
    Optional<TaskJiraIssueEntity> findByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintId(
        String teamKey,
        UUID taskId,
        UUID participantId,
        UUID planningSprintId
    );

    @EntityGraph(attributePaths = {"task", "participant", "planningSprint", "exportBatch"})
    List<TaskJiraIssueEntity> findAllByExportBatchIdOrderByCreatedAtAsc(UUID exportBatchId);

    Optional<TaskJiraIssueEntity> findByIdAndTeamKey(UUID id, String teamKey);

    void deleteAllByTeamKeyAndTaskIdAndParticipantIdIn(
        String teamKey,
        UUID taskId,
        Collection<UUID> participantIds
    );
}
