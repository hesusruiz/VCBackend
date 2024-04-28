package exampleop

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"

	"github.com/evidenceledger/vcdemo/verifiernew/storage"
	"github.com/foolin/goview"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/skip2/go-qrcode"
	"github.com/zitadel/oidc/v3/pkg/op"
)

type login struct {
	authenticate authenticate
	router       chi.Router
	callback     func(context.Context, string) string
}

func NewLogin(authenticate authenticate,
	callback func(context.Context, string) string,
	issuerInterceptor *op.IssuerInterceptor) *login {

	l := &login{
		authenticate: authenticate,
		callback:     callback,
	}
	l.createRouter(issuerInterceptor)

	gv := goview.New(goview.Config{
		Root:         "verifiernew/views",
		Extension:    ".html",
		Master:       "layouts/master",
		DisableCache: true,
		Delims:       goview.Delims{Left: "{{", Right: "}}"},
	})

	//Set new instance
	goview.Use(gv)

	return l
}

func (l *login) createRouter(issuerInterceptor *op.IssuerInterceptor) {
	l.router = chi.NewRouter()

	// Basic CORS
	l.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	l.router.Get("/username", l.loginHandler)
	l.router.Get("/authenticationrequest", l.APIWalletAuthenticationRequest)
	l.router.Get("/poll", l.APIWalletPoll)
	l.router.Post("/authenticationresponse", l.APIWalletAuthenticationResponse)
	l.router.Post("/username", issuerInterceptor.HandlerFunc(l.checkLoginHandler))
}

// TODO: add the ability to check/verify a VC PresentationResponse to update the in-memory registry
type authenticate interface {
	CheckUsernamePassword(username, password, id string) error
	GetWalletAuthenticationRequest(id string) (*storage.InternalAuthRequest, error)
	CheckWalletAuthenticationResponse(id string, cred *yaml.YAML) error
	CheckLoginDone(id string) bool
}

func (l *login) loginHandler(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	// the oidc package will pass the id of the auth request as query parameter
	// we will use this id through the login process and therefore pass it to the login page
	renderLogin(w, r.FormValue(queryAuthRequestID), nil)
}

func renderLogin(w http.ResponseWriter, authRequestID string, formError error) {

	request_uri := "https://verifier.mycredential.eu/login/authenticationrequest" + "?state=" + authRequestID

	escaped_request_uri := url.QueryEscape(request_uri)

	sameDeviceWallet := "https://wallet.mycredential.eu"
	openid4PVURL := "openid4vp://"

	redirected_uri := sameDeviceWallet + "?request_uri=" + escaped_request_uri
	qr_uri := openid4PVURL + "?request_uri=" + escaped_request_uri

	// Create the QR code for cross-device SIOP
	png, err := qrcode.Encode(qr_uri, qrcode.Medium, 256)
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot create QR code:%s", err), http.StatusInternalServerError)
		return
	}

	// Convert the image data to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	data := &struct {
		AuthRequestID string
		QRcode        string
		Samedevice    string
		Error         string
	}{
		AuthRequestID: authRequestID,
		QRcode:        base64Img,
		Samedevice:    redirected_uri,
		Error:         errMsg(formError),
	}

	err = goview.Render(w, http.StatusOK, "login", data)

	// err = templates.ExecuteTemplate(w, "login", data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// TODO: replace with the reception and verification of the VC PresentationResponse.
// The function will redirect to the client application using the callback URL.
func (l *login) checkLoginHandler(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	username := r.FormValue("username")
	password := r.FormValue("password")
	id := r.FormValue("id")
	err = l.authenticate.CheckUsernamePassword(username, password, id)
	if err != nil {
		renderLogin(w, id, err)
		return
	}
	http.Redirect(w, r, l.callback(r.Context(), id), http.StatusFound)
}

func (l *login) APIWalletAuthenticationRequest(w http.ResponseWriter, r *http.Request) {

	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	authReqId := r.FormValue("state")

	// Get the original auth request from the Client
	authReq, err := l.authenticate.GetWalletAuthenticationRequest(authReqId)
	if err != nil {
		http.Error(w, fmt.Sprintf("error getting the Wallet AuthorizationRequest:%s", err), http.StatusInternalServerError)
		return
	}

	// Get the auth request that was sent to the Wallet
	walletAuthRequest := authReq.WalletAuthRequest

	w.Write([]byte(walletAuthRequest))

}

func (l *login) APIWalletPoll(w http.ResponseWriter, r *http.Request) {

	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	authReqId := r.FormValue("state")
	if l.authenticate.CheckLoginDone(authReqId) {
		http.Redirect(w, r, l.callback(r.Context(), authReqId), http.StatusFound)
	}

	w.Write([]byte("pending"))

}

func (l *login) APIWalletAuthenticationResponse(w http.ResponseWriter, r *http.Request) {
	var theCredential *yaml.YAML
	// var isEnterpriseWallet bool

	body, _ := io.ReadAll(r.Body)

	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	authReqId := r.FormValue("state")
	log.Println("APIWalletAuthenticationResponse", "stateKey", authReqId)

	// Decode into a map
	authResponse, err := yaml.ParseJson(string(body))
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse body:%s", err), http.StatusInternalServerError)
		return
	}

	// Get the vp_token field
	vp_token := authResponse.String("vp_token")
	if len(vp_token) == 0 {
		http.Error(w, "vp_token not found", http.StatusInternalServerError)
		return
	}
	// Decode VP from B64Url
	rawVP, err := base64.RawURLEncoding.DecodeString(vp_token)
	if err != nil {
		http.Error(w, fmt.Sprintf("error decoding VP:%s", err), http.StatusInternalServerError)
		return
	}

	// Parse the VP object into a map
	vp, err := yaml.ParseJson(string(rawVP))
	if err != nil {
		http.Error(w, fmt.Sprintf("error parsing the VP object:%s", err), http.StatusInternalServerError)
		return
	}

	// Get the list of credentials in the VP
	credentials := vp.List("verifiableCredential")
	if len(credentials) == 0 {
		http.Error(w, "no credentials found in VP", http.StatusInternalServerError)
		return
	}

	// TODO: for the moment, we accept only the first credential inside the VP
	firstCredential := credentials[0]
	theCredential = yaml.New(firstCredential)

	// Serialize the credential into a JSON string
	serialCredential, err := json.Marshal(theCredential.Data())
	if err != nil {
		http.Error(w, fmt.Sprintf("error serialising the credential:%s", err), http.StatusInternalServerError)
		return
	}
	log.Println("credential", string(serialCredential))

	// Invoke the PDP (Policy Decision Point) to authenticate/authorize this request
	accepted, err := pdp.TakeAuthnDecision(Authenticate, r, string(serialCredential), "")
	if err != nil {
		http.Error(w, fmt.Sprintf("error evaluating authentication rules:%s", err), http.StatusInternalServerError)
		return
	}

	if !accepted {
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}

	// Update the storage object with the Wallet Authentication Response and signal login completed
	err = l.authenticate.CheckWalletAuthenticationResponse(authReqId, theCredential)
	if err != nil {
		http.Error(w, fmt.Sprintf("error updating Wallet authentication response:%s", err), http.StatusInternalServerError)
		return
	}

	resp := map[string]string{
		"authenticatorRequired": "no",
		"type":                  "login",
		"email":                 "email",
	}
	out, _ := json.Marshal(resp)

	w.Header().Add("Content-Type", "application/json")
	w.Write(out)
	return

	// // Invoke the PDP (Policy Decision Point) to authenticate/authorize this request
	// accepted := v.pdp.TakeAuthnDecision(Authenticate, c, string(serialCredential), "")
	// zlog.Info().Bool("Authenticated", accepted).Msg("")

	// if !accepted {

	// 	// Deny access
	// 	// Set the credential in storage, and wait for the polling from client
	// 	newState := handlers.NewState()
	// 	newState.SetStatus(handlers.StateDenied)
	// 	newState.SetContent(serialCredential)

	// 	v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)

	// 	zlog.Info().Msg("Authentication denied")
	// 	return fiber.NewError(fiber.StatusUnauthorized, "access denied")

	// }

	// // Get the email of the user
	// email := theCredential.String("credentialSubject.mandate.mandatee.email")
	// // name := theCredential.String("credentialSubject.name")
	// // zlog.Info().Str("email", email).Msg("data in vp_token")

	// // // Get user from Database
	// // usr, err := v.vault.CreateOrGetUserWithDIDKey(email, name, "naturalperson", "ThePassword")
	// // if err != nil {
	// // 	zlog.Err(err).Msg("CreateOrGetUserWithDIDKey error")
	// // 	return err
	// // }

	// // // Check if the user has a registered WebAuthn credential
	// var userNotRegistered bool
	// // if len(usr.WebAuthnCredentials()) == 0 {
	// // 	userNotRegistered = true
	// // 	zlog.Info().Msg("user does not have a registered WebAuthn credential")
	// // }

	// if isEnterpriseWallet {

	// 	// Set the credential in storage, and wait for the polling from client
	// 	newState := handlers.NewState()
	// 	newState.SetStatus(handlers.StateCompleted)
	// 	newState.SetContent(serialCredential)

	// 	v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)

	// 	zlog.Info().Msg("AuthenticationResponse from enterprise wallet success")
	// 	return c.SendString(email)

	// } else {

	// 	if !v.cfg.Bool("authenticatorRequired", false) {

	// 		// Set the credential in storage, and wait for the polling from client
	// 		newState := handlers.NewState()
	// 		newState.SetStatus(handlers.StateCompleted)
	// 		newState.SetContent(serialCredential)
	// 		newStateString := newState.String()

	// 		err := v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)
	// 		if err != nil {
	// 			zlog.Err(err).Send()
	// 			return err
	// 		}

	// 		zlog.Info().
	// 			Str("state", newStateString).
	// 			Str("email", email).
	// 			Msg("AuthenticationResponse success, not requiring webAuthn")

	// 		resp := map[string]string{
	// 			"authenticatorRequired": "no",
	// 			"type":                  "login",
	// 			"email":                 email,
	// 		}

	// 		return c.JSON(resp)

	// 	}

	// 	if userNotRegistered {
	// 		// The user does not have WebAuthn credentials, so we require initial registration of the Authenticator

	// 		// Set the credential in storage, and wait for the polling from client
	// 		newState := handlers.NewState()
	// 		newState.SetStatus(handlers.StateRegistering)
	// 		newState.SetContent(serialCredential)

	// 		err := v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)
	// 		if err != nil {
	// 			zlog.Err(err).Send()
	// 			return err
	// 		}

	// 		zlog.Info().Msg("AuthenticationResponse success, new user created")

	// 		resp := map[string]string{
	// 			"authenticatorRequired": "yes",
	// 			"authType":              "registration",
	// 			"email":                 email,
	// 		}

	// 		return c.JSON(resp)

	// 	} else {
	// 		// The user already has WebAuthn credentials, so this should be a login operation with the Authenticator

	// 		// Set the credential in storage, and wait for the polling from client
	// 		newState := handlers.NewState()
	// 		newState.SetStatus(handlers.StateAuthenticating)
	// 		newState.SetContent(serialCredential)
	// 		newStateString := newState.String()

	// 		err := v.stateSession.Set(stateKey, newState.Bytes(), handlers.StateExpirationDuration)
	// 		if err != nil {
	// 			zlog.Err(err).Send()
	// 			return err
	// 		}

	// 		zlog.Info().
	// 			Str("state", newStateString).
	// 			Str("email", email).
	// 			Msg("AuthenticationResponse success, existing user")

	// 		resp := map[string]string{
	// 			"authenticatorRequired": "yes",
	// 			"type":                  "login",
	// 			"email":                 email,
	// 		}

	// 		return c.JSON(resp)
	// 	}

	// }

}
