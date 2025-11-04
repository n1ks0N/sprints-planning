package com.sprints.planning.repository;

import com.sprints.planning.model.ReleaseEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReleaseRepository extends JpaRepository<ReleaseEntity, UUID> {
    List<ReleaseEntity> findAllByOrderByPromDateAsc();
}
