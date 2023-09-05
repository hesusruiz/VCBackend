package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/storage/memory"
	"github.com/hesusruiz/vcbackend/back/handlers"
	"github.com/hesusruiz/vcbackend/back/operations"
	"github.com/hesusruiz/vcbackend/vault"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/valyala/fasttemplate"
	"go.uber.org/zap"
)

type Verifier struct {
	rootServer   *handlers.Server
	vault        *vault.Vault
	cfg          *yaml.YAML
	stateSession *memory.Storage
	operations   *operations.Manager
	webAuthn     *handlers.WebAuthnHandler
	did          string
}

// SetupVerifier creates and setups the Verifier routes
func SetupVerifier(s *handlers.Server, cfg *yaml.YAML) {

	verifier := &Verifier{}

	verifier.rootServer = s
	verifier.cfg = cfg

	// Connect to the Verifier store engine
	verifier.vault = vault.Must(vault.New(yaml.New(cfg.Map("verifier"))))

	// Create the Verifier users
	// TODO: the password is only for testing
	_, verifier.did, _ = verifier.vault.CreateOrGetUserWithDIDKey(cfg.String("verifier.id"), cfg.String("verifier.name"), "legalperson", cfg.String("verifier.password"))

	// Backend Operations for the Verifier
	verifier.operations = operations.NewManager(verifier.vault, cfg)

	// Create a storage entry for OIDC4VP flow expiration
	verifier.stateSession = memory.New()

	// WebAuthn
	verifier.webAuthn = handlers.NewWebAuthnHandler(s, verifier.stateSession, verifier.operations, cfg)

	s.Get("/verifier", verifier.HandleVerifierHome)

	// Define the prefix for Verifier routes
	verifierRoutes := s.Group(verifierPrefix)

	// Routes consist of a set of pages rendering HTML using templates and a set of APIs

	// The JWKS endpoint
	jwks_uri := s.Cfg.String("verifier.uri_prefix") + s.Cfg.String("verifier.jwks_uri")
	s.Get(jwks_uri, s.VerifierAPIJWKS)

	// ***********************
	// Main application pages

	// Display a QR code to login for mobile wallet or a link for enterprise wallet
	verifierRoutes.Get("/displayqr", verifier.PageDisplayQRSIOP)

	// Error page when login session has expired without the user sending the credential
	verifierRoutes.Get("/loginexpired", verifier.PageLoginExpired)

	// For same-device logins (e.g., with the enterprise wallet)
	verifierRoutes.Get("/startsiopsamedevice", verifier.PageStartSIOPSameDevice)

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
	verifierRoutes.Get("/token/:state", verifier.APIInternalToken)

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

// PageDisplayQRSIOP displays a QR code to be scanned by the Wallet to start the SIOP process
func (v *Verifier) PageDisplayQRSIOP(c *fiber.Ctx) error {

	// Generate the stateKey that will be used for checking expiration and also successful logon
	stateKey := generateNonce()

	// Create an entry in storage that will expire.
	// The entry is identified by the nonce
	status := handlers.NewState()
	status.SetStatus(handlers.StatePending)

	v.stateSession.Set(stateKey, status.Bytes(), handlers.StateExpiration)

	// This is the endpoint inside the QR that the wallet will use to send the VC/VP
	redirect_uri := c.Protocol() + "://" + c.Hostname() + verifierPrefix + "/authenticationresponse"

	// Create the Authentication Request
	authRequest := createAuthenticationRequest(v.rootServer.VerifierDID, redirect_uri, stateKey)
	//v.rootServer.Logger.Info("AuthRequest", authRequest)
	zlog.Info().Str("AuthRequest", authRequest).Send()

	// Create the QR code for cross-device SIOP
	png, err := qrcode.Encode(authRequest, qrcode.Medium, 256)
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
		"prefix":         verifierPrefix,
		"state":          stateKey,
	}
	return c.Render("verifier_present_qr", m)
}

// Serve /loginexpired route
func (v *Verifier) PageLoginExpired(c *fiber.Ctx) error {
	m := fiber.Map{
		"prefix": verifierPrefix,
	}
	return c.Render("verifier_loginexpired", m)
}

// PageStartSIOPSameDevice performs a redirection to a Wallet in the same device (browser)
// This is compementary to the cross-device OIDC flows
func (v *Verifier) PageStartSIOPSameDevice(c *fiber.Ctx) error {

	stateKey := c.Query("state")

	const scope = "dsba.credentials.presentation.Employee"
	const response_type = "vp_token"
	redirect_uri := c.Protocol() + "://" + c.Hostname() + verifierPrefix + "/authenticationresponse"

	walletUri := c.Protocol() + "://" + c.Hostname() + walletPrefix + "/selectcredential"
	template := walletUri + "/?scope={{scope}}" +
		"&response_type={{response_type}}" +
		"&response_mode=post" +
		"&client_id={{client_id}}" +
		"&redirect_uri={{redirect_uri}}" +
		"&state={{state}}" +
		"&nonce={{nonce}}"

	t := fasttemplate.New(template, "{{", "}}")
	str := t.ExecuteString(map[string]interface{}{
		"scope":         scope,
		"response_type": response_type,
		"client_id":     v.rootServer.VerifierDID,
		"redirect_uri":  redirect_uri,
		"state":         stateKey,
		"nonce":         generateNonce(),
	})
	fmt.Println(str)

	return c.Redirect(str)
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

	// Create an access token from the credential
	accessToken, err := v.vault.CreateAccessToken(rawCred, v.rootServer.Cfg.String("verifier.id"))
	if err != nil {
		return err
	}
	v.rootServer.Logger.Info("Access Token created", string(accessToken))

	// Set it in a cookie
	cookie := new(fiber.Cookie)
	cookie.Name = "dbsamvf"
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

	// Get the access token from the cookie
	accessToken := c.Cookies("dbsamvf")
	v.rootServer.Logger.Info("Access Token received", accessToken)

	// Check if the user has configured a protected service to access
	protected := v.rootServer.Cfg.String("verifier.protectedResource.url")
	if len(protected) > 0 {

		// Prepare to GET to the url
		agent := fiber.Get(protected)

		// Set the Authentication header
		agent.Set("Authorization", "Bearer "+accessToken)

		agent.Set("accept", "application/json")
		code, returnBody, errors = agent.Bytes()
		if len(errors) > 0 {
			v.rootServer.Logger.Errorw("error calling the protected resource", zap.Errors("errors", errors))
			return fmt.Errorf("error calling the protected resource: %v", errors[0])
		}

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

// retrieve token for the given session("state"-paramter)
func (v *Verifier) APIInternalToken(c *fiber.Ctx) error {
	v.rootServer.Logger.Info("Get the token")
	// get the stateKey
	stateKey := c.Params("state")

	v.rootServer.Logger.Infof("Get for state %s", stateKey)
	// get the credential from the storage
	rawCred, _ := v.stateSession.Get(stateKey)
	if len(rawCred) == 0 {

		v.rootServer.Logger.Infof("No credential stored for '%s'", stateKey)
		c.Status(403)
		return errors.New("No_such_credential")
	}

	// Create an access token from the credential
	accessToken, err := v.vault.CreateAccessToken(rawCred, v.rootServer.Cfg.String("verifier.id"))
	if err != nil {
		v.rootServer.Logger.Infof("Was not able to create the token. Err: %s", err)
		c.Status(500)
		return err
	}
	v.rootServer.Logger.Info("Access Token created", string(accessToken))

	return c.SendString(string(accessToken))
}

func (v *Verifier) APIWalletAuthenticationRequest(c *fiber.Ctx) error {

	// Get the stateKey
	stateKey := c.Query("state")

	const scope = "dsba.credentials.presentation.PacketDeliveryService"
	const response_type = "vp_token"
	redirect_uri := c.Protocol() + "://" + c.Hostname() + verifierPrefix + "/authenticationresponse"

	template := "openid://?scope={{scope}}" +
		"&response_type={{response_type}}" +
		"&response_mode=post" +
		"&client_id={{client_id}}" +
		"&redirect_uri={{redirect_uri}}" +
		"&state={{state}}" +
		"&nonce={{nonce}}"

	t := fasttemplate.New(template, "{{", "}}")
	str := t.ExecuteString(map[string]interface{}{
		"scope":         scope,
		"response_type": response_type,
		"client_id":     v.rootServer.VerifierDID,
		"redirect_uri":  redirect_uri,
		"state":         stateKey,
		"nonce":         generateNonce(),
	})

	return c.SendString(str)
}

// // VerifierAPIAuthenticationResponseVP receives a VP, extracts the VC and display a page
// func (v *Verifier) VerifierAPIAuthenticationResponseVP(c *fiber.Ctx) error {

// 	// Get the state, which indicates the login session to which this request belongs
// 	state := c.Query("state")

// 	// We should receive the Verifiable Presentation in the body as JSON
// 	body := c.Body()
// 	fmt.Println(string(body))
// 	fmt.Println(string(state))

// 	// Decode into a map
// 	vp, err := yaml.ParseJson(string(body))
// 	if err != nil {
// 		v.server.Logger.Errorw("invalid vp received", zap.Error(err))
// 		return err
// 	}

// 	credential := vp.String("credential")
// 	// Validate the credential

// 	// Set the credential in storage, and wait for the polling from client
// 	v.server.SessionStorage.Set(state, []byte(credential), stateExpiration)

// 	return c.SendString("ok")
// }

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

	vp_token := authResponse.String("vp_token")
	if len(vp_token) == 0 {

		// Try to see if the request is coming from the enterprise wallet
		cred := authResponse.String("credential")
		if len(cred) == 0 {
			err := fmt.Errorf("no vp_token found")
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

		vp, err := yaml.ParseJson(string(rawVP))
		if err != nil {
			zlog.Err(err).Msg("invalid vp received")
			return err
		}
		credentials := vp.List("verifiableCredential")

		// TODO: for the moment, we accept only the first credential inside the VP
		firstCredential := credentials[0]
		theCredential = yaml.New(firstCredential)

	}

	// Get the email of the user
	email := theCredential.String("credentialSubject.email")
	name := theCredential.String("credentialSubject.name")
	positionSection := theCredential.String("credentialSubject.position.section")
	zlog.Info().Str("email", email).Msg("data in vp_token")

	serialCredential, err := json.Marshal(theCredential.Data())
	if err != nil {
		return err
	}
	zlog.Info().Str("credential", string(serialCredential))

	zlog.Info().Str("section", positionSection).Msg("Performing access control")
	if positionSection != "Section of other good things" {

		// Set the credential in storage, and wait for the polling from client
		newState := handlers.NewState()
		newState.SetStatus(handlers.StateDenied)
		newState.SetContent(serialCredential)

		v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpiration)

		zlog.Info().Msg("Authentication denied")
		return fiber.NewError(fiber.StatusUnauthorized, email)

	}

	// Get user from Database
	usr, _ := v.operations.User().GetByName(email)
	if usr == nil {

		usr, err = v.operations.User().CreateOrGet(email, name)
		if err != nil {
			v.rootServer.Logger.Errorw("error creating user", zap.Error(err))
			return err
		}
		zlog.Info().Str("email", email).Msg("new user created")
	}

	// Check if the user has a registered WebAuthn credetial
	var userNotRegistered bool
	if len(usr.WebAuthnCredentials()) == 0 {
		userNotRegistered = true
	}
	zlog.Info().Msg("user does not have a registered WebAuthn credential")

	if isEnterpriseWallet {

		// Set the credential in storage, and wait for the polling from client
		newState := handlers.NewState()
		newState.SetStatus(handlers.StateCompleted)
		newState.SetContent(serialCredential)

		v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpiration)

		zlog.Info().Msg("AuthenticationResponse from enterprise wallet success")
		return c.SendString(email)

	} else {

		if userNotRegistered {
			// We just created a user, so we require initial registration of the Authenticator

			// Set the credential in storage, and wait for the polling from client
			newState := handlers.NewState()
			newState.SetStatus(handlers.StateRegistering)
			newState.SetContent(serialCredential)

			v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpiration)

			zlog.Info().Msg("AuthenticationResponse success, new user created")
			return fiber.NewError(fiber.StatusNotFound, email)

		} else {
			// The user already existed, so this should be a login operation with the Authenticator

			// Set the credential in storage, and wait for the polling from client
			newState := handlers.NewState()
			newState.SetStatus(handlers.StateAuthenticating)
			newState.SetContent(serialCredential)
			newStateString := newState.String()

			v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpiration)

			zlog.Info().Str("state", newStateString).Str("email", email).Msg("AuthenticationResponse success, existing user")
			return c.SendString(email)

		}

	}
}

// func (v *Verifier) VerifierPageDisplayQR(c *fiber.Ctx) error {

// 	if sameDevice {
// 		return v.PageStartSIOPSameDevice(c)
// 	}

// 	// Generate the state that will be used for checking expiration
// 	state := generateNonce()

// 	// Create an entry in storage that will expire in 2 minutes
// 	// The entry is identified by the nonce
// 	// s.storage.Set(state, []byte("pending"), 2*time.Minute)
// 	v.server.SessionStorage.Set(state, []byte("pending"), stateExpiration)

// 	// QR code for cross-device SIOP
// 	template := "{{protocol}}://{{hostname}}{{prefix}}/startsiop?state={{state}}"
// 	qrCode1, err := qrCode(template, c.Protocol(), c.Hostname(), verifierPrefix, state)
// 	if err != nil {
// 		return err
// 	}

// 	// Render index
// 	m := fiber.Map{
// 		"issuerPrefix":   issuerPrefix,
// 		"verifierPrefix": verifierPrefix,
// 		"walletPrefix":   walletPrefix,
// 		"qrcode":         qrCode1,
// 		"prefix":         verifierPrefix,
// 		"state":          state,
// 	}
// 	return c.Render("verifier_present_qr", m)
// }

// func qrCode(template, protocol, hostname, prefix, state string) (string, error) {

// 	// Construct the URL to be included in the QR
// 	t := fasttemplate.New(template, "{{", "}}")
// 	str := t.ExecuteString(map[string]interface{}{
// 		"protocol": protocol,
// 		"hostname": hostname,
// 		"prefix":   prefix,
// 		"state":    state,
// 	})

// 	// Create the QR
// 	png, err := qrcode.Encode(str, qrcode.Medium, 256)
// 	if err != nil {
// 		return "", err
// 	}

// 	// Convert to a dataURL
// 	base64Img := base64.StdEncoding.EncodeToString(png)
// 	base64Img = "data:image/png;base64," + base64Img

// 	return base64Img, nil

// }

func createAuthenticationRequest(verifierDID string, redirect_uri string, state string) string {

	// This specifies the type of credential that the Verifier will accept
	// TODO: In this use case it is hardcoded, which is enough if the Verifier is simple and uses
	// only one type of credential for authentication its users.
	const scope = "dsba.credentials.presentation.Employee"

	// The response type should be 'vp_token'
	const response_type = "vp_token"

	// Response mode should be 'post'
	const response_mode = "post"

	// We use a template to generate the final string
	template := "openid://?scope={{scope}}" +
		"&response_type={{response_type}}" +
		"&response_mode={{response_mode}}" +
		"&client_id={{client_id}}" +
		"&redirect_uri={{redirect_uri}}" +
		"&state={{state}}" +
		"&nonce={{nonce}}"

	t := fasttemplate.New(template, "{{", "}}")
	authRequest := t.ExecuteString(map[string]interface{}{
		"scope":         scope,
		"response_type": response_type,
		"response_mode": response_mode,
		"client_id":     verifierDID,
		"redirect_uri":  redirect_uri,
		"state":         state,
		"nonce":         generateNonce(),
	})

	return authRequest

}
