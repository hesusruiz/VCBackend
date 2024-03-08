package x509util

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
)

type ELSIName struct {
	CommonName             string
	SerialNumber           string
	GivenName              string
	Surname                string
	Organization           string
	OrganizationIdentifier string
	Country                string
	EmailAddress           string
}

type KeyParams struct {
	Ed25519Key bool
	EcdsaCurve string
	RsaBits    int
	ValidFrom  string
	ValidFor   time.Duration
}

type PEMCert []byte

func NewCertificate(issCert PEMCert, issPrivKey jwk.Key, subAttrs ELSIName, keyparams KeyParams) (subPrivKey jwk.Key, subCert PEMCert, err error) {

	// Decode the Issuer certificate and convert to an in-memory representation
	b, _ := pem.Decode(issCert)
	if b == nil {
		err = fmt.Errorf("error decoding PEM bytes")
		return nil, nil, err
	}

	issuerCert, err := x509.ParseCertificate(b.Bytes)
	if err != nil {
		return nil, nil, err
	}

	var issuerPrivkey any
	err = issPrivKey.Raw(&issuerPrivkey)
	if err != nil {
		return nil, nil, err
	}

	// Generate the private key of the new certificate
	var rawSubPrivKey any
	switch keyparams.EcdsaCurve {
	case "":
		if keyparams.Ed25519Key {
			_, rawSubPrivKey, err = ed25519.GenerateKey(rand.Reader)
		} else {
			rawSubPrivKey, err = rsa.GenerateKey(rand.Reader, keyparams.RsaBits)
		}
	case "P224":
		rawSubPrivKey, err = ecdsa.GenerateKey(elliptic.P224(), rand.Reader)
	case "P256":
		rawSubPrivKey, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "P384":
		rawSubPrivKey, err = ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	case "P521":
		rawSubPrivKey, err = ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	default:
		log.Fatalf("Unrecognized elliptic curve: %q", keyparams.EcdsaCurve)
	}
	if err != nil {
		log.Fatalf("Failed to generate private key: %v", err)
	}

	// ECDSA, ED25519 and RSA subject keys should have the DigitalSignature
	// KeyUsage bits set in the x509.Certificate template
	keyUsage := x509.KeyUsageDigitalSignature
	// Only RSA subject keys should have the KeyEncipherment KeyUsage bits set. In
	// the context of TLS this KeyUsage is particular to RSA key exchange and
	// authentication.
	if _, isRSA := rawSubPrivKey.(*rsa.PrivateKey); isRSA {
		keyUsage |= x509.KeyUsageKeyEncipherment
	}

	var notBefore time.Time
	if len(keyparams.ValidFrom) == 0 {
		notBefore = time.Now()
	} else {
		notBefore, err = time.Parse("Jan 2 15:04:05 2006", keyparams.ValidFrom)
		if err != nil {
			log.Fatalf("Failed to parse creation date: %v", err)
		}
	}

	notAfter := notBefore.Add(keyparams.ValidFor)

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		log.Fatalf("Failed to generate serial number: %v", err)
	}

	// Create the values for eIDAS certificates not supported directly by the Go standard library
	organizationIdentifier := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 97},
		Value: subAttrs.OrganizationIdentifier,
	}
	surname := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 4},
		Value: subAttrs.Surname,
	}
	givenname := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 42},
		Value: subAttrs.GivenName,
	}
	extraNames := []pkix.AttributeTypeAndValue{organizationIdentifier, surname, givenname}

	// Create the Subject object o fthe new certificate
	sub := pkix.Name{
		CommonName:   subAttrs.CommonName,
		SerialNumber: subAttrs.SerialNumber,
		Organization: []string{subAttrs.Organization},
		Country:      []string{subAttrs.Country},
		ExtraNames:   extraNames,
	}

	// Create the template for the new certificate from the supplied attributes
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      sub,
		NotBefore:    notBefore,
		NotAfter:     notAfter,

		KeyUsage:              keyUsage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	// Create the certificate, signing with the Issuer private key
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, issuerCert, publicKey(rawSubPrivKey), issuerPrivkey)
	if err != nil {
		log.Fatalf("Failed to create certificate: %v", err)
	}

	// PEM-encode the new certificate, ready to be saved or exported
	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		log.Fatalf("Failed to encode in PEM the certificate: %v", err)
	}
	subCert = buf.Bytes()

	// Create the JWK for the private and public pair
	subPrivKey, err = jwk.FromRaw(rawSubPrivKey)
	if err != nil {
		return nil, nil, err
	}

	return subPrivKey, subCert, nil

}

func NewCACertificate(subAttrs ELSIName, keyparams KeyParams) (subPrivKey jwk.Key, subCert PEMCert, err error) {
	var priv any
	switch keyparams.EcdsaCurve {
	case "":
		if keyparams.Ed25519Key {
			_, priv, err = ed25519.GenerateKey(rand.Reader)
		} else {
			priv, err = rsa.GenerateKey(rand.Reader, keyparams.RsaBits)
		}
	case "P224":
		priv, err = ecdsa.GenerateKey(elliptic.P224(), rand.Reader)
	case "P256":
		priv, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "P384":
		priv, err = ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	case "P521":
		priv, err = ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	default:
		log.Fatalf("Unrecognized elliptic curve: %q", keyparams.EcdsaCurve)
	}
	if err != nil {
		log.Fatalf("Failed to generate private key: %v", err)
	}

	// ECDSA, ED25519 and RSA subject keys should have the DigitalSignature
	// KeyUsage bits set in the x509.Certificate template
	keyUsage := x509.KeyUsageDigitalSignature
	// Only RSA subject keys should have the KeyEncipherment KeyUsage bits set. In
	// the context of TLS this KeyUsage is particular to RSA key exchange and
	// authentication.
	if _, isRSA := priv.(*rsa.PrivateKey); isRSA {
		keyUsage |= x509.KeyUsageKeyEncipherment
	}

	var notBefore time.Time
	if len(keyparams.ValidFrom) == 0 {
		notBefore = time.Now()
	} else {
		notBefore, err = time.Parse("Jan 2 15:04:05 2006", keyparams.ValidFrom)
		if err != nil {
			log.Fatalf("Failed to parse creation date: %v", err)
		}
	}

	notAfter := notBefore.Add(keyparams.ValidFor)

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		log.Fatalf("Failed to generate serial number: %v", err)
	}

	organizationIdentifier := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 97},
		Value: subAttrs.OrganizationIdentifier,
	}
	surname := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 4},
		Value: subAttrs.Surname,
	}
	givenname := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 42},
		Value: subAttrs.GivenName,
	}

	extraNames := []pkix.AttributeTypeAndValue{organizationIdentifier, surname, givenname}

	subject := pkix.Name{
		CommonName:   subAttrs.CommonName,
		SerialNumber: subAttrs.SerialNumber,
		Organization: []string{subAttrs.Organization},
		Country:      []string{subAttrs.Country},
		ExtraNames:   extraNames,
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      subject,
		NotBefore:    notBefore,
		NotAfter:     notAfter,

		KeyUsage:              keyUsage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	template.IsCA = true
	template.KeyUsage |= x509.KeyUsageCertSign

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, publicKey(priv), priv)
	if err != nil {
		log.Fatalf("Failed to create certificate: %v", err)
	}

	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		log.Fatalf("Failed to encode in PEM the certificate: %v", err)
	}
	subCert = buf.Bytes()

	// Create the JWK for the private and public pair
	subPrivKey, err = jwk.FromRaw(priv)
	if err != nil {
		return nil, nil, err
	}

	return subPrivKey, subCert, nil

}

func publicKey(priv any) any {
	switch k := priv.(type) {
	case *rsa.PrivateKey:
		return &k.PublicKey
	case *ecdsa.PrivateKey:
		return &k.PublicKey
	case ed25519.PrivateKey:
		return k.Public().(ed25519.PublicKey)
	default:
		return nil
	}
}
