package vault

import (
	"github.com/lestrrat-go/jwx/v2/jwt"
)

// CreateToken creates a JWT token from the given claims,
// signed with the first private key associated to the issuer DID
func (v *Vault) CreateToken(credData map[string]any, issuerID string) ([]byte, error) {

	// Get the private key corresponding to the first (main) DID of the issuer of the token
	privkey, err := v.DIDKeyToPrivateKey(issuerID)
	if err != nil {
		return nil, err
	}

	tok := jwt.New()
	for k, v := range credData {
		tok.Set(k, v)
	}

	signed, err := jwt.Sign(tok, jwt.WithKey(privkey.Algorithm(), privkey))
	if err != nil {
		return nil, err
	}

	return signed, nil

}

func (v *Vault) VerifyToken(token []byte, issuerID string) (jwt.Token, error) {

	// Get the private key corresponding to the first (main) DID of the issuer of the token
	publicKey, err := DIDKeyToPubKey(issuerID)
	if err != nil {
		return nil, err
	}

	tok, err := jwt.Parse(token, jwt.WithKey(publicKey.Algorithm(), publicKey))
	return tok, err

	// tokenParts := strings.Split(token, ".")
	// if len(tokenParts) != 3 {
	// 	return nil, fmt.Errorf("malformed token")
	// }

	// payloadRaw, err := base64.RawURLEncoding.DecodeString(tokenParts[1])
	// if err != nil {
	// 	return nil, err
	// }

	// var pj any
	// json.Unmarshal(payloadRaw, &pj)
	// prettypj, _ := json.MarshalIndent(pj, "", "  ")
	// fmt.Println(string(prettypj))

	// p := yaml.New(pj)

	// return p, nil

}
