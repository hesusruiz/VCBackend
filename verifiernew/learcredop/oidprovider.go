package learcredop

import (
	"crypto/sha256"
	"fmt"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hesusruiz/vcutils/yaml"
	my "github.com/hesusruiz/vcutils/yaml"
	"github.com/zitadel/logging"
	"golang.org/x/text/language"

	"github.com/evidenceledger/vcdemo/verifiernew/storage"
	"github.com/zitadel/oidc/v3/pkg/op"
)

const (
	pathLoggedOut            = "/logged-out"
	defaultAuthnPoliciesFile = "authn_policies.star"
)

func init() {

	// For the moment we use an in-memory implementation, so we need to register the known clients.
	// TODO: use Pocketbase to store them in a collection.
	// The following are three sample clients, each of a different type.
	storage.RegisterClients(
		storage.NativeClient("native"),
		storage.WebClient("domemarketplace", "secret"),
		storage.WebClient("api", "secret"),
	)
}

type Storage interface {
	op.Storage
	authenticate
	deviceAuthenticate
}

// simple counter for request IDs
var counter atomic.Int64

var pdp *PDP

type VerifierServer struct {
	Config *Config
	Server *http.Server
}

func New(cfg *my.YAML) *VerifierServer {
	ver := &VerifierServer{}

	c, err := ConfigFromMap(cfg)
	if err != nil {
		panic(err)
	}
	ver.Config = c

	return ver

}

// SetupServer creates an OIDC server with the configured verifier URL
func (ver *VerifierServer) SetupServer(cfg *yaml.YAML, storage Storage, logger *slog.Logger, wrapServer bool, extraOptions ...op.Option) (chi.Router, error) {
	var err error

	verifierURL := ver.Config.VerifierURL
	if len(verifierURL) == 0 {
		return nil, fmt.Errorf("verifierURL not specified in config")
	}

	// Start the Policy Decision Point engine for this Verifier
	authnPoliciesFile := cfg.String("authnPolicies", defaultAuthnPoliciesFile)
	pdp, err = NewPDP(authnPoliciesFile)
	if err != nil {
		return nil, fmt.Errorf("starting authn policies runtime: %w", err)
	}

	// the OpenID Provider requires a 32-byte verifierKey for (token) encryption
	// be sure to create a proper crypto random verifierKey and manage it securely!
	// TODO: use Pocketbase secret management for the Verifier verifierKey
	verifierKey := sha256.Sum256([]byte("test"))

	router := chi.NewRouter()
	router.Use(logging.Middleware(
		logging.WithLogger(logger),
		logging.WithIDFunc(func() slog.Attr {
			return slog.Int64("id", counter.Add(1))
		}),
	))

	fs := http.FileServer(http.Dir("verifiernew/static"))
	router.Handle("/static/*", http.StripPrefix("/static/", fs))

	// for simplicity, we provide a very small default page for users who have signed out
	// TODO: replace with a proper page.
	router.HandleFunc(pathLoggedOut, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte("signed out successfully"))
		// no need to check/log error, this will be handled by the middleware.
	})

	// creation of the OpenIDProvider with the just created in-memory Storage
	verifierProvider, err := newOP(storage, verifierURL, verifierKey, logger, extraOptions...)
	if err != nil {
		return nil, fmt.Errorf("creating new OP: %w", err)
	}

	//the verifierProvider will only take care of the OpenID Protocol, so there must be some sort of UI for the login process
	//for the simplicity of the example this means a simple page with username and password field
	//be sure to provide an IssuerInterceptor with the IssuerFromRequest from the OP so the login can select / and pass it to the storage
	// TODO: we will put the Verifiable Credential authentication process replacing the user/password screen.
	loginProcess := NewLogin(
		cfg,
		storage,
		op.AuthCallbackURL(verifierProvider),
		op.NewIssuerInterceptor(verifierProvider.IssuerFromRequest),
	)

	// regardless of how many pages / steps there are in the process, the UI must be registered in the router,
	// so we will direct all calls to /login to the login UI
	router.Mount("/login/", http.StripPrefix("/login", loginProcess.router))

	// TODO: reformat device support for M2M flows
	router.Route("/device", func(r chi.Router) {
		registerDeviceAuth(storage, r)
	})

	handler := http.Handler(verifierProvider)
	if wrapServer {
		handler = op.RegisterLegacyServer(op.NewLegacyServer(verifierProvider, *op.DefaultEndpoints))
	}

	// We register the http handler of the OP on the root, so that the discovery endpoint (/.well-known/openid-configuration)
	// is served on the correct path.
	router.Mount("/", handler)

	return router, nil
}

// newOP will create an OpenID Provider for the verifierUrl with a given encryption key
// and a predefined default logout uri
// it will enable all options (see descriptions)
func newOP(storage op.Storage, verifierUrl string, verifierKey [32]byte, logger *slog.Logger, extraOptions ...op.Option) (op.OpenIDProvider, error) {
	config := &op.Config{
		CryptoKey: verifierKey,

		// will be used if the end_session endpoint is called without a post_logout_redirect_uri
		DefaultLogoutRedirectURI: pathLoggedOut,

		// enables code_challenge_method S256 for PKCE (and therefore PKCE in general)
		CodeMethodS256: true,

		// enables additional client_id/client_secret authentication by form post (not only HTTP Basic Auth)
		AuthMethodPost: true,

		// enables additional authentication by using private_key_jwt
		AuthMethodPrivateKeyJWT: true,

		// enables refresh_token grant use
		GrantTypeRefreshToken: true,

		// enables use of the `request` Object parameter
		RequestObjectSupported: true,

		// we only support English for the moment
		SupportedUILocales: []language.Tag{language.English},

		DeviceAuthorization: op.DeviceAuthorizationConfig{
			Lifetime:     5 * time.Minute,
			PollInterval: 5 * time.Second,
			UserFormPath: "/device",
			UserCode:     op.UserCodeBase20,
		},
	}
	handler, err := op.NewProvider(config, storage, op.StaticIssuer(verifierUrl),
		append([]op.Option{

			// as an example on how to customize an endpoint this will change the authorization_endpoint from /authorize to /auth
			// op.WithCustomAuthEndpoint(op.NewEndpoint("auth")),

			// Pass our logger to the OP
			op.WithLogger(logger.WithGroup("op")),
		}, extraOptions...)...,
	)
	if err != nil {
		return nil, err
	}
	return handler, nil
}
