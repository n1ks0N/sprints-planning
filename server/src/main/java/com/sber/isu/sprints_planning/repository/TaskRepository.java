package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID> {

    @EntityGraph(attributePaths = {"participants", "loads", "allocations"})
    List<TaskEntity> findAll();

    @EntityGraph(attributePaths = {"participants", "loads", "allocations"})
    @Query("select distinct t from TaskEntity t join t.loads l where l.sprint.quarter.id = :quarterId and l.days > 0")
    List<TaskEntity> findByQuarterWithLoad(@Param("quarterId") UUID quarterId);

    List<TaskEntity> findByReleaseSprintId(UUID sprintId);
}
