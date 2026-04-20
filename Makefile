up:
	@docker compose up -d

build:
	@docker compose up --build -d

restart-app:
	@docker compose restart app

logs:
	@docker compose logs -f

logs-db:
	@docker compose logs -f db

logs-app:
	@docker compose logs -f app

down:
	@docker compose down

down-volumes:
	@docker compose down --volumes

psql:
	@docker compose exec db sh -lc 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: up build logs logs-db logs-app down psql restart-app down-volumes