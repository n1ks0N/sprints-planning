package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import org.springframework.data.domain.Page;

public interface ParticipantRepositoryCustom {

    Page<ParticipantEntity> findWorkloadPage(String teamKey, TaskFilter filter, int page, int size);
}
