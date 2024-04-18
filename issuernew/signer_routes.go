package issuernew

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func (is *IssuerServer) addSignerRoutes(e *core.ServeEvent) {
	// Add special Issuer routes with a common prefix
	// All requests for this group should be authenticated as Admin or with x509 certificate
	signerApiGroup := e.Router.Group(signerApiGroupPrefix, RequireAdminOrX509Auth())

	// Get the x509 certificate that was used to do client authentication
	signerApiGroup.GET("/getcertinfo", func(c echo.Context) error {
		_, subject, err := getX509UserFromHeader(c.Request())
		if err != nil {
			return err
		}
		log.Println(subject)

		return c.JSON(http.StatusOK, subject)
	})

	// Create a LEARCredential with the info in the request
	signerApiGroup.POST("/createjsoncredential", func(c echo.Context) error {
		return is.createJSONCredential(c)
	})

	// Sign in the server the credential passed in the request
	signerApiGroup.POST("/signcredential", func(c echo.Context) error {
		return is.signCredential(c)
	})

	// Retrieve all credentials, applying the proper access control depending on the status
	signerApiGroup.GET("/retrievecredentials", func(c echo.Context) error {
		return is.retrieveAllCredentials(c)
	})

	// Update the credential
	signerApiGroup.POST("/updatesignedcredential", func(c echo.Context) error {
		return is.updateSignedCredential(c)
	})

	// Send a reminder to the user that there is a credential waiting
	signerApiGroup.GET("/sendreminder/:credid", func(c echo.Context) error {
		return is.sendReminder(c)
	})

}

// createJSONCredential is the Echo route to create a credential from the Mandate in the body of the request.
// We get the Mandate object, create a LEARCredential and insert the Mandate into the 'credentialSubject' object.
func (is *IssuerServer) createJSONCredential(c echo.Context) error {

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

	// didkey, _, err := GenDIDKey()
	// if err != nil {
	// 	return err
	// }
	// mandate.Mandatee.Id = didkey

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
	lc.ValidFrom = nowUTC
	lc.ExpirationDate = nowPlusOneYearUTC

	raw, err = json.MarshalIndent(lc, "", "  ")
	if err != nil {
		return err
	}
	log.Println("===== LEARCredential struct Marshalled")
	log.Println(string(raw))

	return c.JSON(http.StatusOK, lc)
}

func (is *IssuerServer) signCredential(c echo.Context) error {

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
	tok, err := CreateLEARCredentialJWTtoken(learCred, jwt.SigningMethodRS256, privateKey)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]any{"signed": tok})
}

func (is *IssuerServer) sendReminder(c echo.Context) error {

	id := c.PathParam("credid")

	return is.sendEmailReminder(id)

}

type updateSignedCredentialRequest struct {
	Id     string
	Status string
	Raw    string
}

func (is *IssuerServer) updateSignedCredential(c echo.Context) error {
	app := is.App

	var request updateSignedCredentialRequest
	err := echo.BindBody(c, &request)
	if err != nil {
		return err
	}

	out, err := json.MarshalIndent(request, "", "  ")
	if err != nil {
		return err
	}
	log.Println(string(out))

	record, err := app.Dao().FindRecordById("credentials", request.Id)
	if err != nil {
		return err
	}

	// set individual fields
	// or bulk load with record.Load(map[string]any{...})
	record.Set("title", "Lorem ipsum")
	record.Set("status", request.Status)
	record.Set("raw", request.Raw)

	if err := app.Dao().SaveRecord(record); err != nil {
		return err
	}

	// Send an email to the user
	err = is.sendEmailReminder(record.Id)
	if err != nil {
		log.Printf("error sending reminder %s", err.Error())
	}

	return c.JSONPretty(http.StatusOK, map[string]any{"result": "OK"}, "  ")
}
