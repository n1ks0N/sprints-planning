package com.sber.isu.sprints_planning.service;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

public record TaskFilter(
    Set<UUID> quarterIds,
    Set<Short> priorities,
    Set<String> statuses,
    UUID releaseDateId,
    Set<String> streams,
    boolean withoutStream,
    Set<String> customers,
    boolean withoutCustomer,
    Set<UUID> participantIds,
    Set<String> roles,
    Set<String> userStreams,
    String searchQuery,
    boolean withoutQuarter,
    UUID pinnedTaskId,
    String workspace,
    java.time.LocalDate releasePromDate,
    ReleaseSelection releases
) {

    public TaskFilter(Set<UUID> quarterIds, Set<Short> priorities, Set<String> statuses, UUID releaseDateId, Set<String> streams, boolean withoutStream, Set<String> customers, boolean withoutCustomer, Set<UUID> participantIds, Set<String> roles, Set<String> userStreams, String searchQuery, boolean withoutQuarter, UUID pinnedTaskId, String workspace, java.time.LocalDate releasePromDate) {
        this(quarterIds, priorities, statuses, releaseDateId, streams, withoutStream, customers, withoutCustomer, participantIds, roles, userStreams, searchQuery, withoutQuarter, pinnedTaskId, workspace, releasePromDate, ReleaseSelection.parse(releaseDateId == null ? null : releaseDateId.toString(), releasePromDate == null ? null : releasePromDate.toString()));
    }

    public TaskFilter withReleases(String ids, String dates) {
        ReleaseSelection extra = ReleaseSelection.parse(ids, dates);
        Set<UUID> allIds = new LinkedHashSet<>(releases.ids()); allIds.addAll(extra.ids());
        Set<java.time.LocalDate> allDates = new LinkedHashSet<>(releases.dates()); allDates.addAll(extra.dates());
        return new TaskFilter(quarterIds, priorities, statuses, releaseDateId, streams, withoutStream, customers,
            withoutCustomer, participantIds, roles, userStreams, searchQuery, withoutQuarter, pinnedTaskId, workspace, releasePromDate,
            new ReleaseSelection(allIds, allDates));
    }

    public TaskFilter(Set<UUID> quarterIds, Set<Short> priorities, Set<String> statuses, UUID releaseDateId, Set<String> streams, boolean withoutStream, Set<String> customers, boolean withoutCustomer, Set<UUID> participantIds, Set<String> roles, Set<String> userStreams, String searchQuery, boolean withoutQuarter, UUID pinnedTaskId) {
        this(quarterIds, priorities, statuses, releaseDateId, streams, withoutStream, customers, withoutCustomer, participantIds, roles, userStreams, searchQuery, withoutQuarter, pinnedTaskId, null, null);
    }

    public TaskFilter withScope(String workspace, String releasePromDate) {
        if (workspace != null && !Set.of("ROADMAP", "BACKLOG").contains(workspace)) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Unknown workspace");
        }
        java.time.LocalDate date = null;
        try { if (releasePromDate != null && !releasePromDate.isBlank()) date = java.time.LocalDate.parse(releasePromDate); }
        catch (java.time.DateTimeException e) { throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid release date"); }
        if (date != null && releaseDateId != null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Choose release ID or date, not both");
        return new TaskFilter(quarterIds, priorities, statuses, releaseDateId, streams, withoutStream, customers,
            withoutCustomer, participantIds, roles, userStreams, searchQuery, withoutQuarter, pinnedTaskId, workspace, date);
    }

    public static TaskFilter empty() {
        return new TaskFilter(
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            null,
            Collections.emptySet(),
            false,
            Collections.emptySet(),
            false,
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            null,
            false,
            null
        );
    }

    public static TaskFilter from(
        String quarterIds,
        String priorities,
        String statuses,
        String releaseDateId,
        String streams,
        String withoutStream,
        String customers,
        String withoutCustomer,
        String participantIds,
        String roles,
        String userStreams,
        String searchQuery,
        String withoutQuarter,
        String pinnedTaskId
    ) {
        return new TaskFilter(
            parseUuidSet(quarterIds),
            parseShortSet(priorities),
            parseStringSet(statuses),
            parseUuid(releaseDateId),
            parseStringSetPreserveCase(streams),
            parseBoolean(withoutStream),
            parseStringSetPreserveCase(customers),
            parseBoolean(withoutCustomer),
            parseUuidSet(participantIds),
            parseStringSet(roles),
            parseStringSet(userStreams),
            normalize(searchQuery),
            parseBoolean(withoutQuarter),
            parseUuid(pinnedTaskId)
        );
    }

    private static Set<UUID> parseUuidSet(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        Set<UUID> values = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            if (part == null || part.isBlank()) {
                continue;
            }
            try {
                values.add(UUID.fromString(part.trim()));
            } catch (IllegalArgumentException ignored) {
                // skip invalid ids
            }
        }
        return values;
    }

    private static Set<Short> parseShortSet(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        Set<Short> values = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            if (part == null || part.isBlank()) {
                continue;
            }
            try {
                values.add(Short.parseShort(part.trim()));
            } catch (NumberFormatException ignored) {
                // skip invalid numbers
            }
        }
        return values;
    }

    private static Set<String> parseStringSet(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        Set<String> values = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            if (part != null && !part.isBlank()) {
                values.add(part.trim().toLowerCase());
            }
        }
        return values;
    }

    private static Set<String> parseStringSetPreserveCase(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        Set<String> values = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            if (part != null && !part.isBlank()) {
                values.add(part.trim());
            }
        }
        return values;
    }

    private static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed.toLowerCase();
    }

    private static UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static boolean parseBoolean(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        return Boolean.parseBoolean(raw.trim());
    }
}
