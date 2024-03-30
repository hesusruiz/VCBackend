package vault

import (
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

// CreateJWTtoken creates a JWT token from the given claims,
// signed with the first private key associated to the issuer DID
func (v *Vault) CreateJWTtoken(credData map[string]any, issuerID string) ([]byte, error) {

	// Get the private key corresponding to the first (main) DID of the issuer of the token
	privkey, err := v.DIDKeyToPrivateKey(issuerID)
	if err != nil {
		return nil, err
	}

	// Create a new token structure with the claims
	tok := jwt.New()
	for k, v := range credData {
		tok.Set(k, v)
	}

	// Serialize and sign the JWT. The result is a byte array with the JWT in compact form:
	// header.payload.signature
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.ES256, privkey))
	if err != nil {
		return nil, err
	}

	return signed, nil

}

func (v *Vault) VerifyJWTtoken(token []byte, issuerDID string) (jwt.Token, error) {

	// Get the private key corresponding to the first (main) DID of the issuer of the token
	publicKey, err := DIDKeyToPubKey(issuerDID)
	if err != nil {
		return nil, err
	}

	tok, err := jwt.Parse(token, jwt.WithKey(jwa.ES256, publicKey))
	return tok, err

}
