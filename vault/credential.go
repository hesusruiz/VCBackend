package vault

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"text/template"

	"github.com/Masterminds/sprig/v3"
	"github.com/google/uuid"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
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

func (v *Vault) InitCredentialTemplates(credentialTemplatesPath string) {

	v.credTemplate = template.Must(template.New("base").Funcs(sprig.TxtFuncMap()).ParseGlob(credentialTemplatesPath))

}

// CreateCredentialJWTFromMap receives a map with the hierarchical data of the credential and returns
// the id of a new credential and the raw JWT string representing the credential
func (v *Vault) CreateCredentialJWTFromMap(credmap map[string]any) (credID string, rawJSONCred json.RawMessage, err error) {

	credData := yaml.New(credmap)

	// Create or get the DID of the issuer.
	issuer, err := v.CreateOrGetUserWithDIDKey(v.id, v.name, "legalperson", v.password)
	if err != nil {
		return "", nil, err
	}

	// Set the issuer did in the credential source data
	credmap["issuerDID"] = issuer.did

	// Create or get the DID of the subject.
	// We will use his email as the unique ID
	subject, err := v.CreateOrGetUserWithDIDKey(credData.String("claims.email"), credData.String("claims.name"), "naturalperson", "ThePassword")
	if err != nil {
		return "", nil, err
	}

	claims := credData.Map("claims")
	claims["id"] = subject.did
	credmap["claims"] = claims

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
	err = v.credTemplate.ExecuteTemplate(&b, credData.String("credName"), credmap)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}

	// The serialized credential
	fmt.Println("**** Serialized Credential ****")
	rawJSONCred = b.Bytes()

	// Compact the serialized representation by Unmarshall and Marshall
	var temporal any
	err = json.Unmarshal(rawJSONCred, &temporal)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}
	rawJSONCred, err = json.Marshal(temporal)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}
	prettyJSONCred, err := json.MarshalIndent(temporal, "", "   ")
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return "", nil, err
	}

	fmt.Printf("%v\n", string(prettyJSONCred))
	fmt.Println("**** End Credential ****")

	// Store credential
	_, err = v.db.Credential.Create().
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

	entCredentials, err := v.db.Credential.Query().All(context.Background())
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
