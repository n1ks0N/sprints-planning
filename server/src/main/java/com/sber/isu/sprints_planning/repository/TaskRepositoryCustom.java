package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import java.util.List;

public interface TaskRepositoryCustom {

    List<TaskEntity> findFilteredWithDetails(String teamKey, TaskFilter filter);
}
