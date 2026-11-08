package com.sber.isu.sprints_planning.service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** A union of selected release IDs and PROM dates. Dates may have no release record yet. */
public record ReleaseSelection(Set<UUID> ids, Set<LocalDate> dates) {
    public static ReleaseSelection parse(String ids, String dates) {
        try {
            return new ReleaseSelection(tokens(ids).map(UUID::fromString).collect(java.util.stream.Collectors.toSet()),
                tokens(dates).map(LocalDate::parse).collect(java.util.stream.Collectors.toSet()));
        } catch (IllegalArgumentException | java.time.DateTimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid release selection");
        }
    }

    public static ReleaseSelection decode(String value) {
        List<String> values = tokens(value).toList();
        return parse(String.join(",", values.stream().filter(v -> !v.startsWith("date:")).toList()),
            String.join(",", values.stream().filter(v -> v.startsWith("date:")).map(v -> v.substring(5)).toList()));
    }

    public String encode() {
        return Stream.concat(ids.stream().map(UUID::toString).sorted(), dates.stream().sorted().map(d -> "date:" + d))
            .collect(java.util.stream.Collectors.joining(","));
    }

    public boolean isEmpty() { return ids.isEmpty() && dates.isEmpty(); }
    public boolean matches(UUID id, LocalDate date) { return (id != null && ids.contains(id)) || (date != null && dates.contains(date)); }
    private static Stream<String> tokens(String raw) {
        return raw == null ? Stream.empty() : Arrays.stream(raw.split(",")).map(String::trim).filter(v -> !v.isBlank());
    }
}
