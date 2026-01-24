package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ReleaseEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReleaseRepository extends JpaRepository<ReleaseEntity, UUID> {
    List<ReleaseEntity> findAllByTeamKeyOrderByPromDateAsc(String teamKey);

    Optional<ReleaseEntity> findByIdAndTeamKey(UUID id, String teamKey);

    List<ReleaseEntity> findByTeamKeyAndIdIn(String teamKey, Iterable<UUID> ids);
}
