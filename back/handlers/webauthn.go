package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"

	"github.com/hesusruiz/vcbackend/back/operations"
	"github.com/hesusruiz/vcutils/yaml"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
	"github.com/gofiber/fiber/v2/utils"
	"github.com/gofiber/storage/memory"
	zlog "github.com/rs/zerolog/log"

	_ "github.com/mattn/go-sqlite3"
)

type WebAuthnHandler struct {
	rootServer      *Server
	stateSession    *memory.Storage
	operations      *operations.Manager
	WebAuthn        *webauthn.WebAuthn
	webAuthnSession *session.Store
}

func NewWebAuthnHandler(back *Server, sess *memory.Storage, ops *operations.Manager, cfg *yaml.YAML) *WebAuthnHandler {
	var err error

	rpDisplayName := cfg.String("webauthn.RPDisplayName")
	rpID := cfg.String("webauthn.RPID")
	rpOrigin := cfg.String("webauthn.RPOrigin")
	authenticatorAttachment := protocol.AuthenticatorAttachment(cfg.String("webauthn.AuthenticatorAttachment"))
	userVerification := protocol.UserVerificationRequirement(cfg.String("webauthn.UserVerification"))

	// Create the WebAuthn backend server object
	s := new(WebAuthnHandler)

	s.rootServer = back
	s.operations = ops
	s.stateSession = sess

	// The session store (in-memory, with cookies)
	s.webAuthnSession = session.New(session.Config{Expiration: 24 * time.Hour})
	s.webAuthnSession.RegisterType(webauthn.SessionData{})

	s.WebAuthn, err = webauthn.New(&webauthn.Config{
		RPDisplayName: rpDisplayName, // display name for your site
		RPID:          rpID,          // generally the domain name for your site
		RPOrigin:      rpOrigin,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			AuthenticatorAttachment: authenticatorAttachment, // Can also be "cross-platform" for USB keys or sw implementations
			UserVerification:        userVerification,
		},
	})

	if err != nil {
		zlog.Panic().Err(err).Msg("failed to create WebAuthn from config")
	}

	s.AddRoutes(back)

	return s

}

func (s *WebAuthnHandler) AddRoutes(f *Server) {

	waRouteGroup := f.Group("/webauthn")

	waRouteGroup.Get("/register/begin/:username", s.BeginRegistration)
	waRouteGroup.Post("/register/finish/:username", s.FinishRegistration)
	waRouteGroup.Get("/login/begin/:username", s.BeginLogin)
	waRouteGroup.Post("/login/finish/:username", s.FinishLogin)
	waRouteGroup.Get("/creds/list", s.ListCredentials)
	waRouteGroup.Get("/logoff", s.Logoff)
}

func (s *WebAuthnHandler) BeginRegistration(c *fiber.Ctx) error {

	// Get username from the path of the HTTP request
	usernameParam := c.Params("username")
	if usernameParam == "" {
		errText := "must supply a valid username i.e. foo@bar.com"
		err := fmt.Errorf(errText)
		zlog.Err(err).Send()
		return fiber.NewError(http.StatusBadRequest, errText)
	}

	username := utils.CopyString(usernameParam)
	displayName := strings.Split(username, "@")[0]

	// Get the state from the URL parameters
	//	state := c.Query("state")

	zlog.Info().Str("username", username).Msg("BeginRegistration started")

	// get user from the Storage
	user, err := s.operations.User().CreateOrGet(username, displayName)
	if err != nil {
		return err
	}
	zlog.Info().Str("username", user.WebAuthnName()).Msg("User retrieved or created")

	// We should exclude all the credentials already registered
	registerOptions := func(credCreationOpts *protocol.PublicKeyCredentialCreationOptions) {
		credCreationOpts.CredentialExcludeList = user.CredentialExcludeList()
	}

	// generate PublicKeyCredentialCreationOptions, session data
	options, waSessionData, err := s.WebAuthn.BeginRegistration(
		user,
		registerOptions,
	)

	if err != nil {
		zlog.Error().Err(err).Msg("Error in BeginRegistration")
		return err
	} else {
		zlog.Info().Msg("Successful BeginRegistration")
	}

	// Use a session to track the request/reply
	waSession, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	waSession.Set("wasession", waSessionData)
	sessionID := waSession.ID()
	// Save session
	if err := waSession.Save(); err != nil {
		panic(err)
	}

	return c.JSON(fiber.Map{
		"options": options,
		"session": sessionID,
	})

}

type RegistrationResponse struct {
	Response protocol.CredentialCreationResponse `json:"response"`
	Session  string                              `json:"session"`
}

func (s *WebAuthnHandler) FinishRegistration(c *fiber.Ctx) error {

	// Get username from the path of the HTTP request
	username := c.Params("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	// Get the state that was used to track the whole authentication process, including Verifiable Credential
	stateKey := c.Query("state")

	stateContent, _ := s.stateSession.Get(stateKey)
	if len(stateContent) < 2 {
		return fiber.NewError(fiber.StatusInternalServerError, "status invalid")
	}

	zlog.Info().Str("username", username).Str("state", stateKey).Uint("status", uint(stateContent[0])).Msg("FinishRegistration started")

	// Get user from Storage
	user, err := s.operations.User().GetByName(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return err
	}

	// Parse the request body into the RegistrationResponse structure
	p := new(RegistrationResponse)
	if err := c.BodyParser(p); err != nil {
		return err
	}

	// Parse the WebAuthn member
	parsedResponse, err := ParseCredentialCreationResponse(p.Response)
	if err != nil {
		return err
	}

	// Retrieve the session that was created in BeginRegistration
	sess, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	v := sess.Get("wasession")
	if v == nil {
		return fiber.NewError(fiber.StatusInternalServerError, "web authn session not found")
	}
	wasession, ok := v.(webauthn.SessionData)
	if !ok {
		return fiber.NewError(fiber.StatusInternalServerError, "web authn session not found")
	}

	// Create the credential
	credential, err := s.WebAuthn.CreateCredential(user, wasession, parsedResponse)
	if err != nil {
		return err
	}

	// Add the new credential to the user
	user.AddCredential(*credential)

	creds := user.WebAuthnCredentials()
	fmt.Println("======== LIST of CREDENTIALS")
	printJSON(creds)

	// Destroy the session
	sess.Destroy()

	// Set the status to completed
	stateContent[0] = StateCompleted

	// And update the status for the poller to retrieve it
	s.stateSession.Set(stateKey, stateContent, StateExpiration)

	zlog.Info().Str("username", username).Str("state", stateKey).Uint("status", uint(stateContent[0])).Msg("FinishRegistration started")

	return nil
}

func (s *WebAuthnHandler) BeginLogin(c *fiber.Ctx) error {

	// Get username from the path of the HTTP request
	username := c.Params("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	zlog.Info().Str("username", username).Msg("BeginLogin started")

	// Get user from Database
	user, err := s.operations.User().GetByName(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return fiber.NewError(fiber.StatusNotFound, "user not found")
	}

	// Generate PublicKeyCredentialRequestOptions, session data
	options, sessionData, err := s.WebAuthn.BeginLogin(user)
	if err != nil {
		zlog.Error().Err(err).Msg("Error in webAuthn.BeginLogin")
		return err
	}

	// Use a httpSession to track the request/reply
	httpSession, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	// Store the data associated to a given key
	httpSession.Set("wasession", sessionData)

	// Save session
	if err := httpSession.Save(); err != nil {
		panic(err)
	}

	zlog.Info().Str("username", username).Msg("BeginLogin finished")

	return c.JSON(fiber.Map{
		"options": options,
		"session": httpSession.ID(),
	})

}

type LoginResponse struct {
	Response protocol.CredentialAssertionResponse `json:"response"`
	Session  string                               `json:"session"`
}

func (s *WebAuthnHandler) FinishLogin(c *fiber.Ctx) error {

	// Get username from the path of the HTTP request
	username := c.Params("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	// Get the state that was used to track the whole authentication process, including Verifiable Credential
	stateKey := c.Query("state")

	stateContent, _ := s.stateSession.Get(stateKey)
	if len(stateContent) < 2 {
		return fiber.NewError(fiber.StatusInternalServerError, "status invalid")
	}

	zlog.Info().Str("username", username).Str("state", stateKey).Uint("status", uint(stateContent[0])).Msg("FinishLogin started")

	// Get user from Storage
	user, err := s.operations.User().GetByName(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return err
	}

	p := new(LoginResponse)

	if err := c.BodyParser(p); err != nil {
		return err
	}

	parsedResponse, err := ParseCredentialRequestResponse(p.Response)
	if err != nil {
		return err
	}

	// Use a session to track the request/reply
	httpSession, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	v := httpSession.Get("wasession")
	wasession := v.(webauthn.SessionData)

	// in an actual implementation we should perform additional
	// checks on the returned 'credential'
	credential, err := s.WebAuthn.ValidateLogin(user, wasession, parsedResponse)
	if err != nil {
		zlog.Error().Err(err).Msg("Error calling webAuthn.FinishLogin")
		return err
	}
	printJSON(credential)

	if credential.Authenticator.CloneWarning {
		zlog.Warn().Msg("The authenticator may be cloned")
	}

	httpSession.Set("username", username)
	// Save session
	if err := httpSession.Save(); err != nil {
		panic(err)
	}

	// Set the status to completed
	stateContent[0] = StateCompleted

	// And update the status for the poller to retrieve it
	s.stateSession.Set(stateKey, stateContent, StateExpiration)

	zlog.Info().Str("username", username).Str("state", stateKey).Uint("status", uint(stateContent[0])).Msg("FinishLogin finished")

	// handle successful login
	return c.JSON("Login Success")
}

func (s *WebAuthnHandler) Logoff(c *fiber.Ctx) error {

	// Use a session to track the request/reply
	sess, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	// Destroy the session
	sess.Destroy()

	// handle successful logoff
	return c.JSON("Loged off")
}

func (s *WebAuthnHandler) ListCredentials(c *fiber.Ctx) error {

	// Use a session to track the request/reply
	sess, err := s.webAuthnSession.Get(c)
	if err != nil {
		return err
	}

	// Try to get the user name
	v := sess.Get("username")
	if v == nil {
		err := fmt.Errorf("user not logged in")
		zlog.Error().Err(err).Send()
		return fiber.ErrForbidden
	}
	username := v.(string)

	zlog.Info().Str("username", username).Msg("User is logged in")

	// Get user from Storage
	user, err := s.operations.User().GetByName(username)
	if err != nil {
		zlog.Warn().Msg("user not found")
		return err
	}
	creds := user.WebAuthnCredentials()
	printJSON(creds)

	// handle successful login
	return c.JSON(creds)
}

func ParseCredentialCreationResponse(ccr protocol.CredentialCreationResponse) (*protocol.ParsedCredentialCreationData, error) {

	if ccr.ID == "" {
		return nil, fmt.Errorf("missing ID")
	}

	testB64, err := base64.RawURLEncoding.DecodeString(ccr.ID)
	if err != nil || !(len(testB64) > 0) {
		return nil, err
	}

	if ccr.PublicKeyCredential.Credential.Type == "" {
		return nil, fmt.Errorf("missing type")
	}

	if ccr.PublicKeyCredential.Credential.Type != "public-key" {
		return nil, fmt.Errorf("type not public-key")
	}

	var pcc protocol.ParsedCredentialCreationData
	pcc.ID, pcc.RawID, pcc.Type, pcc.ClientExtensionResults = ccr.ID, ccr.RawID, ccr.Type, ccr.ClientExtensionResults
	pcc.Raw = ccr

	parsedAttestationResponse, err := ccr.AttestationResponse.Parse()
	if err != nil {
		return nil, err
	}

	pcc.Response = *parsedAttestationResponse

	return &pcc, nil
}

// Parse the credential request response into a format that is either required by the specification
// or makes the assertion verification steps easier to complete. This takes an io.Reader that contains
// the assertion response data in a raw, mostly base64 encoded format, and parses the data into
// manageable structures
func ParseCredentialRequestResponse(car protocol.CredentialAssertionResponse) (*protocol.ParsedCredentialAssertionData, error) {

	if car.ID == "" {
		return nil, fmt.Errorf("CredentialAssertionResponse with ID missing")
	}

	_, err := base64.RawURLEncoding.DecodeString(car.ID)
	if err != nil {
		return nil, err
	}
	if car.Type != "public-key" {
		return nil, fmt.Errorf("CredentialAssertionResponse with bad type")
	}
	var par protocol.ParsedCredentialAssertionData
	par.ID, par.RawID, par.Type, par.ClientExtensionResults = car.ID, car.RawID, car.Type, car.ClientExtensionResults
	par.Raw = car

	par.Response.Signature = car.AssertionResponse.Signature
	par.Response.UserHandle = car.AssertionResponse.UserHandle

	// Step 5. Let JSONtext be the result of running UTF-8 decode on the value of cData.
	// We don't call it cData but this is Step 5 in the spec.
	err = json.Unmarshal(car.AssertionResponse.ClientDataJSON, &par.Response.CollectedClientData)
	if err != nil {
		return nil, err
	}

	err = par.Response.AuthenticatorData.Unmarshal(car.AssertionResponse.AuthenticatorData)
	if err != nil {
		return nil, err
	}
	return &par, nil
}

func printJSON(val any) {
	out, err := json.MarshalIndent(val, "", "  ")
	if err != nil {
		zlog.Error().Err(err).Msg("Error in JSON Marshall")
		return
	}
	fmt.Println(string(out))
}
