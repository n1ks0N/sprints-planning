package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID> {

    @EntityGraph(attributePaths = {"participants", "loads", "allocations"})
    List<TaskEntity> findAllByOrderByDisplayOrderAsc();

    @EntityGraph(attributePaths = {"participants", "loads", "allocations"})
    @Query("select distinct t from TaskEntity t join t.loads l where l.sprint.quarter.id = :quarterId and l.days > 0 order by t.displayOrder")
    List<TaskEntity> findByQuarterWithLoad(@Param("quarterId") UUID quarterId);

    List<TaskEntity> findByReleaseSprintId(UUID sprintId);

    @Modifying(clearAutomatically = true)
    @Query("update TaskEntity t set t.releaseSprint = null where t.releaseSprint.id in :sprintIds")
    void clearReleaseForSprints(@Param("sprintIds") List<UUID> sprintIds);

    @Query("select coalesce(max(t.displayOrder), 0) from TaskEntity t")
    int findMaxDisplayOrder();

    @Modifying(clearAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder + 1 where t.id <> :taskId and t.displayOrder >= :start and t.displayOrder < :end")
    void incrementDisplayOrderRange(
        @Param("taskId") UUID taskId,
        @Param("start") int start,
        @Param("end") int end
    );

    @Modifying(clearAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder - 1 where t.id <> :taskId and t.displayOrder > :start and t.displayOrder <= :end")
    void decrementDisplayOrderRange(
        @Param("taskId") UUID taskId,
        @Param("start") int start,
        @Param("end") int end
    );
}
