package vault

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"sync"
	"text/template"

	"github.com/evidenceledger/vcdemo/vault/ent"

	"github.com/hesusruiz/vcutils/yaml"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
)

var (
	ErrDIDMethodNotSupported = errors.New("DID method not supported")
	ErrDIDInvalid            = errors.New("invalid string for DID key")
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

	// Create the directory for the db file
	if err := MakeDBDirectory(cfg); err != nil {
		return nil, err
	}

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
	storeDataSourceLocation := cfg.String("store.dataSourceLocation")
	storeDataSourceFullName := "file:" + storeDataSourceLocation + "/" + storeDataSourceName
	workDir, err := os.Getwd()
	if err != nil {
		zlog.Err(err).Msg("failed getting current working directory")
		return nil, err
	}
	zlog.Info().Str("cwd", workDir).Str("storeDriverName", storeDriverName).Str("storeDataSourceName", storeDataSourceFullName).Msg("opening vault")

	// Open the database
	v.db, err = ent.Open(storeDriverName, storeDataSourceFullName)
	if err != nil {
		zlog.Err(err).Msg("failed opening database")
		return nil, err
	}

	// Run the auto migration tool.
	if err := v.db.Schema.Create(context.Background()); err != nil {
		zlog.Err(err).Str("dataSourceName", storeDataSourceFullName).Msg("failed creating schema resources")
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

func MakeDBDirectory(cfg *yaml.YAML) error {

	if cfg == nil {
		return fmt.Errorf("no configuration received")
	}

	// Get the name of directory where the db should be created
	storeDataSourceLocation := cfg.String("store.dataSourceLocation")

	// Create the directory if it does not exists
	err := os.MkdirAll(storeDataSourceLocation, 0775)
	if err != nil {
		return err
	}

	return nil

}

func Delete(cfg *yaml.YAML) error {

	if cfg == nil {
		return fmt.Errorf("no configuration received")
	}

	// Get the name of the SQLite database file
	storeDataSourceName := cfg.String("store.dataSourceName")
	parts := strings.Split(storeDataSourceName, "?")
	if len(parts) == 0 {
		panic("invalid Issuer storeDataSourceName")
	}
	storeDataSourceName = parts[0]
	storeDataSourceLocation := cfg.String("store.dataSourceLocation")
	storeDataSourceFullName := storeDataSourceLocation + "/" + storeDataSourceName

	// Return if file does not exist
	if _, err := os.Stat(storeDataSourceFullName); err != nil {
		if os.IsNotExist(err) {
			zlog.Info().Str("name", storeDataSourceFullName).Msg("database does not exist, doing nothing")
			return nil
		} else {
			// Some error happened
			return err
		}
	}

	if err := os.Remove(storeDataSourceFullName); err != nil {
		return err
	} else {
		zlog.Info().Str("name", storeDataSourceFullName).Msg("file deleted")
	}

	return nil

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
