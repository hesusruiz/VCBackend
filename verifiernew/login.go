package verifiernew

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/evidenceledger/vcdemo/verifiernew/storage"
	"github.com/foolin/goview"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/sirupsen/logrus"
	"github.com/skip2/go-qrcode"
	"github.com/zitadel/oidc/v3/pkg/op"
)

const (
	queryAuthRequestID = "authRequestID"
)

type login struct {
	cfg          *Config
	authenticate authenticate
	router       chi.Router
	callback     func(context.Context, string) string
}

func NewLogin(
	cfg *Config,
	authenticate authenticate,
	callback func(context.Context, string) string,
	issuerInterceptor *op.IssuerInterceptor,
) *login {

	l := &login{
		cfg:          cfg,
		authenticate: authenticate,
		callback:     callback,
	}

	l.createRouter()

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

func (l *login) createRouter() {
	l.router = chi.NewRouter()

	// Basic CORS
	l.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// This will render the page with the QR code for cross-device and the link for same-device usage
	l.router.Get("/username", func(w http.ResponseWriter, r *http.Request) {
		err := r.ParseForm()
		if err != nil {
			http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
			return
		}
		// the oidc package will pass the id of the auth request as query parameter
		// we will use this id through the login process and therefore pass it to the login page
		renderLogin(l.cfg, w, r.FormValue(queryAuthRequestID), nil)
	})

	// The JavaScript in the Login page polls the backend to see when the Wallet has sent the
	// Authentication Response, to know when to continue.
	l.router.Get("/poll", l.APIWalletPoll)

	// We use request-uri, and this is the route that the Wallet calls to retrieve the
	// Authentication Request object
	l.router.Get("/authenticationrequest", func(w http.ResponseWriter, r *http.Request) {

		err := r.ParseForm()
		if err != nil {
			http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
			return
		}
		authReqId := r.FormValue("state")

		// Get the original auth request from the Client
		authReq, err := l.authenticate.GetWalletAuthRequestByID(authReqId)
		if err != nil {
			http.Error(w, fmt.Sprintf("error getting the Wallet AuthorizationRequest:%s", err), http.StatusInternalServerError)
			return
		}

		// Get the auth request that was sent to the Wallet
		walletAuthRequest := authReq.WalletAuthRequest

		w.Header().Add("Content-Type", "application/oauth-authz-req+jwt")
		w.Write([]byte(walletAuthRequest))

	})

	// The Wallet calls this route to send the Authentication Response with the LEARCredential
	l.router.Post("/authenticationresponse", func(w http.ResponseWriter, r *http.Request) {
		var theCredential *yaml.YAML

		body, _ := io.ReadAll(r.Body)

		err := r.ParseForm()
		if err != nil {
			http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
			return
		}
		authReqId := r.FormValue("state")
		log.Println("APIWalletAuthenticationResponse", "stateKey", authReqId)

		// Check if the AuthRequest exists
		_, err = l.authenticate.GetWalletAuthRequestByID(authReqId)
		if err != nil {
			http.Error(w, fmt.Sprintf("AuthRequest does not exist:%s", err), http.StatusInternalServerError)
			return
		}

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

		// Update the internal AuthRequest with the LEARCredential received from the Wallet.
		err = l.authenticate.SaveWalletAuthenticationResponse(authReqId, theCredential)
		if err != nil {
			http.Error(w, fmt.Sprintf("error updating Wallet authentication response:%s", err), http.StatusInternalServerError)
			return
		}

		// Send reply to the Wallet, so it can show a success screen
		resp := map[string]string{
			"authenticatorRequired": "no",
			"type":                  "login",
			"email":                 "email",
		}
		out, _ := json.Marshal(resp)

		w.Header().Add("Content-Type", "application/json")
		w.Write(out)

	})

	// For testing several things
	l.router.Get("/fake", l.FakeAPIWalletAuthenticationResponse)
	l.router.Post("/fake", l.FakeAPIWalletAuthenticationResponse)
}

type authenticate interface {
	GetWalletAuthRequestByID(id string) (*storage.InternalAuthRequest, error)
	SaveWalletAuthenticationResponse(id string, cred *yaml.YAML) error
	CheckLoginDone(id string) bool
}

func renderLogin(cfg *Config, w http.ResponseWriter, authRequestID string, formError error) {

	verifierURL := cfg.VerifierURL

	request_uri := verifierURL + "/login/authenticationrequest" + "?state=" + authRequestID
	escaped_request_uri := url.QueryEscape(request_uri)

	sameDeviceWallet := cfg.SamedeviceWallet
	openid4PVURL := "openid4vp://"

	samedevice_uri := sameDeviceWallet + "?request_uri=" + escaped_request_uri
	crossdevice_uri := openid4PVURL + "?request_uri=" + escaped_request_uri

	// Create the QR code for cross-device SIOP
	png, err := qrcode.Encode(crossdevice_uri, qrcode.Medium, 256)
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot create QR code:%s", err), http.StatusInternalServerError)
		return
	}

	// Convert the image data to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	const fakeURL = "openid://?response_type=vp_token&response_mode=direct_post&client_id=did:web:dome-marketplace-prd.org&redirect_uri=https://dome-verifier.mycredential.es/login/fake&state=mKSGXgsJ_Ktjr-9qwgO6SA&nonce=rjHS716zcPtrCO_Rl01hlg&scope=didRead,defaultScope"

	fakepng, err := qrcode.Encode(fakeURL, qrcode.Medium, 256)
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot create QR code:%s", err), http.StatusInternalServerError)
		return
	}

	fakebase64Img := base64.StdEncoding.EncodeToString(fakepng)
	fakebase64Img = "data:image/png;base64," + fakebase64Img

	data := &struct {
		AuthRequestID string
		QRcode        string
		FakeQRcode    string
		Samedevice    string
		Error         string
	}{
		AuthRequestID: authRequestID,
		QRcode:        base64Img,
		FakeQRcode:    fakebase64Img,
		Samedevice:    samedevice_uri,
		Error:         errMsg(formError),
	}

	err = goview.Render(w, http.StatusOK, "login", data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (l *login) FakeAPIWalletAuthenticationResponse(w http.ResponseWriter, r *http.Request) {
	var theCredential *yaml.YAML

	fmt.Println("\n\n\n\n======================")
	fmt.Println("Inside FAKE API")
	fmt.Println(r.URL)

	body, _ := io.ReadAll(r.Body)

	fmt.Println(string(body))

	err := r.ParseForm()
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
		return
	}
	authReqId := r.FormValue("state")
	log.Println("APIWalletAuthenticationResponse", "stateKey", authReqId)

	// The body should have a form like 'vp_token=eyJAY29udGV4dCI...IFVUQyJ9XX0'
	rawVP, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(string(body), "vp_token="))
	if err != nil {
		http.Error(w, fmt.Sprintf("error decoding VP:%s", err), http.StatusInternalServerError)
		return
	}

	fmt.Println(string(rawVP))

	// Decode into a map
	vp, err := yaml.ParseJson(string(rawVP))
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot parse body:%s", err), http.StatusInternalServerError)
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
	fmt.Print("======================\n\n\n")
	log.Println("credential", string(serialCredential))

	fmt.Print("======================\n\n\n")

	// // Invoke the PDP (Policy Decision Point) to authenticate/authorize this request
	// accepted, err := pdp.TakeAuthnDecision(Authenticate, r, string(serialCredential), "")
	// if err != nil {
	// 	http.Error(w, fmt.Sprintf("error evaluating authentication rules:%s", err), http.StatusInternalServerError)
	// 	return
	// }

	// if !accepted {
	// 	http.Error(w, "authentication failed", http.StatusUnauthorized)
	// 	return
	// }

	// // Update the storage object with the Wallet Authentication Response and signal login completed
	// err = l.authenticate.CheckWalletAuthenticationResponse(authReqId, theCredential)
	// if err != nil {
	// 	http.Error(w, fmt.Sprintf("error updating Wallet authentication response:%s", err), http.StatusInternalServerError)
	// 	return
	// }

	resp := map[string]string{
		"authenticatorRequired": "no",
		"type":                  "login",
		"email":                 "email",
	}
	out, _ := json.Marshal(resp)

	w.Header().Add("Content-Type", "application/json")
	w.Write(out)
	return
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

// func (l *login) APIWalletAuthenticationResponse(w http.ResponseWriter, r *http.Request) {
// 	var theCredential *yaml.YAML
// 	// var isEnterpriseWallet bool

// 	body, _ := io.ReadAll(r.Body)

// 	err := r.ParseForm()
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("cannot parse form:%s", err), http.StatusInternalServerError)
// 		return
// 	}
// 	authReqId := r.FormValue("state")
// 	log.Println("APIWalletAuthenticationResponse", "stateKey", authReqId)

// 	// Decode into a map
// 	authResponse, err := yaml.ParseJson(string(body))
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("cannot parse body:%s", err), http.StatusInternalServerError)
// 		return
// 	}

// 	// Get the vp_token field
// 	vp_token := authResponse.String("vp_token")
// 	if len(vp_token) == 0 {
// 		http.Error(w, "vp_token not found", http.StatusInternalServerError)
// 		return
// 	}
// 	// Decode VP from B64Url
// 	rawVP, err := base64.RawURLEncoding.DecodeString(vp_token)
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("error decoding VP:%s", err), http.StatusInternalServerError)
// 		return
// 	}

// 	// Parse the VP object into a map
// 	vp, err := yaml.ParseJson(string(rawVP))
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("error parsing the VP object:%s", err), http.StatusInternalServerError)
// 		return
// 	}

// 	// Get the list of credentials in the VP
// 	credentials := vp.List("verifiableCredential")
// 	if len(credentials) == 0 {
// 		http.Error(w, "no credentials found in VP", http.StatusInternalServerError)
// 		return
// 	}

// 	// TODO: for the moment, we accept only the first credential inside the VP
// 	firstCredential := credentials[0]
// 	theCredential = yaml.New(firstCredential)

// 	// Serialize the credential into a JSON string
// 	serialCredential, err := json.Marshal(theCredential.Data())
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("error serialising the credential:%s", err), http.StatusInternalServerError)
// 		return
// 	}
// 	log.Println("credential", string(serialCredential))

// 	// Invoke the PDP (Policy Decision Point) to authenticate/authorize this request
// 	accepted, err := pdp.TakeAuthnDecision(Authenticate, r, string(serialCredential), "")
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("error evaluating authentication rules:%s", err), http.StatusInternalServerError)
// 		return
// 	}

// 	if !accepted {
// 		http.Error(w, "authentication failed", http.StatusUnauthorized)
// 		return
// 	}

// 	// Update the storage object with the Wallet Authentication Response and signal login completed
// 	err = l.authenticate.CheckWalletAuthenticationResponse(authReqId, theCredential)
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("error updating Wallet authentication response:%s", err), http.StatusInternalServerError)
// 		return
// 	}

// 	resp := map[string]string{
// 		"authenticatorRequired": "no",
// 		"type":                  "login",
// 		"email":                 "email",
// 	}
// 	out, _ := json.Marshal(resp)

// 	w.Header().Add("Content-Type", "application/json")
// 	w.Write(out)
// 	return

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

// }

func errMsg(err error) string {
	if err == nil {
		return ""
	}
	logrus.Error(err)
	return err.Error()
}
