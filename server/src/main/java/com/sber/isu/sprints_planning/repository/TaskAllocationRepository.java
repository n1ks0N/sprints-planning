package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskAllocationRepository extends JpaRepository<TaskAllocationEntity, TaskAllocationId> {
    List<TaskAllocationEntity> findByTaskId(UUID taskId);

    List<TaskAllocationEntity> findByTaskIdAndSprintId(UUID taskId, UUID sprintId);

    @Query("""
        select ta
        from TaskAllocationEntity ta
        join fetch ta.sprint
        where ta.task.id = :taskId
          and ta.participant.id = :participantId
          and ta.teamKey = :teamKey
        """)
    List<TaskAllocationEntity> findEntitiesForParticipant(
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId,
        @Param("teamKey") String teamKey
    );

    @Query("""
        select ta
        from TaskAllocationEntity ta
        where ta.task.id = :taskId
          and ta.teamKey = :teamKey
          and ta.participant.id in :participantIds
          and ta.sprint.id in :sprintIds
        """)
    List<TaskAllocationEntity> findEntitiesForCells(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("participantIds") Collection<UUID> participantIds,
        @Param("sprintIds") Collection<UUID> sprintIds
    );

    boolean existsByTaskIdAndParticipantIdAndTeamKey(
        UUID taskId,
        UUID participantId,
        String teamKey
    );

    @Query("""
        select distinct ta.sprint.id
        from TaskAllocationEntity ta
        where ta.task.id = :taskId
          and ta.participant.id = :participantId
          and ta.teamKey = :teamKey
        order by ta.sprint.id
        """)
    List<UUID> findSprintIdsForParticipant(
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId,
        @Param("teamKey") String teamKey
    );

    @Modifying
    @Query("""
        delete from TaskAllocationEntity ta
        where ta.task.id = :taskId
          and ta.participant.id = :participantId
          and ta.teamKey = :teamKey
        """)
    int deleteForParticipant(
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId,
        @Param("teamKey") String teamKey
    );

    @Query("""
        select ta.sprint.id as sprintId, sum(ta.days) as days
        from TaskAllocationEntity ta
        where ta.task.id = :taskId
          and ta.teamKey = :teamKey
          and ta.sprint.id in :sprintIds
        group by ta.sprint.id
        """)
    List<TaskLoadValueProjection> sumDaysByTaskAndSprints(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("sprintIds") Collection<UUID> sprintIds
    );

    @Query("""
        select ta.participant.id as participantId, ta.sprint.id as sprintId, sum(ta.days) as totalDays
        from TaskAllocationEntity ta
        join ta.task t
        where ta.teamKey = :teamKey
          and ta.sprint.id in :sprintIds
          and t.workspace = 'ROADMAP'
        group by ta.participant.id, ta.sprint.id
        """)
    List<WorkloadAggregation> aggregateWorkloadByParticipantAndSprint(
        @Param("teamKey") String teamKey,
        @Param("sprintIds") Collection<UUID> sprintIds
    );

    @Query("""
        select ta.participant.id as participantId, ta.sprint.id as sprintId, sum(ta.days) as totalDays
        from TaskAllocationEntity ta
        join ta.task t
        where ta.teamKey = :teamKey
          and ta.participant.id in :participantIds
          and ta.sprint.id in :sprintIds
          and t.id <> :taskId
          and t.workspace = 'ROADMAP'
        group by ta.participant.id, ta.sprint.id
        """)
    List<WorkloadAggregation> aggregateScheduledWorkloadByParticipantAndSprintExcludingTask(
        @Param("teamKey") String teamKey,
        @Param("participantIds") Collection<UUID> participantIds,
        @Param("sprintIds") Collection<UUID> sprintIds,
        @Param("taskId") UUID taskId
    );
}
