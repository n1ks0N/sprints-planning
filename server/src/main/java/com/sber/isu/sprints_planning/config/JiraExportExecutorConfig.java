package com.sber.isu.sprints_planning.config;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class JiraExportExecutorConfig {

    private static final int EXPORT_WORKER_CONCURRENCY = 1;

    @Bean(name = "jiraExportExecutor")
    public Executor jiraExportExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(EXPORT_WORKER_CONCURRENCY);
        executor.setMaxPoolSize(EXPORT_WORKER_CONCURRENCY);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("jira-export-");
        executor.initialize();
        return executor;
    }
}
