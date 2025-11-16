package com.sprints.planning.repository;

import com.sprints.planning.model.TaskLoadEntity;
import com.sprints.planning.model.TaskLoadId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskLoadRepository extends JpaRepository<TaskLoadEntity, TaskLoadId> {
    List<TaskLoadEntity> findByTaskId(UUID taskId);
}
