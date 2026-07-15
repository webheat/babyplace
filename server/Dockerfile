# Stage 1: Build admin frontend
FROM node:20-alpine AS frontend
WORKDIR /app/admin-ui
COPY admin-ui/package.json admin-ui/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY admin-ui/ .
RUN pnpm build

# Stage 2: Build Go server
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/static/manage ./static/manage
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/static ./static
EXPOSE 8080
CMD ["./server"]
