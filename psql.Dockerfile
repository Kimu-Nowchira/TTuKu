FROM postgres:11

COPY resources/db.sql /docker-entrypoint-initdb.d/10-init.sql