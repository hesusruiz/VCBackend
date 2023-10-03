package vault

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
)

// CreateAccessToken creates a JWT access token from the credential in serialized form,
// signed with the first private key associated to the issuer DID
func (v *Vault) CreateAccessToken(credData []byte, issuerDID string) (json.RawMessage, error) {

	// Return error if the issuerDID does not exist
	iss, err := v.UserByID(issuerDID)
	if err != nil {
		return nil, err
	}
	if iss == nil {
		return nil, fmt.Errorf("user does not exist")
	}

	// Get the first private key of the issuer to make the signature
	jwks, err := v.PrivateKeysForUser(issuerDID)
	if err != nil {
		return []byte("MyAccessToken"), nil
	}

	// At this point, jwks has at least one key, get the first one
	privateJWK := jwks[0]

	// Parse the serialized credential into a struct
	data, err := yaml.ParseJson(string(credData))
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return nil, err
	}

	jwt := map[string]any{"verifiableCredential": data.Data()}

	// Sign the credential data with the private key
	signedString, err := v.SignWithJWK(privateJWK, jwt)
	if err != nil {
		return nil, err
	}

	_, err = v.CredentialFromJWT(signedString)
	if err != nil {
		zlog.Logger.Error().Err(err).Send()
		return nil, err
	}

	return []byte(signedString), nil

}

// CreateToken creates a JWT token from the given claims,
// signed with the first private key associated to the issuer DID
func (v *Vault) CreateToken(credData any, issuerID string) ([]byte, error) {
	var token bytes.Buffer

	// Get the private key corresponding to the first (main) DID of the issuer of the token
	_, privkey, err := v.GetDIDAndKeyForUser(issuerID)
	if err != nil {
		return nil, err
	}

	// Create the header of the JWT
	headerMap := map[string]string{
		"typ": "JWT",
		"alg": "EdDSA",
		"kid": "key1",
	}

	// Get the serialized and encoded header
	var jsonValue []byte
	if jsonValue, err = json.Marshal(headerMap); err != nil {
		return nil, err
	}
	header := base64.RawURLEncoding.EncodeToString(jsonValue)

	// The header is the first segment of the JWT
	token.WriteString(header)

	// Get the serialized and encoded payload
	if jsonValue, err = json.Marshal(credData); err != nil {
		return nil, err
	}
	payload := base64.RawURLEncoding.EncodeToString(jsonValue)

	// The payload is the second segment, separated by a '.'
	token.WriteByte('.')
	token.WriteString(payload)

	// Perform the signature of the header and payload
	sig, err := privkey.Sign(token.Bytes())
	if err != nil {
		return nil, err
	}
	signature := base64.RawURLEncoding.EncodeToString(sig)

	// The signature is the third segment of the JWT, separated with a '.'
	token.WriteByte('.')
	token.WriteString(signature)

	return token.Bytes(), nil

}

func (v *Vault) VerifyToken(token string, issuerID string) (*yaml.YAML, error) {

	tokenParts := strings.Split(token, ".")
	if len(tokenParts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}

	payloadRaw, err := base64.RawURLEncoding.DecodeString(tokenParts[1])
	if err != nil {
		return nil, err
	}

	var pj any
	json.Unmarshal(payloadRaw, &pj)
	prettypj, _ := json.MarshalIndent(pj, "", "  ")
	fmt.Println(string(prettypj))

	p := yaml.New(pj)

	// claims, err := p.Get("credentialSubject")
	// if err != nil {
	// 	return nil, err
	// }
	// fmt.Println(claims)

	return p, nil

}
