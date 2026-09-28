package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskLoadRepository extends JpaRepository<TaskLoadEntity, TaskLoadId> {
    List<TaskLoadEntity> findByTaskId(UUID taskId);

    @Query("""
        select tl
        from TaskLoadEntity tl
        join fetch tl.sprint
        where tl.task.id = :taskId
          and tl.teamKey = :teamKey
          and tl.sprint.id in :sprintIds
        """)
    List<TaskLoadEntity> findEntitiesForSprints(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("sprintIds") Collection<UUID> sprintIds
    );

    @Query("""
        select tl.sprint.id as sprintId, tl.days as days
        from TaskLoadEntity tl
        where tl.task.id = :taskId
          and tl.teamKey = :teamKey
          and tl.sprint.id in :sprintIds
        """)
    List<TaskLoadValueProjection> findValuesForSprints(
        @Param("taskId") UUID taskId,
        @Param("teamKey") String teamKey,
        @Param("sprintIds") List<UUID> sprintIds
    );
}
