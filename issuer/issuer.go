package issuer

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/internal/util"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/evidenceledger/vcdemo/vault/x509util"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/csrf"
	"github.com/gofiber/fiber/v2/utils"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/valyala/fasttemplate"
)

const defaultPassword = "ThePassword"
const defaultStaticDir = "back/www"

const issuerAPIPrefix = "/issuer/api/v1"

type Issuer struct {
	rootServer *handlers.Server
	vault      *vault.Vault
	cfg        *yaml.YAML
	id         string
	name       string
	did        string
}

// Setup creates and setups the Issuer routes
func Setup(s *handlers.Server, cfg *yaml.YAML) {
	var err error

	issuer := &Issuer{}
	issuer.rootServer = s

	issuer.cfg = cfg

	issuer.id = issuer.cfg.String("id")
	issuer.name = issuer.cfg.String("name")

	// Connect to the Issuer vault
	if issuer.vault, err = vault.New(issuer.cfg); err != nil {
		panic(err)
	}

	// Read the configured x509 certificate generation
	e := cfg.Map("x509.ELSIName")
	elsiName := x509util.ELSIName{
		OrganizationIdentifier: (e["OrganizationIdentifier"]).(string),
		CommonName:             (e["CommonName"]).(string),
		GivenName:              (e["GivenName"]).(string),
		Surname:                (e["Surname"]).(string),
		EmailAddress:           (e["EmailAddress"]).(string),
		SerialNumber:           (e["SerialNumber"]).(string),
		Organization:           (e["Organization"]).(string),
		Country:                (e["Country"]).(string),
	}

	// Create the issuer user
	// TODO: the password is only for testing
	// user, err := issuer.vault.CreateOrGetUserWithDIDKey(issuer.id, issuer.name, "legalperson", cfg.String("issuer.password", defaultPassword))
	user, err := issuer.vault.CreateOrGetUserWithDIDelsi(issuer.id, issuer.name, elsiName, "legalperson", cfg.String("issuer.password", defaultPassword))
	if err != nil {
		panic(err)
	}
	issuer.did = user.DID()
	zlog.Info().Str("id", issuer.id).Str("name", issuer.name).Str("DID", issuer.did).Msg("starting Issuer")

	// CSRF for protecting the forms
	csrfHandler := csrf.New(csrf.Config{
		KeyLookup:      "form:_csrf",
		ContextKey:     "csrftoken",
		CookieName:     "csrf_",
		CookieSameSite: "Strict",
		Expiration:     1 * time.Hour,
		KeyGenerator:   utils.UUID,
	})

	s.Get("/issuer", issuer.HandleIssuerHome)

	// Define the prefix for Issuer routes
	issuerRoutes := s.Group(issuerAPIPrefix)
	issuerRoutes.Use(cors.New())

	// Forms for new credential
	issuerRoutes.Get("/newcredential", csrfHandler, issuer.IssuerPageNewCredentialFormDisplay)
	issuerRoutes.Post("/newcredential", csrfHandler, issuer.IssuerPageNewCredentialFormPost)

	issuerRoutes.Post("/credential", issuer.CreateNewCredential)

	// Display details of a credential
	issuerRoutes.Get("/creddetails/:id", issuer.IssuerPageCredentialDetails)

	// Display a QR with a URL for retrieving the credential from the server
	issuerRoutes.Get("/displayqrurl/:id", issuer.IssuerPageDisplayQRURL)

	// Get a list of all credentials
	issuerRoutes.Get("/allcredentials", issuer.IssuerAPIAllCredentials)

	// Get a credential given its ID
	issuerRoutes.Get("/credential/:id", issuer.IssuerAPICredential)

}

func (i *Issuer) HandleIssuerHome(c *fiber.Ctx) error {

	// Get the list of credentials
	credsSummary := i.vault.GetAllCredentials()

	// Render template
	m := fiber.Map{
		"apiPrefix": issuerAPIPrefix,
		"credlist":  credsSummary,
	}
	return c.Render("issuer_home", m)
}

func (i *Issuer) IssuerAPIAllCredentials(c *fiber.Ctx) error {

	// Get the list of credentials
	credsSummary := i.vault.GetAllCredentials()

	return c.JSON(credsSummary)
}

func (i *Issuer) IssuerPageDisplayQRURL(c *fiber.Ctx) error {

	// Get the credential ID from the path parameter
	id := c.Params("id")

	// QR code for cross-device SIOP
	template := "openid-credential-offer://{{hostname}}{{prefix}}/credential/{{id}}"
	t := fasttemplate.New(template, "{{", "}}")
	issuerCredentialURI := t.ExecuteString(map[string]interface{}{
		"protocol": c.Protocol(),
		"hostname": c.Hostname(),
		"prefix":   issuerAPIPrefix,
		"id":       id,
	})

	// Create the QR
	png, err := qrcode.Encode(issuerCredentialURI, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	// Convert to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	// URL to direct the wallet to retrieve the credential
	sameDeviceWallet := i.cfg.String("samedeviceWallet", "https://wallet.mycredential.eu")
	template = "{{sameDeviceWallet}}?command=getvc&vcid={{protocol}}://{{hostname}}{{prefix}}/credential/{{id}}"
	t = fasttemplate.New(template, "{{", "}}")
	sameDeviceURI := t.ExecuteString(map[string]interface{}{
		"sameDeviceWallet": sameDeviceWallet,
		"protocol":         c.Protocol(),
		"hostname":         c.Hostname(),
		"prefix":           issuerAPIPrefix,
		"id":               id,
	})

	// Render index
	m := fiber.Map{
		"apiPrefix": issuerAPIPrefix,
		"qrcode":    base64Img,
		"url":       sameDeviceURI,
	}
	return c.Render("issuer_present_qr", m)
}

func (i *Issuer) IssuerAPICredential(c *fiber.Ctx) error {

	// Get the ID of the credential
	credID := c.Params("id")

	// Get the raw credential from the Vault
	rawCred, err := i.vault.DB().Credential.Get(context.Background(), credID)
	if err != nil {
		return err
	}

	return c.SendString(string(rawCred.Raw))
}

// ##########################################
// ##########################################
// New Credential begin

func (i *Issuer) IssuerPageNewCredentialFormDisplay(c *fiber.Ctx) error {

	// Display the form to enter credential data
	m := fiber.Map{
		"apiPrefix": issuerAPIPrefix,
		"csrftoken": c.Locals("csrftoken"),
	}

	return c.Render("issuer_newcredential", m)
}

type NewCredentialForm struct {
	FirstName  string `form:"firstName,omitempty"`
	FamilyName string `form:"familyName,omitempty"`
	Email      string `form:"email,omitempty"`
	Target     string `form:"target,omitempty"`
	Roles      string `form:"roles,omitempty"`
}

type waltResponse struct {
	*json.RawMessage
}

func (i *Issuer) CreateNewCredential(c *fiber.Ctx) error {
	zlog.Info().Msg("Create a new credential")
	// The user submitted the form. Get all the data
	newCred := &NewCredentialForm{}
	if err := c.BodyParser(newCred); err != nil {
		zlog.Err(err).Msgf("error parsing")
		return err
	}

	credentialString, err := i.createNewCredential(newCred)
	if err != nil {
		zlog.Err(err).Msg("error creating credential")
		return c.Status(fiber.StatusBadRequest).SendString(err.Error())
	}

	var rawMessage json.RawMessage = credentialString
	jsonResponse := &waltResponse{&rawMessage}
	return c.JSON(jsonResponse)
}

func (i *Issuer) createNewCredential(newCred *NewCredentialForm) (credString []byte, err error) {
	panic("Not implemented")
}

func (i *Issuer) IssuerPageNewCredentialFormPost(c *fiber.Ctx) error {

	// The user submitted the form. Get all the data
	newCred := &NewCredentialForm{}
	if err := c.BodyParser(newCred); err != nil {
		return err
	}

	str, err := i.createNewCredential(newCred)
	if err != nil && err.Error() == "invalid_credential" {
		m := fiber.Map{}
		m["Errormessage"] = "Enter all fields"
		return c.Render("issuer_newcredential", m)
	}

	// Render
	m := fiber.Map{
		"apiPrefix": issuerAPIPrefix,
		"claims":    util.PrettyFormatJSON(str),
	}
	return c.Render("creddetails", m)
}

// New Credential end
// ##########################################
// ##########################################

func (i *Issuer) IssuerPageCredentialDetails(c *fiber.Ctx) error {

	// Get the ID of the credential
	credID := c.Params("id")

	entCredential, err := i.vault.DB().Credential.Get(context.Background(), credID)
	if err != nil {
		return err
	}

	var iface any
	err = json.Unmarshal(entCredential.Raw, &iface)
	if err != nil {
		return err
	}

	var b bytes.Buffer
	err = json.Indent(&b, entCredential.Raw, "", "  ")
	if err != nil {
		return err
	}

	// Render
	m := fiber.Map{
		"APIPrefix": issuerAPIPrefix,
		"claims":    b.String(),
	}
	return c.Render("creddetails", m)
}

const defaultCredentialDataFile = "employee_data.yaml"

func BatchGenerateCredentials(issuerConfig *yaml.YAML) {

	// Get the name of the SQLite database file from the config URI, e.g: "issuer.sqlite?mode=rwc&cache=shared&_fk=1"
	storeDataSourceName := issuerConfig.String("store.dataSourceName")
	parts := strings.Split(storeDataSourceName, "?")
	if len(parts) == 0 {
		panic("invalid Issuer storeDataSourceName")
	}
	storeDataSourceName = parts[0]
	storeDataSourceLocation := issuerConfig.String("store.dataSourceLocation")
	storeDataSourceFullName := storeDataSourceLocation + "/" + storeDataSourceName

	// We do nothing if the file already exists, or panic if an error happened
	_, err := os.Stat(storeDataSourceFullName)
	if err == nil {
		zlog.Info().Str("name", storeDataSourceFullName).Msg("database already exists, doing nothing")
		return
	} else if !os.IsNotExist(err) {
		panic("error checking existence of file")
	}

	// At this point, we know the file does not exist and we can create it and the credentials

	// Connect to the Issuer vault
	issuerVault := vault.Must(vault.New(issuerConfig))

	// Parse credential data
	credentialDataFile := issuerConfig.String("credentialInputDataFile", defaultCredentialDataFile)
	data, err := yaml.ParseYamlFile(credentialDataFile)
	if err != nil {
		panic(err)
	}

	// Get the top-level list (the list of credentials)
	creds := data.List("")
	if len(creds) == 0 {
		panic("no credentials found in config")
	}

	// Iterate through the list creating each credential which will use its own template
	for _, item := range creds {

		// Cast to a map so it can be passed to CreateCredentialFromMap
		cred, _ := item.(map[string]any)
		_, _, err := issuerVault.CreateCredentialJWTFromMap(cred)
		if err != nil {
			zlog.Err(err).Send()
			continue
		}

	}

}

func BatchGenerateLEARCredentials(issuerConfig *yaml.YAML) {
	zlog.Info().Msg("creating LEAR Credentials")

	e := issuerConfig.Map("x509.ELSIName")
	elsiName := x509util.ELSIName{
		OrganizationIdentifier: (e["OrganizationIdentifier"]).(string),
		CommonName:             (e["CommonName"]).(string),
		GivenName:              (e["GivenName"]).(string),
		Surname:                (e["Surname"]).(string),
		EmailAddress:           (e["EmailAddress"]).(string),
		SerialNumber:           (e["SerialNumber"]).(string),
		Organization:           (e["Organization"]).(string),
		Country:                (e["Country"]).(string),
	}

	// Get the name of the SQLite database file from the config URI, e.g: "issuer.sqlite?mode=rwc&cache=shared&_fk=1"
	storeDataSourceName := issuerConfig.String("store.dataSourceName")
	parts := strings.Split(storeDataSourceName, "?")
	if len(parts) == 0 {
		panic("invalid Issuer storeDataSourceName")
	}
	storeDataSourceName = parts[0]
	storeDataSourceLocation := issuerConfig.String("store.dataSourceLocation")
	storeDataSourceFullName := storeDataSourceLocation + "/" + storeDataSourceName

	// We do nothing if the file already exists, or panic if an error happened
	_, err := os.Stat(storeDataSourceFullName)
	if err == nil {
		zlog.Info().Str("name", storeDataSourceFullName).Msg("database already exists, doing nothing")
		return
	} else if !os.IsNotExist(err) {
		panic("error checking existence of file")
	}

	// At this point, we know the file does not exist and we can create it and the credentials

	// Connect to the Issuer vault
	issuerVault := vault.Must(vault.New(issuerConfig))

	// Parse credential data
	credentialDataFile := "data/example_data/employee_data_lear.yaml"
	// credentialDataFile := issuerConfig.String("credentialInputDataFile", defaultCredentialDataFile)
	data, err := yaml.ParseYamlFile(credentialDataFile)
	if err != nil {
		panic(err)
	}

	// Get the top-level list (the list of credentials)
	creds := data.List("")
	if len(creds) == 0 {
		panic("no credentials found in config")
	}

	// Iterate through the list creating each credential which will use its own template
	for _, item := range creds {

		// Cast to a map so it can be passed to CreateCredentialFromMap
		cred, _ := item.(map[string]any)
		_, _, err := issuerVault.CreateLEARCredentialJWTFromMap(cred, elsiName)
		if err != nil {
			zlog.Err(err).Send()
			continue
		}

	}

}
