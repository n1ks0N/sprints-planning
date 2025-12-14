package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID> {

    @EntityGraph(
        attributePaths = {
            "participants",
            "participants.participant",
            "participants.participant.userStreams",
            "loads",
            "allocations"
        }
    )
    List<TaskEntity> findAllByTeamKeyOrderByDisplayOrderAsc(String teamKey);

    @EntityGraph(attributePaths = {"participants", "loads", "allocations"})
    @Query("""
        select distinct t from TaskEntity t
        join t.loads l
        join l.sprint s
        where s.quarter.id = :quarterId and t.teamKey = :teamKey and l.days > 0
        order by t.displayOrder
        """)
    List<TaskEntity> findByQuarterWithLoad(@Param("quarterId") UUID quarterId, @Param("teamKey") String teamKey);

    @EntityGraph(attributePaths = {
        "participants",
        "participants.participant",
        "participants.participant.userStreams",
        "loads",
        "loads.sprint",
        "allocations",
        "allocations.participant",
        "allocations.sprint",
        "leaderParticipant",
        "releaseSprint"
    })
    @Query("select t from TaskEntity t where t.id = :id and t.teamKey = :teamKey")
    TaskEntity findWithDetailsById(@Param("id") UUID id, @Param("teamKey") String teamKey);

    Optional<TaskEntity> findByIdAndTeamKey(UUID id, String teamKey);

    List<TaskEntity> findByTeamKeyAndReleaseSprintId(String teamKey, UUID sprintId);

    @Modifying(clearAutomatically = true)
    @Query("update TaskEntity t set t.releaseSprint = null where t.releaseSprint.id in :sprintIds")
    void clearReleaseForSprints(@Param("sprintIds") List<UUID> sprintIds);

    @Query("select coalesce(max(t.displayOrder), 0) from TaskEntity t where t.teamKey = :teamKey")
    int findMaxDisplayOrder(@Param("teamKey") String teamKey);

    @Modifying(flushAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder + 1 where t.id <> :taskId and t.teamKey = :teamKey and t.displayOrder >= :start and t.displayOrder < :end")
    void incrementDisplayOrderRange(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("start") int start,
        @Param("end") int end
    );

    @Modifying(flushAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder - 1 where t.id <> :taskId and t.teamKey = :teamKey and t.displayOrder > :start and t.displayOrder <= :end")
    void decrementDisplayOrderRange(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("start") int start,
        @Param("end") int end
    );
}
