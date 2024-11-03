package learcredop

import (
	"encoding/json"

	"github.com/go-ozzo/ozzo-validation/v4/is"
	"github.com/hesusruiz/vcutils/yaml"
	val "github.com/invopop/validation"
)

type CLIENTS struct {
	Id     string `json:"id,omitempty"`
	Type   string `json:"type,omitempty"`
	Secret string `json:"secret,omitempty"`
}

func ConfigFromMap(cfg *yaml.YAML) (*Config, error) {
	d, err := json.Marshal(cfg.Data())
	if err != nil {
		return nil, err
	}

	config := &Config{}
	err = json.Unmarshal(d, config)
	if err != nil {
		return nil, err
	}

	err = config.Validate()

	return config, err

}

func (s *Config) SetDefaults() {

}

type Config struct {
	ListenAddress          string    `json:"listenAddress,omitempty"`
	VerifierURL            string    `json:"verifierURL,omitempty"`
	AuthnPolicies          string    `json:"authnPolicies,omitempty"`
	SamedeviceWallet       string    `json:"samedeviceWallet,omitempty"`
	CredentialTemplatesDir string    `json:"credentialTemplatesDir,omitempty"`
	RegisteredClients      []CLIENTS `json:"registeredClients,omitempty"`
}

func (s *Config) Validate() (err error) {

	err = val.ValidateStruct(s,
		val.Field(&s.ListenAddress, val.Required),
		val.Field(&s.VerifierURL, val.Required, is.URL),
		val.Field(&s.AuthnPolicies, val.Required),
		val.Field(&s.SamedeviceWallet, val.Required, is.URL),
		val.Field(&s.CredentialTemplatesDir, val.Required),
	)

	return err
}

func (s *Config) Copy() Config {
	return Config{}
}

func (s *Config) OverrideWith(other Config) {

}

func (s *Config) String() string {
	return ""
}
