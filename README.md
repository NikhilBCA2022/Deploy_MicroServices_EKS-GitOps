# Minimalistic Task Manager (5 Microservices)

A minimalistic Task Management application built with React + Vite, Node.js 20, Express.js, MongoDB, JWT authentication, and Docker Compose.

## Services
1. **API Gateway** (`:4000`) — Routes `/api/auth`, `/api/users`, `/api/tasks`, and `/api/notifications`, verifies JWT on protected routes, and forwards `x-user-id`.
2. **Auth Service** (`:4002`) — User registration and login with `bcryptjs` and `jsonwebtoken`.
3. **User Service** (`:4003`) — User profile read/update (`GET /profile`, `PUT /profile`).
4. **Task Service** (`:4004`) — Task CRUD operations (`GET /tasks`, `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id`).
5. **Notification Service** (`:4005`) — Logs and stores events (`POST /notify`, `GET /notifications`).
6. **Frontend** (`:80`) — Minimalistic React + Vite UI served via Nginx with `/api` reverse proxy to `api-gateway:4000`.

## Quick Start with Docker Compose
```bash
cp .env.example .env
docker compose up --build -d
```
Open `http://localhost` in your browser.
