package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
            "loads.sprint",
            "allocations",
            "allocations.participant",
            "allocations.sprint",
            "leaderParticipant",
            "releaseSprint"
        }
    )
    List<TaskEntity> findAllByTeamKeyOrderByDisplayOrderAsc(String teamKey);

    @EntityGraph(
        attributePaths = {
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
        }
    )
    @Query("""
        select distinct t from TaskEntity t
        left join t.participants tp
        left join tp.participant p
        left join p.userStreams us
        left join t.loads l
        left join l.sprint ls
        left join ls.quarter lq
        left join t.allocations ta
        left join ta.sprint aspr
        left join aspr.quarter aq
        where t.teamKey = :teamKey
            and (:prioritiesEmpty = true or t.priority in :priorities)
            and (:statusesEmpty = true or lower(coalesce(t.status, '')) in :statuses)
            and (:releaseDate is null or t.releaseDate = :releaseDate)
            and (:streamPattern is null or lower(coalesce(t.stream, '')) like :streamPattern)
            and (:participantIdsEmpty = true or p.id in :participantIds)
            and (:rolesEmpty = true or lower(p.role) in :roles)
            and (:userStreamsEmpty = true or lower(us) in :userStreams)
            and (
                :quarterIdsEmpty = true or
                (lq.id in :quarterIds and (l.days is null or l.days > 0)) or
                (aq.id in :quarterIds)
            )
        order by t.displayOrder
        """)
    List<TaskEntity> findAllByTeamKeyWithFilters(
        @Param("teamKey") String teamKey,
        @Param("quarterIds") Set<UUID> quarterIds,
        @Param("quarterIdsEmpty") boolean quarterIdsEmpty,
        @Param("priorities") Set<Short> priorities,
        @Param("prioritiesEmpty") boolean prioritiesEmpty,
        @Param("statuses") Set<String> statuses,
        @Param("statusesEmpty") boolean statusesEmpty,
        @Param("releaseDate") LocalDate releaseDate,
        @Param("streamPattern") String streamPattern,
        @Param("participantIds") Set<UUID> participantIds,
        @Param("participantIdsEmpty") boolean participantIdsEmpty,
        @Param("roles") Set<String> roles,
        @Param("rolesEmpty") boolean rolesEmpty,
        @Param("userStreams") Set<String> userStreams,
        @Param("userStreamsEmpty") boolean userStreamsEmpty
    );

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
