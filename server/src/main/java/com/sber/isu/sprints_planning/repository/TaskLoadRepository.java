package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskLoadRepository extends JpaRepository<TaskLoadEntity, TaskLoadId> {
    List<TaskLoadEntity> findByTaskId(UUID taskId);
}
