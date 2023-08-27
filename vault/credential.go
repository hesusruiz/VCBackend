package vault

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"text/template"

	"github.com/Masterminds/sprig/v3"
	"github.com/google/uuid"
	"github.com/hesusruiz/vcbackend/ent"
	"github.com/hesusruiz/vcbackend/internal/jwt"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
	"github.com/tidwall/gjson"
)

type CredentialData struct {
	Jti                string `json:"jti" yaml:"jti"`
	CredName           string `json:"cred_name"`
	IssuerDID          string `json:"iss"`
	SubjectDID         string `json:"did"`
	Name               string `json:"name"`
	Given_name         string `json:"given_name"`
	Family_name        string `json:"family_name"`
	Preferred_username string `json:"preferred_username"`
	Email              string `json:"email"`
}

var t *template.Template

func init() {

	t = template.Must(template.New("base").Funcs(sprig.TxtFuncMap()).ParseGlob("vault/templates/*.tpl"))

}

func (v *Vault) TestCred(credData *CredentialData) (rawJsonCred json.RawMessage, err error) {

	// Generate the id as a UUID
	jti, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}

	// Set the unique id in the credential
	credData.Jti = jti.String()

	// Generate the credential from the template
	var b bytes.Buffer
	err = t.ExecuteTemplate(&b, credData.CredName, credData)
	if err != nil {
		return nil, err
	}

	// The serialized credential
	rawJsonCred = b.Bytes()

	// Validate the generated JSON, just in case the template is malformed
	if !gjson.ValidBytes(b.Bytes()) {
		zlog.Error().Msg("Error validating JSON")
		return nil, nil
	}
	m, ok := gjson.ParseBytes(b.Bytes()).Value().(map[string]interface{})
	if !ok {
		return nil, nil
	}

	rj, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}

	zlog.Info().Msgf("Value: %T\n\n%v", rj, string(rj))

	// cc := make(map[string]any)

	return nil, nil

}

// // CreateCredentialJWTFromMap receives a map with the hierarchical data of the credential and returns
// // the id of a new credential and the raw JWT string representing the credential
// func (v *Vault) CreateCredentialJWTFromMap(credmap map[string]any) (credID string, rawJSONCred json.RawMessage, err error) {

// 	credData := yaml.New(credmap)

// 	// Return error if the issuerID does not exist
// 	issuerID := credData.String("issuerID")
// 	iss, err := v.UserByID(issuerID)
// 	if err != nil {
// 		return "", nil, err
// 	}
// 	if iss == nil {
// 		return "", nil, fmt.Errorf("user does not exist")
// 	}

// 	// Get the DID of this user
// 	did, err := v.GetDIDForUser(issuerID)
// 	if err != nil {
// 		return "", nil, err
// 	}
// 	credmap["issuerDID"] = did

// 	// Generate a credential ID (jti) if it was not specified in the input data
// 	if len(credData.String("jti")) == 0 {

// 		// Generate the id as a UUID
// 		jti, err := uuid.NewRandom()
// 		if err != nil {
// 			return "", nil, err
// 		}

// 		// Set the unique id in the credential
// 		credmap["jti"] = jti.String()

// 	}

// 	credentialID := credmap["jti"].(string)

// 	// Generate the credential from the template
// 	var b bytes.Buffer
// 	err = t.ExecuteTemplate(&b, credData.String("credName"), credmap)
// 	if err != nil {
// 		zlog.Logger.Error().Err(err).Send()
// 		return "", nil, err
// 	}

// 	// The serialized credential
// 	fmt.Println("**** Serialized Credential ****")
// 	rawJSONCred = b.Bytes()
// 	fmt.Printf("%v\n\n", string(rawJSONCred))
// 	fmt.Println("**** End Serialized Credential ****")

// 	// Parse the resulting byte string
// 	data, err := yaml.ParseYamlBytes(rawJSONCred)
// 	if err != nil {
// 		zlog.Logger.Error().Err(err).Send()
// 		return "", nil, err
// 	}

// 	_, err = v.CredentialFromJWT(signedString)
// 	if err != nil {
// 		zlog.Logger.Error().Err(err).Send()
// 		return "", nil, err
// 	}

// 	// Store credential
// 	_, err = v.Client.Credential.Create().
// 		SetID(credentialID).
// 		SetRaw([]uint8(signedString)).
// 		Save(context.Background())
// 	if err != nil {
// 		zlog.Logger.Error().Err(err).Send()
// 		return "", nil, err
// 	}

// 	return credentialID, []byte(signedString), nil

// }

// CreateCredentialJWTFromMap receives a map with the hierarchical data of the credential and returns
// the id of a new credential and the raw JWT string representing the credential
func (v *Vault) CreateCredentialJWTFromMap(credmap map[string]any) (credID string, rawJSONCred json.RawMessage, err error) {

	credData := yaml.New(credmap)

	// Create or get the DID of the subject.
	// We will use his email as the unique ID
	_, issuerDID, err := v.CreateOrGetUserWithDIDKey(v.ID, v.Name, "naturalperson", v.Password)
	if err != nil {
		return "", nil, err
	}

	credmap["issuerDID"] = issuerDID

	// Create or get the DID of the subject.
	// We will use his email as the unique ID
	_, subjectDID, err := v.CreateOrGetUserWithDIDKey(credData.String("claims.email"), credData.String("claims.name"), "naturalperson", "ThePassword")
	if err != nil {
		return "", nil, err
	}
	credmap["subjectDID"] = subjectDID

	// Generate a credential ID (jti) if it was not specified in the input data
	if len(credData.String("jti")) == 0 {

		// Generate the id as a UUID
		jti, err := uuid.NewRandom()
		if err != nil {
			return "", nil, err
		}

		// Set the unique id in the credential
		credmap["jti"] = jti.String()

	}

	credentialID := credmap["jti"].(string)

	// Generate the credential from the template
	var b bytes.Buffer
	err = t.ExecuteTemplate(&b, credData.String("credName"), credmap)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}

	// The serialized credential
	fmt.Println("**** Serialized Credential ****")
	rawJSONCred = b.Bytes()
	fmt.Printf("%v\n\n", string(rawJSONCred))
	fmt.Println("**** End Serialized Credential ****")

	// Store credential
	_, err = v.Client.Credential.Create().
		SetID(credentialID).
		SetRaw([]uint8(rawJSONCred)).
		Save(context.Background())
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}

	return credentialID, rawJSONCred, nil

}

type CredRawData struct {
	Id      string `json:"id,omitempty"`
	Type    string `json:"type,omitempty"`
	Encoded string `json:"encoded,omitempty"`
}

func (v *Vault) GetAllCredentials() (creds []*CredRawData) {

	entCredentials, err := v.Client.Credential.Query().All(context.Background())
	if err != nil {
		return nil
	}

	credentials := make([]*CredRawData, len(entCredentials))

	for i, cred := range entCredentials {
		cr := &CredRawData{}
		cr.Id = cred.ID
		cr.Type = cred.Type
		cr.Encoded = string(cred.Raw)
		credentials[i] = cr
	}

	return credentials

}

func (v *Vault) CreateOrGetCredential(credData *CredentialData) (rawJsonCred json.RawMessage, err error) {

	// Check if the credential already exists
	cred, err := v.Client.Credential.Get(context.Background(), credData.Jti)
	if err == nil {
		// Credential found, just return it
		return cred.Raw, nil
	}
	if !ent.IsNotFound(err) {
		// Continue only if the error was that the credential was not found
		return nil, err
	}

	// Generate the credential from the template
	var b bytes.Buffer
	err = t.ExecuteTemplate(&b, credData.CredName, credData)
	if err != nil {
		return nil, err
	}

	// The serialized credential
	rawJsonCred = b.Bytes()

	// Store in DB
	_, err = v.Client.Credential.
		Create().
		SetID(credData.Jti).
		SetRaw(rawJsonCred).
		Save(context.Background())
	if err != nil {
		zlog.Error().Err(err).Msg("failed storing credential")
		return nil, err
	}
	zlog.Info().Str("jti", credData.Jti).Msg("credential created")

	return rawJsonCred, nil

}

type CredentialDecoded struct {
	jwt.RegisteredClaims
	Other map[string]any
}

func (v *Vault) CredentialFromJWT(credSerialized string) (rawJsonCred json.RawMessage, err error) {

	cred := &CredentialDecoded{}

	// Parse the serialized string into the structure, no signature validation yet
	token, err := jwt.NewParser().ParseUnverified2(credSerialized, cred)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return nil, err
	}

	// // Enable for Debugging
	// zlog.Debug().Msg("Parsed Token")
	// if out, err := json.MarshalIndent(token, "", "   "); err == nil {
	// 	zlog.Debug().Msg(string(out))
	// }

	// Verify the signature
	err = v.VerifySignature(token.ToBeSignedString, token.Signature, token.Alg(), token.Kid())
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return nil, err
	}

	// Display the formatted JSON structure
	st := map[string]any{}
	json.Unmarshal(token.ClaimBytes, &st)
	if out, err := json.MarshalIndent(st, "", "   "); err == nil {
		zlog.Debug().Msg(string(out))
	}

	return nil, nil

}
