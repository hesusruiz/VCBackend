package storage

import (
	"log/slog"
	"time"

	"golang.org/x/text/language"

	"github.com/zitadel/oidc/v3/pkg/oidc"
	"github.com/zitadel/oidc/v3/pkg/op"
)

const (
	// LEARCredentialScope is the scope that the Client must request in addition to 'openid'
	LEARCredentialScope = "learcred"

	// CustomClaim is the name of the claim that will be added to the token_id sent to the Client.
	// The Client will be able to retrieve the whote LEARCredential from this claim
	CustomClaim = "learcred"

	// CustomScopeImpersonatePrefix is an example scope prefix for passing user id to impersonate using token exchage
	CustomScopeImpersonatePrefix = "custom_scope:impersonate:"
)

type InternalAuthRequest struct {
	ID                string
	CreationDate      time.Time
	ApplicationID     string
	CallbackURI       string
	TransferState     string
	Prompt            []string
	UiLocales         []language.Tag
	LoginHint         string
	MaxAuthAge        *time.Duration
	UserID            string
	Scopes            []string
	ResponseType      oidc.ResponseType
	ResponseMode      oidc.ResponseMode
	Nonce             string
	CodeChallenge     *OIDCCodeChallenge
	WalletAuthRequest string

	done     bool
	authTime time.Time
}

// LogValue allows you to define which fields will be logged.
// Implements the [slog.LogValuer]
func (a *InternalAuthRequest) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("id", a.ID),
		slog.Time("creation_date", a.CreationDate),
		slog.Any("scopes", a.Scopes),
		slog.String("response_type", string(a.ResponseType)),
		slog.String("app_id", a.ApplicationID),
		slog.String("callback_uri", a.CallbackURI),
		slog.String("wallet_authrequest", a.WalletAuthRequest),
	)
}

func (a *InternalAuthRequest) GetID() string {
	return a.ID
}

func (a *InternalAuthRequest) GetACR() string {
	return "" // we won't handle acr in this example
}

func (a *InternalAuthRequest) GetAMR() []string {
	// We use proof of possesion of a key, embedded in the LEARCredential
	if a.done {
		return []string{"vc", "pop"}
	}
	return nil
}

func (a *InternalAuthRequest) GetAudience() []string {
	return []string{a.ApplicationID} // this example will always just use the client_id as audience
}

func (a *InternalAuthRequest) GetAuthTime() time.Time {
	return a.authTime
}

func (a *InternalAuthRequest) GetClientID() string {
	return a.ApplicationID
}

func (a *InternalAuthRequest) GetCodeChallenge() *oidc.CodeChallenge {
	return CodeChallengeToOIDC(a.CodeChallenge)
}

func (a *InternalAuthRequest) GetWalletAuthRequestByID() string {
	return a.WalletAuthRequest
}

func (a *InternalAuthRequest) GetNonce() string {
	return a.Nonce
}

func (a *InternalAuthRequest) GetRedirectURI() string {
	return a.CallbackURI
}

func (a *InternalAuthRequest) GetResponseType() oidc.ResponseType {
	return a.ResponseType
}

func (a *InternalAuthRequest) GetResponseMode() oidc.ResponseMode {
	return a.ResponseMode
}

func (a *InternalAuthRequest) GetScopes() []string {
	return a.Scopes
}

func (a *InternalAuthRequest) GetState() string {
	return a.TransferState
}

func (a *InternalAuthRequest) GetSubject() string {
	return a.UserID
}

func (a *InternalAuthRequest) Done() bool {
	return a.done
}

func PromptToInternal(oidcPrompt oidc.SpaceDelimitedArray) []string {
	prompts := make([]string, len(oidcPrompt))
	for _, oidcPrompt := range oidcPrompt {
		switch oidcPrompt {
		case oidc.PromptNone,
			oidc.PromptLogin,
			oidc.PromptConsent,
			oidc.PromptSelectAccount:
			prompts = append(prompts, oidcPrompt)
		}
	}
	return prompts
}

func MaxAgeToInternal(maxAge *uint) *time.Duration {
	if maxAge == nil {
		return nil
	}
	dur := time.Duration(*maxAge) * time.Second
	return &dur
}

func authRequestToInternal(authReq *oidc.AuthRequest, userID string) *InternalAuthRequest {
	return &InternalAuthRequest{
		CreationDate:  time.Now(),
		ApplicationID: authReq.ClientID,
		CallbackURI:   authReq.RedirectURI,
		TransferState: authReq.State,
		Prompt:        PromptToInternal(authReq.Prompt),
		UiLocales:     authReq.UILocales,
		LoginHint:     authReq.LoginHint,
		MaxAuthAge:    MaxAgeToInternal(authReq.MaxAge),
		UserID:        userID,
		Scopes:        authReq.Scopes,
		ResponseType:  authReq.ResponseType,
		ResponseMode:  authReq.ResponseMode,
		Nonce:         authReq.Nonce,
		CodeChallenge: &OIDCCodeChallenge{
			Challenge: authReq.CodeChallenge,
			Method:    string(authReq.CodeChallengeMethod),
		},
	}
}

type OIDCCodeChallenge struct {
	Challenge string
	Method    string
}

func CodeChallengeToOIDC(challenge *OIDCCodeChallenge) *oidc.CodeChallenge {
	if challenge == nil {
		return nil
	}
	challengeMethod := oidc.CodeChallengeMethodPlain
	if challenge.Method == "S256" {
		challengeMethod = oidc.CodeChallengeMethodS256
	}
	return &oidc.CodeChallenge{
		Challenge: challenge.Challenge,
		Method:    challengeMethod,
	}
}

// RefreshTokenRequestFromBusiness will simply wrap the storage RefreshToken to implement the op.RefreshTokenRequest interface
func RefreshTokenRequestFromBusiness(token *RefreshToken) op.RefreshTokenRequest {
	return &RefreshTokenRequest{token}
}

type RefreshTokenRequest struct {
	*RefreshToken
}

func (r *RefreshTokenRequest) GetAMR() []string {
	return r.AMR
}

func (r *RefreshTokenRequest) GetAudience() []string {
	return r.Audience
}

func (r *RefreshTokenRequest) GetAuthTime() time.Time {
	return r.AuthTime
}

func (r *RefreshTokenRequest) GetClientID() string {
	return r.ApplicationID
}

func (r *RefreshTokenRequest) GetScopes() []string {
	return r.Scopes
}

func (r *RefreshTokenRequest) GetSubject() string {
	return r.UserID
}

func (r *RefreshTokenRequest) SetCurrentScopes(scopes []string) {
	r.Scopes = scopes
}
