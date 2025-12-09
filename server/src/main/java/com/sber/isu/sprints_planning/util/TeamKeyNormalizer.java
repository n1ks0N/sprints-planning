package com.sber.isu.sprints_planning.util;

import org.springframework.util.StringUtils;

public final class TeamKeyNormalizer {
    private TeamKeyNormalizer() {}

    public static String normalize(String teamKey) {
        if (!StringUtils.hasText(teamKey)) {
            throw new IllegalArgumentException("Team key is required");
        }
        return teamKey.trim().toLowerCase();
    }
}
