FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp package
FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl && addgroup -S ifound && adduser -S -G ifound ifound
WORKDIR /app
COPY --from=build --chown=ifound:ifound /build/target/quarkus-app/ ./
USER ifound
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/quarkus-run.jar"]
