package handlers

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"

	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"
	"github.com/evidenceledger/vcdemo/internal/cache"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/labstack/echo/v5"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hesusruiz/vcutils/yaml"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
	zlog "github.com/rs/zerolog/log"

	_ "github.com/mattn/go-sqlite3"
)

type Map map[string]interface{}

type WebAuthnHandlerPB struct {
	app             *pocketbase.PocketBase
	cache           *cache.Cache
	vault           *vault.Vault
	webAuthn        *webauthn.WebAuthn
	webAuthnSession *session.Store
}

func NewWebAuthnHandlerPB(app *pocketbase.PocketBase, cfg *yaml.YAML) *WebAuthnHandlerPB {
	// var err error

	// rpDisplayName := cfg.String("webauthn.RPDisplayName")
	// rpID := cfg.String("webauthn.RPID")
	// rpOrigin := cfg.String("webauthn.RPOrigin")
	// authenticatorAttachment := protocol.AuthenticatorAttachment(cfg.String("webauthn.AuthenticatorAttachment"))
	// userVerification := protocol.UserVerificationRequirement(cfg.String("webauthn.UserVerification"))
	// requireResidentKey := cfg.Bool("webauthn.RequireResidentKey")
	// attestationConveyancePreference := protocol.ConveyancePreference(cfg.String("webauthn.AttestationConveyancePreference"))

	// Create the WebAuthn backend server object
	s := new(WebAuthnHandlerPB)

	s.app = app

	// // Create the cache with expiration
	// s.cache = cache.New(1*time.Minute, 5*time.Minute)

	// // The session store (in-memory, with cookies)
	// s.webAuthnSession = session.New(session.Config{Expiration: 24 * time.Hour})
	// s.webAuthnSession.RegisterType(webauthn.SessionData{})

	// // Pre-create the options object that will be sent to the authenticator in the client.
	// // We are not interested in authenticator attestation, so we do not set the AttestatioPreference field,
	// // which means it will default to (attestation: "none") in the WebAuthn API.
	// s.webAuthn, err = webauthn.New(&webauthn.Config{
	// 	RPDisplayName: rpDisplayName, // display name for your site
	// 	RPID:          rpID,          // generally the domain name for your site
	// 	RPOrigin:      rpOrigin,
	// 	AuthenticatorSelection: protocol.AuthenticatorSelection{
	// 		AuthenticatorAttachment: authenticatorAttachment, // Can also be "cross-platform" for USB keys or sw implementations
	// 		UserVerification:        userVerification,
	// 		RequireResidentKey:      &requireResidentKey,
	// 	},
	// 	AttestationPreference: attestationConveyancePreference,
	// })

	// if err != nil {
	// 	zlog.Panic().Err(err).Msg("failed to create WebAuthn from config")
	// }

	s.AddRoutesPB(app)

	return s

}

func (s *WebAuthnHandlerPB) AddRoutesPB(app *pocketbase.PocketBase) {

	// Serves static files from the provided public dir (if exists)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./www"), false))

		e.Router.GET("/webauthn/register/begin/:username", s.BeginRegistrationPB)
		e.Router.POST("/webauthn/register/finish/:username", s.FinishRegistrationPB)
		e.Router.GET("/webauthn/login/begin/:username", s.BeginLoginPB)
		e.Router.POST("/webauthn/login/finish/:username", s.FinishLoginPB)

		return nil
	})

}

// BeginRegistration is called from the wallet to start registering a new authenticator device in the server
func (s *WebAuthnHandlerPB) BeginRegistrationPB(c echo.Context) error {

	// The new WebAuthn credential will be associated to a user via its email

	// Get username (we use email as username) from the path of the HTTP request
	username := c.PathParam("username")
	if username == "" {
		errText := "must supply a valid username i.e. foo@bar.com"
		err := fmt.Errorf(errText)
		zlog.Err(err).Send()
		return echo.NewHTTPError(http.StatusBadRequest, errText)
	}

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
	options, waSessionData, err := s.webAuthn.BeginRegistration(
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
	s.cache.Set(username, waSessionData, 0)

	return c.JSON(http.StatusOK, Map{
		"options": options,
		"session": username,
	})

}

func (s *WebAuthnHandlerPB) FinishRegistrationPB(c echo.Context) error {

	// Get username from the path of the HTTP request
	username := c.PathParam("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	zlog.Info().Str("username", username).Msg("FinishRegistration started")

	// Get user from Storage
	user, err := s.vault.GetUserById(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return err
	}

	// Parse the request body into the RegistrationResponse structure
	p := new(RegistrationResponse)
	if err := c.Bind(p); err != nil {
		return err
	}

	// Parse the WebAuthn member
	parsedResponse, err := ParseCredentialCreationResponse(p.Response)
	if err != nil {
		return err
	}

	// Retrieve the session that was created in BeginRegistration
	v, found := s.cache.Get(username)
	if !found {
		return echo.NewHTTPError(http.StatusInternalServerError, "session expired")
	}
	if v == nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "session object is nil")
	}

	wasession, ok := v.(*webauthn.SessionData)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "web authn session not found")
	}

	// Create the credential
	credential, err := s.webAuthn.CreateCredential(user, *wasession, parsedResponse)
	if err != nil {
		return err
	}

	// Add the new credential to the user
	user.WebAuthnAddCredential(*credential)

	creds := user.WebAuthnCredentials()
	fmt.Println("======== LIST of CREDENTIALS")
	printJSON(creds)

	// Destroy the session
	s.cache.Delete(username)

	zlog.Info().Str("username", username).Msg("FinishRegistration started")

	return nil
}

// BeginLogin returns to the client app the structure needed by the client to request the Authenticator to
// create an assertion, using a previously created private key.
// The Authenticator will sign our challenge (and other items) with its private key, and the client will invoke
// the FinishLoging API, where we will be able to check the signature with the public key that we stored in
// a previous registration phase.
func (s *WebAuthnHandlerPB) BeginLoginPB(c echo.Context) error {

	// We need from the client a unique user name (an email address in our case).
	// Get username from the path of the HTTP request
	username := c.PathParam("username")
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
	options, sessionData, err := s.webAuthn.BeginLogin(user)
	if err != nil {
		zlog.Error().Err(err).Msg("Error in webAuthn.BeginLogin")
		return err
	}

	// Patch the options and sessionData so we control the challenge sent to the client
	challenge := []byte("hola que tal")
	options.Response.Challenge = challenge
	sessionData.Challenge = base64.RawURLEncoding.EncodeToString(challenge)

	s.cache.Set(username, sessionData, 0)

	zlog.Info().Str("username", username).Msg("BeginLogin finished")

	return c.JSON(http.StatusOK, Map{
		"options": options,
		"session": username,
	})

}

func (s *WebAuthnHandlerPB) FinishLoginPB(c echo.Context) error {

	// Get username from the path of the HTTP request
	username := c.PathParam("username")
	if username == "" {
		err := fmt.Errorf("must supply a valid username i.e. foo@bar.com")
		zlog.Error().Err(err).Send()
		return err
	}

	zlog.Info().Str("username", username).Msg("FinishLogin started")

	// Get user from Storage
	user, err := s.vault.GetUserById(username)

	// It is an error if the user doesn't exist
	if err != nil {
		zlog.Error().Err(err).Msg("Error in userDB.GetUser")
		return err
	}

	p := new(LoginResponse)
	if err := c.Bind(p); err != nil {
		return err
	}

	parsedResponse, err := ParseCredentialRequestResponse(p.Response)
	if err != nil {
		return err
	}

	// Retrieve the session that was created in BeginLogin
	v, found := s.cache.Get(username)
	if !found {
		return echo.NewHTTPError(http.StatusInternalServerError, "session expired")
	}
	if v == nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "session object is nil")
	}

	wasession, ok := v.(webauthn.SessionData)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "web authn session not found")
	}

	// in an actual implementation we should perform additional
	// checks on the returned credential
	credential, err := s.webAuthn.ValidateLogin(user, wasession, parsedResponse)
	if err != nil {
		zlog.Error().Err(err).Msg("Error calling webAuthn.FinishLogin")
		return err
	}
	printJSON(credential)

	if credential.Authenticator.CloneWarning {
		zlog.Warn().Msg("The authenticator may be cloned")
	}

	zlog.Info().Str("username", username).Msg("FinishLogin finished")

	// handle successful login
	return c.JSON(http.StatusOK, "Login Success")
}

// User is built to interface with the Relying Party's User entry and
// elaborate the fields and methods needed for WebAuthn
type User interface {
	// User ID according to the Relying Party
	WebAuthnID() []byte
	// User Name according to the Relying Party
	WebAuthnName() string
	// Display Name of the user
	WebAuthnDisplayName() string
	// User's icon url
	WebAuthnIcon() string
	// Credentials owned by the user
	WebAuthnCredentials() []webauthn.Credential
}

type defaultUser struct {
	id []byte
}

var _ User = (*defaultUser)(nil)

func (user *defaultUser) WebAuthnID() []byte {
	return user.id
}

func (user *defaultUser) WebAuthnName() string {
	return "newUser"
}

func (user *defaultUser) WebAuthnDisplayName() string {
	return "New User"
}

func (user *defaultUser) WebAuthnIcon() string {
	return "https://pics.com/avatar.png"
}

func (user *defaultUser) WebAuthnCredentials() []webauthn.Credential {
	return []webauthn.Credential{}
}
