package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record PageResponse<T>(
    List<T> content,
    int number,
    int size,
    int totalPages,
    long totalElements,
    boolean first,
    boolean last,
    int numberOfElements,
    boolean empty
) {
    public static <T> PageResponse<T> of(List<T> content, int page, int size, long totalElements) {
        int safeSize = Math.max(size, 1);
        int totalPages = (int) Math.max(1, (totalElements + safeSize - 1) / safeSize);
        boolean first = page <= 0;
        boolean last = ((long) page * safeSize) + content.size() >= totalElements;
        int numberOfElements = content.size();
        boolean empty = content.isEmpty();

        return new PageResponse<>(
            content,
            Math.max(page, 0),
            safeSize,
            totalPages,
            totalElements,
            first,
            last,
            numberOfElements,
            empty
        );
    }
}

