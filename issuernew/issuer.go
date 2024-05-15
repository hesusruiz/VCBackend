package issuernew

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"

	"github.com/Masterminds/sprig/v3"
	"github.com/evidenceledger/vcdemo/vault/x509util"
	"github.com/google/uuid"
	my "github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"

	"github.com/multiformats/go-multibase"
	"github.com/multiformats/go-multicodec"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/security"
	pbtemplate "github.com/pocketbase/pocketbase/tools/template"
	"github.com/skip2/go-qrcode"
	"software.sslmate.com/src/go-pkcs12"
)

const defaultCredentialTemplatesDir = "vault/templates"
const signerApiGroupPrefix = "/apisigner"
const userApiGroupPrefix = "/apiuser"

var credTemplate *template.Template

func initCredentialTemplates(credentialTemplatesPath string) {

	credTemplate = template.Must(template.New("base").Funcs(sprig.TxtFuncMap()).ParseGlob(credentialTemplatesPath))

}

// LookupEnvOrString gets a value from the environment or returns the specified default value
func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

type IssuerServer struct {
	App  *pocketbase.PocketBase
	cfg  *my.YAML
	treg *pbtemplate.Registry
}

func New(cfg *my.YAML) *IssuerServer {
	is := &IssuerServer{}
	is.App = pocketbase.New()
	is.cfg = cfg
	return is
}

// Start initializes the Issuer hooks and adds routes and spawns the server to handle them
func (is *IssuerServer) Start() error {

	app := is.App
	cfg := is.cfg

	// Check that we can access to the certificate
	if _, err := getConfigPrivateKey(); err != nil {
		return err
	}

	// Create the HTML templates registry
	is.treg = pbtemplate.NewRegistry()
	is.treg.AddFuncs(sprig.FuncMap())

	// Initialize the Go HTML templates for credential creation
	credentialTemplatesDir := cfg.String("credentialTemplatesDir", defaultCredentialTemplatesDir)
	credentialTemplatesPath := path.Join(credentialTemplatesDir, "*.tpl")
	initCredentialTemplates(credentialTemplatesPath)

	// Perform initialization of Pocketbase before serving requests
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {

		dao := e.App.Dao()

		// The configured TCP address for the server to listen
		e.Server.Addr = cfg.String("listenAddress", ":8090")

		// The default Settings
		settings, _ := dao.FindSettings()
		settings.Meta.AppName = cfg.String("Meta.appName", "DOME Issuer")
		settings.Meta.AppUrl = cfg.String("Meta.appUrl", "issuer.mycredential.eu")
		settings.Logs.MaxDays = 2

		settings.Meta.SenderName = cfg.String("Meta.senderName", "Support")
		settings.Meta.SenderAddress = cfg.String("Meta.senderAddress", "admin@mycredential.eu")

		settings.Smtp.Enabled = cfg.Bool("SMTP.Enabled", true)
		settings.Smtp.Host = cfg.String("SMTP.Host", "example.com")
		settings.Smtp.Port = cfg.Int("SMTP.Port", 465)
		settings.Smtp.Tls = cfg.Bool("SMTP.Tls", true)
		settings.Smtp.Username = cfg.String("SMTP.Username", "admin@mycredential.eu")
		settings.Smtp.Password = cfg.String("SMTP.Password")

		// Write the settings to the database
		err := dao.SaveSettings(settings)
		if err != nil {
			return err
		}
		log.Println("Running as", settings.Meta.AppName, "in", settings.Meta.AppUrl)

		// Create the default admin if needed
		adminEmail := cfg.String("admin.email")
		if len(adminEmail) == 0 {
			log.Fatal("Email for server administrator is not specified in the configuration file")
		}

		admin, err := dao.FindAdminByEmail(adminEmail)
		if err != nil {
			return err
		}
		if admin == nil {
			admin = &models.Admin{}
			admin.Email = adminEmail
			admin.SetPassword("1234567890")
			err = dao.SaveAdmin(admin)
			if err != nil {
				return err
			}
			log.Println("Default Admin added:", admin.Email)
		} else {
			log.Println("Default Admin already existed:", admin.Email)
		}

		// Middleware to select the home page depending on the type of user (signers or holders)
		e.Router.Use(selectHomePage)

		// Serves static files from the provided public dir (if exists)
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./www"), false))

		// Add routes for Signers
		is.addSignerRoutes(e)

		// Add routes for Holders
		is.addUserRoutes(e)

		return nil
	})

	// Hook to add certificate information when creating a user which can sign credentials
	app.OnRecordBeforeCreateRequest("signers").Add(func(e *core.RecordCreateEvent) error {

		// The request must have information about the x509 certificate used for client auth
		receivedCert, _, subject, err := getX509UserFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}

		// Perform some verifications of the certificate
		if len(receivedCert.SubjectKeyId) == 0 {
			return fmt.Errorf("invalid certificate, Subject Key Identifier does not exist")
		}
		if len(subject.SerialNumber) == 0 {
			return fmt.Errorf("invalid certificate, Subject SerialNumber does not exist")
		}
		if len(subject.CommonName) == 0 {
			return fmt.Errorf("invalid certificate, Subject CommonName does not exist")
		}

		// Enrich the incoming Record with the subject info in the certificate
		e.Record.Set("ski", hex.EncodeToString(receivedCert.SubjectKeyId))
		e.Record.Set("commonName", subject.CommonName)
		e.Record.Set("serialNumber", subject.SerialNumber)
		e.Record.Set("country", subject.Country)

		// If it is a personal certificate, fill the Organization info with the personal one
		if len(subject.Organization) > 0 {
			e.Record.Set("organization", subject.Organization)
		} else {
			e.Record.Set("organization", subject.CommonName)
		}

		if len(subject.OrganizationIdentifier) > 0 {
			e.Record.Set("organizationIdentifier", subject.OrganizationIdentifier)
		} else {
			e.Record.Set("organizationIdentifier", subject.SerialNumber)
		}

		cert, err := getCertPEMFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}

		// Enrich the Record with the new CA certificate, which will be used to sign
		e.Record.Set("certificatePem", string(cert))

		return nil
	})

	// Hook to ensure that authorization for "signers" requires a client x509 certificate
	app.OnRecordBeforeAuthWithPasswordRequest("signers").Add(func(e *core.RecordAuthWithPasswordEvent) error {

		receivedCert, _, subject, err := getX509UserFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}
		log.Println("OnRecordBeforeAuthWithPasswordRequest")
		log.Println(subject)

		// Check if an auth record was found (based only on the email send by the user)
		if e.Record == nil {
			return apis.NewUnauthorizedError("Please register your email before", nil)
		}

		// Check if the Subject Key Identifier are the same in the received certificate and in the registered one
		receivedSKI := hex.EncodeToString(receivedCert.SubjectKeyId)
		log.Printf("SubjectKeyId: %s", receivedCert.SubjectKeyId)

		registeredSKI := e.Record.GetString("ski")
		log.Printf("ReceivedSKI: %s - RegisteredSKI: %s", receivedSKI, registeredSKI)

		if receivedSKI != registeredSKI {
			return fmt.Errorf("invalid SKI")
		}

		return nil
	})

	// Hook to ensure that creation of credentials requires a client x509 certificate
	app.OnRecordBeforeCreateRequest("credentials").Add(func(e *core.RecordCreateEvent) error {
		log.Println("OnRecordBeforeCreateRequest(credentials)")

		_, _, subject, err := getX509UserFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}
		log.Println(subject)

		return nil
	})

	// Hook to send an email reminder to the subject when a new credential is created
	app.OnRecordAfterCreateRequest("credentials").Add(func(e *core.RecordCreateEvent) error {
		log.Println("OnRecordAfterCreateRequest(credentials)")

		status := e.Record.GetString("status")
		if status == "offered" {

			// Send an email to the user
			return is.sendEmailReminder(e.Record.Id)

		}

		return nil
	})

	app.OnRecordAfterUpdateRequest("credentials").Add(func(e *core.RecordUpdateEvent) error {
		log.Println("OnRecordAfterUpdateRequest(credentials)")

		status := e.Record.GetString("status")
		switch status {
		case "offered":
			log.Println("Status is OFFERED")
		case "tobesigned":
			log.Println("Status is TOBESIGNED")
		case "signed":
			log.Println("Status is SIGNED")
		}

		// Check if the user already exists, to create a new one if needed
		user, err := app.Dao().FindAuthRecordByEmail("users", e.Record.Email())

		pass := security.RandomString(10)

		if err == sql.ErrNoRows {
			// The user does not exist, must create it
			collection, err := app.Dao().FindCollectionByNameOrId("users")
			if err != nil {
				return err
			}
			user = models.NewRecord(collection)

			user.SetPassword(pass)
			user.SetEmail(e.Record.Email())
			user.SetUsername(pass)

			// TODO: we will later require verification process
			user.SetVerified(true)

			tokenKey := user.TokenKey()
			log.Println("Token key", tokenKey)

			if err := app.Dao().SaveRecord(user); err != nil {
				return err
			}

		} else if err != nil {
			// An error occurred (different from sql.ErrNoRows)
			return err
		}

		log.Println(user.Email())

		if status == "signed" {

			// Send an email to the user
			return is.sendEmailReminder(e.Record.Id)

		}

		return nil
	})

	return is.App.Start()
}

// selectHomePage determines the HTML file to serve for the root path, depending on wether the server requires client certificate
// authorization or not.
func selectHomePage(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if c.Request().URL.Path == "/" {
			log.Println("My host is", c.Request().Host)
			clientCertDer := c.Request().Header.Get("Tls-Client-Certificate")
			if clientCertDer == "" {
				return c.File("www/issuerLandingPage.html")
			} else {
				return c.File("www/indexSigner.html")
			}
		}

		return next(c) // proceed with the request chain
	}
}

// getX509UserFromHeader retrieves the 'issuer' and 'subject' information from the
// incoming x509 client certificate
func getX509UserFromHeader(r *http.Request) (cert *x509.Certificate, issuer *x509util.ELSIName, subject *x509util.ELSIName, err error) {

	// Get the clientCertDer value before processing the request
	// This HTTP request header has been set by the reverse proxy in front of the application
	clientCertDer := r.Header.Get("Tls-Client-Certificate")
	if clientCertDer == "" {
		log.Println("Client certificate not provided")
		return nil, nil, nil, apis.NewBadRequestError("Invalid request", nil)
	}

	cert, issuer, subject, err = x509util.ParseEIDASCertB64Der(clientCertDer)
	if err != nil {
		log.Println("parsing eIDAS certificate", err)
		return nil, nil, nil, err
	}

	return cert, issuer, subject, nil

}

func getCertPEMFromHeader(r *http.Request) (cert x509util.PEMCert, err error) {

	// Get the clientCertDer value
	// This HTTP request header has been set by the reverse proxy in front of the application
	clientCertDer := r.Header.Get("Tls-Client-Certificate")
	if clientCertDer == "" {
		return nil, fmt.Errorf("no x509 certificate in request header")
	}

	rawCert, err := base64.StdEncoding.DecodeString(clientCertDer)
	if err != nil {
		return nil, err
	}

	// Encode the DER buffer into PEM, so it can be stored on disk or database
	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: rawCert}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// RequireAdminOrX509Auth middleware requires a request to have
// a valid admin Authorization header or x509 client certification set.
func RequireAdminOrX509Auth() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			admin, _ := c.Get(apis.ContextAdminKey).(*models.Admin)
			if admin != nil {
				return next(c)
			}
			_, _, _, err := getX509UserFromHeader(c.Request())
			if err != nil {
				return apis.NewUnauthorizedError("The request requires admin or x509 authorization token to be set.", nil)
			}

			return next(c)
		}
	}
}

func getConfigPrivateKey() (any, error) {

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
			return nil, err
		}
		password = string(bytes.TrimSpace(passwordBytes))
	}

	certBinary, err := os.ReadFile(certFilePath)
	if err != nil {
		return nil, err
	}

	privateKey, _, _, err := pkcs12.DecodeChain(certBinary, password)
	if err != nil {
		return nil, err
	}

	return privateKey, nil
}

func newRandomString() string {
	newID, _ := uuid.NewRandom()
	return newID.String()
}

// GenDIDKey generates a new 'did:key' DID by creating an EC key pair
func GenDIDKey() (did string, privateKey jwk.Key, err error) {

	// Generate a raw EC key with the P-256 curve
	rawPrivKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", nil, err
	}

	// Create the JWK for the private and public pair
	privKeyJWK, err := jwk.FromRaw(rawPrivKey)
	if err != nil {
		return "", nil, err
	}
	// privKeyJWK.Set(jwk.AlgorithmKey, jwa.ES256)
	// privKeyJWK.Set(jwk.KeyUsageKey, jwk.ForSignature)

	pubKeyJWK, err := privKeyJWK.PublicKey()
	if err != nil {
		return "", nil, err
	}

	// Create the 'did:key' associated to the public key
	did, err = PubKeyToDIDKey(pubKeyJWK)
	if err != nil {
		return "", nil, err
	}

	return did, privKeyJWK, nil

}

func PubKeyToDIDKey(pubKeyJWK jwk.Key) (did string, err error) {

	var buf [10]byte
	n := binary.PutUvarint(buf[0:], uint64(multicodec.Jwk_jcsPub))
	Jwk_jcsPub_Buf := buf[0:n]

	serialized, err := json.Marshal(pubKeyJWK)
	if err != nil {
		return "", err
	}

	keyEncoded := append(Jwk_jcsPub_Buf, serialized...)

	mb, err := multibase.Encode(multibase.Base58BTC, keyEncoded)
	if err != nil {
		return "", err
	}

	return "did:key:" + mb, nil

}

func qrcodeFromUrl(url string) (string, error) {
	// Create the QR code
	png, err := qrcode.Encode(url, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}

	// Convert the image data to a dataURL
	imgDataUrl := base64.StdEncoding.EncodeToString(png)
	imgDataUrl = "data:image/png;base64," + imgDataUrl

	return imgDataUrl, nil
}
