package client

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"

	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	httphelper "github.com/zitadel/oidc/v3/pkg/http"
	"github.com/zitadel/oidc/v3/pkg/oidc"

	g "github.com/maragudk/gomponents"
	c "github.com/maragudk/gomponents/components"
	. "github.com/maragudk/gomponents/html"
)

var (
	callbackPath = "/auth/callback"
	key          = []byte("test1234test1234")
)

func Setup() {
	http.HandleFunc("/", indexHandler)
	http.Handle("/contact", createHandler(contactPage()))
	http.Handle("/about", createHandler(aboutPage()))

	clientID := LookupEnvOrString("CLIENT_ID", "domemarketplace")
	clientSecret := LookupEnvOrString("CLIENT_SECRET", "secret")
	keyPath := LookupEnvOrString("KEY_PATH", "")
	issuer := LookupEnvOrString("ISSUER", "https://verifier.mycredential.eu")
	port := LookupEnvOrString("PORT", "9999")
	scopes := strings.Split(LookupEnvOrString("SCOPES", "openid learcred profile email"), " ")
	responseMode := LookupEnvOrString("RESPONSE_MODE", "")

	redirectURI := fmt.Sprintf("https://demo.mycredential.eu%v", callbackPath)
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

	options := []rp.Option{
		rp.WithCookieHandler(cookieHandler),
		rp.WithVerifierOpts(rp.WithIssuedAtOffset(5 * time.Second)),
		rp.WithHTTPClient(client),
		rp.WithLogger(logger),
	}
	if clientSecret == "" {
		options = append(options, rp.WithPKCE(cookieHandler))
	}
	if keyPath != "" {
		options = append(options, rp.WithJWTProfile(rp.SignerFromKeyPath(keyPath)))
	}

	// One can add a logger to the context,
	// pre-defining log attributes as required.
	ctx := logging.ToContext(context.TODO(), logger)
	provider, err := rp.NewRelyingPartyOIDC(ctx, issuer, clientID, clientSecret, redirectURI, scopes, options...)
	if err != nil {
		logrus.Fatalf("error creating provider %s", err.Error())
	}

	// generate some state (representing the state of the user in your application,
	// e.g. the page where he was before sending him to login
	state := func() string {
		return uuid.New().String()
	}

	urlOptions := []rp.URLParamOpt{
		rp.WithPromptURLParam("Welcome back!"),
	}

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

	// you could also just take the access_token and id_token without calling the userinfo endpoint:
	//
	marshalToken := func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty) {
		data, err := json.MarshalIndent(tokens, "", "  ")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}

	// register the CodeExchangeHandler at the callbackPath
	// the CodeExchangeHandler handles the auth response, creates the token request and calls the callback function
	// with the returned tokens from the token endpoint
	// in this example the callback function itself is wrapped by the UserinfoCallback which
	// will call the Userinfo endpoint, check the sub and pass the info into the callback function
	//http.Handle(callbackPath, rp.CodeExchangeHandler(rp.UserinfoCallback(marshalUserinfo), provider))

	// if you would use the callback without calling the userinfo endpoint, simply switch the callback handler for:
	//
	http.Handle(callbackPath, rp.CodeExchangeHandler(marshalToken, provider))

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

	lis := fmt.Sprintf("0.0.0.0:%s", port)
	logger.Info("Application listening, press ctrl+c to stop", "addr", lis)
	err = http.ListenAndServe(lis, mw(http.DefaultServeMux))
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
	http.ServeFile(w, r, "client/index.html")

}
func createHandler(title string, body g.Node) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Rendering a Node is as simple as calling Render and passing an io.Writer
		_ = Page(title, r.URL.Path, body).Render(w)
	}
}

func indexPage() (string, g.Node) {
	return "Welcome!", Div(
		H1(g.Text("Welcome to this example page")),
		P(g.Text("I hope it will make you happy. 😄 It's using TailwindCSS for styling.")),
	)
}

func contactPage() (string, g.Node) {
	return "Contact", Div(
		H1(g.Text("Contact us")),
		P(g.Text("Just do it.")),
	)
}

func aboutPage() (string, g.Node) {
	return "About", Div(
		H1(g.Text("About this site")),
		P(g.Text("This is a site showing off gomponents.")),
	)
}

func Page(title, path string, body g.Node) g.Node {
	// HTML5 boilerplate document
	return c.HTML5(c.HTML5Props{
		Title:    title,
		Language: "en",
		Head: []g.Node{
			Script(Src("https://cdn.tailwindcss.com?plugins=typography")),
		},
		Body: []g.Node{
			Navbar(path, []PageLink{
				{Path: "/contact", Name: "Contact"},
				{Path: "/about", Name: "About"},
			}),
			Container(
				Prose(body),
				PageFooter(),
			),
		},
	})
}

type PageLink struct {
	Path string
	Name string
}

func Navbar(currentPath string, links []PageLink) g.Node {
	return Nav(Class("bg-gray-700 mb-4"),
		Container(
			Div(Class("flex items-center space-x-4 h-16"),
				NavbarLink("/", "Home", currentPath == "/"),

				// We can Map custom slices to Nodes
				g.Group(g.Map(links, func(l PageLink) g.Node {
					return NavbarLink(l.Path, l.Name, currentPath == l.Path)
				})),
			),
		),
	)
}

// NavbarLink is a link in the Navbar.
func NavbarLink(path, text string, active bool) g.Node {
	return A(Href(path), g.Text(text),
		// Apply CSS classes conditionally
		c.Classes{
			"px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:text-white focus:bg-gray-700": true,
			"text-white bg-gray-900":                           active,
			"text-gray-300 hover:text-white hover:bg-gray-700": !active,
		},
	)
}

func Container(children ...g.Node) g.Node {
	return Div(Class("max-w-7xl mx-auto px-2 sm:px-6 lg:px-8"), g.Group(children))
}

func Prose(children ...g.Node) g.Node {
	return Div(Class("prose"), g.Group(children))
}

func PageFooter() g.Node {
	return Footer(Class("prose prose-sm prose-indigo"),
		P(
			// We can use string interpolation directly, like fmt.Sprintf.
			g.Textf("Rendered %v. ", time.Now().Format(time.RFC3339)),

			// Conditional inclusion
			g.If(time.Now().Second()%2 == 0, g.Text("It's an even second.")),
			g.If(time.Now().Second()%2 == 1, g.Text("It's an odd second.")),
		),

		P(A(Href("https://www.gomponents.com"), g.Text("gomponents"))),
	)
}
