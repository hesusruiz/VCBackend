package issuernew

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/issuernew/usertpl"
	"github.com/evidenceledger/vcdemo/types"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tokens"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	httphelper "github.com/zitadel/oidc/v3/pkg/http"
	"github.com/zitadel/oidc/v3/pkg/oidc"
)

func (is *IssuerServer) addLearRoutes(e *core.ServeEvent) {

	// Add special normal user routes with a common prefix
	// TODO: document authentication used
	learGroup := e.Router.Group(learGroupPrefix)
	learGroup.Use(middleware.CORS())
	learGroup.Use(is.retrieveLEARUserFromRequest)

	loginGroup := e.Router.Group(learLoginGroupPrefix)
	loginGroup.Use(middleware.CORS())

	// **********************************************************
	// Prepare and set the OpenID Connect login with the Verifier
	// **********************************************************

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)

	ctx := logging.ToContext(context.TODO(), logger)

	vcverifier := is.config.VerifierURL
	clientID := is.config.ClientID
	clientSecret := ""

	callbackPath := is.config.CallbackPath
	redirectURI := is.config.IssuerURL + learLoginGroupPrefix + callbackPath

	// Request a LEARCredential as the result of authentication
	scopes := strings.Split(is.config.Scopes, " ")

	// We are going to use PKCE, so we need a secure cookie handler
	key := GenerateRandomKey(16)
	cookieHandler := httphelper.NewCookieHandler(key, key)

	client := &http.Client{
		Timeout: time.Minute,
	}

	// The options used by the example application (acting as Relying Party)
	options := []rp.Option{
		rp.WithCookieHandler(cookieHandler),
		rp.WithVerifierOpts(rp.WithIssuedAtOffset(5 * time.Second)),
		rp.WithHTTPClient(client),
		rp.WithLogger(logger),
		rp.WithPKCE(cookieHandler),
	}

	provider, err := rp.NewRelyingPartyOIDC(ctx, vcverifier, clientID, clientSecret, redirectURI, scopes, options...)
	if err != nil {
		logger.Error("error creating provider", "error", err.Error())
		os.Exit(1)
	}

	urlOptions := []rp.URLParamOpt{
		rp.WithPromptURLParam("Welcome back!"),
	}

	state := func() string {
		return uuid.New().String()
	}

	// ***************************************************
	// Set the handler for the Login route, which will use redirect to invoke the auth endpoint of the Verifier,
	// following the OIDC standard
	loginGroup.GET("/login", echo.WrapHandler(rp.AuthURLHandler(
		state,
		provider,
		urlOptions...,
	)))

	// The next step is to set up the handler that will be called by the Verifier when the user is authenticated.
	// This will happen after the user Wallet has sent the LEARCredential to the Verifier and it has been validated by it

	// This function is called by the OIDC library when the Verifier calls the RP callback URL.
	processOIDCTokens := func(w http.ResponseWriter, r *http.Request, oidctokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty) {

		// The LEARCredential is received as a claim of the IDToken.
		// We are not interested in the standard claims in the IDToken, because they have been set based on the
		// equivalent fields in the Mandatee object of the LEARCredential.
		// Applications which do not understand LEARCredentials would just use the standard claims, but the
		// full power of the LEARCredential can be obtained by using the claims inside it.
		idTokenClaims := oidctokens.IDTokenClaims
		learCredential := idTokenClaims.Claims["learcred"]

		// // Marshall the LEARCredential for presentation purposes.
		// data, err := json.MarshalIndent(learCredential, "", "  ")
		// if err != nil {
		// 	http.Error(w, err.Error(), http.StatusInternalServerError)
		// 	return
		// }

		// Verify that we have received a well-formed LEARCredential. We trust on the Verifier for performing other
		// validations like credential signature and holder binding to the LearCredential.
		lc, err := types.VerifyLEARCredential(learCredential)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// The user (a LEAR) will act on behalf of an organisation, identified in the Mandator object
		organizationIdentifier := lc.String("credentialSubject.mandate.mandator.organizationIdentifier")

		// Check if the organisation is already registered in our database
		record, err := is.App.Dao().FindFirstRecordByData("signers", "organizationIdentifier", organizationIdentifier)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !record.Verified() {
			usertpl.AuthenticationError("Organisation does not exist or is not validated yet").Render(r.Context(), w)
			return
		}

		// Get or Create the LEAR if it does not exist
		learEmail := lc.String("credentialSubject.mandate.mandatee.email")
		learFirstName := lc.String("credentialSubject.mandate.mandatee.first_name")
		learLastName := lc.String("credentialSubject.mandate.mandatee.last_name")
		learOrganization := lc.String("credentialSubject.mandate.mandator.organization")

		learUser, err := is.App.Dao().FindAuthRecordByEmail("lears", learEmail)
		if err != nil {

			// Create a new user
			collection, err := is.App.Dao().FindCollectionByNameOrId("lears")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			newLEAR := models.NewRecord(collection)

			form := forms.NewRecordUpsert(is.App, newLEAR)

			// or form.LoadRequest(r, "")
			form.LoadData(map[string]any{
				"email":                  learEmail,
				"first_name":             learFirstName,
				"last_name":              learLastName,
				"organizationIdentifier": organizationIdentifier,
				"organization":           learOrganization,
				"password":               "pepepepepepe",
				"passwordConfirm":        "pepepepepepe",
			})

			if err := form.Submit(); err != nil {
				logger.Error("error creating the LEAR user", "error", err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Retrieve the record
			learUser, err = is.App.Dao().FindAuthRecordByEmail("lears", learEmail)
			if err != nil {
				logger.Error("error creating the LEAR user", "error", err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			logger.Info("LEAR user created", "id", learUser.Email())

		} else {
			// Perform some validations
			if learUser.GetString("organizationIdentifier") != organizationIdentifier {
				usertpl.AuthenticationError("The user is already registered with another Organisation").Render(r.Context(), w)
				return
			}
		}

		// Generate new auth token for this user session
		authtoken, err := tokens.NewRecordAuthToken(is.App, learUser)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Create a cookie with the token and set it on the user's browser.
		// The session will expire in 1 hour.
		cookie := new(http.Cookie)
		cookie.Name = "authpbtoken"
		cookie.Value = authtoken
		cookie.Path = "/"
		// cookie.Secure = true
		// cookie.HttpOnly = true
		cookie.MaxAge = 3600
		http.SetCookie(w, cookie)

		usertpl.LoggedUser = learEmail
		usertpl.AfterLEARLogin(lc).Render(r.Context(), w)

	}

	// ***************************************************
	// Set the callback route that will be called by the Verifier.
	// The route will receive the 'code' which wil be exchanged for an access token.
	loginGroup.GET(callbackPath, echo.WrapHandler(rp.CodeExchangeHandler(processOIDCTokens, provider)))

	// ***************************************************
	loginGroup.GET("/logoff", is.learLogoff)

	is.generalLoginRoute = loginGroup.GET("/generallogin", is.GeneralLoginScreen)

	// ***************************************************
	// Retrieve all credentials that the LEAR can access
	learGroup.GET("/learRetrieveAllCredentials", is.learRetrieveAllCredentials)

	// ***************************************************
	// Retrieve a credential, applying the proper access control depending on the status
	learGroup.GET("/retrievecredential/:credid", is.displayLEARCredential)

	// ***************************************************
	// Handle the LEARCredential form
	learGroup.GET("/credentialform", is.displayLEARCredentialForm)
	learGroup.POST("/credentialform", is.processLEARCredentialForm)

}

// Middleware for the LEAR routes to check authenticated LEAR.
// If the user is not authenticated, we redirect to the general login page.
// Otherwise, we setup the user data in the 'authUser' struct in the server and pass control to the next middleware.
func (is *IssuerServer) retrieveLEARUserFromRequest(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {

		authUser, err := is.requireLEAR(c)
		if err != nil {
			usertpl.LoggedUser = ""
			is.authUser = nil

			// Send the user to the general login page via a redirection
			return c.Redirect(http.StatusFound, is.generalLoginRoute.Path())
		}

		// Store the authenticated user info for use by the handlers down the chain
		is.authUser = authUser
		usertpl.LoggedUser = authUser.Email

		return next(c) // proceed with the request chain
	}
}

func (is *IssuerServer) GeneralLoginScreen(c echo.Context) error {

	return Render(c, http.StatusOK, usertpl.GeneralLogin(is.config.IssuerCertificateURL))
}

func (is *IssuerServer) LEARHomeHandler(c echo.Context) error {

	// rr, _ := c.Echo().RouterFor("")
	// routes := rr.Routes()

	// fmt.Println("====================================================")
	// for _, route := range routes {
	// 	fmt.Println(route.Name())
	// }
	// fmt.Println("====================================================")

	authUser, err := is.requireLEAR(c)
	if err != nil {
		usertpl.LoggedUser = ""
		return c.Redirect(http.StatusFound, "/lear/generallogin")
	} else {
		usertpl.LoggedUser = authUser.Email
		return Render(c, http.StatusOK, usertpl.FormLEARCredential(authUser))
	}
}

func (is *IssuerServer) learLogoff(c echo.Context) error {

	cookie := new(http.Cookie)
	cookie.Name = "authpbtoken"
	cookie.Value = ""
	cookie.Path = "/"
	cookie.MaxAge = 0
	// cookie.Secure = true
	// cookie.HttpOnly = true

	c.SetCookie(cookie)

	return c.Redirect(http.StatusFound, "/")

}

func (is *IssuerServer) displayLEARCredentialForm(c echo.Context) error {
	authUser, err := is.requireLEAR(c)
	if err != nil {
		usertpl.LoggedUser = ""
		return err
	}

	return Render(c, http.StatusOK, usertpl.FormLEARCredential(authUser))

}

func (is *IssuerServer) processLEARCredentialForm(c echo.Context) error {

	authUser, err := is.requireLEAR(c)
	if err != nil {
		usertpl.LoggedUser = ""
		return err
	}

	info := apis.RequestInfo(c)

	// We received the body data in form of a map[string]any
	data := info.Data

	// Serialize to JSON
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	log.Println("RAW", string(raw))

	return Render(c, http.StatusOK, usertpl.FormLEARCredential(authUser))

}

func (is *IssuerServer) learRetrieveAllCredentials(c echo.Context) error {

	authUser, err := is.requireLEAR(c)
	if err != nil {
		usertpl.LoggedUser = ""
		return err
	}

	// Retrieve all records which can be signed by the user and in the state 'tobesigned'
	expr1 := dbx.HashExp{"organizationIdentifier": authUser.OrganizationIdentifier, "status": "tobesigned"}
	records, err := is.App.Dao().FindRecordsByExpr("credentials", expr1)
	if err != nil {
		return err
	}

	// Render the page with the list of credentials
	return Render(c, http.StatusOK, usertpl.ListCredentials(records))

}

func (is *IssuerServer) displayLEARCredential(c echo.Context) error {

	authUser, err := is.requireLEAR(c)
	if err != nil {
		return Render(c, http.StatusOK, usertpl.Error("Please provide valid credentials"))
	}

	app := is.App

	id := c.PathParam("credid")

	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil || record.GetString("organizationIdentifier") != authUser.OrganizationIdentifier {
		return Render(c, http.StatusOK, usertpl.Error("Credential "+id+" not found"))
	}

	credentialJWT := record.GetString("raw")
	// credType := record.GetString("type")
	// status := record.GetString("status")

	unverifiedClaims, err := security.ParseUnverifiedJWT(credentialJWT)
	if err != nil {
		return err
	}

	out, err := json.MarshalIndent(unverifiedClaims, "", "  ")
	if err != nil {
		return err
	}

	return Render(c, http.StatusOK, usertpl.DisplayLEARCredential(string(out)))

	// return c.JSON(http.StatusOK, map[string]any{"credential": credential, "type": credType, "status": status, "id": id})

}

func (is *IssuerServer) requireLEAR(c echo.Context) (authUser *types.AuthenticatedUser, err error) {
	app := is.App

	// Retrieve the auth cookie
	cookie, err := c.Cookie("authpbtoken")
	if err != nil {
		return nil, err
	}

	// Verify the token received in the cookie
	authRecord, err := app.Dao().FindAuthRecordByToken(cookie.Value, app.Settings().RecordAuthToken.Secret)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusForbidden, "Please provide valid credentials")
	}

	authUser = &types.AuthenticatedUser{}
	if authRecord.Collection().Name == "lears" {
		authUser.Type = "lear"
		authUser.Email = authRecord.Email()
		authUser.OrganizationIdentifier = authRecord.GetString("organizationIdentifier")
	} else {
		return nil, echo.NewHTTPError(http.StatusForbidden, "Invalid authenticated user")
	}

	return
}

func GenerateRandomKey(length int) []byte {
	k := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, k); err != nil {
		return nil
	}
	return k
}
