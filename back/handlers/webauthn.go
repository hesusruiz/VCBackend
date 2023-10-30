package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"
	"github.com/evidenceledger/vcdemo/internal/cache"
	"github.com/evidenceledger/vcdemo/vault"

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
	vault           *vault.Vault
	WebAuthn        *webauthn.WebAuthn
	webAuthnSession *session.Store
	cache           *cache.Cache
}

func NewWebAuthnHandler(back *Server, sess *memory.Storage, v *vault.Vault, cfg *yaml.YAML) *WebAuthnHandler {
	var err error

	rpDisplayName := cfg.String("webauthn.RPDisplayName")
	rpID := cfg.String("webauthn.RPID")
	rpOrigin := cfg.String("webauthn.RPOrigin")
	authenticatorAttachment := protocol.AuthenticatorAttachment(cfg.String("webauthn.AuthenticatorAttachment", "cross-platform"))
	userVerification := protocol.UserVerificationRequirement(cfg.String("webauthn.UserVerification", "required"))
	residentKey := cfg.String("webauthn.ResidentKey", "preferred")
	attestationConveyancePreference := protocol.ConveyancePreference(cfg.String("webauthn.AttestationConveyancePreference", "indirect"))

	// Create the WebAuthn backend server object
	s := new(WebAuthnHandler)

	s.rootServer = back
	s.vault = v
	s.stateSession = sess

	// Create the cache with expiration
	s.cache = cache.New(5*time.Minute, 15*time.Minute)

	// The session store (in-memory, with cookies)
	s.webAuthnSession = session.New(session.Config{Expiration: 24 * time.Hour})
	s.webAuthnSession.RegisterType(webauthn.SessionData{})

	// Pre-create the options object that will be sent to the authenticator in the client.
	// We are not interested in authenticator attestation, so we do not set the AttestatioPreference field,
	// which means it will default to (attestation: "none") in the WebAuthn API.
	s.WebAuthn, err = webauthn.New(&webauthn.Config{
		RPDisplayName: rpDisplayName, // display name for your site
		RPID:          rpID,          // generally the domain name for your site
		RPOrigin:      rpOrigin,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			AuthenticatorAttachment: authenticatorAttachment, // Can also be "cross-platform" for USB keys or sw implementations
			UserVerification:        userVerification,
			// RequireResidentKey:      &requireResidentKey,
			ResidentKey: protocol.ResidentKeyRequirement(residentKey),
		},
		AttestationPreference: attestationConveyancePreference,
	})

	if err != nil {
		zlog.Panic().Err(err).Msg("failed to create WebAuthn from config")
	}

	s.AddRoutes(back)

	return s

}

func (s *WebAuthnHandler) AddRoutes(f *Server) {

	f.Get("/webauthn/register/begin/:username", s.BeginRegistration)
	f.Post("/webauthn/register/finish/:username", s.FinishRegistration)
	f.Get("/webauthn/login/begin/:username", s.BeginLogin)
	f.Post("/webauthn/login/finish/:username", s.FinishLogin)
	f.Get("/webauthn/creds/list", s.ListCredentials)
	f.Get("/webauthn/logoff", s.Logoff)
}

// BeginRegistration is called from the wallet to start registering a new authenticator device in the server
func (s *WebAuthnHandler) BeginRegistration(c *fiber.Ctx) error {

	// The new WebAuthn credential will be associated to a user via its email

	// Get username (we use email as username) from the path of the HTTP request
	usernameParam := c.Params("username")
	if usernameParam == "" {
		errText := "must supply a valid username i.e. foo@bar.com"
		err := fmt.Errorf(errText)
		zlog.Err(err).Send()
		return fiber.NewError(http.StatusBadRequest, errText)
	}

	// Make a copy so Fiber can overwrite the request without affecting us
	username := utils.CopyString(usernameParam)

	// The displayname will be the first part of the email address
	// displayName := strings.Split(username, "@")[0]

	zlog.Info().Str("username", username).Msg("BeginRegistration started")

	// Get user from the Storage. The user is automatically created if it does not exist
	user, err := s.vault.CreateOrGetUserWithDIDKey(username, username, "naturalperson", "ThePassword")
	if err != nil {
		return err
	}
	zlog.Info().Str("username", user.WebAuthnName()).Msg("User retrieved or created")

	// We should exclude all the credentials already registered
	// They will be sent to the authenticator so it does not have to create a new credential if there is already one
	registerOptions := func(credCreationOpts *protocol.PublicKeyCredentialCreationOptions) {
		credCreationOpts.CredentialExcludeList = user.CredentialExcludeList()
	}

	// Generate PublicKeyCredentialCreationOptions, session data
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

	// Create an entry in an expirable cache to track request/reply
	sessionKey := randomString()
	s.cache.Set(sessionKey, waSessionData, 0)

	return c.JSON(fiber.Map{
		"options": options,
		"session": sessionKey,
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

	zlog.Info().
		Str("username", username).
		Str("state", stateKey).
		Str("status", StatusToString(stateContent[0])).
		Msg("FinishRegistration started")

	// Get user from Storage
	user, err := s.vault.GetUserById(username)

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

	sessionKey := p.Session

	// Retrieve the session that was created in BeginRegistration
	v, found := s.cache.Get(sessionKey)
	if !found || v == nil {
		err := fmt.Errorf("no session data found")
		zlog.Error().Err(err).Send()
		return err
	}

	s.cache.Delete(sessionKey)

	wasession, ok := v.(*webauthn.SessionData)
	if !ok {
		return fiber.NewError(fiber.StatusInternalServerError, "web authn session not found")
	}

	// Create the credential
	credential, err := s.WebAuthn.CreateCredential(user, *wasession, parsedResponse)
	if err != nil {
		return err
	}

	// Add the new credential to the user
	user.WebAuthnAddCredential(*credential)

	creds := user.WebAuthnCredentials()
	fmt.Println("======== LIST of CREDENTIALS")
	printJSON(creds)

	// Set the status to completed
	stateContent[0] = StateCompleted

	// And update the status for the poller to retrieve it
	s.stateSession.Set(stateKey, stateContent, StateExpirationDuration)

	zlog.Info().
		Str("username", username).
		Str("state", stateKey).
		Str("status", StatusToString(stateContent[0])).
		Msg("FinishRegistration started")

	return nil
}

// BeginLogin returns to the client app the structure needed by the client to request the Authenticator to
// create an assertion, using a previously created private key.
// The Authenticator will sign our challenge (and other items) with its private key, and the client will invoke
// the FinishLoging API, where we will be able to check the signature with the public key that we stored in
// a previous registration phase.
func (s *WebAuthnHandler) BeginLogin(c *fiber.Ctx) error {

	// We need from the client a unique user name (an email address in our case).
	// Get username from the path of the HTTP request
	username := c.Params("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	zlog.Info().Str("username", username).Msg("BeginLogin started")

	// The user must have been registered previously, so we check in our user database
	user, err := s.vault.GetUserById(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return fiber.NewError(fiber.StatusNotFound, "user not found")
	}

	// Now we create the assertion request.
	// Generate PublicKeyCredentialRequestOptions, session data
	options, sessionData, err := s.WebAuthn.BeginLogin(user)
	if err != nil {
		zlog.Error().Err(err).Msg("Error in webAuthn.BeginLogin")
		return err
	}

	// Patch the options ans sessionData so we control the challenge sent to the client
	challenge := []byte("hola que tal")
	options.Response.Challenge = challenge
	sessionData.Challenge = base64.RawURLEncoding.EncodeToString(challenge)

	// Create an entry in an expirable cache to track request/reply
	sessionKey := randomString()
	s.cache.Set(sessionKey, sessionData, 0)

	v, found := s.cache.Get(sessionKey)
	if !found || v == nil {
		err := fmt.Errorf("no session data found in BeginLogin")
		zlog.Error().Err(err).Send()
		return err
	}

	zlog.Info().Str("username", username).Msg("BeginLogin finished")

	return c.JSON(fiber.Map{
		"options": options,
		"session": sessionKey,
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
	user, err := s.vault.GetUserById(username)

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

	// Retrieve the session that was created in BeginLogin
	sessionKey := p.Session
	v, found := s.cache.Get(sessionKey)
	if !found || v == nil {
		err := fmt.Errorf("no session data found")
		zlog.Error().Err(err).Send()
		return err
	}
	fmt.Printf("%T\n", v)
	s.cache.Delete(sessionKey)

	wasession, ok := v.(*webauthn.SessionData)
	if !ok {
		err := fmt.Errorf("invalid type for SessionData")
		zlog.Error().Err(err).Send()
		return err

	}

	// in an actual implementation we should perform additional
	// checks on the returned 'credential'
	credential, err := s.WebAuthn.ValidateLogin(user, *wasession, parsedResponse)
	if err != nil {
		zlog.Error().Err(err).Msg("Error calling webAuthn.FinishLogin")
		return err
	}
	printJSON(credential)

	if credential.Authenticator.CloneWarning {
		zlog.Warn().Msg("The authenticator may be cloned")
	}

	// Set the status to completed
	stateContent[0] = StateCompleted

	// And update the status for the poller to retrieve it
	s.stateSession.Set(stateKey, stateContent, StateExpirationDuration)

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
	user, err := s.vault.GetUserById(username)
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

// ChallengeLength - Length of bytes to generate for a challenge
const ChallengeLength = 32

// Challenge that should be signed and returned by the authenticator
type Challenge protocol.URLEncodedBase64

// Create a new challenge to be sent to the authenticator. The spec recommends using
// at least 16 bytes with 100 bits of entropy. We use 32 bytes.
func CreateChallenge() (Challenge, error) {
	challenge := make([]byte, ChallengeLength)
	_, err := rand.Read(challenge)
	if err != nil {
		return nil, err
	}
	return challenge, nil
}

func (c Challenge) String() string {
	return base64.RawURLEncoding.EncodeToString(c)
}

func randomString() string {
	buf := make([]byte, 10)
	rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}
