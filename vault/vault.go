package vault

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"sync"
	"text/template"

	"github.com/evidenceledger/vcdemo/vault/ent"

	// "github.com/evidenceledger/vcdemo/vault2/ent/user"
	// "github.com/evidenceledger/vcdemo/internal/didkey"
	// "github.com/evidenceledger/vcdemo/internal/jwk"
	// "github.com/evidenceledger/vcdemo/internal/jwt"
	// p2pcrypto "github.com/libp2p/go-libp2p/core/crypto"

	"github.com/hesusruiz/vcutils/yaml"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
)

var (
	ErrDIDMethodNotSupported = errors.New("DID method not supported")
	ErrDIDKeyInvalid         = errors.New("invalid string for DID key")
	ErrInvalidCodec          = errors.New("invalid codec")
)

func init() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zlog.Logger = zlog.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	zlog.Logger = zlog.With().Caller().Logger()
}

type Vault struct {
	db           *ent.Client
	id           string
	name         string
	password     string
	credTemplate *template.Template
}

var mutexForNew sync.Mutex

// Must is a helper that wraps a call to a function returning (*Vault, error)
// and panics if the error is non-nil. It is intended for use in program
// initialization where the starting process has to be aborted in case of error.
// Usage is like this:
//
//	var issuerVault = vault.Must(vault.New(cfg))
func Must(v *Vault, err error) *Vault {
	if err != nil {
		panic(err)
	}

	return v
}

const defaultCredentialTemplatesDir = "vault/templates"

// New opens or creates a repository storing users, keys and credentials
func New(cfg *yaml.YAML) (v *Vault, err error) {

	if cfg == nil {
		return nil, fmt.Errorf("no configuration received")
	}

	// Make sure only one thread performs initialization of the critical structures.
	// including migrations
	mutexForNew.Lock()
	defer mutexForNew.Unlock()

	v = &Vault{}

	// Our identity
	v.id = cfg.String("id")
	v.name = cfg.String("name")
	v.password = cfg.String("password")

	// Initialize the templates for credential creation
	credentialTemplatesDir := cfg.String("credentialTemplatesDir", defaultCredentialTemplatesDir)
	credentialTemplatesPath := path.Join(credentialTemplatesDir, "*.tpl")
	v.InitCredentialTemplates(credentialTemplatesPath)

	// Get the configured parameters for the database
	storeDriverName := cfg.String("store.driverName")
	storeDataSourceName := cfg.String("store.dataSourceName")
	workDir, err := os.Getwd()
	if err != nil {
		zlog.Err(err).Msg("failed getting current working directory")
		return nil, err
	}
	zlog.Info().Str("cwd", workDir).Str("storeDriverName", storeDriverName).Str("storeDataSourceName", storeDataSourceName).Msg("opening vault")

	// Open the database
	v.db, err = ent.Open(storeDriverName, storeDataSourceName)
	if err != nil {
		zlog.Err(err).Msg("failed opening database")
		return nil, err
	}

	// Run the auto migration tool.
	if err := v.db.Schema.Create(context.Background()); err != nil {
		zlog.Err(err).Str("dataSourceName", storeDataSourceName).Msg("failed creating schema resources")
		return nil, err
	}

	return v, nil
}

// NewFromDBClient uses an existing client connection for creating the storage object
func NewFromDBClient(entClient *ent.Client, cfg *yaml.YAML) (v *Vault) {

	v = &Vault{}
	v.db = entClient

	v.id = cfg.String("id")
	v.name = cfg.String("name")
	v.password = cfg.String("password")

	return v
}

func (v *Vault) DB() *ent.Client {
	return v.db
}

func JSONRemarshal(bytes []byte) ([]byte, error) {
	var ifce interface{}
	err := json.Unmarshal(bytes, &ifce)
	if err != nil {
		return nil, err
	}
	return json.Marshal(ifce)
}
