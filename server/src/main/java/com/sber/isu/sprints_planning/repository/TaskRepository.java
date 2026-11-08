package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.TaskEntity;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID>, TaskRepositoryCustom {

    Optional<TaskEntity> findByIdAndTeamKey(UUID id, String teamKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TaskEntity t where t.id = :id and t.teamKey = :teamKey")
    Optional<TaskEntity> findByIdAndTeamKeyForUpdate(@Param("id") UUID id, @Param("teamKey") String teamKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TaskEntity t where t.teamKey = :teamKey and t.id in :ids order by t.id")
    List<TaskEntity> lockAllByIdInAndTeamKey(@Param("ids") List<UUID> ids, @Param("teamKey") String teamKey);

    @Query("select coalesce(max(t.displayOrder), 0) from TaskEntity t where t.teamKey = :teamKey and t.workspace = :workspace")
    int findMaxWorkspaceOrder(@Param("teamKey") String teamKey, @Param("workspace") String workspace);

    @Modifying(flushAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder + 1 where t.teamKey = :teamKey and t.workspace = :workspace and t.displayOrder >= :start")
    void incrementWorkspaceOrderFrom(@Param("teamKey") String teamKey, @Param("workspace") String workspace, @Param("start") int start);

    @Modifying(flushAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder + :delta where t.id <> :id and t.teamKey = :teamKey and t.workspace = :workspace and t.displayOrder >= :start and t.displayOrder <= :end")
    void shiftWorkspaceOrder(@Param("id") UUID id, @Param("teamKey") String teamKey, @Param("workspace") String workspace, @Param("start") int start, @Param("end") int end, @Param("delta") int delta);

    @Modifying(flushAutomatically = true)
    @Query("update TaskEntity t set t.displayOrder = t.displayOrder - 1 where t.teamKey = :teamKey and t.workspace = :workspace and t.displayOrder > :order")
    void decrementWorkspaceOrderAfter(@Param("teamKey") String teamKey, @Param("workspace") String workspace, @Param("order") int order);

}
