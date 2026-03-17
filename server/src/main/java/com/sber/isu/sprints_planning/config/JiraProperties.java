package com.sber.isu.sprints_planning.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jira")
public record JiraProperties(
    String basicToken,
    boolean mockEnabled,
    Integer connectTimeoutMs,
    Integer readTimeoutMs,
    Integer exportWorkerConcurrency
) {
}
