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
    Set<String> customers,
    Set<UUID> participantIds,
    Set<String> roles,
    Set<String> userStreams,
    String searchQuery,
    UUID pinnedTaskId
) {

    public static TaskFilter empty() {
        return new TaskFilter(
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            null,
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            Collections.emptySet(),
            null,
            null
        );
    }

    public static TaskFilter from(
        String quarterIds,
        String priorities,
        String statuses,
        String releaseDateId,
        String streams,
        String customers,
        String participantIds,
        String roles,
        String userStreams,
        String searchQuery,
        String pinnedTaskId
    ) {
        return new TaskFilter(
            parseUuidSet(quarterIds),
            parseShortSet(priorities),
            parseStringSet(statuses),
            parseUuid(releaseDateId),
            parseStringSetPreserveCase(streams),
            parseStringSetPreserveCase(customers),
            parseUuidSet(participantIds),
            parseStringSet(roles),
            parseStringSet(userStreams),
            normalize(searchQuery),
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
}
