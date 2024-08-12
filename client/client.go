package client

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/foolin/goview"
	"github.com/google/uuid"
	"github.com/hesusruiz/vcutils/yaml"

	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	httphelper "github.com/zitadel/oidc/v3/pkg/http"
	"github.com/zitadel/oidc/v3/pkg/oidc"
)

type stringMap map[string]any

var (
	key = GenerateRandomKey(16)
	gv  *goview.ViewEngine
)

func Setup(cfg *yaml.YAML) {

	gv = goview.New(goview.Config{
		Root:         "client/views",
		Extension:    ".html",
		Master:       "layouts/master",
		DisableCache: true,
		Delims:       goview.Delims{Left: "{{", Right: "}}"},
	})

	// Serve the static assets
	http.Handle("/static/", http.FileServer(http.Dir("client/")))

	// The home page
	http.HandleFunc("/", indexHandler)

	http.HandleFunc("/example.html", func(w http.ResponseWriter, r *http.Request) {
		err := gv.Render(w, http.StatusOK, "example", nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	// Get my client ID to identify with the Verifier acting as OpenID Provider
	clientID := LookupEnvOrString("CLIENT_ID", "domemarketplace")
	clientSecret := LookupEnvOrString("CLIENT_SECRET", "secret")

	// The URL that the Verifier will use to call us with the result of authentication
	myURL := cfg.String("url", "https://demo.mycredential.eu")
	callbackPath := cfg.String("callbackPath", "/auth/callback")
	redirectURI := myURL + callbackPath

	// The URL of the Verifier (acting as OpenID Provider, Issuer of tokens)
	issuer := LookupEnvOrString("ISSUER", cfg.String("verifierURL", "https://verifier.mycredential.eu"))

	keyPath := LookupEnvOrString("KEY_PATH", "")

	// The OIDC scopes. Specify 'learcred' to receive the LEARCredential
	scopes := strings.Split(LookupEnvOrString("SCOPES", cfg.String("scopes", "openid learcred profile email")), " ")

	// Response mode for the OIDC flows
	responseMode := LookupEnvOrString("RESPONSE_MODE", "")

	cookieHandler := httphelper.NewCookieHandler(key, key, httphelper.WithUnsecure())

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)

	client := &http.Client{
		Timeout: time.Minute,
	}
	// enable outgoing request logging
	logging.EnableHTTPClient(client,
		logging.WithClientGroup("client"),
	)

	// The options used by the example application (acting as Relying Party)
	options := []rp.Option{
		rp.WithCookieHandler(cookieHandler),
		rp.WithVerifierOpts(rp.WithIssuedAtOffset(5 * time.Second)),
		rp.WithHTTPClient(client),
		rp.WithLogger(logger),
	}

	// If no secret specified, we will use PKCE to talk to the Verifier
	if clientSecret == "" {
		options = append(options, rp.WithPKCE(cookieHandler))
	}

	// If we specified a file with a private key, create a signer for the JWT Profile Client Authentication on the token endpoint
	if keyPath != "" {
		options = append(options, rp.WithJWTProfile(rp.SignerFromKeyPath(keyPath)))
	}

	// Add our logger to the context
	ctx := logging.ToContext(context.TODO(), logger)

	// Create the OIDC Relaying Party using the VC Verifier as OpenID Provider
	provider, err := rp.NewRelyingPartyOIDC(ctx, issuer, clientID, clientSecret, redirectURI, scopes, options...)
	if err != nil {
		logger.Error("error creating provider", "error", err.Error())
		os.Exit(1)
	}
	logger.Info("Relying Party created for the example application")

	// generate some state (representing the state of the user in your application,
	// e.g. the page where he was before sending him to login
	state := func() string {
		return uuid.New().String()
	}

	urlOptions := []rp.URLParamOpt{
		rp.WithPromptURLParam("Welcome back!"),
	}

	// Add the possible OIDC response modes, if specified
	if responseMode != "" {
		urlOptions = append(urlOptions, rp.WithResponseModeURLParam(oidc.ResponseMode(responseMode)))
	}

	// register the AuthURLHandler at your preferred path.
	// the AuthURLHandler creates the auth request and redirects the user to the auth server.
	// including state handling with secure cookie and the possibility to use PKCE.
	// Prompts can optionally be set to inform the server of
	// any messages that need to be prompted back to the user.
	http.Handle("/login", rp.AuthURLHandler(
		state,
		provider,
		urlOptions...,
	))

	// // for demonstration purposes the returned userinfo response is written as JSON object onto response
	// marshalUserinfo := func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty, info *oidc.UserInfo) {
	// 	fmt.Println("access token", tokens.AccessToken)
	// 	fmt.Println("refresh token", tokens.RefreshToken)
	// 	fmt.Println("id token", tokens.IDToken)

	// 	data, err := json.MarshalIndent(info, "", "  ")
	// 	if err != nil {
	// 		http.Error(w, err.Error(), http.StatusInternalServerError)
	// 		return
	// 	}
	// 	w.Write(data)
	// }

	// in this example the callback function itself is wrapped by the UserinfoCallback which
	// will call the Userinfo endpoint, check the sub and pass the info into the callback function
	//http.Handle(callbackPath, rp.CodeExchangeHandler(rp.UserinfoCallback(marshalUserinfo), provider))
	//
	//
	//

	// This function is called by the OIDC library when the Verifier calls the RP callback URL.
	processOIDCTokens := func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty) {
		idTokenClaims := tokens.IDTokenClaims
		learCredential := idTokenClaims.Claims["learcred"]
		data, err := json.MarshalIndent(learCredential, "", "  ")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		err = gv.Render(
			w, http.StatusOK, "after_login",
			stringMap{
				"learCredentialSerialised": string(data),
				"learCredential":           learCredential,
			})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}

	}

	// Register the CodeExchangeHandler at the callbackPath.
	// The CodeExchangeHandler handles the auth response, creates the token request and calls the 'processOIDCTokens' function
	// with the returned tokens from the token endpoint
	http.Handle(callbackPath, rp.CodeExchangeHandler(processOIDCTokens, provider))

	// simple counter for request IDs
	var counter atomic.Int64
	// enable incomming request logging
	mw := logging.Middleware(
		logging.WithLogger(logger),
		logging.WithGroup("server"),
		logging.WithIDFunc(func() slog.Attr {
			return slog.Int64("id", counter.Add(1))
		}),
	)

	// Start the server at the configured address
	listenAddress := cfg.String("listenAddress", ":9999")
	logger.Info("Application listening, press ctrl+c to stop", "addr", listenAddress)

	err = http.ListenAndServe(listenAddress, mw(http.DefaultServeMux))
	if err != http.ErrServerClosed {
		logger.Error("server terminated", "error", err)
		os.Exit(1)
	}
}

// LookupEnvOrString gets a value from the environment or returns the specified default value
func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func indexHandler(w http.ResponseWriter, r *http.Request) {

	err := gv.Render(w, http.StatusOK, "index", nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

}

func GenerateRandomKey(length int) []byte {
	k := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, k); err != nil {
		return nil
	}
	return k
}
