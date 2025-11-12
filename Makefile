.PHONY: help build dev prod stop clean logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build Docker image
	docker-compose build

dev: ## Start development servers (backend + frontend)
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:3001"
	@echo "Frontend: http://localhost:3000"
	@make -j2 dev-backend dev-frontend

dev-backend: ## Start backend dev server
	cd backend && pnpm dev

dev-frontend: ## Start frontend dev server
	cd frontend && pnpm dev

prod: ## Build and start production containers
	docker-compose up -d --build

stop: ## Stop Docker containers
	docker-compose down

restart: ## Restart Docker containers
	docker-compose restart

logs: ## Show Docker container logs
	docker-compose logs -f yui

clean: ## Clean build artifacts and containers
	docker-compose down -v
	rm -rf backend/dist frontend/dist
	rm -rf backend/node_modules frontend/node_modules

install: ## Install dependencies for development
	cd backend && pnpm install
	cd frontend && pnpm install

db-migrate: ## Run database migrations
	cd backend && pnpm prisma migrate dev

db-studio: ## Open Prisma Studio
	cd backend && pnpm prisma studio

db-backup: ## Backup database
	@mkdir -p backups
	cp data/yui.db backups/yui-$$(date +%Y%m%d-%H%M%S).db
	@echo "Database backed up to backups/"
