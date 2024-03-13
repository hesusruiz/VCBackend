package vault

import (
	"context"
	"time"

	"github.com/evidenceledger/vcdemo/vault/ent"
	"github.com/evidenceledger/vcdemo/vault/ent/user"
	"github.com/evidenceledger/vcdemo/vault/x509util"
	"golang.org/x/crypto/bcrypt"

	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"
	zlog "github.com/rs/zerolog/log"
)

// User represents the user model
// It also implements the webauthn.User interface
type User struct {
	db          *ent.Client
	entuser     *ent.User
	id          string
	name        string
	displayName string
	did         string
	credentials []webauthn.Credential
}

func (u *User) DID() string {
	return u.did
}

func NewUser(db *ent.Client, id string, name string) *User {
	if db == nil {
		panic("null DB handle")
	}
	if id == "" {
		panic("null user ID")
	}
	u := &User{}
	u.db = db
	u.id = id
	u.name = name
	u.displayName = name
	return u
}

// CreateOrGetUserWithDIDKey retrieves an existing User or creates a new one if it did not exist.
// The user created is associated to a did:key
func (v *Vault) CreateOrGetUserWithDIDKey(userid string, name string, usertype string, password string) (*User, error) {

	// Create a new User in memory
	u := NewUser(v.db, userid, name)

	// Return the user and DID from the storage if they already exist.
	// It is an error if the DID does not exist for a user
	usr, _ := v.db.User.Get(context.Background(), userid)
	if usr != nil {
		// User exists, retrieve the first did
		did, err := v.GetDIDForUser(userid)

		// Every user must have a did
		if err != nil {
			return nil, err
		}

		// Just return the existing user to the caller
		u.entuser = usr
		u.did = did
		return u, nil
	}

	// The user did not exist, we must create a new one

	// Calculate the password to store
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), 0)
	if err != nil {
		panic(err)
	}

	// Create new user of the specified type
	usr, err = v.db.User.
		Create().
		SetID(userid).
		SetName(name).
		SetDisplayname(name).
		SetType(usertype).
		SetPassword(hashedPassword).
		Save(context.Background())
	if err != nil {
		return nil, err
	}
	u.entuser = usr

	// Create a new did:key and add it to the user
	u.did, _, err = v.NewDidKeyForUser(u)
	if err != nil {
		return nil, err
	}

	zlog.Info().Str("DID", u.did).Str("id", userid).Str("name", name).Str("type", usertype).Msg("user created")

	return u, nil
}

// CreateOrGetUserWithDIDKey retrieves an existing User or creates a new one if it did not exist.
// The user created is associated to a did:key
func (v *Vault) CreateOrGetUserWithDIDelsi(userid string, name string, elsiName x509util.ELSIName, usertype string, password string) (*User, error) {

	// Create a new User in memory
	u := NewUser(v.db, userid, name)

	// Return the user and DID from the storage if they already exist.
	// It is an error if the DID does not exist for a user
	usr, _ := v.db.User.Get(context.Background(), userid)
	if usr != nil {
		// User exists, retrieve the first did
		did, err := v.GetDIDForUser(userid)

		// Every user must have a did
		if err != nil {
			return nil, err
		}

		// Just return the existing user to the caller
		u.entuser = usr
		u.did = did
		return u, nil
	}

	// The user did not exist, we must create a new one

	// Calculate the password to store
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), 0)
	if err != nil {
		panic(err)
	}

	// Create new user of the specified type
	usr, err = v.db.User.
		Create().
		SetID(userid).
		SetName(name).
		SetDisplayname(name).
		SetType(usertype).
		SetPassword(hashedPassword).
		Save(context.Background())
	if err != nil {
		return nil, err
	}
	u.entuser = usr

	keyparams := x509util.KeyParams{
		Ed25519Key: true,
		ValidFrom:  "Jan 1 15:04:05 2024",
		ValidFor:   365 * 24 * time.Hour,
	}

	// Create a new did:key and add it to the user
	u.did, _, _, err = v.NewDidelsiForUser(u, elsiName, keyparams)
	if err != nil {
		return nil, err
	}

	zlog.Info().Str("DID", u.did).Str("id", userid).Str("name", name).Str("type", usertype).Msg("user created")

	return u, nil
}

// GetUser returns a *User by the user's username
func (v *Vault) GetUserById(userid string) (*User, error) {

	entuser, err := v.db.User.Get(context.Background(), userid)
	if err != nil {
		return nil, err
	}

	u := NewUser(v.db, userid, entuser.Name)
	u.displayName = entuser.Displayname
	u.entuser = entuser

	// Get the credentials
	u.WebAuthnCredentials()

	// Get the first did of the user
	u.did, err = v.GetDIDForUser(u.id)
	if err != nil {
		return nil, err
	}

	return u, nil

}

// GetUser returns a *User by the user's username
func (v *Vault) GetUserByName(name string) (*User, error) {

	entuser, err := v.db.User.Query().Where(user.Name(name)).Only(context.Background())
	if err != nil {
		return nil, err
	}

	u := NewUser(v.db, entuser.ID, entuser.Name)
	u.displayName = entuser.Displayname
	u.entuser = entuser

	// Get the credentials
	u.WebAuthnCredentials()

	// Get the first did of the user
	u.did, err = v.GetDIDForUser(u.id)
	if err != nil {
		return nil, err
	}

	return u, nil

}

// WebAuthnID returns the user's ID
func (u User) WebAuthnID() []byte {
	return []byte(u.id)
}

// WebAuthnName returns the user's username
func (u User) WebAuthnName() string {
	return u.name
}

// WebAuthnDisplayName returns the user's display name
func (u User) WebAuthnDisplayName() string {
	return u.displayName
}

// WebAuthnIcon is not (yet) implemented
func (u User) WebAuthnIcon() string {
	return ""
}

// WebAuthnAddCredential associates the credential to the user
func (u *User) WebAuthnAddCredential(cred webauthn.Credential) {
	if u.entuser == nil {
		zlog.Panic().Msg("User model not initialized")
	}

	u.db.WebauthnCredential.Create().
		SetID(string(cred.ID)).
		SetCredential(cred).
		SetUser(u.entuser).
		SaveX(context.Background())

}

// WebAuthnCredentials returns credentials owned by the user
func (u *User) WebAuthnCredentials() []webauthn.Credential {
	if u.entuser == nil {
		zlog.Panic().Msg("User model not initialized")
	}

	entCreds := u.db.User.QueryAuthncredentials(u.entuser).AllX(context.Background())

	u.credentials = make([]webauthn.Credential, len(entCreds))

	for i, ec := range entCreds {
		u.credentials[i] = ec.Credential
	}

	return u.credentials
}

// CredentialExcludeList returns a CredentialDescriptor array filled
// with all a user's credentials
func (u *User) CredentialExcludeList() []protocol.CredentialDescriptor {

	credentialExcludeList := []protocol.CredentialDescriptor{}
	for _, cred := range u.credentials {
		descriptor := protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: cred.ID,
		}
		credentialExcludeList = append(credentialExcludeList, descriptor)
	}

	return credentialExcludeList
}
