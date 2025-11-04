package com.sprints.planning.repository;

import com.sprints.planning.model.ParticipantEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParticipantRepository extends JpaRepository<ParticipantEntity, UUID> {
    List<ParticipantEntity> findAllByOrderByDisplayOrderAsc();
}
