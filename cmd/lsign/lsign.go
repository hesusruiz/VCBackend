package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/evidenceledger/vcdemo/vault/x509util"
	"software.sslmate.com/src/go-pkcs12"
)

var (
	password = flag.String("password", "", "password to decrypt the pkcs12 file")
)

func main() {
	flag.Parse()

	userHome, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	certFile := filepath.Join(userHome, ".certs", "testcert.pfx")

	certBinary, err := os.ReadFile(certFile)
	if err != nil {
		panic(err)
	}

	_, certificate, caCerts, err := pkcs12.DecodeChain(certBinary, *password)
	if err != nil {
		panic(err)
	}

	fmt.Println("Number of CACerts", len(caCerts))

	subject := x509util.ParseEIDASNameFromATVSequence(certificate.Subject.Names)
	fmt.Println(subject)

}
