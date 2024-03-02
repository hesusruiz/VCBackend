package vault

import (
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func TestGenDIDelsi(t *testing.T) {
	tests := []struct {
		name       string
		sub        ELSISubject
		ed25519Key bool
		ecdsaCurve string
		rsaBits    int
		isCA       bool
		validFrom  string
		validFor   time.Duration
		wantErr    bool
	}{
		{
			name: "Roundtrip check",
			sub: ELSISubject{
				OrganizationIdentifier: "VATES-12345678",
				CommonName:             "56565656V Beppe Cafiso",
				SerialNumber:           "56565656V",
				Organization:           "GoodAir",
				Country:                "IT",
			},
			ed25519Key: true,
			isCA:       true,
			validFrom:  "Jan 1 15:04:05 2011",
			validFor:   365 * 24 * time.Hour,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {

			// Generate a new did:elsi
			gotDid, gotPrivateKey, pemBytes, err := GenDIDelsi(tt.sub, tt.ed25519Key, tt.ecdsaCurve, tt.rsaBits, tt.isCA, tt.validFrom, tt.validFor)
			if (err != nil) != tt.wantErr {
				t.Errorf("GenDIDKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if gotDid != "did:elsi:"+tt.sub.OrganizationIdentifier {
				t.Errorf("gotDid error = %v, want %v", gotDid, "did:elsi:"+tt.sub.OrganizationIdentifier)
				return
			}

			b, _ := pem.Decode(pemBytes)
			if b == nil {
				t.Errorf("error decoding PEM bytes")
				return
			}

			newCert, err := x509.ParseCertificate(b.Bytes)
			if err != nil {
				t.Errorf("ParseCertificate error = %v", err)
				return
			}

			if newCert.Subject.Organization[0] != tt.sub.Organization {
				t.Errorf("ParseCertificate error = %v, want %v", newCert.Subject.Organization[0], tt.sub.Organization)
				return
			}
			// Get the public key
			_, err = gotPrivateKey.PublicKey()
			if err != nil {
				t.Errorf("gotPrivateKey.PublicKey() error = %v", err)
				return
			}
		})
	}
}
