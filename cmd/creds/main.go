package main

import (
	"flag"
	"fmt"

	"github.com/evidenceledger/vcdemo/internal/jwt"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
)

type CredentialClaims struct {
	jwt.RegisteredClaims
	Other map[string]any
}

const defaultConfigFile = "./server.yaml"
const defaultCredentialDataFile = "cmd/creds/sampledata/employee_data.yaml"

var (
	configFile = flag.String("config", defaultConfigFile, "path to configuration file")
)

func main() {

	// Parse command-line flags
	flag.Parse()

	// Read configuration file
	cfg := readConfiguration(*configFile)

	// Connect to the Vault
	issuerVault := vault.Must(vault.New(yaml.New(cfg.Map("issuer"))))

	// Parse credential data
	data, err := yaml.ParseYamlFile(defaultCredentialDataFile)
	if err != nil {
		panic(err)
	}

	// Get the top-level list (the list of credentials)
	creds := data.List("")
	if len(creds) == 0 {
		panic("no credentials found in config")
	}

	// Iterate through the list creating each credential which will use its own template
	for _, item := range creds {

		// Cast to a map so it can be passed to CreateCredentialFromMap
		cred, _ := item.(map[string]any)
		_, _, err := issuerVault.CreateCredentialJWTFromMap(cred)
		if err != nil {
			zlog.Logger.Error().Err(err).Send()
			continue
		}

	}

}

// readConfiguration reads a YAML file and creates an easy-to navigate structure
func readConfiguration(configFile string) *yaml.YAML {
	var cfg *yaml.YAML
	var err error

	cfg, err = yaml.ParseYamlFile(configFile)
	if err != nil {
		fmt.Printf("Config file not found, using defaults\n")
		panic(err)
	}
	return cfg
}
