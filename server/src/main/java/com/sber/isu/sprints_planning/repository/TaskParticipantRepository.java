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

    @Modifying
    @Query(value = """
        insert into task_participants (task_id, participant_id, display_order, team_key)
        select :taskId,
               p.id,
               coalesce((
                   select max(tp.display_order)
                   from task_participants tp
                   where tp.task_id = :taskId and tp.team_key = :teamKey
               ), -1) + 1,
               :teamKey
        from participants p
        where p.id = :participantId and p.team_key = :teamKey
        on conflict (task_id, participant_id) do nothing
        """, nativeQuery = true)
    int insertIfAbsent(
        @Param("taskId") UUID taskId,
        @Param("participantId") UUID participantId,
        @Param("teamKey") String teamKey
    );

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
