package x509util

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"

	"github.com/evidenceledger/vcdemo/vault/x509util"
	"github.com/pkg/errors"
	"software.sslmate.com/src/go-pkcs12"
)

type KeyParams struct {
	Ed25519Key bool
	EcdsaCurve string
	RsaBits    int
	ValidFrom  string
	ValidFor   time.Duration
}

const defaultRsaBits = 2048
const defaultValidFor = 365 * 24 * time.Hour

type PEMCert []byte

var attributeTypeNames = map[string]string{
	"2.5.4.6":  "C",
	"2.5.4.10": "O",
	"2.5.4.11": "OU",
	"2.5.4.3":  "CN",
	"2.5.4.5":  "SERIALNUMBER",
	"2.5.4.97": "ORGANIZATIONIDENTIFIER",
	"2.5.4.7":  "L",
	"2.5.4.8":  "ST",
	"2.5.4.9":  "STREET",
	"2.5.4.17": "POSTALCODE",
}

// NewCAELSICertificateRaw creates a self-signed CA test certificate with the proper eIDAS fields,
// like organizationIdentifier.
// If keyparams is empty, an RSA key with 2048 bits is generated and used to sign the certificate, which is
// valid for one year since creation date.
func NewCAELSICertificateRaw(subAttrs ELSIName, keyparams KeyParams) (subPrivKey any, subCert *x509.Certificate, err error) {
	var priv any
	switch keyparams.EcdsaCurve {
	case "":
		if keyparams.Ed25519Key {
			_, priv, err = ed25519.GenerateKey(rand.Reader)
		} else {
			if keyparams.RsaBits == 0 {
				keyparams.RsaBits = defaultRsaBits
			}
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
		return nil, nil, fmt.Errorf("unrecognized elliptic curve: %q", keyparams.EcdsaCurve)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate private key: %w", err)
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

	// By default, the certificate is valid since it is created
	var notBefore time.Time
	if len(keyparams.ValidFrom) == 0 {
		notBefore = time.Now()
	} else {
		notBefore, err = time.Parse("Jan 2 15:04:05 2006", keyparams.ValidFrom)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to parse creation date: %w", err)
		}
	}

	// Set validity if not specified
	if keyparams.ValidFor == 0 {
		keyparams.ValidFor = defaultValidFor
	}
	notAfter := notBefore.Add(keyparams.ValidFor)

	// Generate a new random SerialNumber for the certificate
	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	// Convert the subject attributes to the proper format
	extraNames := subAttrs.ToATVSequence()
	subject := pkix.Name{
		ExtraNames: extraNames,
	}

	// Create the template with all the required data
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      subject,
		NotBefore:    notBefore,
		NotAfter:     notAfter,

		KeyUsage:              keyUsage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageEmailProtection},
		BasicConstraintsValid: true,
	}

	// This certificate can be used to sign (issue) other certificates
	template.IsCA = true
	template.KeyUsage |= x509.KeyUsageCertSign

	// Create the certificate and receive a DER-encoded byte array.
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, publicKey(priv), priv)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create x509 certificate: %w", err)
	}

	// We will return the certificate as a x509.Certificate object
	newCert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return nil, nil, err
	}

	return priv, newCert, nil

}

func NewELSICertificateRaw(issCert *x509.Certificate, issPrivKey any, subAttrs ELSIName, keyparams KeyParams) (subPrivKey any, subCert *x509.Certificate, err error) {
	var priv any

	// Generate the private key of the new certificate
	switch keyparams.EcdsaCurve {
	case "":
		if keyparams.Ed25519Key {
			_, priv, err = ed25519.GenerateKey(rand.Reader)
		} else {
			if keyparams.RsaBits == 0 {
				keyparams.RsaBits = defaultRsaBits
			}
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
		return nil, nil, fmt.Errorf("unrecognized elliptic curve: %q", keyparams.EcdsaCurve)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate private key: %w", err)
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

	// By default, the certificate is valid since it is created
	var notBefore time.Time
	if len(keyparams.ValidFrom) == 0 {
		notBefore = time.Now()
	} else {
		notBefore, err = time.Parse("Jan 2 15:04:05 2006", keyparams.ValidFrom)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to parse creation date: %w", err)
		}
	}

	// Set validity if not specified
	if keyparams.ValidFor == 0 {
		keyparams.ValidFor = defaultValidFor
	}
	notAfter := notBefore.Add(keyparams.ValidFor)

	// Generate a new random SerialNumber for the certificate
	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	// Convert the subject attributes to the proper format
	extraNames := subAttrs.ToATVSequence()
	subject := pkix.Name{
		ExtraNames: extraNames,
	}

	// Create the template with all the required data
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      subject,
		NotBefore:    notBefore,
		NotAfter:     notAfter,

		KeyUsage:              keyUsage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageEmailProtection},
		BasicConstraintsValid: true,
	}

	pubKey := publicKey(priv)

	publicKeyBytes, err := marshalPublicKey(pubKey)
	if err != nil {
		return nil, nil, err
	}

	h := sha1.Sum(publicKeyBytes)
	subjectKeyId := h[:]

	template.SubjectKeyId = subjectKeyId

	// Create the certificate and receive a DER-encoded byte array.
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, issCert, pubKey, issPrivKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create x509 certificate: %w", err)
	}

	// We will return the certificate as a x509.Certificate object
	newCert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return nil, nil, err
	}

	return priv, newCert, nil

}

// pkcs1PublicKey reflects the ASN.1 structure of a PKCS #1 public key.
type pkcs1PublicKey struct {
	N *big.Int
	E int
}

func marshalPublicKey(pub any) (publicKeyBytes []byte, err error) {
	switch pub := pub.(type) {
	case *rsa.PublicKey:
		publicKeyBytes, err = asn1.Marshal(pkcs1PublicKey{
			N: pub.N,
			E: pub.E,
		})
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("x509: unsupported public key type: %T", pub)
	}

	return publicKeyBytes, nil
}

// ParseCertificate extracts the first certificate from the given PEM string.
// In addition to the whole certificate, it also returns the parsed issuer and subject fields.
func ParseCertificateFromPEM(pemData []byte) (cert *x509.Certificate, issuer *ELSIName, subject *ELSIName, err error) {
	var block *pem.Block
	for len(pemData) > 0 {
		// Get the next block, bypassing the headers
		block, pemData = pem.Decode(pemData)
		if block == nil {
			return nil, nil, nil, errors.New("error decoding pem block")
		}

		// Continue until we find a certificate or the end of the PEM data
		if block.Type != "CERTIFICATE" || len(block.Headers) != 0 {
			continue
		}

		// Try to parse the certificate from the block
		cert, issuer, subject, err := ParseEIDASCertDer(block.Bytes)
		if err != nil {
			return nil, nil, nil, errors.Wrap(err, "error parsing certificate")
		}
		return cert, issuer, subject, nil
	}

	return nil, nil, nil, errors.New("error parsing certificate: no certificate found")
}

func ParseEIDASCertB64Der(certDer string) (cert *x509.Certificate, issuer *ELSIName, subject *ELSIName, err error) {

	rawCert, err := base64.StdEncoding.DecodeString(certDer)
	if err != nil {
		return nil, nil, nil, err
	}

	return ParseEIDASCertDer(rawCert)
}

func ParseEIDASCertDer(rawCert []byte) (cert *x509.Certificate, issuer *ELSIName, subject *ELSIName, err error) {

	cert, err = x509.ParseCertificate(rawCert)
	if err != nil {
		return nil, nil, nil, err
	}

	subject = ParseEIDASNameFromATVSequence(cert.Subject.Names)
	issuer = ParseEIDASNameFromATVSequence(cert.Issuer.Names)

	return cert, issuer, subject, nil
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

// ELSIName represents an X.509 distinguished name. This only includes the common
// elements of a DN. Note that ELSIName is only an approximation of the X.509
// structure. If an accurate representation is needed, asn1.Unmarshal the raw
// subject or issuer as an [RDNSequence].
type ELSIName struct {
	Country                string `json:"country,omitempty"`
	Organization           string `json:"organization,omitempty"`
	OrganizationalUnit     string `json:"organizational_unit,omitempty"`
	Locality               string `json:"locality,omitempty"`
	Province               string `json:"province,omitempty"`
	StreetAddress          string `json:"street_address,omitempty"`
	PostalCode             string `json:"postal_code,omitempty"`
	SerialNumber           string `json:"serial_number,omitempty"`
	CommonName             string `json:"common_name,omitempty"`
	GivenName              string `json:"given_name,omitempty"`
	Surname                string `json:"surname,omitempty"`
	OrganizationIdentifier string `json:"organization_identifier,omitempty"`
	EmailAddress           string `json:"email_address,omitempty"`
}

func (e ELSIName) String() string {
	jsonRaw, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return "<error>"
	}
	return string(jsonRaw)
}

func ParseEIDASNameFromATVSequence(rdn []pkix.AttributeTypeAndValue) *ELSIName {

	n := &ELSIName{}

	for _, atv := range rdn {
		value, ok := atv.Value.(string)
		if !ok {
			continue
		}

		t := atv.Type
		if len(t) == 4 && t[0] == 2 && t[1] == 5 && t[2] == 4 {
			switch t[3] {
			case 3:
				n.CommonName = value
			case 4:
				n.Surname = value
			case 42:
				n.GivenName = value
			case 5:
				n.SerialNumber = value
			case 97:
				n.OrganizationIdentifier = value
			case 6:
				n.Country = value
			case 7:
				n.Locality = value
			case 8:
				n.Province = value
			case 9:
				n.StreetAddress = value
			case 10:
				n.Organization = value
			case 11:
				n.OrganizationalUnit = value
			case 17:
				n.PostalCode = value
			}
		}
	}
	return n
}

var (
	oidCommonName             = []int{2, 5, 4, 3}
	oidSurname                = []int{2, 5, 4, 4}
	oidGivenName              = []int{2, 5, 4, 42}
	oidSerialNumber           = []int{2, 5, 4, 5}
	oidOrganization           = []int{2, 5, 4, 10}
	oidOrganizationIdentifier = []int{2, 5, 4, 97}
	oidCountry                = []int{2, 5, 4, 6}
	oidLocality               = []int{2, 5, 4, 7}
	oidProvince               = []int{2, 5, 4, 8}
	oidStreetAddress          = []int{2, 5, 4, 9}
	oidOrganizationalUnit     = []int{2, 5, 4, 11}
	oidPostalCode             = []int{2, 5, 4, 17}
)

func (n ELSIName) ToATVSequence() (ret []pkix.AttributeTypeAndValue) {

	if len(n.CommonName) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidCommonName, Value: n.CommonName})
	}
	if len(n.Surname) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidSurname, Value: n.Surname})
	}
	if len(n.GivenName) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidGivenName, Value: n.GivenName})
	}
	if len(n.SerialNumber) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidSerialNumber, Value: n.SerialNumber})
	}
	if len(n.Organization) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidOrganization, Value: n.Organization})
	}
	if len(n.OrganizationIdentifier) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidOrganizationIdentifier, Value: n.OrganizationIdentifier})
	}
	if len(n.Country) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidCountry, Value: n.Country})
	}
	if len(n.Locality) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidLocality, Value: n.Locality})
	}
	if len(n.StreetAddress) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidStreetAddress, Value: n.StreetAddress})
	}
	if len(n.Province) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidProvince, Value: n.Province})
	}
	if len(n.OrganizationalUnit) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidOrganizationalUnit, Value: n.OrganizationalUnit})
	}
	if len(n.PostalCode) > 0 {
		ret = append(ret, pkix.AttributeTypeAndValue{Type: oidPostalCode, Value: n.PostalCode})
	}
	return ret

}

func DisplayP12Cert(inputFileName string, password string) error {

	_, cert, _, err := ReadPKCS12File(inputFileName, password)
	if err != nil {
		return err
	}

	subject := x509util.ParseEIDASNameFromATVSequence(cert.Subject.Names)
	issuer := x509util.ParseEIDASNameFromATVSequence(cert.Issuer.Names)

	fmt.Println("Certificate in PKCS12 format")
	if cert.IsCA {
		fmt.Println("Certificate is a CA")
	} else {
		fmt.Println("Certificate is not a CA")
	}

	fmt.Println("Issuer:", issuer)
	fmt.Println("Subject:", subject)

	return nil
}

func DisplayPEMCert(inputFileName string, password string) error {

	// Read the PEM file
	pemData, err := os.ReadFile(inputFileName)
	if err != nil {
		return err
	}

	cert, issuer, subject, err := x509util.ParseCertificateFromPEM(pemData)
	if err != nil {
		return err
	}

	fmt.Println("Certificate in PEM format")
	if cert.IsCA {
		fmt.Println("Certificate is a CA")
	} else {
		fmt.Println("Certificate is not a CA")
	}

	fmt.Println("Issuer:", issuer)
	fmt.Println("Subject:", subject)

	return nil
}

func SaveCertificateToPkcs12File(outputFileName string, privateKey any, cert *x509.Certificate, pass string) error {

	pfxData, err := pkcs12.Modern2023.Encode(privateKey, cert, nil, pass)
	if err != nil {
		panic(err)
	}

	pfxFile, err := os.OpenFile(outputFileName, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to open %s for writing: %w", outputFileName, err)
	}
	_, err = pfxFile.Write(pfxData)
	if err != nil {
		return fmt.Errorf("error writing to %s: %w", outputFileName, err)
	}

	if err := pfxFile.Close(); err != nil {
		return fmt.Errorf("error closing %s: %w", outputFileName, err)
	}

	return nil

}

func ReadPKCS12File(fileName string, password string) (privateKey any, certificate *x509.Certificate, caCerts []*x509.Certificate, err error) {

	certBinary, err := os.ReadFile(fileName)
	if err != nil {
		return nil, nil, nil, err
	}

	return pkcs12.DecodeChain(certBinary, password)
}

// LookupEnvOrString gets a value from the environment or returns the specified default value
func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

// GetConfigPrivateKey retrieves the private key from a PKCS12 file in the following locations:
// 1) the location specified in the environment variable CERT_FILE_PATH.
// 2) $HOME/.certs/testcert.pfx.
//
// The password used is the following:
// 1) specified in the environment variable CERT_PASSWORD.
// 2) the content of the file specified in the env variable CERT_PASSWORD_FILE.
func GetConfigPrivateKey() (privateKey any, certificate *x509.Certificate, caCerts []*x509.Certificate, err error) {

	userHome, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	certFilePath := LookupEnvOrString("CERT_FILE_PATH", filepath.Join(userHome, ".certs", "testcert.pfx"))
	password := LookupEnvOrString("CERT_PASSWORD", "")
	if len(password) == 0 {
		passwordFilePath := LookupEnvOrString("CERT_PASSWORD_FILE", filepath.Join(userHome, ".certs", "pass.txt"))
		passwordBytes, err := os.ReadFile(passwordFilePath)
		if err != nil {
			return nil, nil, nil, err
		}
		password = string(bytes.TrimSpace(passwordBytes))
	}

	return ReadPKCS12File(certFilePath, password)
}
