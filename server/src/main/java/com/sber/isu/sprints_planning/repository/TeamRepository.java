package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TeamEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamRepository extends JpaRepository<TeamEntity, String> {
}
