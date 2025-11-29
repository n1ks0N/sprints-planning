package com.sber.isu.sprints_planning;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SprintsPlanningApplication {

    public static void main(String[] args) {
        SpringApplication.run(SprintsPlanningApplication.class, args);
    }
}
