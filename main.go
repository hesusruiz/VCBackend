package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/client"
	"github.com/evidenceledger/vcdemo/faster"
	"github.com/evidenceledger/vcdemo/issuer"
	"github.com/evidenceledger/vcdemo/issuernew"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/evidenceledger/vcdemo/verifiernew"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	echomiddle "github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"flag"
	"log"
)

const dataDirectory = "data"
const defaultConfigFile = "./data/config/server.yaml"
const defaultBuildConfigFile = "./data/config/devserver.yaml"
const defaultTemplateDir = "back/views"
const defaultStaticDir = "back/www"
const defaultPassword = "ThePassword"

var (
	prod       = flag.Bool("prod", false, "Enable prefork in Production, for better performance")
	configFile = LookupEnvOrString("CONFIG_FILE", defaultConfigFile)
	// Path to config file for building the front
)

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func main() {

	var baseDir string
	var withGoRun bool

	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		// probably ran with go run
		withGoRun = true
		baseDir, _ = os.Getwd()
	} else {
		// probably ran with go build
		withGoRun = false
		baseDir = filepath.Dir(os.Args[0])
	}
	fmt.Println(os.Args)
	fmt.Println("BaseDir:", baseDir, "GoRun:", withGoRun)

	// Parse command-line flags before anything else
	flag.Parse()

	// Read configuration file
	cfg := readConfiguration(configFile)

	// Get the configurations for the individual services
	icfg := cfg.Map("issuer")
	if len(icfg) == 0 {
		panic("no configuration for new Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	// Create a new Issuer with its configuration
	iss := issuernew.New(issuerCfg)
	app := iss.App

	// loosely check if it was executed using "go run"
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// enable auto creation of migration files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Automigrate: isGoRun,
	})

	// Customize the root command
	app.RootCmd.Short = "VCDemo CLI"

	buildConfigFile := cfg.String("server.buildFront.buildConfigFile", defaultBuildConfigFile)
	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", buildConfigFile)

	// Add our commands
	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "build",
		Short: "Build the wallet front application",
		Run: func(cmd *cobra.Command, args []string) {
			log.Println("Building the front")
			faster.BuildFront(buildConfigFile)
		},
	})

	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "lear",
		Short: "Create the LEAR Credential",
		Run: func(cmd *cobra.Command, args []string) {
			log.Println("Create the LEAR Credential")
			deleteDatabase(cfg)
			issuer.BatchGenerateLEARCredentials(issuerCfg)
		},
	})

	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "cleandb",
		Short: "Erase the SQLite database files",
		Run: func(cmd *cobra.Command, args []string) {
			log.Println("Erase the SQLite database files")
			deleteDatabase(cfg)
		},
	})

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// Start Verifier and Wallet static server other services
		StartServices(cfg)
		return nil
	})

	// Start the new Issuer and block
	err := iss.Start()
	if err != nil {
		panic(err)
	}

}

func StartServices(cfg *yaml.YAML) {

	buildConfigFile := cfg.String("server.buildFront.buildConfigFile", defaultBuildConfigFile)
	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", buildConfigFile)

	// Start the new Verifier
	go verifiernew.Setup()

	// Start the watcher
	go faster.WatchAndBuild(buildConfigFile)

	// Start the server for static Wallet assets
	go func() {
		staticServer := echo.New()
		staticServer.Use(echomiddle.CORS())
		staticServer.Static("/*", "www")
		log.Println("Serving static assets from", cfg.String("server.staticDir", defaultStaticDir))

		if cfg.String("server.environment") == "development" {
			// Just for development time. Disable when in production
			staticServer.GET("/stopserver", func(c echo.Context) error {
				os.Exit(0)
				return nil
			})
		}

		log.Fatal(staticServer.Start(":3030"))
	}()

	time.Sleep(2 * time.Second)
	go client.Setup()

}

// func StartServicesOld(cfg *yaml.YAML) {

// 	buildConfigFile := cfg.String("server.buildFront.buildConfigFile", defaultBuildConfigFile)
// 	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", buildConfigFile)

// 	// // Check that the configuration entries for Issuer, Verifier and Wallet do exist
// 	// icfg := cfg.Map("issuer")
// 	// if len(icfg) == 0 {
// 	// 	panic("no configuration for Issuer found")
// 	// }
// 	// issuerCfg := yaml.New(icfg)

// 	// vcfg := cfg.Map("verifier")
// 	// if len(vcfg) == 0 {
// 	// 	panic("no configuration for Verifier found")
// 	// }
// 	// verifierCfg := yaml.New(vcfg)

// 	// wcfg := cfg.Map("wallet")
// 	// if len(wcfg) == 0 {
// 	// 	panic("no configuration for Wallet found")
// 	// }
// 	// walletCfg := yaml.New(wcfg)

// 	// Create the HTTP server
// 	s := handlers.NewServer(cfg)

// 	// // Create default credentials if not already created
// 	// issuer.BatchGenerateLEARCredentials(issuerCfg)

// 	// Create the template engine using the templates in the configured directory
// 	templateDir := cfg.String("server.templateDir", defaultTemplateDir)
// 	templateEngine := html.New(templateDir, ".html").AddFuncMap(sprig.FuncMap())

// 	if cfg.String("server.environment") == "development" {
// 		// Just for development time. Disable when in production
// 		templateEngine.Reload(true)
// 	}

// 	// Define the configuration for Fiber
// 	fiberCfg := fiber.Config{
// 		Views:       templateEngine,
// 		ViewsLayout: "layouts/main",
// 		Prefork:     *prod,
// 	}

// 	// Create a Fiber instance and set it in our Server struct
// 	s.App = fiber.New(fiberCfg)
// 	s.Cfg = cfg

// 	// Recover panics from the HTTP handlers so the server continues running
// 	s.Use(recover.New(recover.Config{EnableStackTrace: true}))

// 	// CORS
// 	s.Use(cors.New())

// 	// Create a storage entry for logon expiration
// 	s.SessionStorage = memory.New()
// 	defer s.SessionStorage.Close()

// 	// Application Home pages
// 	s.Get("/", s.HandleHome)
// 	s.Get("/walletprovider", s.HandleWalletProviderHome)

// 	// WARNING! This is just for development. Disable this in production by using the config file setting
// 	if cfg.String("server.environment") == "development" {
// 		s.Get("/stop", s.HandleStop)
// 	}

// 	// Setup the Issuer, Wallet and Verifier routes
// 	// issuer.Setup(s, issuerCfg)
// 	// verifier.Setup(s, verifierCfg)

// 	// Setup static files
// 	s.Static("/static", cfg.String("server.staticDir", defaultStaticDir))

// 	// Start the Wallet backend server
// 	//		wallet.Start(walletCfg)

// 	// Start the new Verifier
// 	go verifiernew.Setup()

// 	// Start the watcher
// 	go faster.WatchAndBuild(buildConfigFile)

// 	// Start the Verifier server
// 	go func() {
// 		log.Fatal(s.Listen(cfg.String("server.listenAddress")))
// 	}()

// 	// Start the server for static Wallet assets
// 	go func() {
// 		staticServer := echo.New()
// 		staticServer.Use(echomiddle.CORS())
// 		staticServer.Static("/*", "www")
// 		log.Println("Serving static assets from", cfg.String("server.staticDir", defaultStaticDir))
// 		log.Fatal(staticServer.Start(":3030"))
// 	}()

// 	time.Sleep(2 * time.Second)
// 	go client.Setup()

// }

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

func deleteDatabase(cfg *yaml.YAML) {

	icfg := cfg.Map("issuer")
	if len(icfg) == 0 {
		panic("no configuration for Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	// Delete Issuer database
	if err := vault.Delete(issuerCfg); err != nil {
		panic(err)
	}

	vcfg := cfg.Map("verifier")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	verifierCfg := yaml.New(vcfg)

	// Delete Verifier database
	if err := vault.Delete(verifierCfg); err != nil {
		panic(err)
	}

	wcfg := cfg.Map("wallet")
	if len(wcfg) == 0 {
		panic("no configuration for Wallet found")
	}
	walletCfg := yaml.New(wcfg)

	// Delete Wallet database
	if err := vault.Delete(walletCfg); err != nil {
		panic(err)
	}

}
