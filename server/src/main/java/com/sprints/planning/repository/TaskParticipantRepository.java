package com.sprints.planning.repository;

import com.sprints.planning.model.TaskParticipantEntity;
import com.sprints.planning.model.TaskParticipantId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskParticipantRepository extends JpaRepository<TaskParticipantEntity, TaskParticipantId> {
    List<TaskParticipantEntity> findByTaskId(UUID taskId);
}
