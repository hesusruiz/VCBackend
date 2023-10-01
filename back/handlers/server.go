package handlers

import (
	"encoding/base64"
	"errors"
	"os"

	"github.com/evidenceledger/vcdemo/internal/jwk"
	"github.com/evidenceledger/vcdemo/vault"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/skip2/go-qrcode"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/storage/memory"
	"go.uber.org/zap"
)

const issuerPrefix = "/issuer/api/v1"
const verifierPrefix = "/verifier/api/v1"
const walletPrefix = "/wallet/api/v1"

var (
	ErrNoStateReceived          = errors.New("no state received")
	ErrInvalidStateReceived     = errors.New("invalid state received")
	ErrNoCredentialFoundInState = errors.New("no credential found in state")
	ErrBadCredentialFormat      = errors.New("credential received not in JSON format")
)

// Server is the struct holding the state of the server
type Server struct {
	*fiber.App
	Cfg      *yaml.YAML
	WebAuthn *WebAuthnHandler
	// Operations     *operations.Manager
	IssuerVault    *vault.Vault
	VerifierVault  *vault.Vault
	WalletVault    *vault.Vault
	VerifierDID    string
	Logger         *zap.SugaredLogger
	SessionStorage *memory.Storage
}

func NewServer(cfg *yaml.YAML) *Server {

	srv := &Server{
		App:      &fiber.App{},
		Cfg:      cfg,
		WebAuthn: &WebAuthnHandler{},
		// Operations:     &operations.Manager{},
		IssuerVault:    &vault.Vault{},
		VerifierVault:  &vault.Vault{},
		WalletVault:    &vault.Vault{},
		VerifierDID:    "",
		Logger:         &zap.SugaredLogger{},
		SessionStorage: &memory.Storage{},
	}

	return srv
}

// type backendInfo struct {
// 	IssuerDID   string `json:"issuerDid"`
// 	VerifierDID string `json:"verifierDid"`
// }

// func (s *Server) GetBackendInfo(c *fiber.Ctx) error {
// 	info := backendInfo{IssuerDID: s.IssuerDID, VerifierDID: s.VerifierDID}

// 	return c.JSON(info)
// }

func (s *Server) HandleHome(c *fiber.Ctx) error {

	// Render index
	return c.Render("index", "")
}

func (s *Server) HandleStop(c *fiber.Ctx) error {
	os.Exit(0)
	return nil
}

// PageDisplayQRSIOP displays a QR code to be scanned by the Wallet to start the SIOP process
func (v *Server) HandleWalletProviderHome(c *fiber.Ctx) error {

	// This is the endpoint inside the QR that the wallet will use to send the VC/VP
	// wallet_url := c.Protocol() + "://" + c.Hostname() + "/static/wallet"
	wallet_url := "https://verifier.mycredential.eu/static/wallet"

	// Create the QR code for cross-device SIOP
	png, err := qrcode.Encode(wallet_url, qrcode.Medium, 256)
	if err != nil {
		return err
	}

	// Convert the image data to a dataURL
	base64Img := base64.StdEncoding.EncodeToString(png)
	base64Img = "data:image/png;base64," + base64Img

	// Render the page
	m := fiber.Map{
		"issuerPrefix":   issuerPrefix,
		"verifierPrefix": verifierPrefix,
		"walletPrefix":   walletPrefix,
		"qrcode":         base64Img,
		"prefix":         verifierPrefix,
	}
	return c.Render("walletprovider_present_qr", m)
}

var sameDevice = false

type jwkSet struct {
	Keys []*jwk.JWK `json:"keys"`
}

func (s *Server) VerifierAPIJWKS(c *fiber.Ctx) error {

	// Get public keys from Verifier
	pubkeys, err := s.VerifierVault.PublicKeysForUser(s.Cfg.String("verifier.id"))
	if err != nil {
		return err
	}

	keySet := jwkSet{pubkeys}

	return c.JSON(keySet)

}

// func (s *Server) HandleAuthenticationRequest(c *fiber.Ctx) error {

// 	// Get the list of credentials
// 	credsSummary, err := s.Operations.GetAllCredentials()
// 	if err != nil {
// 		return err
// 	}

// 	// Render template
// 	m := fiber.Map{
// 		"prefix":   verifierPrefix,
// 		"credlist": credsSummary,
// 	}
// 	return c.Render("wallet_selectcredential", m)
// }
