package main

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/evidenceledger/vcdemo/certstore"
	"github.com/evidenceledger/vcdemo/issuernew"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/pkg/browser"
	"software.sslmate.com/src/go-pkcs12"
)

var (
	SigningMethodCert *SigningMethodCertStore
)

func main() {

	e := echo.New()
	e.Use(middleware.CORS())
	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Hello, World!")
	})
	e.POST("/signcredential", func(c echo.Context) error {
		return signCredential(c)
	})

	err := browser.OpenURL("https://issuersec.mycredential.eu")
	if err != nil {
		panic(err)
	}
	log.Fatal(e.Start("127.0.0.1:80"))

}

func signCredential(c echo.Context) error {

	var learCred issuernew.LEARCredentialEmployee

	// The body of the HTTP request should be a LEARCredentialEmployee
	err := echo.BindBody(c, &learCred)
	if err != nil {
		return err
	}

	// Get the CommonName of the issuer
	cn := learCred.CredentialSubject.Mandate.Mandator.CommonName
	fmt.Printf("Looking for certificate for CN: %s\n", cn)

	// Get the identity associated to the CommonName
	identity, err := GetIdentityFromCertStore(cn)
	if err != nil {
		return err
	}
	defer identity.Close()

	// Get the signer associated to the identity
	signer, err := identity.Signer()
	if err != nil {
		return err
	}

	// Sign the credential
	tok, err := issuernew.CreateLEARCredentialJWTtoken(learCred, SigningMethodCert, signer)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]any{"signed": tok})
}

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

	certBinary, err := os.ReadFile(certFilePath)
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

func GetIdentityFromCertStore(commonName string) (identity certstore.Identity, err error) {
	now := time.Now()

	//specify which store to use for windows
	certstore.UseUserStore()

	// Open the certificate store for use. This must be Close()'ed once you're
	// finished with the store and any identities it contains.
	store, err := certstore.Open()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	// Get an Identity slice, containing every identity in the store. Each of
	// these must be Close()'ed when you're done with them.
	idents, err := store.Identities()
	if err != nil {
		return nil, err
	}

	// Iterate through the identities, looking for the one we want.
	var me certstore.Identity
	for _, ident := range idents {

		crt, errr := ident.Certificate()
		if errr != nil {
			ident.Close()
			return nil, errr
		}

		fmt.Printf("%s (%s) - %s\n", crt.Subject.CommonName, crt.Subject.SerialNumber, crt.NotAfter)

		if crt.Subject.CommonName == commonName {
			if now.After(crt.NotBefore) && now.Before(crt.NotAfter) {
				me = ident
				fmt.Println(crt.Subject.CommonName)
				notAfter := crt.NotAfter
				fmt.Println("NotBefore", crt.NotBefore)
				fmt.Println("NotAfter", notAfter)
				break
			}
		}
		ident.Close()
	}

	if me == nil {
		return nil, errors.New("couldn't find my identity")
	}

	return me, nil

}

// SigningMethodCertStore implements the RSA family of signing methods.
type SigningMethodCertStore struct {
	Name string
	Hash crypto.Hash
}

func init() {
	// RS256
	SigningMethodCert = &SigningMethodCertStore{"CERTRS256", crypto.SHA256}
	jwt.RegisterSigningMethod(SigningMethodCert.Alg(), func() jwt.SigningMethod {
		return SigningMethodCert
	})

}

func (m *SigningMethodCertStore) Alg() string {
	return m.Name
}

// Verify implements token verification for the SigningMethod
// For this signing method, must be an *rsa.PublicKey structure.
func (m *SigningMethodCertStore) Verify(signingString string, sig []byte, key interface{}) error {
	var rsaKey *rsa.PublicKey
	var ok bool

	if rsaKey, ok = key.(*rsa.PublicKey); !ok {
		return fmt.Errorf("RSA verify expects *rsa.PublicKey")
	}

	// Create hasher
	if !m.Hash.Available() {
		return jwt.ErrHashUnavailable
	}
	hasher := m.Hash.New()
	hasher.Write([]byte(signingString))

	// Verify the signature
	return rsa.VerifyPKCS1v15(rsaKey, m.Hash, hasher.Sum(nil), sig)
}

// Sign implements token signing for the SigningMethod
// For this signing method, must be an *rsa.PrivateKey structure.
func (m *SigningMethodCertStore) Sign(signingString string, key any) ([]byte, error) {
	var ok bool
	var signer crypto.Signer

	if signer, ok = key.(crypto.Signer); !ok {
		return nil, fmt.Errorf("expecting a crypto.Signer key")
	}

	// Digest and sign our message.
	digest := sha256.Sum256([]byte(signingString))
	signature, err := signer.Sign(rand.Reader, digest[:], crypto.SHA256)
	if err != nil {
		return nil, err
	}
	return signature, nil
}
