package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.PlanningBacklogItemEntity;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlanningBacklogItemRepository extends JpaRepository<PlanningBacklogItemEntity, UUID> {

    java.util.Optional<PlanningBacklogItemEntity> findBySourceTaskIdAndTeamKey(UUID taskId, String teamKey);

    @Query("select distinct i.sourceTaskId from PlanningBacklogItemEntity i where i.teamKey = :teamKey and i.id in :ids and i.sourceTaskId is not null")
    List<UUID> findSourceTaskIds(@Param("teamKey") String teamKey, @Param("ids") Collection<UUID> ids);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from PlanningBacklogItemEntity i where i.teamKey = :teamKey and i.id in :ids order by i.id")
    List<PlanningBacklogItemEntity> lockSelected(@Param("teamKey") String teamKey, @Param("ids") Collection<UUID> ids);

    @EntityGraph(attributePaths = {"releaseDate", "initialQuarter"})
    List<PlanningBacklogItemEntity> findAllByTeamKeyOrderByDisplayOrderAscCreatedAtAsc(String teamKey);

    @EntityGraph(attributePaths = {"releaseDate", "initialQuarter"})
    @Query("select i from PlanningBacklogItemEntity i where i.teamKey = :teamKey and i.id = :id")
    PlanningBacklogItemEntity findWithDetailsById(@Param("id") UUID id, @Param("teamKey") String teamKey);

    @EntityGraph(attributePaths = {"releaseDate", "initialQuarter"})
    @Query("select i from PlanningBacklogItemEntity i where i.teamKey = :teamKey and i.id in :ids")
    List<PlanningBacklogItemEntity> findAllWithDetailsByTeamKeyAndIdIn(
        @Param("teamKey") String teamKey,
        @Param("ids") Collection<UUID> ids
    );

    @Query("select coalesce(max(i.displayOrder), 0) from PlanningBacklogItemEntity i where i.teamKey = :teamKey")
    int findMaxDisplayOrder(@Param("teamKey") String teamKey);
}
