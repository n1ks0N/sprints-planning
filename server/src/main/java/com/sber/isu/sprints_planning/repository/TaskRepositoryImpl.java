package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.SetJoin;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

@Repository
public class TaskRepositoryImpl implements TaskRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<TaskEntity> findFilteredWithDetails(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = Objects.requireNonNullElseGet(filter, TaskFilter::empty);
        List<UUID> ids = findTaskIds(teamKey, effectiveFilter, null, null);
        if (ids.isEmpty()) {
            return List.of();
        }
        List<TaskEntity> tasks = loadDetails(ids);
        Map<UUID, TaskEntity> byId = tasks.stream()
            .collect(Collectors.toMap(TaskEntity::getId, Function.identity()));
        return ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .toList();
    }

    @Override
    public Page<TaskEntity> findFilteredPageWithDetails(String teamKey, TaskFilter filter, int page, int size) {
        TaskFilter effectiveFilter = Objects.requireNonNullElseGet(filter, TaskFilter::empty);
        Pageable pageable = Pageable.ofSize(size).withPage(page);

        long total = countTasks(teamKey, effectiveFilter);
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        List<UUID> ids = findTaskIds(teamKey, effectiveFilter, page, size);
        if (ids.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        List<TaskEntity> tasks = loadDetails(ids);
        Map<UUID, TaskEntity> byId = tasks.stream()
            .collect(Collectors.toMap(TaskEntity::getId, Function.identity()));
        List<TaskEntity> ordered = ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .toList();

        return new PageImpl<>(ordered, pageable, total);
    }

    private long countTasks(String teamKey, TaskFilter filter) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<TaskEntity> task = countQuery.from(TaskEntity.class);
        Predicate predicate = buildPredicate(teamKey, filter, cb, countQuery, task);
        countQuery.select(cb.count(task)).where(predicate);
        return entityManager.createQuery(countQuery).getSingleResult();
    }

    private List<UUID> findTaskIds(String teamKey, TaskFilter filter, Integer page, Integer size) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<UUID> idQuery = cb.createQuery(UUID.class);
        Root<TaskEntity> task = idQuery.from(TaskEntity.class);
        Predicate predicate = buildPredicate(teamKey, filter, cb, idQuery, task);

        Expression<?> orderValue = cb.coalesce(task.get("displayOrder"), cb.literal(Integer.MAX_VALUE));
        List<Order> ordering = new ArrayList<>();
        if (filter.pinnedTaskId() != null) {
            Expression<Integer> pinnedOrder = cb.<Integer>selectCase()
                .when(cb.equal(task.get("id"), filter.pinnedTaskId()), 0)
                .otherwise(1);
            ordering.add(cb.asc(pinnedOrder));
        }
        ordering.add(cb.asc(orderValue));
        ordering.add(cb.asc(task.get("createdAt")));

        idQuery.select(task.get("id"))
            .where(predicate)
            .orderBy(ordering);

        TypedQuery<UUID> query = entityManager.createQuery(idQuery);
        if (page != null && size != null) {
            int safePage = Math.max(page, 0);
            int safeSize = Math.max(size, 1);
            query.setFirstResult(safePage * safeSize);
            query.setMaxResults(safeSize);
        }
        return query.getResultList();
    }

    private List<TaskEntity> loadDetails(List<UUID> ids) {
        List<TaskEntity> base = fetchBaseTasks(ids);
        if (base.isEmpty()) {
            return base;
        }
        fetchParticipants(ids);
        fetchAllocations(ids);
        fetchLoads(ids);
        return base;
    }

    private List<TaskEntity> fetchBaseTasks(List<UUID> ids) {
        return entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.leaderParticipant lp
                    left join fetch t.releaseDate rd
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchParticipants(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.participants tp
                    left join fetch tp.participant p
                    left join fetch p.userStreams
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchAllocations(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.allocations a
                    left join fetch a.sprint s
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchLoads(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.loads l
                    left join fetch l.sprint s
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private Predicate buildPredicate(
        String teamKey,
        TaskFilter filter,
        CriteriaBuilder cb,
        CriteriaQuery<?> query,
        Root<TaskEntity> task
    ) {
        List<Predicate> predicates = new ArrayList<>();
        Predicate teamPredicate = cb.equal(task.get("teamKey"), teamKey);
        predicates.add(teamPredicate);

        if (!filter.participantIds().isEmpty()) {
            predicates.add(participantExists(query, cb, task, filter.participantIds()));
        }

        if (!filter.roles().isEmpty()) {
            predicates.add(roleExists(query, cb, task, filter.roles()));
        }

        if (!filter.userStreams().isEmpty()) {
            predicates.add(userStreamExists(query, cb, task, filter.userStreams()));
        }

        if (!filter.priorities().isEmpty()) {
            predicates.add(task.get("priority").in(filter.priorities()));
        }

        if (filter.releaseDateId() != null) {
            predicates.add(cb.equal(task.get("releaseDate").get("id"), filter.releaseDateId()));
        }

        if (!filter.streams().isEmpty()) {
            predicates.add(jsonArrayContainsAny(cb, task.get("stream"), filter.streams()));
        }

        if (!filter.customers().isEmpty()) {
            predicates.add(jsonArrayContainsAny(cb, task.get("customer"), filter.customers()));
        }

        if (filter.searchQuery() != null) {
            String like = "%" + filter.searchQuery() + "%";
            predicates.add(cb.or(
                cb.like(cb.lower(task.get("title")), like),
                cb.like(cb.lower(task.get("description")), like),
                cb.like(cb.lower(task.get("dod")), like),
                cb.like(cb.lower(task.get("customer").as(String.class)), like),
                cb.like(cb.lower(task.get("stream").as(String.class)), like)
            ));
        }

        if (!filter.quarterIds().isEmpty()) {
            predicates.add(quarterMatches(query, cb, task, filter));
        }

        if (!filter.statuses().isEmpty()) {
            predicates.add(cb.lower(task.get("status")).in(filter.statuses()));
        }

        Predicate basePredicate = cb.and(predicates.toArray(new Predicate[0]));
        if (filter.pinnedTaskId() != null) {
            Predicate pinned = cb.and(
                teamPredicate,
                cb.equal(task.get("id"), filter.pinnedTaskId())
            );
            return cb.or(basePredicate, pinned);
        }

        return basePredicate;
    }

    private Predicate participantExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<UUID> ids) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        Join<TaskParticipantEntity, ParticipantEntity> participant = tp.join("participant");

        CriteriaBuilder.In<UUID> participantIds = cb.in(tp.get("id").get("participantId"));
        ids.forEach(participantIds::value);

        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                participantIds,
                cb.equal(participant.get("teamKey"), task.get("teamKey"))
            );
        return cb.exists(sub);
    }

    private Predicate roleExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<String> roles) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        CriteriaBuilder.In<String> roleFilter = cb.in(cb.lower(tp.get("participant").get("role")));
        roles.forEach(roleFilter::value);
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                roleFilter
            );
        return cb.exists(sub);
    }

    private Predicate userStreamExists(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Iterable<String> userStreams
    ) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        Join<TaskParticipantEntity, ParticipantEntity> participant = tp.join("participant");
        SetJoin<ParticipantEntity, String> streams = participant.joinSet("userStreams");
        CriteriaBuilder.In<String> streamFilter = cb.in(cb.lower(streams));
        userStreams.forEach(streamFilter::value);
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                streamFilter
            );
        return cb.exists(sub);
    }

    private Predicate quarterMatches(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, TaskFilter filter) {
        var loadSub = query.subquery(UUID.class);
        Root<TaskLoadEntity> load = loadSub.from(TaskLoadEntity.class);
        loadSub.select(load.get("task").get("id"))
            .where(
                cb.equal(load.get("task").get("id"), task.get("id")),
                load.get("sprint").get("quarter").get("id").in(filter.quarterIds()),
                cb.greaterThan(cb.coalesce(load.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        var allocationSub = query.subquery(UUID.class);
        Root<TaskAllocationEntity> allocation = allocationSub.from(TaskAllocationEntity.class);
        allocationSub.select(allocation.get("task").get("id"))
            .where(
                cb.equal(allocation.get("task").get("id"), task.get("id")),
                allocation.get("sprint").get("quarter").get("id").in(filter.quarterIds())
            );

        return cb.or(cb.exists(loadSub), cb.exists(allocationSub));
    }

    private Predicate jsonArrayContainsAny(CriteriaBuilder cb, Path<?> field, Set<String> values) {
        if (values == null || values.isEmpty()) {
            return cb.conjunction();
        }
        Expression<String> asText = cb.lower(field.as(String.class));
        List<Predicate> predicates = values.stream()
            .map(value -> {
                String escaped = escapeLike(value);
                String pattern = "%\"" + escaped + "\"%";
                return cb.like(asText, pattern, '\\');
            })
            .toList();
        return cb.or(predicates.toArray(new Predicate[0]));
    }

    private String escapeLike(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
            .toLowerCase();
    }
}
