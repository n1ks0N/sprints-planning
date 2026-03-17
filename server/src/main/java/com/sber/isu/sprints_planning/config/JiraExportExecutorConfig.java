package com.sber.isu.sprints_planning.config;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class JiraExportExecutorConfig {

    @Bean(name = "jiraExportExecutor")
    public Executor jiraExportExecutor(JiraProperties jiraProperties) {
        int concurrency = jiraProperties.exportWorkerConcurrency() == null || jiraProperties.exportWorkerConcurrency() <= 0
            ? 1
            : jiraProperties.exportWorkerConcurrency();

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(concurrency);
        executor.setMaxPoolSize(concurrency);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("jira-export-");
        executor.initialize();
        return executor;
    }
}
