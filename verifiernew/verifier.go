package verifiernew

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	exampleop "github.com/evidenceledger/vcdemo/verifiernew/learcredop"
	"github.com/evidenceledger/vcdemo/verifiernew/storage"
)

func Setup() {
	//we will run on :9998
	port := "9998"

	verifierUrl := "https://verifiertest.mycredential.eu"

	// the OpenIDProvider interface needs a Storage interface handling various checks and state manipulations
	// this might be the layer for accessing your database
	// in this example it will be handled in-memory
	storage := storage.NewStorage(storage.NewUserStore(verifierUrl))

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)
	router := exampleop.SetupServer(verifierUrl, storage, logger, false)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}
	logger.Info("Verifier listening, press ctrl+c to stop", "addr", fmt.Sprintf("http://localhost:%s/", port))
	err := server.ListenAndServe()
	if err != http.ErrServerClosed {
		logger.Error("server terminated", "error", err)
		os.Exit(1)
	}
}
