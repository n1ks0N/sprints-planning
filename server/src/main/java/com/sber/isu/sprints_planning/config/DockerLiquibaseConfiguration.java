package com.sber.isu.sprints_planning.config;

import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.exception.LiquibaseException;
import liquibase.integration.spring.SpringLiquibase;
import liquibase.resource.ClassLoaderResourceAccessor;
import liquibase.database.jvm.JdbcConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

@Configuration
@Profile("docker")
public class DockerLiquibaseConfiguration {

    @Bean
    public SpringLiquibase liquibase(DataSource dataSource) {
        SpringLiquibase liquibase = new SpringLiquibase() {
            @Override
            public void afterPropertiesSet() throws LiquibaseException {
                try (Connection connection = getDataSource().getConnection()) {
                    JdbcConnection jdbcConnection = new JdbcConnection(connection);
                    Liquibase liquibase = new Liquibase(getChangeLog(), new ClassLoaderResourceAccessor(), jdbcConnection);
                    liquibase.dropAll();
                    liquibase.clearCheckSums();
                    liquibase.update(new Contexts(), new LabelExpression());
                } catch (SQLException e) {
                    throw new LiquibaseException(e);
                }
            }
        };

        liquibase.setDataSource(dataSource);
        liquibase.setChangeLog("classpath:database/changelog.yml");
        return liquibase;
    }
}
