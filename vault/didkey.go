package vault

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"strings"

	"github.com/evidenceledger/vcdemo/vault/ent/did"
	"github.com/evidenceledger/vcdemo/vault/ent/user"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/multiformats/go-multibase"
	"github.com/multiformats/go-multicodec"
)

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
	privKeyJWK.Set(jwk.AlgorithmKey, jwa.ES256)
	privKeyJWK.Set(jwk.KeyUsageKey, jwk.ForSignature)

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

func DIDKeyToPubKey(did string) (publicKey jwk.Key, err error) {

	if !strings.HasPrefix(did, "did:key:") {
		return nil, ErrDIDKeyInvalid
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

func (v *Vault) newDidKeyForUser(user *User) (did string, privateKey jwk.Key, err error) {

	did, privateKey, err = GenDIDKey()
	if err != nil {
		return "", nil, err
	}

	// Serialize the private key
	jsonbuf, err := json.Marshal(privateKey)
	if err != nil {
		return "", nil, err
	}

	// Convert to PEM representation
	pem, err := jwk.EncodePEM(privateKey)
	if err != nil {
		return "", nil, err
	}

	// Store in the vault
	partialCreate := v.db.DID.Create().
		SetID(did).
		SetJwk(jsonbuf).
		SetPem(pem).
		SetKeyusage(privateKey.KeyUsage()).
		SetAlg(privateKey.Algorithm().String()).
		SetMethod("did:key")

	if user != nil {
		partialCreate = partialCreate.SetUser(user.entuser)
	}

	_, err = partialCreate.Save(context.Background())
	if err != nil {
		return "", nil, err
	}

	return did, privateKey, nil
}

func (v *Vault) NewDidKey() (did string, privateKey jwk.Key, err error) {
	return v.newDidKeyForUser(nil)
}

func (v *Vault) NewDidKeyForUser(user *User) (did string, privateKey jwk.Key, err error) {

	return v.newDidKeyForUser(user)

}

func (v *Vault) GetDIDForUser(userid string) (string, error) {
	return v.db.DID.Query().Where(did.HasUserWith(user.ID(userid))).FirstID(context.Background())
}

func (v *Vault) DIDKeyToPrivateKey(did string) (privateKey jwk.Key, err error) {

	if !strings.HasPrefix(did, "did:key:") {
		return nil, ErrDIDKeyInvalid
	}

	entDID, err := v.db.DID.Get(context.Background(), did)
	if err != nil {
		return nil, err
	}

	// Parse the key from the PEM
	privateKey, err = jwk.ParseKey(entDID.Jwk)
	if err != nil {
		return nil, err
	}

	return privateKey, nil

}

func (v *Vault) DIDKeyToPublicKey(did string) (publicKey jwk.Key, err error) {

	if !strings.HasPrefix(did, "did:key:") {
		return nil, ErrDIDKeyInvalid
	}

	entDID, err := v.db.DID.Get(context.Background(), did)
	if err != nil {
		return nil, err
	}

	// Parse the key from the PEM
	privateKey, err := jwk.ParseKey(entDID.Jwk)
	if err != nil {
		return nil, err
	}
	publicKey, err = privateKey.PublicKey()
	if err != nil {
		return nil, err
	}

	return publicKey, nil

}
