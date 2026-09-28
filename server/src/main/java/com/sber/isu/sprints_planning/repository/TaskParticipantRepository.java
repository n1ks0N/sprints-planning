package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskParticipantRepository extends JpaRepository<TaskParticipantEntity, TaskParticipantId> {
    List<TaskParticipantEntity> findByTaskId(UUID taskId);

    @Query("""
        select coalesce(max(tp.displayOrder), -1)
        from TaskParticipantEntity tp
        where tp.task.id = :taskId and tp.teamKey = :teamKey
        """)
    int findMaxDisplayOrder(@Param("taskId") UUID taskId, @Param("teamKey") String teamKey);

    @Query("""
        select tp.participant.id
        from TaskParticipantEntity tp
        where tp.task.id = :taskId and tp.teamKey = :teamKey
        order by tp.displayOrder, tp.participant.id
        """)
    List<UUID> findParticipantIds(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey
    );

    @Query("""
        select tp.participant.id
        from TaskParticipantEntity tp
        where tp.task.id = :taskId
          and tp.teamKey = :teamKey
          and tp.participant.id in :participantIds
        """)
    List<UUID> findAssignedParticipantIds(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("participantIds") Collection<UUID> participantIds
    );

    @Modifying
    @Query("""
        delete from TaskParticipantEntity tp
        where tp.task.id = :taskId
          and tp.participant.id = :participantId
          and tp.teamKey = :teamKey
        """)
    int deleteForParticipant(
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId,
        @Param("teamKey") String teamKey
    );
}
