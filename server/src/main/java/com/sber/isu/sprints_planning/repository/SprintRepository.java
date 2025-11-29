package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SprintRepository extends JpaRepository<SprintEntity, UUID> {
    List<SprintEntity> findByQuarterOrderByOrderAsc(QuarterEntity quarter);

    List<SprintEntity> findByQuarterIdOrderByOrderAsc(UUID quarterId);
}
