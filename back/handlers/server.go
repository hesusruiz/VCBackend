package handlers

import (
	"encoding/base64"
	"errors"
	"os"

	"github.com/hesusruiz/vcutils/yaml"
	"github.com/skip2/go-qrcode"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/storage/memory"
)

const issuerPrefix = "/issuer/api/v1"
const verifierPrefix = "/verifier/api/v1"
const walletPrefix = "/wallet/api/v1"
const defaultWalletProvisioning = "wallet.mycredential.eu"

var (
	ErrNoStateReceived          = errors.New("no state received")
	ErrInvalidStateReceived     = errors.New("invalid state received")
	ErrNoCredentialFoundInState = errors.New("no credential found in state")
	ErrBadCredentialFormat      = errors.New("credential received not in JSON format")
)

// Server is the struct holding the state of the server
type Server struct {
	*fiber.App
	Cfg            *yaml.YAML
	SessionStorage *memory.Storage
}

func NewServer(cfg *yaml.YAML) *Server {

	srv := &Server{
		App:            &fiber.App{},
		Cfg:            cfg,
		SessionStorage: &memory.Storage{},
	}

	return srv
}

func (s *Server) HandleHome(c *fiber.Ctx) error {

	// Render index
	return c.Render("index", "")
}

func (s *Server) HandleStop(c *fiber.Ctx) error {
	os.Exit(0)
	return nil
}

// HandleWalletProviderHome displays a QR code to be scanned and obtain the wallet
func (v *Server) HandleWalletProviderHome(c *fiber.Ctx) error {

	// This is the url for the demo wallet
	walletDomain := v.Cfg.String("server.walletProvisioning", defaultWalletProvisioning)
	wallet_url := c.Protocol() + "://" + walletDomain

	// Create the QR code
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
		"walletDomain":   walletDomain,
	}
	return c.Render("walletprovider_present_qr", m)
}
