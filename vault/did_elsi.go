package vault

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/multiformats/go-multibase"
	"github.com/multiformats/go-multicodec"
	zlog "github.com/rs/zerolog/log"
)

func publicKey(priv any) any {
	switch k := priv.(type) {
	case *rsa.PrivateKey:
		return &k.PublicKey
	case *ecdsa.PrivateKey:
		return &k.PublicKey
	case ed25519.PrivateKey:
		return k.Public().(ed25519.PublicKey)
	default:
		return nil
	}
}

type ELSISubject struct {
	OrganizationIdentifier string
	CommonName             string
	SerialNumber           string
	Organization           string
	Country                string
}

// GenDIDelsi generates a new 'did:elsi' DID by creating an EC key pair
func GenDIDelsi(sub ELSISubject,
	ed25519Key bool,
	ecdsaCurve string,
	rsaBits int,
	isCA bool,
	validFrom string,
	validFor time.Duration) (did string, privateKey jwk.Key, pemBytes []byte, err error) {

	var priv any
	switch ecdsaCurve {
	case "":
		if ed25519Key {
			_, priv, err = ed25519.GenerateKey(rand.Reader)
		} else {
			priv, err = rsa.GenerateKey(rand.Reader, rsaBits)
		}
	case "P224":
		priv, err = ecdsa.GenerateKey(elliptic.P224(), rand.Reader)
	case "P256":
		priv, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "P384":
		priv, err = ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	case "P521":
		priv, err = ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	default:
		log.Fatalf("Unrecognized elliptic curve: %q", ecdsaCurve)
	}
	if err != nil {
		log.Fatalf("Failed to generate private key: %v", err)
	}

	// ECDSA, ED25519 and RSA subject keys should have the DigitalSignature
	// KeyUsage bits set in the x509.Certificate template
	keyUsage := x509.KeyUsageDigitalSignature
	// Only RSA subject keys should have the KeyEncipherment KeyUsage bits set. In
	// the context of TLS this KeyUsage is particular to RSA key exchange and
	// authentication.
	if _, isRSA := priv.(*rsa.PrivateKey); isRSA {
		keyUsage |= x509.KeyUsageKeyEncipherment
	}

	var notBefore time.Time
	if len(validFrom) == 0 {
		notBefore = time.Now()
	} else {
		notBefore, err = time.Parse("Jan 2 15:04:05 2006", validFrom)
		if err != nil {
			log.Fatalf("Failed to parse creation date: %v", err)
		}
	}

	notAfter := notBefore.Add(validFor)

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		log.Fatalf("Failed to generate serial number: %v", err)
	}

	organizationIdentifier := pkix.AttributeTypeAndValue{
		Type:  []int{2, 5, 4, 97},
		Value: sub.OrganizationIdentifier,
	}
	extraNames := []pkix.AttributeTypeAndValue{organizationIdentifier}
	subject := pkix.Name{
		CommonName:   sub.CommonName,
		SerialNumber: sub.SerialNumber,
		Organization: []string{sub.Organization},
		Country:      []string{sub.Country},
		ExtraNames:   extraNames,
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      subject,
		NotBefore:    notBefore,
		NotAfter:     notAfter,

		KeyUsage:              keyUsage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	if isCA {
		template.IsCA = true
		template.KeyUsage |= x509.KeyUsageCertSign
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, publicKey(priv), priv)
	if err != nil {
		log.Fatalf("Failed to create certificate: %v", err)
	}

	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		log.Fatalf("Failed to encode in PEM the certificate: %v", err)
	}
	pemBytes = buf.Bytes()

	//************************************************

	// Create the JWK for the private and public pair
	privKeyJWK, err := jwk.FromRaw(priv)
	if err != nil {
		return "", nil, nil, err
	}

	// Create the 'did:elsi' associated to the OrganizationIdentifier
	did = "did:elsi:" + sub.OrganizationIdentifier

	return did, privKeyJWK, pemBytes, nil

}

func PubKeyToDIDelsi(pubKeyJWK jwk.Key) (did string, err error) {

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

func DIDelsiIdentifier(did string) (string, error) {
	if !strings.HasPrefix(did, "did:elsi:") {
		return "", ErrDIDInvalid
	}

	identifier := strings.TrimPrefix(did, "did:elsi:")

	return did + "#" + identifier, nil
}

func DIDelsiToPubKey(did string) (publicKey jwk.Key, err error) {

	if !strings.HasPrefix(did, "did:key:") {
		return nil, ErrDIDInvalid
	}

	identifier := strings.TrimPrefix(did, "did:key:")

	_, dec, err := multibase.Decode(identifier)
	if err != nil {
		return nil, err
	}

	buf := bytes.NewBuffer(dec)
	cod, err := binary.ReadUvarint(buf)
	if err != nil {
		return nil, err
	}

	if cod != uint64(multicodec.Jwk_jcsPub) {
		return nil, ErrInvalidCodec
	}

	key, err := jwk.ParseKey(buf.Bytes())
	if err != nil {
		return nil, err
	}

	return key, nil

}

func (v *Vault) newDidelsiForUser(user *User,
	sub ELSISubject,
	ed25519Key bool,
	ecdsaCurve string,
	rsaBits int,
	isCA bool,
	validFrom string,
	validFor time.Duration) (did string, privateKey jwk.Key, pemBytes []byte, err error) {

	did, privateKey, pemBytes, err = GenDIDelsi(sub, ed25519Key, ecdsaCurve, rsaBits, isCA, validFrom, validFor)
	if err != nil {
		return "", nil, nil, err
	}

	// Serialize the private key
	jsonbuf, err := json.Marshal(privateKey)
	if err != nil {
		return "", nil, nil, err
	}

	// Store in the vault
	partialCreate := v.db.DID.Create().
		SetID(did).
		SetJwk(jsonbuf).
		SetPem(pemBytes).
		SetKeyusage(privateKey.KeyUsage()).
		SetAlg(privateKey.Algorithm().String()).
		SetMethod("did:elsi")

	if user != nil {
		partialCreate = partialCreate.SetUser(user.entuser)
	}

	_, err = partialCreate.Save(context.Background())
	if err != nil {
		return "", nil, nil, err
	}

	return did, privateKey, pemBytes, nil
}

func (v *Vault) NewDidelsiForUser(user *User,
	sub ELSISubject,
	ed25519Key bool,
	ecdsaCurve string,
	rsaBits int,
	isCA bool,
	validFrom string,
	validFor time.Duration) (did string, privateKey jwk.Key, pemBytes []byte, err error) {

	return v.newDidelsiForUser(user, sub, ed25519Key, ecdsaCurve, rsaBits, isCA, validFrom, validFor)

}

func (v *Vault) DIDelsiToKey(did string) (privateKey jwk.Key, publicKey jwk.Key, err error) {

	privateKey, err = v.DIDelsiToPrivateKey(did)
	if err != nil {
		return nil, nil, err
	}

	publicKey, err = privateKey.PublicKey()
	if err != nil {
		return nil, nil, err
	}

	return privateKey, publicKey, nil

}

func (v *Vault) DIDelsiToPrivateKey(did string) (privateKey jwk.Key, err error) {

	if !strings.HasPrefix(did, "did:elsi:") {
		return nil, ErrDIDInvalid
	}

	entDID, err := v.db.DID.Get(context.Background(), did)
	if err != nil {
		return nil, err
	}

	// Parse the key from the JWK
	privateKey, err = jwk.ParseKey(entDID.Jwk)
	if err != nil {
		return nil, err
	}

	return privateKey, nil

}

func (v *Vault) DIDelsiToPublicKey(did string) (publicKey jwk.Key, err error) {

	privateKey, err := v.DIDelsiToPrivateKey(did)
	if err != nil {
		return nil, err
	}

	publicKey, err = privateKey.PublicKey()
	if err != nil {
		return nil, err
	}

	return publicKey, nil

}

func (v *Vault) SignWithDIDelsi(did string, stringToSign string) (signedString string, err error) {
	zlog.Info().Str("stringToSign", stringToSign).Msg("")

	// Get the private key corresponding to the DID of the signer
	jwkPrivkey, err := v.DIDKeyToPrivateKey(did)
	if err != nil {
		return "", err
	}

	jsonbuf, err := json.Marshal(jwkPrivkey)
	if err != nil {
		return "", err
	}
	fmt.Println(string(jsonbuf))

	privateKey := &ecdsa.PrivateKey{}
	err = jwkPrivkey.Raw(privateKey)
	if err != nil {
		return "", err
	}

	// Sign the string with the private key
	hash := sha256.Sum256([]byte(stringToSign))

	sig, err := ecdsa.SignASN1(rand.Reader, privateKey, hash[:])
	if err != nil {
		panic(err)
	}

	signature := base64.RawURLEncoding.EncodeToString(sig)

	return stringToSign + "." + signature, nil
}
