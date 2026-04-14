up:
	@docker compose up

build:
	@docker compose up --build

down:
	@docker compose down

psql:
	@docker compose exec db sh -lc 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'
