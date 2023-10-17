package main

import (
	"fmt"
	"os"
	"path"

	"github.com/Masterminds/sprig/v3"
	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/faster"
	"github.com/evidenceledger/vcdemo/issuer"
	"github.com/evidenceledger/vcdemo/verifier"

	"github.com/evidenceledger/vcdemo/wallet"
	"github.com/hesusruiz/vcutils/yaml"

	"flag"
	"log"

	zlog "github.com/rs/zerolog/log"

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
	prod            = flag.Bool("prod", false, "Enable prefork in Production, for better performance")
	buildConfigFile = flag.String("buildconfig", LookupEnvOrString("BUILD_CONFIG_FILE", defaultBuildConfigFile), "path to build config file")
	configFile      = flag.String("config", LookupEnvOrString("CONFIG_FILE", defaultConfigFile), "path to configuration file")
	password        = flag.String("pass", LookupEnvOrString("PASSWORD", defaultPassword), "admin password for the server")
)

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func main() {

	flag.Usage = func() {
		fmt.Printf("Usage of vcdemo (v1.1)\n")
		fmt.Println("  vcdemo            \tStart the server")
		fmt.Println("  vcdemo credentials\tCreate in batch the default credentials")
		fmt.Println("  vcdemo build      \tBuild the wallet front application")
		fmt.Println("  vcdemo cleandb    \tErase the SQLite database files")
		fmt.Println()
		fmt.Println("vcdemo uses a configuration file named 'server.yaml' located in the current directory.")
		fmt.Println()
		fmt.Println("The server has the following flags:")
		flag.PrintDefaults()
	}

	// Make the default directory for db files
	err := os.MkdirAll("data/storage", 0775)
	if err != nil {
		panic(err)
	}

	// Parse command-line flags
	flag.Parse()
	argsCmd := flag.Args()

	// Read configuration file
	cfg := readConfiguration(*configFile)

	// Create the HTTP server
	s := handlers.NewServer(cfg)

	// Prepare the arguments map
	args := map[string]bool{}
	for _, arg := range argsCmd {
		args[arg] = true
	}

	// Check that the configuration entries for Issuer and Verifier do exist
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

	// Create default credentials
	if args["credentials"] {
		issuer.BatchGenerateCredentials(issuerCfg)
		os.Exit(0)
	}

	// Build the front
	if args["build"] {
		faster.BuildFront(*buildConfigFile)
		os.Exit(0)
	}

	// Erase SQLite database files
	if args["cleandb"] {
		deleteDatabase(cfg)
		os.Exit(0)
	}

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
	wallet.Start(cfg)

	// Start the server
	log.Fatal(s.Listen(cfg.String("server.listenAddress")))

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

	storageDirectory := "data/storage"

	// Delete the files inside 'config/storage' directory
	files, err := os.ReadDir(storageDirectory)
	if err != nil {
		panic(err)
	}

	for _, file := range files {
		if !file.IsDir() {
			fullPath := path.Join(storageDirectory, file.Name())
			if err := os.Remove(fullPath); err != nil {
				zlog.Warn().Str("error", err.Error()).Msg("")
			} else {
				zlog.Info().Str("name", file.Name()).Msg("file deleted")
			}
		} else {
			zlog.Warn().Str("name", file.Name()).Msg("there is a directory inside config")
		}
	}
}
