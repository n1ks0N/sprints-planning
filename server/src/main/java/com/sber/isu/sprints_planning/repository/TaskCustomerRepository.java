package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface TaskCustomerRepository extends JpaRepository<TaskCustomerEntity, UUID> {

    Optional<TaskCustomerEntity> findByNameAndTeamKey(String name, String teamKey);

    List<TaskCustomerEntity> findByTeamKeyOrderByNameAsc(String teamKey);

    @Query("SELECT tc FROM TaskCustomerEntity tc WHERE tc.name IN :names AND tc.teamKey = :teamKey")
    List<TaskCustomerEntity> findByNamesAndTeamKey(@Param("names") Set<String> names, @Param("teamKey") String teamKey);

    @Query("SELECT DISTINCT tc.name FROM TaskCustomerEntity tc WHERE tc.teamKey = :teamKey ORDER BY tc.name")
    List<String> findAllNamesByTeamKey(@Param("teamKey") String teamKey);
}
