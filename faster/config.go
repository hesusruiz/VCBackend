package faster

import (
	"encoding/json"
	"fmt"
	"os"
)

// Config represents the structure of the buildfront.yaml configuration file.
type Config struct {
	Sourcedir       string            `yaml:"sourcedir"`
	Targetdir       string            `yaml:"targetdir"`
	EntryPoints     []string          `yaml:"entryPoints"`
	PagesDir        string            `yaml:"pagedir"`
	StaticAssets    StaticAssets      `yaml:"staticAssets"`
	Subdomainprefix string            `yaml:"subdomainprefix"`
	Devserver       Devserver         `yaml:"devserver"`
	CleanTarget     bool              `yaml:"cleantarget"`
	HashEntrypointNames bool          `yaml:"hashEntrypointNames"`
	HtmlFiles       []string          `yaml:"htmlfiles"`
	Dependencies    []string          `yaml:"dependencies"`
	Templates       Templates         `yaml:"templates"`
	Components      string            `yaml:"components"`
	Public          string            `yaml:"public"`
}

// StaticAssets represents the staticAssets section of the configuration.
type StaticAssets struct {
	Source string `yaml:"source"`
	Target string `yaml:"target"`
}

// Devserver represents the devserver section of the configuration.
type Devserver struct {
	ListenAddress string `yaml:"listenAddress"`
	Autobuild     bool   `yaml:"autobuild"`
}

// Templates represents the templates section of the configuration.
type Templates struct {
	Dir   string  `yaml:"dir"`
	Elems []any   `yaml:"elems"`
}

// LoadConfig loads the configuration from the specified YAML file.
func LoadConfig(configFile string) (*Config, error) {

	src, err := os.ReadFile(configFile)
	if err != nil {
		fmt.Printf("Error reading config file: %s\n", err)
		return nil, err
	}

	config := &Config{}
	err = json.Unmarshal(src, config)
	if err != nil {
		return nil, fmt.Errorf("unmarshalling config data: %w", err)
	}


	return config, nil

}

