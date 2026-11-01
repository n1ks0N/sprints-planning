package com.sber.isu.sprints_planning.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;

/** Filters before pagination; JSON collections are evaluated by PostgreSQL without per-item queries. */
@Repository
public class PlanningBacklogPageRepository {
    @PersistenceContext private EntityManager entityManager;

    public Page<UUID> findPage(String team, String sortBy, String direction, int page, int size,
        List<String> quarters, String priorities, String release, List<String> streams, List<String> customers,
        String search, Boolean withoutStream, Boolean withoutCustomer) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("team", team);
        StringBuilder where = new StringBuilder(" where i.team_key = :team ");
        List<UUID> quarterIds = values(quarters).stream().map(UUID::fromString).toList();
        if (!quarterIds.isEmpty()) {
            params.put("quarters", quarterIds);
            where.append("""
                and (exists(select 1 from jsonb_array_elements_text(i.planning_quarter_ids) v where cast(v.value as uuid) in (:quarters))
                  or exists(select 1 from sprints s join jsonb_array_elements_text(i.planning_sprint_ids) v on s.id = cast(v.value as uuid)
                    where s.team_key = :team and s.quarter_id in (:quarters))
                  or (jsonb_array_length(i.planning_quarter_ids) = 0 and jsonb_array_length(i.planning_sprint_ids) = 0 and i.initial_quarter_id in (:quarters)))
                """);
        }
        var priorityValues = values(priorities == null ? List.of() : List.of(priorities)).stream().map(Short::valueOf).toList();
        if (!priorityValues.isEmpty()) { where.append(" and i.priority in (:priorities) "); params.put("priorities", priorityValues); }
        if (release != null && !release.isBlank()) {
            if (release.startsWith("date:")) { where.append(" and r.prom_date = :releaseDate "); params.put("releaseDate", java.time.LocalDate.parse(release.substring(5))); }
            else { where.append(" and i.release_date_id = :release "); params.put("release", UUID.fromString(release)); }
        }
        collection(where, params, "streams", streams, Boolean.TRUE.equals(withoutStream));
        collection(where, params, "customers", customers, Boolean.TRUE.equals(withoutCustomer));
        if (search != null && !search.isBlank()) {
            where.append(" and (lower(i.title) like :search or lower(i.description) like :search or lower(i.dod) like :search) ");
            params.put("search", "%" + search.trim().toLowerCase(Locale.ROOT) + "%");
        }
        String from = " from planning_backlog_items i left join releases r on r.id = i.release_date_id ";
        var countQuery = entityManager.createNativeQuery("select count(*)" + from + where);
        params.forEach(countQuery::setParameter);
        long total = ((Number) countQuery.getSingleResult()).longValue();
        Pageable pageable = PageRequest.of(page, size);
        if (total == 0) return Page.empty(pageable);
        String primary = switch (sortBy == null ? "manual" : sortBy) {
            case "priority" -> "i.priority";
            case "load" -> "(select coalesce(sum(cast(d->>'days' as numeric)),0) from jsonb_array_elements(i.planning_demands) d)";
            case "releaseDate" -> """
                coalesce(r.prom_date,
                  (select min(q.start_date) from sprints s join quarters q on q.id = s.quarter_id
                    join jsonb_array_elements_text(i.planning_sprint_ids) v on s.id = cast(v.value as uuid) where s.team_key = :team),
                  (select min(q.start_date) from quarters q join jsonb_array_elements_text(i.planning_quarter_ids) v on q.id = cast(v.value as uuid) where q.team_key = :team),
                  (select q.start_date from quarters q where q.id = i.initial_quarter_id), date '9999-12-31')
                """;
            default -> "i.display_order";
        };
        String ordering = primary + ("desc".equalsIgnoreCase(direction) && !"i.display_order".equals(primary) ? " desc" : " asc") + ", i.display_order, i.created_at, i.id";
        var query = entityManager.createNativeQuery("select i.id" + from + where + " order by " + ordering);
        params.forEach(query::setParameter);
        query.setFirstResult(Math.multiplyExact(page, size)); query.setMaxResults(size);
        @SuppressWarnings("unchecked") List<Object> raw = query.getResultList();
        return new PageImpl<>(raw.stream().map(id -> id instanceof UUID uuid ? uuid : UUID.fromString(id.toString())).toList(), pageable, total);
    }

    private List<String> values(List<String> raw) {
        return raw == null ? List.of() : raw.stream().filter(Objects::nonNull).flatMap(s -> Arrays.stream(s.split(",")))
            .map(String::trim).filter(s -> !s.isBlank()).distinct().toList();
    }
    private void collection(StringBuilder where, Map<String, Object> params, String field, List<String> raw, boolean includeEmpty) {
        var selected = values(raw);
        if (selected.isEmpty() && !includeEmpty) return;
        where.append(" and (");
        if (includeEmpty) where.append("jsonb_array_length(i.").append(field).append(") = 0");
        if (!selected.isEmpty()) {
            if (includeEmpty) where.append(" or ");
            where.append("exists(select 1 from jsonb_array_elements_text(i.").append(field).append(") v where v.value in (:").append(field).append("))");
            params.put(field, selected);
        }
        where.append(")");
    }
}
