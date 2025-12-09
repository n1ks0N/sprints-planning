package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.QuarterEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuarterRepository extends JpaRepository<QuarterEntity, UUID> {
    Optional<QuarterEntity> findByNameIgnoreCaseAndTeamKey(String name, String teamKey);

    Optional<QuarterEntity> findByIdAndTeamKey(UUID id, String teamKey);

    List<QuarterEntity> findByTeamKeyOrderByStartDateAsc(String teamKey);
}
