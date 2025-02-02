package issuernew

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/issuernew/usertpl"
	"github.com/evidenceledger/vcdemo/types"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tokens"
	"github.com/zitadel/logging"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	"github.com/zitadel/oidc/v3/pkg/oidc"
)

func (is *IssuerServer) addUserRoutes(e *core.ServeEvent) {

	// Add special normal user routes with a common prefix
	// TODO: document authentication used
	userGroup := e.Router.Group(userApiGroupPrefix)
	userGroup.Use(middleware.CORS())

	logger := slog.New(
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		}),
	)

	ctx := logging.ToContext(context.TODO(), logger)

	vcverifier := "https://verifier.mycredential.eu"
	clientID := "domemarketplace"
	clientSecret := "secret"

	callbackPath := "/auth/callback"
	redirectURI := "https://issuer.mycredential.eu" + userApiGroupPrefix + callbackPath

	scopes := strings.Split("openid learcred profile email", " ")

	provider, err := rp.NewRelyingPartyOIDC(ctx, vcverifier, clientID, clientSecret, redirectURI, scopes)
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

	echoHandler := echo.WrapHandler(rp.AuthURLHandler(
		state,
		provider,
		urlOptions...,
	))

	userGroup.GET("/login", echoHandler)

	// This function is called by the OIDC library when the Verifier calls the RP callback URL.
	processOIDCTokens := func(w http.ResponseWriter, r *http.Request, oitokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty) {
		idTokenClaims := oitokens.IDTokenClaims
		learCredential := idTokenClaims.Claims["learcred"]
		// data, err := json.MarshalIndent(learCredential, "", "  ")
		// if err != nil {
		// 	http.Error(w, err.Error(), http.StatusInternalServerError)
		// 	return
		// }

		lc, err := types.VerifyLEARCredential(learCredential)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		organizationIdentifier := lc.String("credentialSubject.mandate.mandator.organizationIdentifier")

		learEmail := lc.String("credentialSubject.mandate.mandatee.email")

		// Check if there is a Signer in the DB with that organizationIdentifier
		record, err := is.App.Dao().FindFirstRecordByData("signers", "organizationIdentifier", organizationIdentifier)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !record.Verified() && record.Collection().AuthOptions().OnlyVerified {
			usertpl.AuthenticationError("Organisation does not exist").Render(r.Context(), w)
			return
		}

		// Generate new auth token
		authtoken, err := tokens.NewRecordAuthToken(is.App, record)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		cookie := new(http.Cookie)
		cookie.Name = "authpbtoken"
		cookie.Value = authtoken
		cookie.Path = "/apiuser/"
		// cookie.Secure = true
		// cookie.HttpOnly = true
		cookie.Expires = time.Now().Add(1 * time.Hour)
		http.SetCookie(w, cookie)

		usertpl.LoggedUser = learEmail
		usertpl.AfterLEARLogin(lc).Render(r.Context(), w)

	}

	codeExchangerEcho := echo.WrapHandler(rp.CodeExchangeHandler(processOIDCTokens, provider))
	userGroup.GET(callbackPath, codeExchangerEcho)

	// userGroup.GET("/learRetrieveAllCredentials", is.learRetrieveAllCredentials)

	// ***************************************************
	// ***************************************************
	// ***************************************************
	// ***************************************************

	userGroup.GET("/startissuancepage/:credid", func(c echo.Context) error {
		return is.startCredentialIssuancePage(c)
	})

	// Retrieve a credential, applying the proper access control depending on the status
	userGroup.GET("/retrievecredential/:credid", func(c echo.Context) error {
		return is.retrieveCredential(c)
	})

	// Retrieve a credential, after updating the stored credential with the did proof provided in the body of the request
	userGroup.POST("/retrievecredential/:credid", func(c echo.Context) error {
		return is.retrieveCredentialPOST(c)
	})

	// Update a credential, applying the proper access control depending on the status
	userGroup.POST("/senddid/:credid", func(c echo.Context) error {
		return is.sendDid(c)
	})

}

func (is *IssuerServer) startCredentialIssuancePage(c echo.Context) error {
	app := is.App

	// Retrieve the credential passed
	id := c.PathParam("credid")
	log.Println("startCredentialIssuancePage", id)
	if len(id) == 0 {
		err := fmt.Errorf("id not specified")
		app.Logger().Error(err.Error())
		return err
	}

	credentialRecord, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		app.Logger().Error(err.Error())
		return err
	}

	// QRcode for downloading the Wallet
	walletQRcode, err := qrcodeFromUrl(is.config.SamedeviceWallet)
	if err != nil {
		return err
	}

	// Build the URL for the cross-device flow
	issuerHostName := strings.TrimPrefix(app.Settings().Meta.AppUrl, "https://")
	prefix := userApiGroupPrefix
	pathRetrieval := prefix + "/retrievecredential/"

	// URL for using from Wallet (cross-device SIOP)
	credURIforQR := "openid-credential-offer://" + issuerHostName + userApiGroupPrefix + "/retrievecredential/" + id

	// Credential QR code for scanning with the Wallet (cross-device SIOP)
	credentialQRcode, err := qrcodeFromUrl(credURIforQR)
	if err != nil {
		return err
	}

	// URL for retrieving the credential in the same-device flow
	credURIsameDevice := "https://" + issuerHostName + pathRetrieval + id
	sameDeviceCredentialHref := is.config.SamedeviceWallet + "/?command=getvc&vcid=" + credURIsameDevice

	html := renderLEARCredentialOffer(credentialRecord, walletQRcode, credentialQRcode, sameDeviceCredentialHref, is.config.SamedeviceWallet)

	return c.HTML(http.StatusOK, html)

}

func (is *IssuerServer) retrieveCredential(c echo.Context) error {
	app := is.App

	id := c.PathParam("credid")

	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	credential := record.GetString("raw")
	credType := record.GetString("type")
	status := record.GetString("status")

	return c.JSON(http.StatusOK, map[string]any{"credential": credential, "type": credType, "status": status, "id": id})

}

type updateCredentialrequest struct {
	DID string `query:"did"`
}

// sendDid receives the did created by the user and updates the credential with it
func (is *IssuerServer) sendDid(c echo.Context) error {
	app := is.App

	// Get the did specified by the user
	var request updateCredentialrequest
	err := c.Bind(&request)
	if err != nil {
		return c.String(http.StatusBadRequest, "bad request")
	}

	// Get the unique id of the credential to be updated
	id := c.PathParam("credid")
	didKey := request.DID
	log.Println("updateCredential", id, didKey)

	// Retrieve the credential from storage
	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	// Decode the payload of the JWT, which is the actual credential in JSON
	tokenString := record.GetString("raw")
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return fmt.Errorf("token contains an invalid number of segments")
	}

	encoding := base64.RawURLEncoding

	claimsDecoded, err := encoding.DecodeString(parts[1])
	if err != nil {
		return err
	}

	// Build the Go struct from the JSON credential
	var learCred types.LEARCredentialEmployee
	err = json.Unmarshal(claimsDecoded, &learCred)
	if err != nil {
		return err
	}

	// Replace the Mandatee id with the did that the user specified
	learCred.CredentialSubject.Mandate.Mandatee.Id = didKey
	log.Println("Updated Mandate with didKey", didKey)

	// Get the private key from the configured x509 certificate
	privateKey, err := getConfigPrivateKey()
	if err != nil {
		return err
	}

	// Sign the credential with the server certificate
	credential, err := types.CreateLEARCredentialJWTtoken(learCred, jwt.SigningMethodRS256, privateKey)
	if err != nil {
		return err
	}

	// Update the record in the db
	status := "tobesigned"
	record.Set("raw", credential)
	record.Set("status", status)
	if err := app.Dao().SaveRecord(record); err != nil {
		return err
	}

	credType := record.GetString("type")

	return c.JSON(http.StatusOK, map[string]any{"credential": credential, "type": credType, "status": status, "id": id})

}

type proofClaims struct {
	jwt.RegisteredClaims
	Nonce string `json:"nonce,omitempty"`
}

func (o *proofClaims) String() string {
	out, _ := json.MarshalIndent(o, "", "  ")
	return string(out)
}

func (is *IssuerServer) retrieveCredentialPOST(c echo.Context) error {
	app := is.App

	// This is the struct to unmarshall the body of the request
	type retrieveCredentialPOSTRequest struct {
		Format string `json:"format,omitempty"`
		Proof  struct {
			Proof_type string `json:"proof_type,omitempty"`
			JWT        string `json:"jwt,omitempty"`
		} `json:"proof,omitempty"`
	}

	// Get the id of the credential (in our case it is also the nonce inside the did proof)
	id := c.PathParam("credid")

	// Retrieve the credential record from the database
	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	// Check if the credential can not be modified
	currentStatus := record.GetString("status")
	if currentStatus == "signed" {
		log.Println("retrieveCredentialPOST: credential already signed")
		return c.JSON(http.StatusOK,
			map[string]any{
				"credential": record.GetString("raw"),
				"type":       record.GetString("type"),
				"status":     currentStatus,
				"id":         id,
			})
	}

	// Get the proof claims from the body of the request
	var request retrieveCredentialPOSTRequest
	err = c.Bind(&request)
	if err != nil {
		return c.String(http.StatusBadRequest, "bad request")
	}

	// The serialised token in the proof
	proofTokenString := request.Proof.JWT

	// Parse the serialised token in a struct.
	// TODO: We do not check the signature.
	var pc = proofClaims{}
	tokenParser := jwt.NewParser()
	proof, _, err := tokenParser.ParseUnverified(proofTokenString, &pc)
	if err != nil {
		return err
	}

	fmt.Print(proof.Claims)

	// Get the current credential from the db and unmarshall it into the LEARCredentialEmployee struct

	// Divide the token string in three parts, which are separated by a dot (.)
	tokenString := record.GetString("raw")
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return fmt.Errorf("token contains an invalid number of segments")
	}

	// Base64-decode the payload
	encoding := base64.RawURLEncoding
	claimsDecoded, err := encoding.DecodeString(parts[1])
	if err != nil {
		return err
	}

	// Build the Go struct from the JSON credential
	var learCred types.LEARCredentialEmployee
	err = json.Unmarshal(claimsDecoded, &learCred)
	if err != nil {
		return err
	}

	// We now have the credential in the struct. We will update the did of the user and re-sign it

	// Get the issuer from the decoded credential
	issuerDID, err := proof.Claims.GetIssuer()
	if err != nil {
		return err
	}

	// Replace the Mandatee id with the did that the user specified
	learCred.CredentialSubject.Mandate.Mandatee.Id = issuerDID
	log.Println("Updated Mandate with didKey", issuerDID)

	// Get the private key to sign from the configured x509 certificate
	privateKey, err := getConfigPrivateKey()
	if err != nil {
		return err
	}

	// Sign the signedCredential with the server certificate
	signedCredential, err := types.CreateLEARCredentialJWTtoken(learCred, jwt.SigningMethodRS256, privateKey)
	if err != nil {
		return err
	}

	// Update the record in the db. After the user has updated the credential with her did, the legal representative has to sign.
	// So the state is "tobesigned".
	status := "tobesigned"
	record.Set("raw", signedCredential)
	record.Set("status", status)
	if err := app.Dao().SaveRecord(record); err != nil {
		return err
	}

	credType := record.GetString("type")

	return c.JSON(http.StatusOK, map[string]any{"credential": signedCredential, "type": credType, "status": status, "id": id})

}
