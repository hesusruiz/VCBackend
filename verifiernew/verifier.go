package verifiernew

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/evidenceledger/vcdemo/verifiernew/learcredop"
	"github.com/hesusruiz/vcutils/yaml"

	"github.com/evidenceledger/vcdemo/verifiernew/storage"
)

func Start(cfg *yaml.YAML) error {

	ver := learcredop.New(cfg)

	listenAddress := ver.Config.ListenAddress

	verifierURL := ver.Config.VerifierURL
	if len(verifierURL) == 0 {
		return fmt.Errorf("verifierURL not specified in config")
	}

	// _, isUsingGoRun := inspectRuntime()

	// app := pocketbase.NewWithConfig(pocketbase.Config{
	// 	DefaultDev:     isUsingGoRun,
	// 	DefaultDataDir: "data/verifier_data",
	// })

	// go func() {
	// 	app.Start()
	// }()

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

	router, err := ver.SetupServer(cfg, storage, logger, false)
	if err != nil {
		return err
	}

	ver.Server = &http.Server{
		Addr:    listenAddress,
		Handler: router,
	}
	logger.Info("Verifier listening, press ctrl+c to stop", "addr", listenAddress)

	go func() {
		err := ver.Server.ListenAndServe()
		if err != http.ErrServerClosed {
			logger.Error("server terminated", "error", err)
			os.Exit(1)
		}
	}()

	return nil
}

func InspectRuntime() (baseDir string, withGoRun bool) {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		// probably ran with go run
		withGoRun = true
		baseDir, _ = os.Getwd()
	} else {
		// probably ran with go build
		withGoRun = false
		baseDir = filepath.Dir(os.Args[0])
	}
	return
}
