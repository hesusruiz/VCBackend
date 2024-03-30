package x509util

import (
	"testing"
	"time"
)

func TestParseEIDASCertB64Der(t *testing.T) {
	type args struct {
		certDer string
	}
	tests := []struct {
		name             string
		args             args
		wantSerialNumber string
		wantErr          bool
	}{
		{
			name: "my certificate",
			args: args{
				certDer: "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",
			},
			wantSerialNumber: "IDCES-21442837Y",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, subject, err := ParseEIDASCertB64Der(tt.args.certDer)
			if (err != nil) != tt.wantErr {
				t.Errorf("decodeeIDASCert() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			// Check if the eIDAS organizationIdentifier field is correct
			if subject.SerialNumber != tt.wantSerialNumber {
				t.Errorf("NewCAELSICertificate() gotOrganizationIdentifier = %v, want %v", subject.SerialNumber, tt.wantSerialNumber)
			}

			// if !reflect.DeepEqual(got, tt.want) {
			// 	t.Errorf("decodeeIDASCert() = %v, want %v", got, tt.want)
			// }
		})
	}
}

func TestNewCAELSICertificate(t *testing.T) {
	type args struct {
		subAttrs  ELSIName
		keyparams KeyParams
	}
	tests := []struct {
		name                       string
		args                       args
		wantOrganizationIdentifier string
		wantErr                    bool
	}{
		{
			name:                       "Roundtrip check",
			wantOrganizationIdentifier: "VATES-12345678",
			args: args{
				subAttrs: ELSIName{
					OrganizationIdentifier: "VATES-12345678",
					CommonName:             "56565656V Beppe Cafiso",
					GivenName:              "Beppe",
					Surname:                "Cafiso",
					EmailAddress:           "beppe@goodair.com",
					SerialNumber:           "56565656V",
					Organization:           "GoodAir",
					Country:                "IT",
				},
				keyparams: KeyParams{
					Ed25519Key: true,
					ValidFrom:  "Jan 1 15:04:05 2022",
					ValidFor:   365 * 24 * time.Hour,
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {

			// Create a new certificate in PEM format
			_, gotSubCert, err := NewCAELSICertificate(tt.args.subAttrs, tt.args.keyparams)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewCAELSICertificate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			// Parse the PEM string and return the Subject from the certificate
			_, _, subject, err := ParseCertificateFromPEM(gotSubCert)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewCAELSICertificate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			// Check if the eIDAS organizationIdentifier field is correct
			if subject.OrganizationIdentifier != tt.wantOrganizationIdentifier {
				t.Errorf("NewCAELSICertificate() gotOrganizationIdentifier = %v, want %v", subject.OrganizationIdentifier, tt.wantOrganizationIdentifier)
			}
		})
	}
}
