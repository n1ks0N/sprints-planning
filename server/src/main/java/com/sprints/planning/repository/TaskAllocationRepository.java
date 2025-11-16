package com.sprints.planning.repository;

import com.sprints.planning.model.TaskAllocationEntity;
import com.sprints.planning.model.TaskAllocationId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskAllocationRepository extends JpaRepository<TaskAllocationEntity, TaskAllocationId> {
    List<TaskAllocationEntity> findByTaskId(UUID taskId);

    List<TaskAllocationEntity> findByTaskIdAndSprintId(UUID taskId, UUID sprintId);
}
