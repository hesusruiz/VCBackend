package main

import (
	"fmt"
	"os"

	"github.com/Masterminds/sprig/v3"
	"github.com/hesusruiz/vcbackend/back/handlers"
	"github.com/hesusruiz/vcbackend/issuer"
	"github.com/hesusruiz/vcbackend/vault"
	"github.com/hesusruiz/vcbackend/verifier"
	"github.com/hesusruiz/vcbackend/wallet"
	"github.com/hesusruiz/vcutils/yaml"

	"flag"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/storage/memory"
	"github.com/gofiber/template/html"
	"go.uber.org/zap"
)

const defaultConfigFile = "./server.yaml"
const defaultTemplateDir = "back/views"
const defaultStaticDir = "back/www"
const defaultPassword = "ThePassword"

var (
	sameDevice = false

	prod       = flag.Bool("prod", false, "Enable prefork in Production")
	configFile = flag.String("config", LookupEnvOrString("CONFIG_FILE", defaultConfigFile), "path to configuration file")
	password   = flag.String("pass", LookupEnvOrString("PASSWORD", defaultPassword), "admin password for the server")
)

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func main() {

	// Read configuration file
	cfg := readConfiguration(*configFile)

	// Create the HTTP server
	s := handlers.NewServer(cfg)

	// Create the logger and store in Server so all handlers can use it
	if cfg.String("server.environment") == "production" {
		s.Logger = zap.Must(zap.NewProduction()).Sugar()
	} else {
		s.Logger = zap.Must(zap.NewDevelopment()).Sugar()
	}
	zap.WithCaller(true)
	defer s.Logger.Sync()

	// Parse command-line flags
	flag.Parse()

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

	// Connect to the different store engines
	s.IssuerVault = vault.Must(vault.New(yaml.New(cfg.Map("issuer"))))
	s.VerifierVault = vault.Must(vault.New(yaml.New(cfg.Map("verifier"))))
	s.WalletVault = vault.Must(vault.New(yaml.New(cfg.Map("wallet"))))

	// Create the issuer and verifier users
	// TODO: the password is only for testing
	// _, s.IssuerDID, _ = s.IssuerVault.CreateOrGetUserWithDIDKey(cfg.String("issuer.id"), cfg.String("issuer.name"), "legalperson", cfg.String("issuer.password"))
	_, s.VerifierDID, _ = s.VerifierVault.CreateOrGetUserWithDIDKey(cfg.String("verifier.id"), cfg.String("verifier.name"), "legalperson", cfg.String("verifier.password"))

	// // Backend Operations for the Verifier
	// s.Operations = operations.NewManager(s.VerifierVault, cfg)

	// Recover panics from the HTTP handlers so the server continues running
	s.Use(recover.New(recover.Config{EnableStackTrace: true}))

	// CORS
	s.Use(cors.New())

	// Create a storage entry for logon expiration
	s.SessionStorage = memory.New()
	defer s.SessionStorage.Close()

	// // WebAuthn
	// s.WebAuthn = handlers.NewWebAuthnHandler(s, cfg)

	// ##########################
	// Application Home pages
	s.Get("/", s.HandleHome)
	s.Get("/walletprovider", s.HandleWalletProviderHome)

	// Info base path
	// s.Get("/info", s.GetBackendInfo)

	// WARNING! This is just for development. Disable this in production by using the config file setting
	if cfg.String("server.environment") == "development" {
		s.Get("/stop", s.HandleStop)
	}

	// Setup the Issuer, Wallet and Verifier routes
	issuer.Setup(s, cfg)
	setupEnterpriseWallet(s, cfg)
	verifier.Setup(s, cfg)

	// Setup static files
	s.Static("/static", cfg.String("server.staticDir", defaultStaticDir))

	// Start the PB server
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
