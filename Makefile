.PHONY: help install lint test build run up down logs push helm lint helm template kustomize clean

SHELL := /bin/bash
APP   := deployment-platform
IMAGE ?= ghcr.io/$(USER)/$(APP)
TAG   ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install Node dependencies
	cd app && npm ci

lint: ## Lint application source
	cd app && npm run lint

test: ## Run unit tests
	cd app && npm test

build: ## Build the container image
	docker build -t $(IMAGE):$(TAG) -t $(IMAGE):latest ./app

run: ## Run the image locally
	docker run --rm -p 3000:3000 --env-file .env.example $(IMAGE):$(TAG)

up: ## Start the local docker-compose stack
	docker compose up -d --build
	@echo "App:    http://localhost:3000"
	@echo "Health: http://localhost:3000/healthz"

down: ## Stop the local docker-compose stack
	docker compose down -v

logs: ## Tail logs from docker-compose
	docker compose logs -f

push: build ## Build and push image
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

helm-lint: ## Lint the Helm chart
	cd helm/app && helm lint .
	cd helm/app && helm lint -f values-dev.yaml .
	cd helm/app && helm lint -f values-prod.yaml .

helm-template: ## Render the Helm chart with default values
	cd helm/app && helm template $(APP) .

kustomize: ## Build dev / staging / prod overlays
	kubectl kustomize k8s/overlays/dev
	@echo "---"
	kubectl kustomize k8s/overlays/staging
	@echo "---"
	kubectl kustomize k8s/overlays/prod

clean: ## Remove local artifacts
	rm -rf app/node_modules app/coverage
