package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface TaskStreamRepository extends JpaRepository<TaskStreamEntity, UUID> {

    Optional<TaskStreamEntity> findByNameAndTeamKey(String name, String teamKey);

    List<TaskStreamEntity> findByTeamKeyOrderByNameAsc(String teamKey);

    @Query("SELECT ts FROM TaskStreamEntity ts WHERE ts.name IN :names AND ts.teamKey = :teamKey")
    List<TaskStreamEntity> findByNamesAndTeamKey(@Param("names") Set<String> names, @Param("teamKey") String teamKey);

    @Query("SELECT DISTINCT ts.name FROM TaskStreamEntity ts WHERE ts.teamKey = :teamKey ORDER BY ts.name")
    List<String> findAllNamesByTeamKey(@Param("teamKey") String teamKey);
}
