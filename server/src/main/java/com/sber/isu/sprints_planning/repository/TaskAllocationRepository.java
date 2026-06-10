package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskAllocationRepository extends JpaRepository<TaskAllocationEntity, TaskAllocationId> {
    List<TaskAllocationEntity> findByTaskId(UUID taskId);

    List<TaskAllocationEntity> findByTaskIdAndSprintId(UUID taskId, UUID sprintId);

    @Query("""
        select ta.participant.id as participantId, ta.sprint.id as sprintId, sum(ta.days) as totalDays
        from TaskAllocationEntity ta
        join ta.task t
        where ta.teamKey = :teamKey
          and ta.sprint.id in :sprintIds
          and lower(coalesce(t.status, 'inprogress')) <> 'backlog'
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
          and lower(coalesce(t.status, 'inprogress')) <> 'backlog'
        group by ta.participant.id, ta.sprint.id
        """)
    List<WorkloadAggregation> aggregateScheduledWorkloadByParticipantAndSprintExcludingTask(
        @Param("teamKey") String teamKey,
        @Param("participantIds") Collection<UUID> participantIds,
        @Param("sprintIds") Collection<UUID> sprintIds,
        @Param("taskId") UUID taskId
    );
}
