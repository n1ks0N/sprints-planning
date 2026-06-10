package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantStreamValueEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ParticipantStreamValueRepository extends JpaRepository<ParticipantStreamValueEntity, UUID> {

    Optional<ParticipantStreamValueEntity> findByNameAndTeamKey(String name, String teamKey);

    @Query("SELECT DISTINCT ps.name FROM ParticipantStreamValueEntity ps WHERE ps.teamKey = :teamKey ORDER BY ps.name")
    List<String> findAllNamesByTeamKey(@Param("teamKey") String teamKey);

    @Query("""
        SELECT ps.id
        FROM ParticipantStreamValueEntity ps
        WHERE ps.teamKey = :teamKey
          AND NOT EXISTS (
            SELECT p.id
            FROM ParticipantEntity p
            JOIN p.userStreams userStream
            WHERE p.teamKey = :teamKey AND userStream = ps.name
          )
        """)
    List<UUID> findUnusedIdsByTeamKey(@Param("teamKey") String teamKey);
}
