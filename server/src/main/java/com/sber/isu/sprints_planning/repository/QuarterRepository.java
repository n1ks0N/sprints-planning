package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.QuarterEntity;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuarterRepository extends JpaRepository<QuarterEntity, UUID> {
    Optional<QuarterEntity> findByNameIgnoreCase(String name);
}
