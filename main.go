package main

import (
	"encoding/pem"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/evidenceledger/vcdemo/client"
	"github.com/evidenceledger/vcdemo/faster"
	"github.com/evidenceledger/vcdemo/issuernew"
	"github.com/evidenceledger/vcdemo/verifiernew"
	"github.com/evidenceledger/vcdemo/x509util"
	"github.com/hesusruiz/vcutils/yaml"
	"github.com/labstack/echo/v5"
	echomiddle "github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"log"
)

const defaultConfigFileName = "server.yaml"
const defaultBuildConfigFile = "./data/config/devserver.yaml"

var baseDir string

func main() {

	// Loosely check if it was executed using "go run"
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	// Detect the location of the main config file
	if isGoRun {
		// Probably ran with go run
		baseDir, _ = os.Getwd()
	} else {
		// Probably ran with go build
		baseDir = filepath.Dir(os.Args[0])
	}

	// The full path to the default config file, in the same place as the program binary
	defaultConfigFilePath := filepath.Join(baseDir, defaultConfigFileName)

	// Read configuration file
	rootCfg := readConfiguration(LookupEnvOrString("CONFIG_FILE", defaultConfigFilePath))

	// Get the configurations for the individual services
	icfg := rootCfg.Map("issuer")
	if len(icfg) == 0 {
		panic("no configuration for new Issuer found")
	}
	issuerCfg := yaml.New(icfg)

	// Create a new Issuer with its configuration
	iss := issuernew.New(issuerCfg)
	app := iss.App

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// enable auto creation of migration files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Automigrate: isGoRun,
	})

	// Customize the root command
	app.RootCmd.Short = "VCDemo CLI"

	// Add our command to build the frontend code
	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "build",
		Short: "Build the wallet front application",
		Run: func(cmd *cobra.Command, args []string) {
			log.Println("Building the front")
			faster.BuildFront(buildConfigFileName(rootCfg))
		},
	})

	// Add the eIDAS-related commands
	app.RootCmd.AddCommand(eIDASCommand(rootCfg))

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// Start Verifier and Wallet static server other services
		return StartServices(rootCfg)
	})

	// Start the new Issuer and block
	err := iss.Start()
	if err != nil {
		panic(err)
	}

}

func eIDASCommand(rootCfg *yaml.YAML) *cobra.Command {

	// The main eIDAS command
	eIDAScmd := &cobra.Command{
		Use:   "eidas",
		Short: "Create and view eIDAS test certificates",

		// Run: func(cmd *cobra.Command, args []string) {
		// 	log.Println("Running the eIDAS command")
		// 	eIDASThings(cmd, args)
		// },
	}

	// Create a test eIDAS CA certificate, both in PKCS12 and PEM format
	var capassword string
	var casubject string
	var caoutput string
	createCAcmd := &cobra.Command{
		Use:   "createca",
		Short: "Creates a test eIDAs CA certificate from the data in a YAML file. The certificate is written in two formats, PEM and PKCS12",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Do the work
			return createCACert(capassword, casubject, caoutput)
		},
	}
	createCAcmd.LocalFlags().StringVarP(&capassword, "password", "p", "", "Password for the certificate")
	createCAcmd.LocalFlags().StringVarP(&casubject, "subject", "s", "eidascert_ca.yaml", "Path to the input data file in YAML format")
	createCAcmd.LocalFlags().StringVarP(&caoutput, "output", "o", "", "Path to the directory where certificate files will be created")

	// Create a test eIDAS leaf certificate, both in PKCS12 and PEM format
	var password string
	var cacert string
	var subject string
	var output string
	createLeafcmd := &cobra.Command{
		Use:   "createleaf",
		Short: "Creates a test eIDAs leaf certificate from the data in a YAML file, signed with a CA certificate",
		RunE: func(cmd *cobra.Command, args []string) error {
			return createLeafCert(password, cacert, subject, output)
		},
	}
	createLeafcmd.LocalFlags().StringVarP(&password, "password", "p", "", "Password for the certificate")
	createLeafcmd.LocalFlags().StringVarP(&cacert, "cacert", "c", "eidascert_ca.p12", "Path to the existing CA certificate in PKCS12 format")
	createLeafcmd.LocalFlags().StringVarP(&subject, "subject", "s", "eidascert.yaml", "Path to the input data file in YAML format")
	createLeafcmd.LocalFlags().StringVarP(&output, "output", "o", "", "Path to the directory where certificate files will be created")

	// Display the contents of a certificate file, accepts either PEM or PKCS12
	var displayPassword string
	displayCertcmd := &cobra.Command{
		Use:   "display cert_file_name",
		Short: "Displays an eIDAs certificate from the PEM or PKCS12 file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			err := x509util.DisplayPEMCert(args[0], displayPassword)
			if err == nil {
				return nil
			}
			return x509util.DisplayP12Cert(args[0], displayPassword)
		},
	}
	displayCertcmd.LocalFlags().StringVarP(&displayPassword, "password", "p", "", "Password for the certificate")

	eIDAScmd.AddCommand(createCAcmd)
	eIDAScmd.AddCommand(createLeafcmd)
	eIDAScmd.AddCommand(displayCertcmd)

	return eIDAScmd
}

// createCACert creates a test eIDAS CA certificate
func createCACert(password, casubject, caoutput string) error {

	//*******************************
	// Create the CA certificate
	//*******************************

	// Get the absolute path to the input file
	absSubject, err := filepath.Abs(casubject)
	if err != nil {
		return err
	}

	// Get the filename without extension
	dir, filename := filepath.Split(absSubject)
	nakedFilename := strings.TrimSuffix(filename, filepath.Ext(filename))

	if caoutput == "" {
		caoutput = dir
	}

	// Get the absolute path to the output directory
	absOutdir, err := filepath.Abs(caoutput)
	if err != nil {
		return err
	}

	// Create the two output files
	p12FileName := path.Join(absOutdir, nakedFilename+".p12")
	pemFileName := path.Join(absOutdir, nakedFilename+".pem")

	// Read the data to include in the CA Certificate
	cd, err := readCertData(absSubject)
	if err != nil {
		fmt.Println("file", casubject, "not found, using default values")
		cd = yaml.New("")
	}

	subAttrs := x509util.ELSIName{
		OrganizationIdentifier: cd.String("OrganizationIdentifier", "VATES-55663399H"),
		Organization:           cd.String("Organization", "DOME Marketplace"),
		CommonName:             cd.String("CommonName", "RUIZ JESUS - 12345678V"),
		Country:                cd.String("Country", "ES"),
	}
	fmt.Println(subAttrs)

	// Use the default values for the key parameters (RSA, 2048 bits)
	keyparams := x509util.KeyParams{}

	// Create the self-signed CA certificate
	privateCAKey, newCACert, err := x509util.NewCAELSICertificateRaw(subAttrs, keyparams)
	if err != nil {
		return err
	}

	// Save to a file in pkcs12 format, including the private key and the certificate
	err = x509util.SaveCertificateToPkcs12File(p12FileName, privateCAKey, newCACert, password)
	if err != nil {
		return err
	}

	// Save the certificate to a file in PEM format
	pemFile, err := os.OpenFile(pemFileName, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to open %s for writing: %w", pemFileName, err)
	}

	block := &pem.Block{
		Type:  "CERTIFICATE",
		Bytes: newCACert.Raw,
	}

	if err := pem.Encode(pemFile, block); err != nil {
		return err
	}

	if err := pemFile.Close(); err != nil {
		return err
	}

	fmt.Printf("Certificates created in: %s and %s\n", pemFileName, p12FileName)
	return nil
}

func createLeafCert(password, cacert, subject, output string) error {

	//*******************************
	// Retrieve the CA certificate
	//*******************************

	privateCAKey, newCACert, _, err := x509util.ReadPKCS12File(cacert, password)
	if err != nil {
		return err
	}

	//*******************************
	// Create the leaf certificate
	//*******************************

	// Get the absolute path to the input file
	absSubject, err := filepath.Abs(subject)
	if err != nil {
		return err
	}

	// Get the filename without extension
	dir, filename := filepath.Split(absSubject)
	nakedFilename := strings.TrimSuffix(filename, filepath.Ext(filename))

	if output == "" {
		output = dir
	}

	// Get the absolute path to the output directory
	absOutdir, err := filepath.Abs(output)
	if err != nil {
		return err
	}

	// Create the two output files
	p12FileName := path.Join(absOutdir, nakedFilename+".p12")
	pemFileName := path.Join(absOutdir, nakedFilename+".pem")

	// Use the default values for the key parameters (RSA, 2048 bits)
	keyparams := x509util.KeyParams{}

	cd, err := readCertData(subject)
	if err != nil {
		fmt.Println("file", subject, "not found, using default values")
		cd = yaml.New("")
	}

	subAttrs := x509util.ELSIName{

		OrganizationIdentifier: cd.String("OrganizationIdentifier", "VATES-55663399H"),
		Organization:           cd.String("Organization", "DOME Marketplace"),
		CommonName:             cd.String("CommonName", "RUIZ JESUS - 12345678V"),
		GivenName:              cd.String("GivenName", "JESUS"),
		Surname:                cd.String("Surname", "RUIZ"),
		EmailAddress:           cd.String("EmailAddress", "jesus@alastria.io"),
		SerialNumber:           cd.String("SerialNumber", "IDCES-12345678V"),
		Country:                cd.String("Country", "ES"),
	}
	fmt.Println(subAttrs)

	// Create the entity certificate, signed by the CA certificate
	privateKey, newCert, err := x509util.NewELSICertificateRaw(
		newCACert,
		privateCAKey,
		subAttrs,
		keyparams)
	if err != nil {
		return err
	}

	// Save to a file in pkcs12 format, including the private key and the certificate
	err = x509util.SaveCertificateToPkcs12File(p12FileName, privateKey, newCert, password)
	if err != nil {
		return err
	}

	// Save the certificate to a file in PEM format
	pemFile, err := os.OpenFile(pemFileName, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to open %s for writing: %w", pemFileName, err)
	}

	block := &pem.Block{
		Type:  "CERTIFICATE",
		Bytes: newCert.Raw,
	}

	if err := pem.Encode(pemFile, block); err != nil {
		return err
	}

	if err := pemFile.Close(); err != nil {
		return err
	}

	fmt.Printf("Certificates created in: %s and %s\n", pemFileName, p12FileName)
	return nil
}

func StartServices(rootCfg *yaml.YAML) error {

	// Get the configuration for the Verifier
	vcfg := rootCfg.Map("verifier")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	verifierCfg := yaml.New(vcfg)

	// Start the new Verifier
	if err := verifiernew.Start(verifierCfg); err != nil {
		return err
	}

	// Start the server for static Wallet assets
	go func() {
		staticServer := echo.New()
		staticServer.Use(echomiddle.CORS())

		// Serve the static assets from the configured directory
		staticDir := rootCfg.String("server.staticDir", "www")
		staticServer.Static("/*", staticDir)

		if rootCfg.String("server.environment") == "development" {
			// Just for development time. Disable when in production

			// Start the watcher
			go faster.WatchAndBuild(buildConfigFileName(rootCfg))

			// Stop the whole server remotely
			staticServer.GET("/stopserver", func(c echo.Context) error {
				os.Exit(0)
				return nil
			})

			staticServer.GET("/fake", func(c echo.Context) error {
				fmt.Println("Me han llamado al GET: ", c.Request().URL)

				return nil
			})
			staticServer.POST("/fake", func(c echo.Context) error {
				fmt.Println("Me han llamado al POST")

				return nil
			})

		}

		//Start serving requests
		walletListenAddress := rootCfg.String("server.listenAddress", ":3030")
		log.Fatal(staticServer.Start(walletListenAddress))
	}()

	// Get the configuration for the example Relying Party
	rcfg := rootCfg.Map("relyingParty")
	if len(vcfg) == 0 {
		panic("no configuration for Verifier found")
	}
	relyingPartyCfg := yaml.New(rcfg)

	// Start the example application which will use the Verifier to accept Verifiable Credentials
	time.Sleep(2 * time.Second)
	go client.Setup(relyingPartyCfg)

	return nil

}

// readConfiguration reads a YAML file and creates an easy-to navigate structure
func readConfiguration(configFile string) *yaml.YAML {
	var cfg *yaml.YAML
	var err error

	cfg, err = yaml.ParseYamlFile(configFile)
	if err != nil {
		fmt.Printf("Config file not found, exiting\n")
		panic(err)
	}
	return cfg
}

func LookupEnvOrString(key string, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func buildConfigFileName(cfg *yaml.YAML) string {
	buildConfigFile := cfg.String("server.buildFront.buildConfigFile", defaultBuildConfigFile)
	buildConfigFile = LookupEnvOrString("BUILD_CONFIG_FILE", buildConfigFile)
	return buildConfigFile
}

// readConfiguration reads a YAML file and creates an easy-to navigate structure
func readCertData(certDataFile string) (*yaml.YAML, error) {
	var cfg *yaml.YAML
	var err error

	cfg, err = yaml.ParseYamlFile(certDataFile)
	if err != nil {
		return nil, err
	}
	return cfg, nil
}
