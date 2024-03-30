package issuernew

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/skip2/go-qrcode"
	"github.com/valyala/fasttemplate"
)

func addUserRoutes(app *pocketbase.PocketBase, e *core.ServeEvent) {

	// Add special normal user routes with a common prefix
	// TODO: document authentication used
	userGroup := e.Router.Group(userApiGroupPrefix)

	userGroup.GET("/startissuancepage/:credid", func(c echo.Context) error {
		return startCredentialIssuancePage(app, c)
	})

	// Retrieve a credential, applying the proper access control depending on the status
	userGroup.GET("/retrievecredential/:credid", func(c echo.Context) error {
		return retrieveCredential(app, c)
	})

	// Update a credential, applying the proper access control depending on the status
	userGroup.POST("/updatecredential/:credid", func(c echo.Context) error {
		return updateCredential(app, c)
	})

	// Retrieve a credential, applying the proper access control depending on the status
	userGroup.GET("/retrievecredentialpage/:credid", func(c echo.Context) error {
		return retrieveCredentialPage(app, c)
	})

}

func startCredentialIssuancePage(app *pocketbase.PocketBase, c echo.Context) error {

	// Retrieve the credential passed from the Wallet
	id := c.PathParam("credid")
	log.Println("startCredentialIssuance", id)

	credentialRecord, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	// This is the url for Wallet
	wallet_url := "https://wallet.mycredential.eu"

	// QRcode for downloading the Wallet
	walletQRcode, err := qrcodeFromUrl(wallet_url)
	if err != nil {
		return err
	}

	const oidprotocol = "openid-credential-offer"
	hostName := app.Settings().Meta.AppUrl
	prefix := userApiGroupPrefix
	pathRetrieval := prefix + "/retrievecredential/"

	// URL for using from Wallet (cross-device SIOP)
	credURIforQR := oidprotocol + "://" + hostName + pathRetrieval + id

	// Credential QR code for scanning with the Wallet (cross-device SIOP)
	credentialQRcode, err := qrcodeFromUrl(credURIforQR)
	if err != nil {
		return err
	}

	// URL for retrieving the credential in the same-device flow
	credURIsameDevice := "https://" + hostName + pathRetrieval + id
	credentialHref := wallet_url + "/?command=getvc&vcid=" + credURIsameDevice

	html := templateOfferingParse(credentialRecord, walletQRcode, credentialQRcode, credentialHref, credURIsameDevice)

	return c.HTML(http.StatusOK, html)

}

func retrieveCredential(app *pocketbase.PocketBase, c echo.Context) error {

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

func updateCredential(app *pocketbase.PocketBase, c echo.Context) error {

	var request updateCredentialrequest
	err := c.Bind(&request)
	if err != nil {
		return c.String(http.StatusBadRequest, "bad request")
	}
	id := c.PathParam("credid")
	didKey := request.DID
	log.Println("updateCredential", id, didKey)

	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

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

	var learCred LEARCredentialEmployee
	err = json.Unmarshal(claimsDecoded, &learCred)
	if err != nil {
		return err
	}

	learCred.CredentialSubject.Mandate.Mandatee.Id = didKey
	log.Println("Updated Mandate with didKey", didKey)

	// Get the private key from the configured x509 certificate
	privateKey, err := getConfigPrivateKey()
	if err != nil {
		return err
	}

	// Sign the credential
	tok, err := CreateLEARCredentialJWTtoken(learCred, jwt.SigningMethodRS256, privateKey)
	if err != nil {
		return err
	}

	// Update the record in the db
	status := "tobesigned"
	record.Set("raw", tok)
	record.Set("status", "signed")
	if err := app.Dao().SaveRecord(record); err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]any{"status": status})

}

func retrieveCredentialPage(app *pocketbase.PocketBase, c echo.Context) error {

	id := c.PathParam("credid")

	credentialRecord, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	// This is the url for Wallet
	wallet_url := "https://wallet.mycredential.eu"

	// Create the QR code
	png, err := qrcode.Encode(wallet_url, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	// Convert the image data to a dataURL
	walletQRcode := base64.StdEncoding.EncodeToString(png)
	walletQRcode = "data:image/png;base64," + walletQRcode

	// QR code for cross-device SIOP
	template := "{{protocol}}://{{hostname}}{{prefix}}/retrievecredential/{{id}}"

	t := fasttemplate.New(template, "{{", "}}")
	credURIforQR := t.ExecuteString(map[string]interface{}{
		"protocol": "openid-credential-offer",
		"hostname": app.Settings().Meta.AppUrl,
		"prefix":   userApiGroupPrefix,
		"id":       id,
	})

	// Create the QR
	png, err = qrcode.Encode(credURIforQR, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	t = fasttemplate.New(template, "{{", "}}")
	credURIsameDevice := t.ExecuteString(map[string]interface{}{
		"protocol": c.Scheme(),
		"hostname": app.Settings().Meta.AppUrl,
		"prefix":   userApiGroupPrefix,
		"id":       id,
	})

	credentialHref := wallet_url + "/?command=getvc&vcid=" + credURIsameDevice

	// Convert to a dataURL
	credentialQRcode := base64.StdEncoding.EncodeToString(png)
	credentialQRcode = "data:image/png;base64," + credentialQRcode
	log.Println(credentialQRcode)

	html := templateOfferingParse(credentialRecord, walletQRcode, credentialQRcode, credentialHref, credURIsameDevice)

	return c.HTML(http.StatusOK, html)

}
