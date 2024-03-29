package main

import (
	"crypto/tls"
	"flag"
	"fmt"
	"net/http"
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

	tp := &http.Transport{}
	tp.TLSClientConfig = &tls.Config{
		GetClientCertificate: certRequested,
	}

	client := &http.Client{Transport: tp}
	client.Get("https://issuersec.mycredential.eu/issuer.html")

}

func certRequested(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
	fmt.Println("Hola, me estan pidiendo un certificado")
	return nil, fmt.Errorf("no tengo ningun certificado")
}
