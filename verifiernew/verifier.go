package verifiernew

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/evidenceledger/vcdemo/verifiernew/learcredop"
	"github.com/hesusruiz/vcutils/yaml"

	"github.com/evidenceledger/vcdemo/verifiernew/storage"
)

func Start(cfg *yaml.YAML) error {
	listenAddress := cfg.String("listenAddress", ":9998")

	verifierURL := cfg.String("verifierURL")
	if len(verifierURL) == 0 {
		return fmt.Errorf("verifierURL not specified in config")
	}

	// The OpenIDProvider interface needs a Storage interface handling various checks and state manipulations.
	// This is normally used as the layer for accessing a database, but we do not need permanent storage for users
	// and it will be handled in-memory because the user data is coming from the Verifiable Credential presented.
	storage := storage.NewStorage(storage.NewUserStore(verifierURL))

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)

	router, err := learcredop.SetupServer(cfg, storage, logger, false)
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:    listenAddress,
		Handler: router,
	}
	logger.Info("Verifier listening, press ctrl+c to stop", "addr", listenAddress)

	go func() {
		err := server.ListenAndServe()
		if err != http.ErrServerClosed {
			logger.Error("server terminated", "error", err)
			os.Exit(1)
		}
	}()

	return nil
}
