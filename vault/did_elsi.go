package vault

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"

	"github.com/evidenceledger/vcdemo/vault/x509util"
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

// GenDIDelsi generates a new 'did:elsi' DID by creating an EC key pair
func GenDIDelsi(subject x509util.ELSIName, keyparams x509util.KeyParams) (did string, privateKey jwk.Key, cert x509util.PEMCert, err error) {

	privateKey, cert, err = x509util.NewCAELSICertificate(subject, keyparams)
	if err != nil {
		return "", nil, nil, err
	}

	// Create the 'did:elsi' associated to the OrganizationIdentifier
	did = "did:elsi:" + subject.OrganizationIdentifier

	return did, privateKey, cert, nil

}

// func PubKeyToDIDelsi(pubKeyJWK jwk.Key) (did string, err error) {

// 	var buf [10]byte
// 	n := binary.PutUvarint(buf[0:], uint64(multicodec.Jwk_jcsPub))
// 	Jwk_jcsPub_Buf := buf[0:n]

// 	serialized, err := json.Marshal(pubKeyJWK)
// 	if err != nil {
// 		return "", err
// 	}

// 	keyEncoded := append(Jwk_jcsPub_Buf, serialized...)

// 	mb, err := multibase.Encode(multibase.Base58BTC, keyEncoded)
// 	if err != nil {
// 		return "", err
// 	}

// 	return "did:key:" + mb, nil

// }

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
	sub x509util.ELSIName,
	kp x509util.KeyParams,
) (did string, privateKey jwk.Key, pemBytes []byte, err error) {

	did, privateKey, pemBytes, err = GenDIDelsi(sub, kp)
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

func (v *Vault) NewDidelsiForUser(user *User, sub x509util.ELSIName, kp x509util.KeyParams) (did string, privateKey jwk.Key, pemBytes []byte, err error) {

	return v.newDidelsiForUser(user, sub, kp)

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

func (v *Vault) SignWithDIDelsi(did string, privateKey jwk.Key, cert x509util.PEMCert, stringToSign string) (signedString string, err error) {
	zlog.Info().Str("stringToSign", stringToSign).Msg("")

	// Convert key from JWK to native raw format
	var rawPrivateKey any
	err = privateKey.Raw(&rawPrivateKey)
	if err != nil {
		return "", err
	}

	// Prepare for signing with the key
	key, ok := rawPrivateKey.(crypto.Signer)
	if !ok {
		return "", errors.New("x509: certificate private key does not implement crypto.Signer")
	}

	// The input certificate is in PEM format. Decode it and convert to an in-memory representation
	b, _ := pem.Decode(cert)
	if b == nil {
		err = fmt.Errorf("error decoding PEM bytes")
		return "", err
	}

	// Get the certificate in native Go format
	template, err := x509.ParseCertificate(b.Bytes)
	if err != nil {
		return "", err
	}

	// Check the serial number of the certificate
	if template.SerialNumber == nil {
		return "", errors.New("x509: no SerialNumber given")
	}

	if template.SerialNumber.Sign() == -1 {
		return "", errors.New("x509: serial number must be positive")
	}

	// Sign the string with the private key
	hash := sha256.Sum256([]byte(stringToSign))

	sig, err := key.Sign(rand.Reader, hash[:], nil)
	//	sig, err := ecdsa.SignASN1(rand.Reader, privateKey, hash[:])
	if err != nil {
		panic(err)
	}

	signature := base64.RawURLEncoding.EncodeToString(sig)

	return stringToSign + "." + signature, nil
}
