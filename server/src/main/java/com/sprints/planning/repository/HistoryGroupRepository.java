package com.sprints.planning.repository;

import com.sprints.planning.model.HistoryGroupEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistoryGroupRepository extends JpaRepository<HistoryGroupEntity, UUID> {

    @EntityGraph(attributePaths = "changes")
    List<HistoryGroupEntity> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = "changes")
    Optional<HistoryGroupEntity> findTopByOrderByCreatedAtDesc();
}
