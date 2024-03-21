package issuernew

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path"
	"time"

	"github.com/Masterminds/sprig"
	"github.com/evidenceledger/vcdemo/vault/x509util"
	"github.com/google/uuid"
	"github.com/hesusruiz/vcutils/yaml"
	my "github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/multiformats/go-multibase"
	"github.com/multiformats/go-multicodec"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
	"github.com/skip2/go-qrcode"
	"github.com/valyala/fasttemplate"
)

const defaultCredentialTemplatesDir = "vault/templates"

var credTemplate *template.Template

func InitCredentialTemplates(credentialTemplatesPath string) {

	credTemplate = template.Must(template.New("base").Funcs(sprig.TxtFuncMap()).ParseGlob(credentialTemplatesPath))

}

func Start(app *pocketbase.PocketBase, cfg *my.YAML) error {

	// Initialize the templates for credential creation
	credentialTemplatesDir := cfg.String("credentialTemplatesDir", defaultCredentialTemplatesDir)
	credentialTemplatesPath := path.Join(credentialTemplatesDir, "*.tpl")
	InitCredentialTemplates(credentialTemplatesPath)

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {

		dao := e.App.Dao()

		e.Server.Addr = ":8090"

		// The default Settings
		settings, _ := dao.FindSettings()
		settings.Meta.AppName = "DOME Issuer"
		settings.Meta.AppUrl = "wallettest.mycredential.eu"
		settings.Logs.MaxDays = 2

		settings.Meta.SenderName = "Support"
		settings.Meta.SenderAddress = "admin@mycredential.eu"

		settings.Smtp.Enabled = cfg.Bool("SMTP.Enabled", true)
		settings.Smtp.Host = cfg.String("SMTP.Host", "example.com")
		settings.Smtp.Port = cfg.Int("SMTP.Port", 465)
		settings.Smtp.Tls = cfg.Bool("SMTP.Tls", true)
		settings.Smtp.Username = cfg.String("SMTP.Username", "admin@mycredential.eu")
		settings.Smtp.Password = cfg.String("SMTP.Password")

		err := dao.SaveSettings(settings)
		if err != nil {
			return err
		}
		log.Println("Settings updated!!!!")

		// The default admin
		admin := &models.Admin{}
		admin.Email = "jesus@alastria.io"
		admin.SetPassword("1234567890")

		if dao.IsAdminEmailUnique(admin.Email) {
			err = dao.SaveAdmin(admin)
			if err != nil {
				return err
			}
			log.Println("Default Admin added!!!!")
		} else {
			log.Println("Default Admin already existed!!!!")
		}

		// Serves static files from the provided public dir (if exists)
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./www"), false))

		// Add Issuer routes
		iss := e.Router.Group("/eidasapi")
		iss.GET("/getcertinfo", func(c echo.Context) error {
			_, subject, err := getX509UserFromHeader(c.Request())
			if err != nil {
				return err
			}
			log.Println(subject)

			return c.JSON(http.StatusOK, subject)
		})
		iss.POST("/createcredential", func(c echo.Context) error {
			return createCredential(app, c)
		})
		iss.GET("/createqrcode/:credid", func(c echo.Context) error {
			return createQRCode(app, c)
		})
		iss.GET("/retrievecredential/:credid", func(c echo.Context) error {
			return retrieveCredential(app, c)
		})

		return nil
	})

	app.OnRecordBeforeCreateRequest("signers").Add(func(e *core.RecordCreateEvent) error {
		log.Println(e.HttpContext)
		log.Println(e.Record)
		log.Println(e.UploadedFiles)

		_, subject, err := getX509UserFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}
		log.Println(subject)

		e.Record.Set("commonName", subject.CommonName)
		e.Record.Set("serialNumber", subject.SerialNumber)
		e.Record.Set("country", subject.Country)

		if len(subject.Organization) > 0 {
			e.Record.Set("organization", subject.Organization)
		} else {
			e.Record.Set("organization", subject.CommonName)
		}

		if len(subject.OrganizationIdentifier) > 0 {
			e.Record.Set("organizationIdentifier", subject.OrganizationIdentifier)
		} else {
			e.Record.Set("organizationIdentifier", subject.SerialNumber)
		}

		// TODO: generate the key params dynamically
		keyparams := x509util.KeyParams{
			Ed25519Key: true,
			ValidFrom:  "Jan 1 15:04:05 2024",
			ValidFor:   365 * 24 * time.Hour,
		}

		// Create a CA Certificate
		privateKey, cert, err := x509util.NewCACertificate(*subject, keyparams)
		if err != nil {
			return err
		}

		// Serialize the private key
		serializedPrivateKey, err := json.Marshal(privateKey)
		if err != nil {
			return err
		}

		log.Println("NewCertificate", string(cert))
		log.Println("NewKey", serializedPrivateKey)
		e.Record.Set("certificatePem", string(cert))
		e.Record.Set("privatekeyPem", serializedPrivateKey)

		return nil
	})

	// Fires only for "signers" auth collection
	app.OnRecordBeforeAuthWithPasswordRequest("signers").Add(func(e *core.RecordAuthWithPasswordEvent) error {

		_, subject, err := getX509UserFromHeader(e.HttpContext.Request())
		if err != nil {
			return err
		}
		log.Println(subject)

		return nil
	})

	app.OnRecordBeforeCreateRequest("credentials").Add(func(e *core.RecordCreateEvent) error {
		log.Println("OnRecordBeforeCreateRequest(credentials)")

		return nil
	})

	err := app.Start()
	if err != nil {
		log.Fatal(err)
	}
	return err
}

func getX509UserFromHeader(r *http.Request) (issuer *x509util.ELSIName, subject *x509util.ELSIName, err error) {

	// Get the clientCertDer value before processing the request
	clientCertDer := r.Header.Get("Tls-Client-Certificate")
	if clientCertDer == "" {
		log.Println("Client certificate not provided")
		return nil, nil, apis.NewBadRequestError("Invalid request", nil)
	}

	_, issuer, subject, err = x509util.ParseEIDASCertB64Der(clientCertDer)
	if err != nil {
		log.Println("parsing eIDAS certificate", err)
		return nil, nil, err
	}

	return issuer, subject, nil

}

type Mandate struct {
	Id       string `json:"id,omitempty"`
	Mandator struct {
		OrganizationIdentifier string `json:"organizationIdentifier,omitempty"` // OID 2.5.4.97
		CommonName             string `json:"commonName,omitempty"`             // OID 2.5.4.3
		GivenName              string `json:"givenName,omitempty"`
		Surname                string `json:"surname,omitempty"`
		EmailAddress           string `json:"emailAddress,omitempty"`
		SerialNumber           string `json:"SerialNumber,omitempty"`
		Organization           string `json:"Organization,omitempty"`
		Country                string `json:"Country,omitempty"`
	} `json:"mandator,omitempty"`
	Mandatee struct {
		Id           string `json:"id,omitempty"`
		First_name   string `json:"first_name,omitempty"`
		Last_name    string `json:"last_name,omitempty"`
		Gender       string `json:"gender,omitempty"`
		Email        string `json:"email,omitempty"`
		Mobile_phone string `json:"mobile_phone,omitempty"`
	} `json:"mandatee,omitempty"`
	Power []struct {
		Id           string   `json:"id,omitempty"`
		Tmf_type     string   `json:"tmf_type,omitempty"`
		Tmf_domain   []string `json:"tmf_domain,omitempty"`
		Tmf_function string   `json:"tmf_function,omitempty"`
		Tmf_action   []string `json:"tmf_action,omitempty"`
	} `json:"power,omitempty"`
	LifeSpan struct {
		StartDateTime string `json:"start_date_time,omitempty"`
		EndDateTime   string `json:"end_date_time,omitempty"`
	} `json:"life_span,omitempty"`
}

type LEARCredentialEmployee struct {
	Context        []string `json:"@context,omitempty"`
	Id             string   `json:"id,omitempty"`
	TypeCredential []string `json:"type,omitempty"`
	Issuer         struct {
		Id string `json:"id,omitempty"`
	} `json:"issuer,omitempty"`
	IssuanceDate      string `json:"issuanceDate,omitempty"`
	ValidFrom         string `json:"validFrom,omitempty"`
	ExpirationDate    string `json:"expirationDate,omitempty"`
	CredentialSubject struct {
		Mandate Mandate `json:"mandate,omitempty"`
	} `json:"credentialSubject,omitempty"`
}

func createCredential(app *pocketbase.PocketBase, c echo.Context) error {

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

func newRandomString() string {
	newID, _ := uuid.NewRandom()
	return newID.String()
}

// CreateLEARCredentialJWTFromMap receives a map with the hierarchical data of the credential and returns
// the id of a new credential and the raw JWT string representing the credential
func CreateLEARCredentialJWTFromMap(app *pocketbase.PocketBase, e *core.RecordCreateEvent, credmap map[string]any, elsiName x509util.ELSIName) (credID string, rawJSONCred json.RawMessage, err error) {

	_ = yaml.New(credmap)

	// It is an error if the credential does not include the name and email of the employee as the holder
	email := yaml.GetString(credmap, "holder.email")
	name := yaml.GetString(credmap, "holder.name")
	if email == "" || name == "" {
		err := fmt.Errorf("email or name not found")
		return "", nil, err
	}

	// The input data does not specify the credential ID.
	// We should create a new ID as a UUID
	newID, err := uuid.NewRandom()
	if err != nil {
		return "", nil, err
	}
	credentialID := newID.String()

	// Set the unique id in the credential
	credmap["jti"] = credentialID

	// // Create or get the DID of the issuer.
	// issuer, err := v.CreateOrGetUserWithDIDelsi(v.id, v.name, elsiName, "legalperson", v.password)
	// if err != nil {
	// 	return "", nil, err
	// }

	// // Set the issuer did in the credential source data
	// credmap["issuerDID"] = issuer.did

	// // Create or get the DID of the holder.
	// // We will use his email as the unique ID
	// holder, err := v.CreateOrGetUserWithDIDKey(email, name, "naturalperson", "ThePassword")
	// if err != nil {
	// 	return "", nil, err
	// }

	// claims := credData.Map("claims")
	// claims["id"] = holder.did
	// credmap["claims"] = claims

	// // Generate the credential from the template
	// var b bytes.Buffer
	// err = v.credTemplate.ExecuteTemplate(&b, credData.String("credName"), credmap)
	// if err != nil {
	// 	zlog.Logger.Error().Err(err).Send()
	// 	return "", nil, err
	// }

	// // The serialized credential
	// rawJSONCred = b.Bytes()

	// // Compact the serialized representation by Unmarshall and Marshall
	// var temporal any
	// err = json.Unmarshal(rawJSONCred, &temporal)
	// if err != nil {
	// 	zlog.Logger.Error().Err(err).Send()
	// 	return "", nil, err
	// }
	// rawJSONCred, err = json.Marshal(temporal)
	// if err != nil {
	// 	zlog.Logger.Error().Err(err).Send()
	// 	return "", nil, err
	// }
	// prettyJSONCred, err := json.MarshalIndent(temporal, "", "   ")
	// if err != nil {
	// 	zlog.Logger.Error().Err(err).Send()
	// 	return "", nil, err
	// }

	// // Store credential
	// _, err = v.db.Credential.Create().
	// 	SetID(credentialID).
	// 	SetRaw([]uint8(rawJSONCred)).
	// 	Save(context.Background())
	// if err != nil {
	// 	zlog.Logger.Error().Err(err).Send()
	// 	return "", nil, err
	// }

	// zlog.Info().Str("id", credentialID).Msg("credential created")
	// fmt.Println("**** Serialized Credential ****")
	// fmt.Printf("%v\n", string(prettyJSONCred))
	// fmt.Println("**** End Credential ****")

	return credentialID, rawJSONCred, nil

}

// GenDIDKey generates a new 'did:key' DID by creating an EC key pair
func GenDIDKey() (did string, privateKey jwk.Key, err error) {

	// Generate a raw EC key with the P-256 curve
	rawPrivKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", nil, err
	}

	// Create the JWK for the private and public pair
	privKeyJWK, err := jwk.FromRaw(rawPrivKey)
	if err != nil {
		return "", nil, err
	}
	// privKeyJWK.Set(jwk.AlgorithmKey, jwa.ES256)
	// privKeyJWK.Set(jwk.KeyUsageKey, jwk.ForSignature)

	pubKeyJWK, err := privKeyJWK.PublicKey()
	if err != nil {
		return "", nil, err
	}

	// Create the 'did:key' associated to the public key
	did, err = PubKeyToDIDKey(pubKeyJWK)
	if err != nil {
		return "", nil, err
	}

	return did, privKeyJWK, nil

}

func PubKeyToDIDKey(pubKeyJWK jwk.Key) (did string, err error) {

	var buf [10]byte
	n := binary.PutUvarint(buf[0:], uint64(multicodec.Jwk_jcsPub))
	Jwk_jcsPub_Buf := buf[0:n]

	serialized, err := json.Marshal(pubKeyJWK)
	if err != nil {
		return "", err
	}

	keyEncoded := append(Jwk_jcsPub_Buf, serialized...)

	mb, err := multibase.Encode(multibase.Base58BTC, keyEncoded)
	if err != nil {
		return "", err
	}

	return "did:key:" + mb, nil

}

func createQRCode(app *pocketbase.PocketBase, c echo.Context) error {

	id := c.PathParam("credid")

	// QR code for cross-device SIOP
	template := "openid-credential-offer://{{hostname}}{{prefix}}/credential/{{id}}"
	t := fasttemplate.New(template, "{{", "}}")
	issuerCredentialURI := t.ExecuteString(map[string]interface{}{
		"protocol": c.Scheme(),
		"hostname": c.Request().Host,
		"prefix":   "/eidasapi",
		"id":       id,
	})

	// Create the QR
	png, err := qrcode.Encode(issuerCredentialURI, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	// Convert to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	return c.JSON(http.StatusOK, map[string]any{"image": base64Img})

}

func retrieveCredential(app *pocketbase.PocketBase, c echo.Context) error {

	id := c.PathParam("credid")

	record, err := app.Dao().FindRecordById("credentials", id)
	if err != nil {
		return err
	}

	credential := record.GetString("raw")

	// return c.JSON(http.StatusOK, map[string]any{"credential": credential})
	return c.String(http.StatusOK, credential)

}

type CreateNaturalPersonRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

// func CreateNaturalPerson(c echo.Context) error {

// 	sts := &CreateNaturalPersonRequest{}
// 	if err := c.Bind(sts); err != nil {
// 		return err
// 	}
// 	log.Printf("CreateNaturalPerson name: %s, email: %s")

// 	// Get user from the Storage. The user is automatically created if it does not exist
// 	user, err := s.vault.CreateOrGetUserWithDIDKey(sts.Email, sts.Name, "naturalperson", "ThePassword")
// 	if err != nil {
// 		return err
// 	}

// 	zlog.Info().Str("username", user.WebAuthnName()).Str("DID", user.DID()).Msg("User retrieved or created")

// 	privKey, err := s.vault.DIDKeyToPrivateKey(user.DID())
// 	if err != nil {
// 		return err
// 	}
// 	jsonbuf, err := json.Marshal(privKey)
// 	if err != nil {
// 		return err
// 	}

// 	return c.JSON(http.StatusOK, Map{
// 		"did":        user.DID(),
// 		"privateKey": string(jsonbuf),
// 	})

// }
