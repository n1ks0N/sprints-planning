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
