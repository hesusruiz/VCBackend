package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/client"
	"github.com/evidenceledger/vcdemo/faster"
	"github.com/evidenceledger/vcdemo/issuernew"
	"github.com/evidenceledger/vcdemo/verifiernew"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	echomiddle "github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"log"
)

const defaultConfigFileName = "server.yaml"
const defaultBuildConfigFile = "./data/config/devserver.yaml"

var baseDir string

func main() {

	// Loosely check if it was executed using "go run"
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	// Detect the location of the main config file
	if isGoRun {
		// Probably ran with go run
		baseDir, _ = os.Getwd()
	} else {
		// Probably ran with go build
		baseDir = filepath.Dir(os.Args[0])
	}

	// The full path to the default config file, in the same place as the program binary
	defaultConfigFilePath := filepath.Join(baseDir, defaultConfigFileName)

	// Read configuration file
	rootCfg := readConfiguration(LookupEnvOrString("CONFIG_FILE", defaultConfigFilePath))

	// Get the configurations for the individual services
	icfg := rootCfg.Map("issuer")
	if len(icfg) == 0 {
		panic("no configuration for new Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	// Create a new Issuer with its configuration
	iss := issuernew.New(issuerCfg)
	app := iss.App

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// enable auto creation of migration files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Automigrate: isGoRun,
	})

	// Customize the root command
	app.RootCmd.Short = "VCDemo CLI"

	app.RootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		fmt.Println("**Persistent PreRun")
		fmt.Println(cmd.Use)
		for _, argument := range args {
			fmt.Println("   -", argument)
		}
	}

	// Add our commands
	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "build",
		Short: "Build the wallet front application",
		Run: func(cmd *cobra.Command, args []string) {
			log.Println("Building the front")
			faster.BuildFront(buildConfigFileName(rootCfg))
		},
	})

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// Start Verifier and Wallet static server other services
		return StartServices(rootCfg)
	})

	// Start the new Issuer and block
	err := iss.Start()
	if err != nil {
		panic(err)
	}

}

func StartServices(rootCfg *yaml.YAML) error {

	// Get the configuration for the Verifier
	vcfg := rootCfg.Map("verifier")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	verifierCfg := yaml.New(vcfg)

	// Start the new Verifier
	if err := verifiernew.Start(verifierCfg); err != nil {
		return err
	}

	// Start the server for static Wallet assets
	go func() {
		staticServer := echo.New()
		staticServer.Use(echomiddle.CORS())

		// Serve the static assets from the configured directory
		staticDir := rootCfg.String("server.staticDir", "www")
		staticServer.Static("/*", staticDir)

		if rootCfg.String("server.environment") == "development" {
			// Just for development time. Disable when in production

			// Start the watcher
			go faster.WatchAndBuild(buildConfigFileName(rootCfg))

			// Stop the whole server remotely
			staticServer.GET("/stopserver", func(c echo.Context) error {
				os.Exit(0)
				return nil
			})

			staticServer.GET("/fake", func(c echo.Context) error {
				fmt.Println("Me han llamado al GET: ", c.Request().URL)

				return nil
			})
			staticServer.POST("/fake", func(c echo.Context) error {
				fmt.Println("Me han llamado al POST")

				return nil
			})

		}

		//Start serving requests
		walletListenAddress := rootCfg.String("server.listenAddress", ":3030")
		log.Fatal(staticServer.Start(walletListenAddress))
	}()

	// Get the configuration for the example Relying Party
	rcfg := rootCfg.Map("relyingParty")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	relyingPartyCfg := yaml.New(rcfg)

	// Start the example application which will use the Verifier to accept Verifiable Credentials
	time.Sleep(2 * time.Second)
	go client.Setup(relyingPartyCfg)

	return nil

}

// readConfiguration reads a YAML file and creates an easy-to navigate structure
func readConfiguration(configFile string) *yaml.YAML {
	var cfg *yaml.YAML
	var err error

	cfg, err = yaml.ParseYamlFile(configFile)
	if err != nil {
		fmt.Printf("Config file not found, exiting\n")
		panic(err)
	}
	return cfg
}

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func buildConfigFileName(cfg *yaml.YAML) string {
	buildConfigFile := cfg.String("server.buildFront.buildConfigFile", defaultBuildConfigFile)
	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", buildConfigFile)
	return buildConfigFile
}
