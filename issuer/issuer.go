package issuer

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/internal/util"
	"github.com/evidenceledger/vcdemo/vault"
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

	issuer.id = cfg.String("issuer.id")
	issuer.name = cfg.String("issuer.name")

	// Connect to the Issuer vault
	cfgIssuer := yaml.New(cfg.Map("issuer"))
	if issuer.vault, err = vault.New(cfgIssuer); err != nil {
		panic(err)
	}

	// Create the issuer user
	// TODO: the password is only for testing
	user, err := issuer.vault.CreateOrGetUserWithDIDKey(issuer.id, issuer.name, "legalperson", cfg.String("issuer.password", defaultPassword))
	if err != nil {
		panic(err)
	}
	issuer.did = user.DID()

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
	template = "https://wallet.mycredential.eu?command=getvc&vcid=https://{{hostname}}{{prefix}}/credential/{{id}}"
	t = fasttemplate.New(template, "{{", "}}")
	sameDeviceURI := t.ExecuteString(map[string]interface{}{
		"protocol": c.Protocol(),
		"hostname": c.Hostname(),
		"prefix":   issuerAPIPrefix,
		"id":       id,
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
