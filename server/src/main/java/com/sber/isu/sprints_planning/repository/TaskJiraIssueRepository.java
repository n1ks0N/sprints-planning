package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @EntityGraph(attributePaths = {"task", "participant", "planningSprint", "parentTaskJiraIssue"})
    List<TaskJiraIssueEntity> findAllByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintId(
        String teamKey,
        UUID taskId,
        UUID participantId,
        UUID planningSprintId
    );

    @EntityGraph(attributePaths = {"task", "participant", "planningSprint", "exportBatch"})
    Optional<TaskJiraIssueEntity> findByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintIdAndJiraProjectKey(
        String teamKey,
        UUID taskId,
        UUID participantId,
        UUID planningSprintId,
        String jiraProjectKey
    );

    @EntityGraph(attributePaths = {"task", "planningSprint", "exportBatch"})
    Optional<TaskJiraIssueEntity> findByTeamKeyAndTaskIdAndIssueScopeAndPlanningSprintIdAndJiraProjectKey(
        String teamKey,
        UUID taskId,
        String issueScope,
        UUID planningSprintId,
        String jiraProjectKey
    );

    @EntityGraph(attributePaths = {"task", "exportBatch"})
    Optional<TaskJiraIssueEntity> findFirstByTeamKeyAndTaskIdAndIssueScopeOrderByCreatedAtAsc(
        String teamKey,
        UUID taskId,
        String issueScope
    );

    @EntityGraph(attributePaths = {"task", "participant", "planningSprint", "parentTaskJiraIssue"})
    List<TaskJiraIssueEntity> findAllByTeamKeyAndTaskIdAndIssueScope(
        String teamKey,
        UUID taskId,
        String issueScope
    );

    @EntityGraph(attributePaths = {"task", "participant", "planningSprint", "exportBatch"})
    List<TaskJiraIssueEntity> findAllByExportBatchIdOrderByCreatedAtAsc(UUID exportBatchId);

    Optional<TaskJiraIssueEntity> findByIdAndTeamKey(UUID id, String teamKey);

    void deleteAllByTeamKeyAndTaskIdAndParticipantIdIn(
        String teamKey,
        UUID taskId,
        Collection<UUID> participantIds
    );

    @Modifying
    @Query("""
        delete from TaskJiraIssueEntity issue
        where issue.teamKey = :teamKey
          and issue.task.id = :taskId
          and issue.participant.id = :participantId
        """)
    int deleteForParticipant(
        @Param("teamKey") String teamKey,
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId
    );
}
