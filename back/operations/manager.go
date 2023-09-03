package operations

import (
	"github.com/hesusruiz/vcbackend/vault"
	"github.com/hesusruiz/vcutils/yaml"
)

type Manager struct {
	vault *vault.Vault
	cfg   *yaml.YAML
}

func NewManager(v *vault.Vault, cfg *yaml.YAML) *Manager {

	manager := &Manager{
		vault: v,
		cfg:   cfg,
	}
	return manager

}

func (m *Manager) User() *User {
	return &User{
		db:    m.vault.Client,
		vault: m.vault,
	}
}
