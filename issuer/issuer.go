package issuer

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/csrf"
	"github.com/gofiber/fiber/v2/utils"
	"github.com/hesusruiz/vcbackend/back/handlers"
	"github.com/hesusruiz/vcbackend/back/operations"
	"github.com/hesusruiz/vcbackend/internal/util"
	"github.com/hesusruiz/vcbackend/vault"
	"github.com/hesusruiz/vcutils/yaml"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/valyala/fasttemplate"
)

const defaultConfigFile = "./server.yaml"
const defaultTemplateDir = "back/views"
const defaultStaticDir = "back/www"
const defaultStoreDriverName = "sqlite3"
const defaultStoreDataSourceName = "file:issuer.sqlite?mode=rwc&cache=shared&_fk=1"
const defaultPassword = "ThePassword"

const issuerPrefix = "/issuer/api/v1"
const verifierPrefix = "/verifier/api/v1"
const walletPrefix = "/wallet/api/v1"

type Issuer struct {
	rootServer *handlers.Server
	vault      *vault.Vault
	cfg        *yaml.YAML
	operations *operations.Manager
	did        string
}

// Setup creates and setups the Issuer routes
func Setup(s *handlers.Server, cfg *yaml.YAML) {

	issuer := &Issuer{}
	issuer.rootServer = s
	issuer.cfg = cfg

	// Connect to the Issuer store engine
	issuer.vault = vault.Must(vault.New(yaml.New(cfg.Map("issuer"))))

	// Create the issuer and verifier users
	// TODO: the password is only for testing
	_, issuer.did, _ = issuer.vault.CreateOrGetUserWithDIDKey(cfg.String("issuer.id"), cfg.String("issuer.name"), "legalperson", cfg.String("issuer.password"))

	// Backend Operations for the Verifier
	issuer.operations = operations.NewManager(issuer.vault, cfg)

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
	issuerRoutes := s.Group(issuerPrefix)
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
	credsSummary, err := i.operations.GetAllCredentials()
	if err != nil {
		return err
	}

	// Render template
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"prefix":         issuerPrefix,
		"credlist":       credsSummary,
	}
	return c.Render("issuer_home", m)
}

func (i *Issuer) IssuerAPIAllCredentials(c *fiber.Ctx) error {

	// Get the list of credentials
	credsSummary, err := i.operations.GetAllCredentials()
	if err != nil {
		return err
	}

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
		"prefix":   issuerPrefix,
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
		"prefix":   issuerPrefix,
		"id":       id,
	})

	// Render index
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"qrcode":         base64Img,
		"url":            sameDeviceURI,
	}
	return c.Render("issuer_present_qr", m)
}

func (i *Issuer) IssuerAPICredential(c *fiber.Ctx) error {

	// Get the ID of the credential
	credID := c.Params("id")

	// Get the raw credential from the Vault
	rawCred, err := i.vault.Client.Credential.Get(context.Background(), credID)
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
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"csrftoken":      c.Locals("csrftoken"),
		"prefix":         issuerPrefix,
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
	i.rootServer.Logger.Info("Create a new credential")
	// The user submitted the form. Get all the data
	newCred := &NewCredentialForm{}
	if err := c.BodyParser(newCred); err != nil {
		i.rootServer.Logger.Infof("Error parsing: %s", err)
		return err
	}

	credentialString, err := i.createNewCredential(newCred)
	if err != nil {
		i.rootServer.Logger.Infof("Error: %s", err)
		return c.Status(fiber.StatusBadRequest).SendString(err.Error())
	}

	var rawMessage json.RawMessage = credentialString
	jsonResponse := &waltResponse{&rawMessage}
	return c.JSON(jsonResponse)
}

func (i *Issuer) createNewCredential(newCred *NewCredentialForm) (credString []byte, err error) {
	panic("Not implemented")
}

// func (i *Issuer) createNewCredentialOld(newCred *NewCredentialForm) (credString []byte, err error) {
// 	if newCred.Email == "" || newCred.FirstName == "" || newCred.FamilyName == "" ||
// 		newCred.Roles == "" || newCred.Target == "" {
// 		return credString, errors.New("invalid_credential")
// 	}
// 	// Convert to the hierarchical map required for the template
// 	claims := fiber.Map{}

// 	claims["firstName"] = newCred.FirstName
// 	claims["familyName"] = newCred.FamilyName
// 	claims["email"] = newCred.Email

// 	names := strings.Split(newCred.Roles, ",")
// 	var roles []map[string]any
// 	role := map[string]any{
// 		"target": newCred.Target,
// 		"names":  names,
// 	}

// 	roles = append(roles, role)
// 	claims["roles"] = roles

// 	credentialData := fiber.Map{}
// 	credentialData["credentialSubject"] = claims

// 	// Get the issuer DID
// 	issuerDID, err := i.server.issuerVault.GetDIDForUser(i.server.cfg.String("issuer.id"))
// 	if err != nil {
// 		return credString, err
// 	}

// 	// Call the issuer of SSI Kit
// 	agent := fiber.Post(i.server.ssiKit.signatoryUrl + "/v1/credentials/issue")

// 	config := fiber.Map{
// 		"issuerDid":  issuerDID,
// 		"subjectDid": "did:key:z6Mkfdio1n9SKoZUtKdr9GTCZsRPbwHN8f7rbJghJRGdCt88",
// 		// "verifierDid": "theVerifier",
// 		// "issuerVerificationMethod": "string",
// 		"proofType": "LD_PROOF",
// 		// "domain":                   "string",
// 		// "nonce":                    "string",
// 		// "proofPurpose":             "string",
// 		// "credentialId":             "string",
// 		// "issueDate":                "2022-10-06T18:09:14.570Z",
// 		// "validDate":                "2022-10-06T18:09:14.570Z",
// 		// "expirationDate":           "2022-10-06T18:09:14.570Z",
// 		// "dataProviderIdentifier":   "string",
// 	}

// 	bodyRequest := fiber.Map{
// 		"templateId":     "PacketDeliveryService",
// 		"config":         config,
// 		"credentialData": credentialData,
// 	}

// 	agent.JSON(bodyRequest)
// 	agent.ContentType("application/json")
// 	agent.Set("accept", "application/json")
// 	_, returnBody, errors := agent.Bytes()
// 	if len(errors) > 0 {
// 		i.server.logger.Errorw("error calling SSI Kit", zap.Errors("errors", errors))
// 		return credString, fmt.Errorf("error calling SSI Kit: %v", errors[0])
// 	}

// 	parsed, err := yaml.ParseJson(string(returnBody))
// 	if err != nil {
// 		return credString, err
// 	}

// 	credentialID := parsed.String("id")
// 	if len(credentialID) == 0 {
// 		i.server.logger.Errorw("id field not found in credential")
// 		return credString, fmt.Errorf("id field not found in credential")
// 	}

// 	// Store credential
// 	_, err = i.server.issuerVault.Client.Credential.Create().
// 		SetID(credentialID).
// 		SetRaw([]uint8(returnBody)).
// 		Save(context.Background())
// 	if err != nil {
// 		i.server.logger.Errorw("error storing the credential", zap.Error(err))
// 		return credString, err
// 	}

// 	return returnBody, err
// }

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
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"claims":         util.PrettyFormatJSON(str),
		"prefix":         issuerPrefix,
	}
	return c.Render("creddetails", m)
}

// New Credential end
// ##########################################
// ##########################################

func (i *Issuer) IssuerPageCredentialDetails(c *fiber.Ctx) error {

	// Get the ID of the credential
	credID := c.Params("id")

	claims, err := i.operations.GetCredentialLD(credID)
	if err != nil {
		return err
	}

	// Render
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"claims":         claims,
		"prefix":         issuerPrefix,
	}
	return c.Render("creddetails", m)
}
