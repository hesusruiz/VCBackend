package vault

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/evidenceledger/vcdemo/vault/ent"

	_ "github.com/mattn/go-sqlite3"
)

func TestDIDKey(t *testing.T) {
	type args struct {
		did string
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
	}{
		{
			name: "EBSI test DID",
			args: args{
				did: "did:key:z2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbpB33KYjExVXDTYogTZn23fXdtEpErHvhvmuu3CkikhTh6CetfaEPtKv8i4nnV8D3wnrVT7xBT9Yve7RGtBkte9o2ssiiz27V65WRiRYnEHnMJuaRwwS83sDs7m4WzhuKTJ",
			},
		},
		{
			name: "Another EBSI DID key",
			args: args{
				did: "did:key:z2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbrXvBzPktzb33FeUNFTaHY2jCWbkKjvNeLe9weXDqBE7fHqzoF5CJd1gcxtqgrGbetUfzpf9Rp7EGsB8FiQgNP2s3L5NNcfZWTeyeDAGjSDmjd7E5GYxR99KstHoSb3PXn4",
			},
		},
		{
			name: "Our DID 1",
			args: args{
				did: "did:key:zDowk6ZHp3nXCP9S5gemSLvehA5qZ9YSaqWmQMTkrsCSdqs4ZKpwuygamincgobZTVAqMRHiwNrdgi726b5281S9gkwb2kkc967YRsXVNWZfjwUKsUneKLAZk9utTfDGp5qmYaGbT4L1SBrbTBkCbynX9Yy4M7eK3SfXUHv5igWKhKYfeWMf4mztqjJGVVf9DSvjMRApg9N3W3XcbnMvc",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPublicKey, err := DIDKeyToPubKey(tt.args.did)
			if (err != nil) != tt.wantErr {
				t.Errorf("DIDKeyToPubKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			jsonbuf, _ := json.Marshal(gotPublicKey)
			fmt.Printf("%s", jsonbuf)
			didBack, err := PubKeyToDIDKey(gotPublicKey)
			if err != nil {
				t.Errorf("DIDKeyToPubKey->PubKeyToDIDKey error = %v", err)
				return
			}

			if tt.args.did != didBack {
				t.Errorf("DIDKeyToPubKey->PubKeyToDIDKey = %v, want %v", didBack, tt.args.did)
			}
		})
	}
}

func TestGenDIDKey(t *testing.T) {
	tests := []struct {
		name    string
		wantErr bool
	}{
		{
			name: "Roundtrip check",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {

			// Generate a new did:key
			gotDid, gotPrivateKey, err := GenDIDKey()
			if (err != nil) != tt.wantErr {
				t.Errorf("GenDIDKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			// Get the public key
			gotPublicKey, err := gotPrivateKey.PublicKey()
			if err != nil {
				t.Errorf("gotPrivateKey.PublicKey() error = %v", err)
				return
			}
			// Convert the public key to a did to check consistency
			derivedDID, err := PubKeyToDIDKey(gotPublicKey)
			if err != nil {
				t.Errorf("PubKeyToDIDKey() error = %v", err)
				return
			}
			if gotDid != derivedDID {
				t.Errorf("GenDIDKey->PubKeyToDIDKey gotDid = %v, derivedDID %v", gotDid, derivedDID)
			}
		})
	}
}

func TestDIDKeyPEMRoundtrip(t *testing.T) {

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

	t.Run("Roundtrip", func(t *testing.T) {

		// Generate and store a new did:key
		gotDid, _, err := v.NewDidKey()
		if err != nil {
			t.Errorf("NewDidKey() error = %v", err)
			return
		}

		// Retrieve the private key from the vault
		derivedPrivateKey, err := v.DIDKeyToPrivateKey(gotDid)
		if err != nil {
			t.Errorf("jwk.ParseKey() error = %v", err)
			return
		}

		// Get the derived Public key
		derivedPublicKey, err := derivedPrivateKey.PublicKey()
		if err != nil {
			t.Errorf("derivedPrivateKey.PublicKey() error = %v", err)
			return
		}

		// Generate a did from the derived public key
		derivedDID, err := PubKeyToDIDKey(derivedPublicKey)
		if err != nil {
			t.Errorf("PubKeyToDIDKey(derivedPublicKey) error = %v", err)
			return
		}

		// And compare the DIDs
		if derivedDID != gotDid {
			t.Errorf("gotDid = %v, derivedDID %v", gotDid, derivedDID)
			return
		}

	})
}
