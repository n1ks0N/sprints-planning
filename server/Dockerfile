# syntax=docker/dockerfile:1.4

FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src src
COPY database database
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/isu-sprints-planning-service.jar app.jar
COPY --from=build /app/database database
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
