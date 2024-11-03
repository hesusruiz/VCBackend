package issuernew

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/invopop/validation"
)

type Mandate struct {
	Id       string `json:"id,omitempty"`
	Mandator struct {
		OrganizationIdentifier string `json:"organizationIdentifier,omitempty"` // OID 2.5.4.97
		CommonName             string `json:"commonName,omitempty"`             // OID 2.5.4.3
		GivenName              string `json:"givenName,omitempty"`
		Surname                string `json:"surname,omitempty"`
		EmailAddress           string `json:"emailAddress,omitempty"`
		SerialNumber           string `json:"serialNumber,omitempty"`
		Organization           string `json:"organization,omitempty"`
		Country                string `json:"country,omitempty"`
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

type LEARCredentialEmployeeJWTClaims struct {
	LEARCredentialEmployee
	jwt.RegisteredClaims
}

// CreateLEARCredentialJWTtoken creates a JWT token from the given claims,
// signed with the first private key associated to the issuer DID
func CreateLEARCredentialJWTtoken(learCred LEARCredentialEmployee, sigMethod jwt.SigningMethod, privateKey any) (string, error) {

	// Prepare some fields of the LEARCredential
	now := time.Now()

	// Create claims with multiple fields populated
	claims := LEARCredentialEmployeeJWTClaims{
		learCred,
		jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * 365 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    learCred.Issuer.Id,
			Subject:   learCred.CredentialSubject.Mandate.Mandatee.Id,
			ID:        learCred.Id,
			Audience:  []string{"everybody"},
		},
	}

	// Serialize and sign the JWT. The result is a byte array with the JWT in compact form:
	// header.payload.signature
	token := jwt.NewWithClaims(sigMethod, claims)
	ss, err := token.SignedString(privateKey)
	fmt.Println(ss, err)

	return ss, nil

}

func LEARCredentialFromMap(s map[string]any) (err error) {
	// s, ok := sourceany.(map[string]any)
	// if !ok {
	// 	return lc, fmt.Errorf("source is not a map[string]any")
	// }

	err = validation.Validate(s,
		validation.Map(
			validation.Key("type", validation.Required, validation.Length(2, 2)),
		),
	)

	if err != nil {
		return err
	}

	return nil
}

func VerifyLEARCredential(r any) (*yaml.YAML, error) {
	lc := yaml.New(r)

	// Check that the type is a LEARCredentialEmployee
	vctypes := lc.ListString("type")
	if len(vctypes) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'type' array")
	}

	var hasVCtype, hasLEARtype bool
	for _, el := range vctypes {
		if el == "VerifiableCredential" {
			hasVCtype = true
		}
		if el == "LEARCredentialEmployee" {
			hasLEARtype = true
		}
	}

	if !hasVCtype {
		return nil, fmt.Errorf("malformed VC, missing type 'VerifiableCredential'")
	}
	if !hasLEARtype {
		return nil, fmt.Errorf("malformed VC, missing type 'LEARCredentialEmployee'")
	}

	// Get the Mandate
	if len(lc.Map("credentialSubject")) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'credentialSubject'")
	}
	if len(lc.Map("credentialSubject.mandate")) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'mandate'")
	}
	if len(lc.Map("credentialSubject.mandate.mandator")) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'mandator'")
	}
	if len(lc.Map("credentialSubject.mandate.mandatee")) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'mandatee'")
	}
	if len(lc.List("credentialSubject.mandate.power")) == 0 {
		return nil, fmt.Errorf("malformed VC, missing 'power'")
	}

	return lc, nil

}
