package com.sprints.planning.repository;

import com.sprints.planning.model.HistoryChangeEntity;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistoryChangeRepository extends JpaRepository<HistoryChangeEntity, UUID> {
}
