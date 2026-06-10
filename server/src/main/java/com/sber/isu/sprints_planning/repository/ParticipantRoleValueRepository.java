package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantRoleValueEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ParticipantRoleValueRepository extends JpaRepository<ParticipantRoleValueEntity, UUID> {

    Optional<ParticipantRoleValueEntity> findByNameAndTeamKey(String name, String teamKey);

    @Query("SELECT DISTINCT pr.name FROM ParticipantRoleValueEntity pr WHERE pr.teamKey = :teamKey ORDER BY pr.name")
    List<String> findAllNamesByTeamKey(@Param("teamKey") String teamKey);

    @Query("""
        SELECT pr.id
        FROM ParticipantRoleValueEntity pr
        WHERE pr.teamKey = :teamKey
          AND NOT EXISTS (
            SELECT p.id
            FROM ParticipantEntity p
            WHERE p.teamKey = :teamKey AND p.role = pr.name
          )
        """)
    List<UUID> findUnusedIdsByTeamKey(@Param("teamKey") String teamKey);
}
