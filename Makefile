.PHONY: start dev build web clean ngrok

# Run both backend (:8000) and frontend dev server (:5173) in parallel
start:
	@trap 'kill 0' INT; \
	go run . & \
	cd web && npm run dev & \
	wait

# Run backend only (assumes frontend already built or running separately)
dev:
	go run .

# Build frontend then compile single binary
build: web
	go build -ldflags='-s -w' -o badminton .

# Build frontend only
web:
	cd web && npm install && npm run build

# Install frontend deps (no build)
web-install:
	cd web && npm install

# Run frontend dev server (proxy /api → :8000)
web-dev:
	cd web && npm run dev

clean:
	rm -rf web/dist web/node_modules badminton *.db *.db-wal *.db-shm

# Build (if needed) then run the production binary + ngrok tunnel on port 8000.
# Prerequisite: ngrok installed (brew install ngrok/ngrok/ngrok) and ANTHROPIC_API_KEY set.
# Usage:  ANTHROPIC_API_KEY=sk-ant-... make ngrok
ngrok: build
	@trap 'kill 0' INT; \
	./badminton & \
	sleep 1 && ngrok http 8000 & \
	wait
