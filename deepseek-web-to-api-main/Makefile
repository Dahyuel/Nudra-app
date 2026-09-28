.PHONY: install run dev test docker

install:
	pip install -r requirements.txt

run:
	python -m app.main

dev:
	uvicorn app.main:app --host 0.0.0.0 --port 4981 --reload

test:
	curl -X POST http://localhost:4981/openai/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"default","messages":[{"role":"user","content":"hello"}]}'

docker:
	docker compose up -d --build
