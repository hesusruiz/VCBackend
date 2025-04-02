package issuernew

import (
	"encoding/json"

	"github.com/hesusruiz/vcutils/yaml"
)

type Config struct {
	ListenAddress          string     `json:"listenAddress,omitempty"`
	AppName                string     `json:"appName,omitempty"`
	IssuerURL              string     `json:"issuerURL,omitempty"`
	IssuerCertificateURL   string     `json:"issuerCertificateURL,omitempty"`
	SenderName             string     `json:"senderName,omitempty"`
	SenderAddress          string     `json:"senderAddress,omitempty"`
	VerifierURL            string     `json:"verifierURL,omitempty"`
	CallbackPath           string     `json:"callbackPath,omitempty"`
	Scopes                 string     `json:"scopes,omitempty"`
	AdminEmail             string     `json:"adminEmail,omitempty"`
	SMTP                   SMTPConfig `json:"smtp,omitempty"`
	SamedeviceWallet       string     `json:"samedeviceWallet,omitempty"`
	CredentialTemplatesDir string     `json:"credentialTemplatesDir,omitempty"`
	ClientID               string     `json:"clientID,omitempty"`
}

type SMTPConfig struct {
	Enabled  bool   `json:"enabled,omitempty"`
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Tls      bool   `json:"tls,omitempty"`
	Username string `json:"username,omitempty"`
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

func (s *Config) Validate() (err error) {

	return nil
}

func (s *Config) Copy() Config {
	return Config{}
}

func (s *Config) OverrideWith(other Config) {

}

func (s *Config) String() string {
	return ""
}
