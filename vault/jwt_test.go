package vault

import (
	"context"
	"testing"

	"github.com/evidenceledger/vcdemo/vault/ent"
)

func TestVault_CreateToken(t *testing.T) {

	// Open the database in memory
	db, err := ent.Open("sqlite3", "file:test.db?mode=memory&_fk=yes")
	if err != nil {
		t.Errorf("failed opening database")
		return
	}
	// Run the auto migration tool.
	if err := db.Schema.Create(context.Background()); err != nil {
		t.Errorf("failed migration of db, error = %v", err)
		return
	}

	type fields struct {
		db       *ent.Client
		ID       string
		Name     string
		Password string
	}

	v := fields{}
	v.db = db

	type args struct {
		credData map[string]any
		issuerID string
	}
	tests := []struct {
		name    string
		fields  fields
		args    args
		want    []byte
		wantErr bool
	}{
		{
			name:   "Create token",
			fields: v,
			args: args{
				credData: nil,
				issuerID: "",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := &Vault{
				db:       tt.fields.db,
				id:       tt.fields.ID,
				name:     tt.fields.Name,
				password: tt.fields.Password,
			}

			// Create a DID
			did, _, err := v.NewDidKey()
			if (err != nil) != tt.wantErr {
				t.Errorf("v.NewDidKeyPersisted error = %v", err)
				return
			}

			got, err := v.CreateJWTtoken(tt.args.credData, did)
			if (err != nil) != tt.wantErr {
				t.Errorf("Vault.CreateToken() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			t.Logf("token: %s", got)
		})
	}
}

func TestVault_SignAndVerifyToken(t *testing.T) {

	// Open the database in memory
	db, err := ent.Open("sqlite3", "file:test.db?mode=memory&_fk=yes")
	if err != nil {
		t.Errorf("failed opening database")
		return
	}
	// Run the auto migration tool.
	if err := db.Schema.Create(context.Background()); err != nil {
		t.Errorf("failed migration of db, error = %v", err)
		return
	}

	v := &Vault{
		db: db,
	}

	t.Run("SignAndVerifyToken", func(t *testing.T) {

		// Generate and store a new did:key
		gotDid, _, err := v.NewDidKey()
		if err != nil {
			t.Errorf("NewDidKey() error = %v", err)
			return
		}

		initialToken := map[string]any{
			"name": "pepe",
			"age":  "25",
		}

		// Create a token with that DID
		rawtok, err := v.CreateJWTtoken(initialToken, gotDid)
		if err != nil {
			t.Errorf("CreateToken() error = %v", err)
			return
		}

		// Verify the token
		token, err := v.VerifyJWTtoken(rawtok, gotDid)
		if err != nil {
			t.Errorf("VerifyToken() error = %v", err)
			return
		}
		asmap, err := token.AsMap(context.Background())
		if err != nil {
			t.Errorf("token.AsMap() error = %v", err)
			return
		}

		t.Logf("Token: %v", asmap)

	})
}
