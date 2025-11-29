package com.sber.isu.sprints_planning.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.capacity")
public record CapacityProperties(double normFactor) {
}
