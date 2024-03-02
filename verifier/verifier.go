package verifier

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/storage/memory"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/lestrrat-go/jwx/v2/jwk"
	zlog "github.com/rs/zerolog/log"
	qrcode "github.com/skip2/go-qrcode"
)

const verifierPrefix = "/verifier/api/v1"
const walletPrefix = "/wallet/api/v1"

type Verifier struct {
	rootServer   *handlers.Server
	vault        *vault.Vault
	cfg          *yaml.YAML
	id           string
	name         string
	did          string
	pdp          *PDP
	stateSession *memory.Storage
	webAuthn     *handlers.WebAuthnHandler
}

// Setup creates and setups the Verifier routes
func Setup(s *handlers.Server, cfg *yaml.YAML) {
	var err error

	verifier := &Verifier{}

	verifier.rootServer = s

	verifier.cfg = cfg

	verifier.id = verifier.cfg.String("id")
	verifier.name = verifier.cfg.String("name")

	// Connect to the Verifier store engine
	if verifier.vault, err = vault.New(verifier.cfg); err != nil {
		panic(err)
	}

	// Create the Verifier user
	// TODO: the password is only for testing
	user, err := verifier.vault.CreateOrGetUserWithDIDKey(verifier.id, verifier.name, "legalperson", cfg.String("verifier.password"))
	if err != nil {
		panic(err)
	}
	verifier.did = user.DID()
	zlog.Info().Str("id", verifier.id).Str("name", verifier.name).Str("DID", verifier.did).Msg("starting Verifier")

	policiesFile := verifier.cfg.String("authnPolicies")
	zlog.Info().Str("file", policiesFile).Msg("starting Policy Decision Point")

	// Start the Policy Decision Point engine
	pdp, err := NewPDP(policiesFile)
	if err != nil {
		panic(err)
	}
	verifier.pdp = pdp

	// Create a storage entry for OIDC4VP flow expiration
	verifier.stateSession = memory.New()

	// WebAuthn
	verifier.webAuthn = handlers.NewWebAuthnHandler(s, verifier.stateSession, verifier.vault, cfg)

	s.Get("/verifier", verifier.HandleVerifierHome)

	// Define the prefix for Verifier routes
	verifierRoutes := s.Group(verifierPrefix)

	// Routes consist of a set of pages rendering HTML using templates and a set of APIs

	// The JWKS endpoint
	jwks_uri := cfg.String("verifier.jwks_uri")
	verifierRoutes.Get(jwks_uri, verifier.VerifierAPIJWKS)

	// ***********************
	// Main application pages

	// Display a QR code to login for mobile wallet or a link for enterprise wallet
	verifierRoutes.Get("/displaysimpleqr", verifier.PageDisplaySimpleQR)

	// Error page when login session has expired without the user sending the credential
	verifierRoutes.Get("/loginexpired", verifier.PageLoginExpired)

	// // Error page when login session has expired without the user sending the credential
	// verifierRoutes.Get("/logindenied", verifier.PageLoginDenied)

	// Page displaying the received credential, after successful login
	verifierRoutes.Get("/receivecredential/:state", verifier.PageReceiveCredential)

	// Page displaying the received credential, after successful login
	verifierRoutes.Get("/logincompleted/:state", verifier.PageLoginCompleted)

	// Page displaying the received credential, after denied login
	verifierRoutes.Get("/logindenied/:state", verifier.PageLoginDenied)

	// Allow simulation of accessing protected resources, after successful login
	verifierRoutes.Get("/accessprotectedservice", verifier.PageAccessProtectedService)

	// **********************************
	// Internal APIs used by the Verifier

	// Used by the login page from the browser, to check successful login or expiration
	verifierRoutes.Get("/poll/:state", verifier.APIInternalPoll)

	// **********************************
	// Wallet APIs used by the wallet

	// Used by the Wallet to receive an Authentication Request using an API (for long requests)
	verifierRoutes.Get("/authenticationrequest", verifier.APIWalletAuthenticationRequest)

	// Used by the Wallet to send an Authentication Response with the Verifiable Presentation
	verifierRoutes.Post("/authenticationresponse", verifier.APIWalletAuthenticationResponse)

}

func (v *Verifier) HandleVerifierHome(c *fiber.Ctx) error {

	// Render template
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"prefix":         verifierPrefix,
	}
	return c.Render("verifier_home", m)
}

func (v *Verifier) VerifierAPIJWKS(c *fiber.Ctx) error {

	// Get public keys from Verifier
	did, err := v.vault.GetDIDForUser(v.id)
	if err != nil {
		return err
	}

	pubKey, err := v.vault.DIDKeyToPublicKey(did)
	if err != nil {
		return err
	}

	keySet := jwk.NewSet()
	keySet.AddKey(pubKey)

	return c.JSON(keySet)

}

func (v *Verifier) PageDisplaySimpleQR(c *fiber.Ctx) error {

	// Generate the stateKey that will be used for checking expiration and also successful logon
	stateKey := generateNonce()

	// This is the endpoint inside the QR that the wallet will use to send the VC/VP
	response_uri := httpLocation(c) + "/authenticationresponse"

	// Create the Authentication Request
	authRequest, err := v.createJWTSecuredAuthenticationRequest(response_uri, stateKey)
	if err != nil {
		return err
	}
	//v.rootServer.Logger.Info("AuthRequest", authRequest)
	zlog.Info().Str("AuthRequest", string(authRequest)).Send()

	// Create an entry in storage that will expire.
	// The entry is identified by the nonce
	status := handlers.NewState()
	status.SetStatus(handlers.StatePending)
	status.SetContent(authRequest)

	v.stateSession.Set(stateKey, status.Bytes(), handlers.StateExpirationDuration)

	request_uri := httpLocation(c) + "/authenticationrequest" + "/?jar=yes&state=" + stateKey

	escaped_request_uri := url.QueryEscape(request_uri)

	sameDeviceWallet := v.cfg.String("samedeviceWallet", "https://wallet.mycredential.eu")

	redirected_uri := sameDeviceWallet + "?request_uri=" + escaped_request_uri

	// Create the QR code for cross-device SIOP
	png, err := qrcode.Encode(request_uri, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	// Convert the image data to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	// Render the page
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"qrcode":         base64Img,
		"samedevice":     redirected_uri,
		"state":          stateKey,
		"prefix":         verifierPrefix,
	}
	return c.Render("verifier_present_simpleqr", m)
}

// Serve /loginexpired route
func (v *Verifier) PageLoginExpired(c *fiber.Ctx) error {
	m := fiber.Map{
		"prefix": verifierPrefix,
	}
	return c.Render("verifier_loginexpired", m)
}

// PageReceiveCredential is invoked by the page presenting the QR for authentication,
// when this page detects that the Wallet has sent a Verifiable Credential.
func (v *Verifier) PageReceiveCredential(c *fiber.Ctx) error {

	// Get the stateKey as a path parameter
	stateKey := c.Params("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	stateContent, _ := v.stateSession.Get(stateKey)
	if len(stateContent) < 2 {
		// Render an error
		err := handlers.ErrNoCredentialFoundInState
		zlog.Err(err).Send()
		m := fiber.Map{
			"error": err.Error(),
		}
		return c.Render("displayerror", m)
	}

	stateStatus := stateContent[0]

	// We should be here only if registering or authenticating
	if stateStatus != handlers.StateAuthenticating && stateStatus != handlers.StateRegistering {
		zlog.Err(handlers.ErrInvalidStateReceived).Str("expected", "registering,authenticating").Str("received", handlers.StatusToString(stateStatus)).Msg("PageReceiveCredential")

		zlog.Err(handlers.ErrInvalidStateReceived).Send()
		// Render an error
		m := fiber.Map{
			"error": "incorrect status",
		}
		return c.Render("displayerror", m)
	}

	// get the credential from the storage
	rawCred := stateContent[1:]

	// Decode the credential to enable access to individual fields
	var decoded map[string]any
	err := json.Unmarshal(rawCred, &decoded)
	if err != nil {
		zlog.Err(handlers.ErrBadCredentialFormat).Send()
		// Render an error
		m := fiber.Map{
			"error": handlers.ErrBadCredentialFormat,
		}
		return c.Render("displayerror", m)
	}

	// Render
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"claims":         decoded,
		"prefix":         verifierPrefix,
		"state":          stateKey,
		"registering":    (stateStatus == handlers.StateRegistering),
	}
	return c.Render("verifier_receivedcredential", m)
}

// PageLoginCompleted is invoked by the page presenting the QR for authentication,
// when this page detects that the Wallet has sent a Verifiable Credential and WebAuthn is also completed.
func (v *Verifier) PageLoginCompleted(c *fiber.Ctx) error {

	// Get the stateKey as a path parameter
	stateKey := c.Params("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	stateContent, _ := v.stateSession.Get(stateKey)
	if len(stateContent) < 2 {
		// Render an error
		err := handlers.ErrNoCredentialFoundInState
		zlog.Err(err).Send()
		m := fiber.Map{
			"error": err.Error(),
		}
		return c.Render("displayerror", m)
	}

	stateStatus := stateContent[0]
	if stateStatus != handlers.StateCompleted {
		zlog.Err(handlers.ErrInvalidStateReceived).Str("expected", "completed").Str("received", handlers.StatusToString(stateStatus)).Send()
		// Render an error
		m := fiber.Map{
			"error": "incorrect status",
		}
		return c.Render("displayerror", m)
	}

	zlog.Info().
		Str("stateKey", stateKey).
		Str("status", handlers.StatusToString(stateStatus)).
		Msg("PageLoginCompleted with state")

	// get the credential from the storage
	rawCred := stateContent[1:]

	// Delete the session key, as it is not needed anymore
	v.stateSession.Delete(stateKey)

	// Decode the credential to enable access to individual fields
	var decoded map[string]any
	err := json.Unmarshal(rawCred, &decoded)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "credential received not in JSON format")
	}

	claims := map[string]any{
		"credential": decoded,
	}
	// Create an access token from the credential
	accessToken, err := v.vault.CreateJWTtoken(claims, v.did)
	if err != nil {
		return err
	}
	zlog.Info().Str("token", string(accessToken)).Msg("Access Token created")

	// Set it in a cookie
	cookie := new(fiber.Cookie)
	cookie.Name = "dsbamvf"
	cookie.Value = string(accessToken)
	cookie.Expires = time.Now().Add(1 * time.Hour)

	// Set cookie
	c.Cookie(cookie)

	// Set also the access token in the Authorization field of the response header
	bearer := "Bearer " + string(accessToken)
	c.Set("Authorization", bearer)

	// Render
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"claims":         decoded,
		"prefix":         verifierPrefix,
		"state":          stateKey,
	}
	return c.Render("verifier_logincompleted", m)
}

// PageLoginDenied is invoked by the page presenting the QR for authentication,
// when this page detects that the Wallet has sent a Verifiable Credential and WebAuthn is also completed.
func (v *Verifier) PageLoginDenied(c *fiber.Ctx) error {

	// Get the stateKey as a path parameter
	stateKey := c.Params("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	zlog.Info().Str("stateKey", stateKey).Msg("PageLoginDenied")

	stateContent, _ := v.stateSession.Get(stateKey)
	if len(stateContent) < 2 {
		// Render an error
		err := handlers.ErrInvalidStateReceived
		zlog.Err(err).Send()
		m := fiber.Map{
			"error": err.Error(),
		}
		return c.Render("displayerror", m)
	}

	stateStatus := stateContent[0]
	if stateStatus != handlers.StateDenied {
		zlog.Err(handlers.ErrInvalidStateReceived).Str("expected", "denied").Str("received", handlers.StatusToString(stateStatus)).Send()
		// Render an error
		m := fiber.Map{
			"error": "incorrect status",
		}
		return c.Render("displayerror", m)
	}

	zlog.Info().Str("stateKey", stateKey).Str("status", handlers.StatusToString(stateStatus)).Msg("PageLoginCompleted with state")

	// get the credential from the storage
	rawCred := stateContent[1:]

	// Delete the session key, as it is not needed anymore
	v.stateSession.Delete(stateKey)

	// Decode the credential to enable access to individual fields
	var decoded map[string]any
	err := json.Unmarshal(rawCred, &decoded)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "credential received not in JSON format")
	}

	// Render
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"claims":         decoded,
		"prefix":         verifierPrefix,
		"state":          stateKey,
	}
	return c.Render("verifier_logindenied", m)
}

// PageAccessProtectedService performs access control to a protected resource based on the access token.
// For the moment is just a simulation
func (v *Verifier) PageAccessProtectedService(c *fiber.Ctx) error {

	var code int
	var returnBody []byte
	var errors []error

	// Try to get the access token from the cookie (for interactive HTML pages)
	accessToken := c.Cookies("dsbamvf")

	// Otherwise, try to teh the token from the Authorization HTTP Request header
	if len(accessToken) == 0 {
		auth := strings.Split(c.Get("authorization"), " ")
		if len(auth) > 1 {
			accessToken = auth[1]
			c.Locals("bearer", accessToken)
		}
	}

	// It is an error to receive a request withou Access Token
	if len(accessToken) == 0 {
		zlog.Error().Str("token", accessToken).Msg("no Access Token received")
		return fiber.NewError(fiber.StatusUnauthorized, "no Access Token received")
	}
	zlog.Info().Str("token", accessToken).Msg("Access Token received")

	// Verify the format and the signature of the Access Token.
	// No content verification is done here.
	// The token should have been signed by ourselves.
	token, err := v.vault.VerifyJWTtoken([]byte(accessToken), v.did)
	if err != nil {
		return err
	}

	// Convert the token payload to a manageable format
	payload, err := token.AsMap(context.Background())
	if err != nil {
		return err
	}

	// Minimal verification that it contains the credential object
	credential, ok := payload["credential"]
	if !ok {
		zlog.Error().Msg("credential not found in Access Token")
		return fiber.NewError(fiber.StatusBadRequest, "credential not found in Access Token")
	}
	zlog.Info().Msgf("%s", credential)

	// Check if the user has configured a protected service to access
	protected := v.rootServer.Cfg.String("verifier.protectedResource.url")
	if len(protected) == 0 {
		zlog.Error().Msg("no protected resource was configured")
		return fiber.NewError(fiber.StatusInternalServerError, "bad configuration: no protected resource")
	}

	// Perform access control
	rawcred, err := json.Marshal(credential)
	if err != nil {
		return err
	}
	authorized := v.pdp.TakeAuthnDecision(Authorize, c, string(rawcred), protected)
	if !authorized {
		zlog.Error().Msg("no authorization")

		// Render
		m := fiber.Map{
			"verifierPrefix": verifierPrefix,
			"claims":         credential,
		}
		return c.Render("verifier_logindenied", m)

	}

	// Prepare to GET to the url
	agent := fiber.Get(protected)

	// Set the Authentication header
	agent.Set("Authorization", "Bearer "+accessToken)

	agent.Set("accept", "application/json")
	code, returnBody, errors = agent.Bytes()
	if len(errors) > 0 {
		zlog.Err(errors[0]).Msg("error calling the protected resource")
		return errors[0]
	}

	// Render
	m := fiber.Map{
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"accesstoken":    accessToken,
		"protected":      protected,
		"code":           code,
		"returnBody":     string(returnBody),
	}
	return c.Render("verifier_protectedservice", m)
}

func (v *Verifier) APIInternalPoll(c *fiber.Ctx) error {

	// Get the stateKey as a path parameter
	stateKey := c.Params("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	// Get the object with the stateContent to check if session still pending
	stateContent, _ := v.stateSession.Get(stateKey)
	if len(stateContent) == 0 {
		// If we do not find the state, it means (most probably) that it has expired
		zlog.Info().Str("poll state", stateKey).Str("status", "expired").Msg("APIInternalPoll")
		return c.SendString("expired")
	}

	stateStatus := stateContent[0]
	statusString := handlers.StatusToString(stateStatus)

	zlog.Info().Str("poll state", stateKey).Str("status", statusString).Msg("APIInternalPoll")
	return c.SendString(statusString)

}

func (v *Verifier) APIWalletAuthenticationRequest(c *fiber.Ctx) error {

	// Get the stateKey
	stateKey := c.Query("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	zlog.Info().Str("stateKey", stateKey).Msg("APIWalletAuthenticationRequest")

	// get the JWT Authentication Request Object from the storage
	stateContent, _ := v.stateSession.Get(stateKey)
	if len(stateContent) == 0 {
		err := errors.New("no Authentication Request stored for stateKey")
		zlog.Err(err).Send()
		c.Status(403)
		return err
	}

	authenticationRequest := stateContent[1:]
	zlog.Info().Str("authenticationRequest", string(authenticationRequest)).Msg("")

	return c.Send(authenticationRequest)
}

func (v *Verifier) APIWalletAuthenticationResponse(c *fiber.Ctx) error {
	var theCredential *yaml.YAML
	var isEnterpriseWallet bool

	// Get the stateKey
	stateKey := c.Query("state")
	if len(stateKey) == 0 {
		zlog.Err(handlers.ErrNoStateReceived).Send()
		return fiber.NewError(fiber.StatusBadRequest, handlers.ErrNoStateReceived.Error())
	}

	zlog.Info().Str("stateKey", stateKey).Msg("APIWalletAuthenticationResponse")

	// We should receive the credential in the body as JSON
	body := c.Body()
	zlog.Info().Str("stateKey", stateKey).Bytes("body", body).Msg("Authentication Response")

	// Decode into a map
	authResponse, err := yaml.ParseJson(string(body))
	if err != nil {
		zlog.Err(err).Msg("invalid vp received")
		return err
	}

	// Get the vp_token field
	vp_token := authResponse.String("vp_token")
	if len(vp_token) == 0 {

		// Try to see if the request is coming from the enterprise wallet
		cred := authResponse.String("credential")
		if len(cred) == 0 {
			err := fmt.Errorf("no credential found")
			zlog.Err(err).Send()
			return err
		}

		theCredential, err = yaml.ParseJson(cred)
		if err != nil {
			zlog.Err(err).Msg("invalid credential received")
			return err
		}

		isEnterpriseWallet = true

	} else {
		// Decode VP from B64Url
		rawVP, err := base64.RawURLEncoding.DecodeString(vp_token)
		if err != nil {
			zlog.Err(err).Send()
			return err
		}

		// Parse the VP object into a map
		vp, err := yaml.ParseJson(string(rawVP))
		if err != nil {
			zlog.Err(err).Msg("invalid vp received")
			return err
		}

		// Get the list of credentials in the VP
		credentials := vp.List("verifiableCredential")
		if len(credentials) == 0 {
			err := fmt.Errorf("no 'verifiableCredential' member found")
			zlog.Err(err).Send()
			return err
		}

		// TODO: for the moment, we accept only the first credential inside the VP
		firstCredential := credentials[0]
		theCredential = yaml.New(firstCredential)

	}

	// Serialize the credential into a JSON string
	serialCredential, err := json.Marshal(theCredential.Data())
	if err != nil {
		return err
	}
	zlog.Info().Str("credential", string(serialCredential)).Send()

	// Invoke the PDP (Policy Decision Point) to authenticate/authorize this request
	accepted := v.pdp.TakeAuthnDecision(Authenticate, c, string(serialCredential), "")
	zlog.Info().Bool("Authenticated", accepted).Msg("")

	if !accepted {

		// Deny access
		// Set the credential in storage, and wait for the polling from client
		newState := handlers.NewState()
		newState.SetStatus(handlers.StateDenied)
		newState.SetContent(serialCredential)

		v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)

		zlog.Info().Msg("Authentication denied")
		return fiber.NewError(fiber.StatusUnauthorized, "access denied")

	}

	// Get the email of the user
	email := theCredential.String("credentialSubject.email")
	name := theCredential.String("credentialSubject.name")
	zlog.Info().Str("email", email).Msg("data in vp_token")

	// Get user from Database
	usr, err := v.vault.CreateOrGetUserWithDIDKey(email, name, "naturalperson", "ThePassword")
	if err != nil {
		zlog.Err(err).Msg("CreateOrGetUserWithDIDKey error")
		return err
	}

	// Check if the user has a registered WebAuthn credential
	var userNotRegistered bool
	if len(usr.WebAuthnCredentials()) == 0 {
		userNotRegistered = true
		zlog.Info().Msg("user does not have a registered WebAuthn credential")
	}

	if isEnterpriseWallet {

		// Set the credential in storage, and wait for the polling from client
		newState := handlers.NewState()
		newState.SetStatus(handlers.StateCompleted)
		newState.SetContent(serialCredential)

		v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)

		zlog.Info().Msg("AuthenticationResponse from enterprise wallet success")
		return c.SendString(email)

	} else {

		if userNotRegistered {
			// The user does not have WebAuthn credentials, so we require initial registration of the Authenticator

			// Set the credential in storage, and wait for the polling from client
			newState := handlers.NewState()
			newState.SetStatus(handlers.StateRegistering)
			newState.SetContent(serialCredential)

			err := v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)
			if err != nil {
				zlog.Err(err).Send()
				return err
			}

			zlog.Info().Msg("AuthenticationResponse success, new user created")

			resp := map[string]string{
				"authenticatorRequired": "yes",
				"authType":              "registration",
				"email":                 email,
			}

			return c.JSON(resp)

		} else {
			// The user already has WebAuthn credentials, so this should be a login operation with the Authenticator

			// Set the credential in storage, and wait for the polling from client
			newState := handlers.NewState()
			newState.SetStatus(handlers.StateAuthenticating)
			newState.SetContent(serialCredential)
			newStateString := newState.String()

			err := v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)
			if err != nil {
				zlog.Err(err).Send()
				return err
			}

			zlog.Info().
				Str("state", newStateString).
				Str("email", email).
				Msg("AuthenticationResponse success, existing user")

			resp := map[string]string{
				"authenticatorRequired": "yes",
				"type":                  "login",
				"email":                 email,
			}

			return c.JSON(resp)
		}

	}
}

// createJWTSecuredAuthenticationRequest creates an Authorization Request Object according to:
// "IETF RFC 9101: The OAuth 2.0 Authorization Framework: JWT-Secured Authorization Request (JAR)""
func (v *Verifier) createJWTSecuredAuthenticationRequest(response_uri string, state string) (json.RawMessage, error) {

	// This specifies the type of credential that the Verifier will accept
	// TODO: In this use case it is hardcoded, which is enough if the Verifier is simple and uses
	// only one type of credential for authenticating its users.

	verifierDID, err := v.vault.GetDIDForUser(v.id)
	if err != nil {
		return nil, err
	}

	jarPlain := map[string]any{
		"iss":              verifierDID,
		"aud":              "self-issued",
		"max_age":          600,
		"scope":            "dsba.credentials.presentation.Employee",
		"response_type":    "vp_token",
		"response_mode":    "direct_post",
		"client_id":        verifierDID,
		"client_id_scheme": "did",
		"response_uri":     response_uri,
		"state":            state,
		"nonce":            generateNonce(),
	}

	jar, err := v.vault.CreateJWTtoken(jarPlain, v.did)
	if err != nil {
		return nil, err
	}

	return jar, nil

}

func generateNonce() string {
	b := make([]byte, 16)
	io.ReadFull(rand.Reader, b)
	nonce := base64.RawURLEncoding.EncodeToString(b)
	return nonce
}

func httpLocation(c *fiber.Ctx) string {
	return c.Protocol() + "://" + c.Hostname() + verifierPrefix
}
