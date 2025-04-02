package issuernew

import (
	"github.com/pocketbase/pocketbase/models"
	"github.com/valyala/fasttemplate"
)

var templateLEARCredentialOffer = `
<!DOCTYPE html>
<html lang="en">

<head>

    <link rel="stylesheet" href="/common.css" />

    <script type="module" src="https://cdn.jsdelivr.net/npm/@ionic/core@7/dist/ionic/ionic.esm.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@ionic/core@7/css/ionic.bundle.css" />

    <script>
        window.Ionic = {
            config: {
                mode: 'ios',
            },
        };
    </script>

    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Private Verifiable Credentials" />
    <meta name="theme-color" content="#919597">
    <title>Issuer home</title>

    <meta itemprop="name" content="Private Verifiable Credentials">
    <meta itemprop="description" content="Private Verifiable Credentials">
    <!-- Facebook Meta Tags -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Private Verifiable Credentials">
    <meta property="og:description" content="Privacy-focused Wallet for Verifiable Credentials">
    <!-- <link rel="manifest" href="./manifest.webmanifest"> -->

    <link rel="icon" type="image/png" href="/favicon.ico" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <meta name="apple-mobile-web-app-title" content="Private Verifiable Credentials" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <style>

        @font-face {
            font-family: "Roboto";
            src: url("/fonts/Roboto-Regular.ttf") format("truetype");
        }

        @font-face {
            font-family: "Roboto";
            src: url("/fonts/Roboto-Medium.ttf") format("truetype");
            font-weight: 450 500;
        }

        .text-large {
            font-size: large;
        }

        .text-menu {
            font-size: large;
            font-weight: 500;
        }

        .text-larger {
            font-size: 1.3rem;
        }

        .text-medium {
            font-size: medium;
        }

        .text-small {
            font-size: small;
        }

        ion-toolbar {
            --min-height: 55px;
        }
    </style>

</head>

<body>

    <ion-app>

        <ion-header id="the_header">

            <ion-toolbar color="primary">
                <ion-title>Issuer of LEARCredentials</ion-title>
            </ion-toolbar>

        </ion-header>

        <ion-content>

            <div class="half-centered">
            
                <div class="w3-panel">
                    <h2>You have a Credential</h2>
            
            
                    <p>A LEARCredential has been issued to you by {{creator_email}} on {{created}}.
                        The status of the credential is "{{status}}".
                    </p>
            
                    <p>You have two options to receive the credential in your Wallet.
                    </p>
            
                    <div class="w3-card w3-panel">

                        <h3>1. If you are reading this in your mobile</h3>

                        <p>You can <a href="{{sameDeviceCredentialHref}}"" target=" _blank">click here to see the credential</a>
                            and decide if you want to store the credential in the wallet. You can skip the rest of the steps.
                        </p>        
    
                    </div>

                    <div class="w3-card w3-panel">
                        <h3>2. If you are reading this in another device</h3>

                        <p>If you are reading this in a PC, Laptop or any other device which is not the mobile where you want
                            your credential to be stored, you need to scan the QR code displayed below with your Credential Wallet:
                        </p>

                        <h4>2.1 First you need your Wallet</h4>

                        <p>If you already have your Wallet, skip this step and go to step 2.2. Otherwise, you need first to load the wallet by scanning
                            the QR code just below, and then go to step 2.2.
                        </p>

                        <figure class="w3-margin">
                            <img src="{{walletqrcode}}" alt="QR code">
                            <figcaption>Getting the Wallet: Scan the QR code above with your mobile camera or type <b>{{samedeviceWallet}}</b> in the browser in your mobile.</figcaption>
                          </figure>

                        <h4>2.2 Scan and save the credential in your Wallet</h4>

                        <p>With your Wallet in your mobile, scan the QR code below and click the button to save it to your Wallet.
                        </p>
                
                        <figure class="w3-margin">
                            <img src="{{credentialqrcode}}" alt="QR code">
                            <figcaption>Getting the Credential: Scan the QR code above with the Wallet.</b></figcaption>
                          </figure>
                
                    </div>
            
                </div>
            </div>

        </ion-content>
    </ion-app>

    <footer>
    </footer>

</body>

</html>
`

func renderLEARCredentialOffer(credentialRecord *models.Record, walletQRcode, credentialQRcode, sameDeviceCredentialHref, samedeviceWallet string) string {

	t := fasttemplate.New(templateLEARCredentialOffer, "{{", "}}")
	html := t.ExecuteString(map[string]any{
		"walletqrcode":             walletQRcode,
		"credentialqrcode":         credentialQRcode,
		"sameDeviceCredentialHref": sameDeviceCredentialHref,
		"samedeviceWallet":         samedeviceWallet,
		"creator_email":            credentialRecord.GetString("creator_email"),
		"status":                   credentialRecord.GetString("status"),
		"created":                  credentialRecord.GetString("created"),
	})

	return html
}
