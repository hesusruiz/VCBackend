package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Masterminds/sprig/v3"
	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/faster"
	"github.com/evidenceledger/vcdemo/issuer"
	"github.com/evidenceledger/vcdemo/issuernew"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/evidenceledger/vcdemo/verifier"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"flag"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/storage/memory"
	"github.com/gofiber/template/html"
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
	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", defaultBuildConfigFile)
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
		panic("no configuration for Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	icfgnew := cfg.Map("issuernew")
	if len(icfg) == 0 {
		panic("no configuration for new Issuer found")
	}
	issuerCfgNew := yaml.New(icfgnew)

	// Create a new Pocketbase App
	app := pocketbase.New()

	// loosely check if it was executed using "go run"
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// enable auto creation of migration files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Automigrate: isGoRun,
	})

	// Customize the root command
	app.RootCmd.Short = "VCDemo CLI"

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

	// Start Verifier and other services
	StartServices(app, cfg)

	// Start the new Issuer and block
	issuernew.Start(app, issuerCfgNew)

}

func StartServices(app *pocketbase.PocketBase, cfg *yaml.YAML) {

	// Check that the configuration entries for Issuer, Verifier and Wallet do exist
	icfg := cfg.Map("issuer")
	if len(icfg) == 0 {
		panic("no configuration for Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	vcfg := cfg.Map("verifier")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	verifierCfg := yaml.New(vcfg)

	// wcfg := cfg.Map("wallet")
	// if len(wcfg) == 0 {
	// 	panic("no configuration for Wallet found")
	// }
	// walletCfg := yaml.New(wcfg)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		log.Println(e.App)

		// Create the HTTP server
		s := handlers.NewServer(cfg)

		// Create default credentials if not already created
		issuer.BatchGenerateLEARCredentials(issuerCfg)

		// Create the template engine using the templates in the configured directory
		templateDir := cfg.String("server.templateDir", defaultTemplateDir)
		templateEngine := html.New(templateDir, ".html").AddFuncMap(sprig.FuncMap())

		if cfg.String("server.environment") == "development" {
			// Just for development time. Disable when in production
			templateEngine.Reload(true)
		}

		// Define the configuration for Fiber
		fiberCfg := fiber.Config{
			Views:       templateEngine,
			ViewsLayout: "layouts/main",
			Prefork:     *prod,
		}

		// Create a Fiber instance and set it in our Server struct
		s.App = fiber.New(fiberCfg)
		s.Cfg = cfg

		// Recover panics from the HTTP handlers so the server continues running
		s.Use(recover.New(recover.Config{EnableStackTrace: true}))

		// CORS
		s.Use(cors.New())

		// Create a storage entry for logon expiration
		s.SessionStorage = memory.New()
		defer s.SessionStorage.Close()

		// Application Home pages
		s.Get("/", s.HandleHome)
		s.Get("/walletprovider", s.HandleWalletProviderHome)

		// WARNING! This is just for development. Disable this in production by using the config file setting
		if cfg.String("server.environment") == "development" {
			s.Get("/stop", s.HandleStop)
		}

		// Setup the Issuer, Wallet and Verifier routes
		issuer.Setup(s, issuerCfg)
		verifier.Setup(s, verifierCfg)

		// Setup static files
		s.Static("/static", cfg.String("server.staticDir", defaultStaticDir))

		// Start the Wallet backend server
		//		wallet.Start(walletCfg)

		// Start the watcher
		go faster.WatchAndBuild(buildConfigFile)

		// Start the server
		go func() {
			log.Fatal(s.Listen(cfg.String("server.listenAddress")))
		}()

		// Start the server for static Wallet assets
		go func() {
			staticServer := echo.New()
			staticServer.Static("/*", "www")
			log.Println("Serving static assets from", cfg.String("server.staticDir", defaultStaticDir))
			log.Fatal(staticServer.Start(":3030"))
		}()

		return nil
	})

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
