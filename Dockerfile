FROM node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web .
RUN npm run build

FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY --from=web /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -ldflags='-s -w' -o /badminton .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /data
ENV DB_PATH=/data/badminton.db PORT=8080
EXPOSE 8080
COPY --from=build /badminton /usr/local/bin/badminton
CMD ["badminton"]
