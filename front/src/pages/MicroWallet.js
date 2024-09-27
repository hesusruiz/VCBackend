import { renderAnyCredentialCard } from '../components/renderAnyCredential'
import { getOrCreateDidKey } from '../components/crypto'

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog

window.MHR.register("MicroWallet", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

        // Create a new did:key (ECDSA/P-256) if it was not already created
        const mydid = await getOrCreateDidKey()

        console.log("My DID", mydid.did)

        let html = this.html

        // We can receive QRs via the URL or scanning with the camera

        // If URL specifies a QR then
        //     check it and store in local storage
        //     clean the URL and reload the app
        // If URL is clean (initially or after reloading)
        //     retrieve the QR from local storage and display it

        let params = new URL(document.location).searchParams
        console.log("MicroWallet", document.location)

        // Check for redirect during the authentication flow
        if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
            console.log("MicroWallet ************Redirected with state**************")
            gotoPage("LoadAndSaveQRVC", document.URL)
            return;
        }
        
        if (document.URL.includes("code=")) {
            console.log("MicroWallet ************Redirected with code**************")
            gotoPage("LoadAndSaveQRVC", document.URL)
            return;
        }
        
        // QR code found in URL. Process and display it
        let scope = params.get("scope")
        if (scope !== null) {
            console.log("detected scope")
            gotoPage("SIOPSelectCredential", document.URL)
            return;
        }

        // Check if we are authenticating
        let request_uri = params.get("request_uri")
        if (request_uri !== null) {
            // Unescape the query parameter
            request_uri = decodeURIComponent(request_uri)
            console.log("MicroWallet request_uri", request_uri)
            console.log("Going to SIOPSelectCredential with", document.URL)
            gotoPage("SIOPSelectCredential", document.URL)
            return;
        }

        // Check if we are in a credential issuance scenario
        let credential_offer_uri = params.get("credential_offer_uri")
        if (credential_offer_uri) {
            console.log("MicroWallet", credential_offer_uri)
            await gotoPage("LoadAndSaveQRVC", document.location.href)
            return;
        }

        // The URL specifies a command
        let command = params.get("command")
        if (command !== null) {
            
            switch (command) {
                case "getvc":
                    var vc_id = params.get("vcid")
                    await gotoPage("LoadAndSaveQRVC", vc_id)
                    return;

                default:
                    break;
            }
        }

        // Retrieve all recent credentials from storage
        var credentials = await storage.credentialsGetAllRecent()
        
        if (!credentials) {
            gotoPage("ErrorPage", { "title": "Error", "msg": "Error getting recent credentials" })
            return
        }

        // Pre-render each of the known credentials
        const theDivs = []
        for (const vcraw of credentials) {

            // For the moment, we only understand the credentials in the "jwt_vc" format
            if (vcraw.type == "jwt_vc") {

                // We use the hash of the credential as its unique ID
                const currentId = vcraw.hash

                // Get the unencoded payload
                const vc = vcraw.decoded

                const status = vcraw.status

                // Render the credential
                const div = html`
                <ion-card>
                
                    ${renderAnyCredentialCard(vc, vcraw.status)}
        
                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("DisplayVC", vcraw)}>
                            <ion-icon slot="start" name="construct"></ion-icon>
                            ${T("Details")}
                        </ion-button>

                        <ion-button color="danger" @click=${() => this.presentActionSheet(currentId)}>
                            <ion-icon slot="start" name="trash"></ion-icon>
                            ${T("Delete")}
                        </ion-button>
                    </div>
                </ion-card>
                `

                theDivs.push(div)
            }

        }

        var theHtml

        if (theDivs.length > 0) {

            theHtml = html`
                <ion-card>
                    <ion-card-content>
                        <h2>Click here to scan a QR code</h2>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan QR")}
                        </ion-button>
                    </div>

                </ion-card>

                ${theDivs}

                <ion-action-sheet id="mw_actionSheet" @ionActionSheetDidDismiss=${(ev) => this.deleteVC(ev)}>
                </ion-action-sheet>

            `

        } else {
            mylog("No credentials")

            // We do not have a QR in the local storage
            theHtml = html`
                <ion-card>
                    <ion-card-header>
                        <ion-card-title>The wallet is empty</ion-card-title>
                    </ion-card-header>

                    <ion-card-content>
                    <div class="text-medium">You need to obtain a Verifiable Credential from an Issuer, by scanning the QR in the screen of the Issuer page</div>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan a QR")}
                        </ion-button>
                    </div>

                </ion-card>
            `

        }

        this.render(theHtml, false)

    }


    async presentActionSheet(currentId) {
        const actionSheet = document.getElementById("mw_actionSheet")
        actionSheet.header = 'Confirm to delete credential'
        actionSheet.buttons = [
            {
                text: 'Delete',
                role: 'destructive',
                data: {
                    action: 'delete',
                },
            },
            {
                text: 'Cancel',
                role: 'cancel',
                data: {
                    action: 'cancel',
                },
            },
        ];

        this.credentialIdToDelete = currentId
        await actionSheet.present();
    }

    async deleteVC(ev) {
        // Delete only if event is delete
        if (ev.detail.data) {
            if (ev.detail.data.action == "delete") {
                // Get the credential to delete
                const currentId = this.credentialIdToDelete
                mylog("deleting credential", currentId)
                await storage.credentialsDelete(currentId)
                goHome()
                return
            }
        }
    }

})

