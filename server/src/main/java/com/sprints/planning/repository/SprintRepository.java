package com.sprints.planning.repository;

import com.sprints.planning.model.QuarterEntity;
import com.sprints.planning.model.SprintEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SprintRepository extends JpaRepository<SprintEntity, UUID> {
    List<SprintEntity> findByQuarterOrderByOrderAsc(QuarterEntity quarter);

    List<SprintEntity> findByQuarterIdOrderByOrderAsc(UUID quarterId);
}
