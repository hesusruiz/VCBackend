package main

import (
	"context"
	"fmt"
	"net/http"

	"github.com/evidenceledger/vcdemo/back/handlers"
	"github.com/evidenceledger/vcdemo/back/operations"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/gofiber/fiber/v2"
	"github.com/hesusruiz/vcutils/yaml"
	zlog "github.com/rs/zerolog/log"
	"go.uber.org/zap"
)

const issuerPrefix = "/issuer/api/v1"
const verifierPrefix = "/verifier/api/v1"
const walletPrefix = "/wallet/api/v1"

type EnterpriseWallet struct {
	rootServer *handlers.Server
	vault      *vault.Vault
	cfg        *yaml.YAML
	operations *operations.Manager
	did        string
}

// setupEnterpriseWallet creates and setups the Enterprise Wallet routes
func setupEnterpriseWallet(s *handlers.Server, cfg *yaml.YAML) {

	wallet := &EnterpriseWallet{}

	wallet.rootServer = s
	wallet.cfg = cfg

	// The Enterprise Wallet is associated to the Issuer, so we connect to the Issuer store engine
	wallet.vault = vault.Must(vault.New(yaml.New(cfg.Map("issuer"))))

	// Backend Operations for the Verifier
	wallet.operations = operations.NewManager(wallet.vault, cfg)

	// Define the prefix for Wallet routes
	walletRoutes := s.Group(walletPrefix)

	// Page to display the available credentials (from the Issuer)
	walletRoutes.Get("/selectcredential", wallet.WalletPageSelectCredential)

	// To send a credential to the Verifier
	walletRoutes.Get("/sendcredential", wallet.WalletPageSendCredential)

}

func (w *EnterpriseWallet) WalletPageSelectCredential(c *fiber.Ctx) error {

	type authRequest struct {
		Scope         string `query:"scope"`
		Response_mode string `query:"response_mode"`
		Response_type string `query:"response_type"`
		Client_id     string `query:"client_id"`
		Redirect_uri  string `query:"redirect_uri"`
		State         string `query:"state"`
		Nonce         string `query:"nonce"`
	}

	ar := new(authRequest)
	if err := c.QueryParser(ar); err != nil {
		return err
	}

	// Get the list of credentials
	credsSummary, err := w.operations.GetAllCredentials()
	if err != nil {
		return err
	}

	// Render template
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"prefix":         walletPrefix,
		"authRequest":    ar,
		"credlist":       credsSummary,
	}
	return c.Render("wallet_selectcredential", m)
}

func (w *EnterpriseWallet) WalletPageSendCredential(c *fiber.Ctx) error {

	// Get the ID of the credential
	credID := c.Query("id")

	// Get the url where we have to send the credential
	redirect_uri := c.Query("redirect_uri")

	// Get the state nonce
	state := c.Query("state")

	zlog.Info().Str("credID", credID).Str("redirect_uri", redirect_uri).Str("state", state).Msg("WalletPageSendCredential")

	// Get the raw credential from the Vault
	rawCred, err := w.vault.Client.Credential.Get(context.Background(), credID)
	if err != nil {
		return err
	}

	// Prepare to POST the credential to the url, passing the state
	agent := fiber.Post(redirect_uri)
	agent.QueryString("state=" + state)

	// Set the credential in the body of the request
	bodyRequest := fiber.Map{
		"credential": string(rawCred.Raw),
	}
	agent.JSON(bodyRequest)

	// Set content type, both for request and accepted reply
	agent.ContentType("application/json")
	agent.Set("accept", "application/json")

	// Send the request.
	// We are interested only in the success of the request.
	code, body, _ := agent.Bytes()
	if code != http.StatusOK {
		err = fmt.Errorf(string(body))
		zlog.Err(err).Send()
	}

	// Tell the user that it was OK
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"prefix":         verifierPrefix,
		"error":          "",
	}
	if code != http.StatusOK {
		m["error"] = fmt.Sprintf("Error calling server: %s", err)
	}
	return c.Render("wallet_credentialsent", m)
}

func (w *EnterpriseWallet) WalletAPICreatePresentation(creds []string, holder string) (string, error) {

	type inputCreatePresentation struct {
		Vcs       []string `json:"vcs,omitempty"`
		HolderDid string   `json:"holderDid,omitempty"`
	}

	postBody := inputCreatePresentation{
		Vcs:       creds,
		HolderDid: holder,
	}

	custodianURL := w.rootServer.Cfg.String("ssikit.custodianURL")

	// Call the SSI Kit
	agent := fiber.Post(custodianURL + "/credentials/present")
	agent.Set("accept", "application/json")
	agent.JSON(postBody)
	_, returnBody, errors := agent.Bytes()
	if len(errors) > 0 {
		w.rootServer.Logger.Errorw("error calling SSI Kit", zap.Errors("errors", errors))
		return "", fmt.Errorf("error calling SSI Kit: %v", errors[0])
	}

	fmt.Println("presentation", string(returnBody))

	return string(returnBody), nil

}
