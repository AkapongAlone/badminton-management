package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	_ "time/tzdata" // embed tzdata so Asia/Bangkok works in scratch/alpine containers

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
)

//go:embed all:web/dist
var webDist embed.FS

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	db, err := openDB(env("DB_PATH", "badminton.db"))
	if err != nil {
		log.Fatal(err)
	}
	s := &Server{db: db}

	app := fiber.New(fiber.Config{AppName: "badminton-session-manager"})

	api := app.Group("/api")
	api.Post("/groups", s.createGroup)
	api.Get("/groups/:id", s.getGroup)
	api.Post("/groups/:id/sessions", s.createSession)
	api.Get("/groups/:id/roster", s.listRoster)
	api.Post("/groups/:id/roster", s.addRosterPlayer)
	api.Patch("/roster/:id", s.patchRosterPlayer)

	api.Get("/sessions/:id/state", s.handleState)
	api.Patch("/sessions/:id/config", s.patchSessionConfig)
	api.Post("/sessions/:id/close", s.closeSession)
	api.Post("/sessions/:id/players", s.checkIn)
	api.Post("/sessions/:id/courts", s.addCourt)
	api.Get("/sessions/:id/suggest", s.handleSuggest)

	api.Post("/players/:id/checkout", s.checkoutPlayer)
	api.Patch("/players/:id", s.patchPlayer)
	api.Patch("/courts/:id", s.patchCourt)
	api.Post("/courts/:id/games", s.startGame)
	api.Post("/games/:id/end", s.endGame)

	api.Post("/sessions/:id/match-queue", s.addToMatchQueue)
	api.Delete("/match-queue/:id", s.removeFromMatchQueue)
	api.Post("/match-queue/:id/start", s.startFromMatchQueue)

	// Embedded SPA: serve the built frontend, fall back to index.html for client routes.
	dist, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatal(err)
	}
	app.Use(filesystem.New(filesystem.Config{
		Root:         http.FS(dist),
		NotFoundFile: "index.html",
		MaxAge:       60,
	}))

	addr := ":" + env("PORT", "8080")
	log.Printf("listening on %s", addr)
	log.Fatal(app.Listen(addr))
}
