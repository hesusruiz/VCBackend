package issuernew

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func addAdminRoutes(app *pocketbase.PocketBase, e *core.ServeEvent) {
	// Add special Issuer routes with a common prefix
	// All requests for this group should be authenticated as Admin or with x509 certificate
	adminApiGroup := e.Router.Group(adminApiGroupPrefix, RequireAdminOrX509Auth())

	// Get the x509 certificate that was used to do client authentication
	adminApiGroup.GET("/getcertinfo", func(c echo.Context) error {
		_, subject, err := getX509UserFromHeader(c.Request())
		if err != nil {
			return err
		}
		log.Println(subject)

		return c.JSON(http.StatusOK, subject)
	})

	// Create a LEARCredential with the info in the request
	adminApiGroup.POST("/createcredential", func(c echo.Context) error {
		return createCredential(c)
	})

	// Sign in the server the credential passed in the request
	adminApiGroup.POST("/signcredential", func(c echo.Context) error {
		return signCredential(c)
	})

	// Send a reminder to the user that there is a credential waiting
	adminApiGroup.GET("/sendreminder/:credid", func(c echo.Context) error {
		return sendReminder(app, c)
	})

	// // Create the QR code in the server and return the image ready to be presented
	// iss.GET("/createqrcode/:credid", func(c echo.Context) error {
	// 	return createQRCode(c, settings.Meta.AppUrl, cfg.String("samedeviceWallet", "https://wallet.mycredential.eu"))
	// })

}

// createCredential is the Echo route to create a credential from the Mandate in the body of the request.
// We get the Mandate object, create a LEARCredential and insert the Mandate into the 'credentialSubject' object.
func createCredential(c echo.Context) error {

	info := apis.RequestInfo(c)

	// We received the body data in form of a map[string]any
	data := info.Data
	log.Println("data", data)

	// Serialize to JSON
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	log.Println("RAW", string(raw))

	// Create the Mandate struct from the serialized JSON data
	mandate := Mandate{}
	err = json.Unmarshal(raw, &mandate)
	if err != nil {
		return err
	}

	// Generate the dates for the Mandate
	now := time.Now()
	nowPlusOneYear := now.AddDate(1, 0, 0)
	nowUTC := now.UTC().String()
	nowPlusOneYearUTC := nowPlusOneYear.UTC().String()

	mandate.Id = newRandomString()
	for i := range mandate.Power {
		mandate.Power[i].Id = newRandomString()
	}

	mandate.LifeSpan.StartDateTime = nowUTC
	mandate.LifeSpan.EndDateTime = nowPlusOneYearUTC

	didkey, _, err := GenDIDKey()
	if err != nil {
		return err
	}
	mandate.Mandatee.Id = didkey

	// Print the Mandate struct to check it is OK
	raw, err = json.MarshalIndent(mandate, "", "  ")
	if err != nil {
		return err
	}
	log.Println("===== Mandate struct Marshalled")
	log.Println(string(raw))

	// Create the LEARCredential struct
	lc := LEARCredentialEmployee{}
	lc.CredentialSubject.Mandate = mandate

	// Complete the LEARCredential
	lc.Context = []string{"https://www.w3.org/ns/credentials/v2", "https://www.evidenceledger.eu/2022/credentials/employee/v1"}
	lc.Id = newRandomString()
	lc.TypeCredential = []string{"VerifiableCredential", "LEARCredentialEmployee"}
	lc.Issuer.Id = "did:elsi:" + mandate.Mandator.OrganizationIdentifier

	lc.IssuanceDate = nowUTC
	lc.ExpirationDate = nowPlusOneYearUTC

	raw, err = json.MarshalIndent(lc, "", "  ")
	if err != nil {
		return err
	}
	log.Println("===== LEARCredential struct Marshalled")
	log.Println(string(raw))

	return c.JSON(http.StatusOK, lc)
}

func signCredential(c echo.Context) error {

	// Get the private key from the configured x509 certificate
	privateKey, err := getConfigPrivateKey()
	if err != nil {
		return err
	}

	var learCred LEARCredentialEmployee

	// The body of the HTTP request should be a LEARCredentialEmployee
	err = echo.BindBody(c, &learCred)
	if err != nil {
		return err
	}

	// Sign the credential
	tok, err := CreateLEARCredentialJWTtoken(learCred, privateKey)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]any{"signed": tok})
}

func sendReminder(app *pocketbase.PocketBase, c echo.Context) error {

	id := c.PathParam("credid")

	return sendEmailReminder(app, id)

}
