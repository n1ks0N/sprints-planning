package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskParticipantRepository extends JpaRepository<TaskParticipantEntity, TaskParticipantId> {
    List<TaskParticipantEntity> findByTaskId(UUID taskId);
}
