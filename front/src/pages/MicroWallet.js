import PocketBase from '../components/pocketbase.es.mjs'

console.log("Wallet served from:", window.location.origin)
const pb = new PocketBase(window.location.origin)

// The logo in the header
import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'
import { log } from '../log'

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

        let html = this.html

        // Create our DID in the server
        const newUser = await createUser()

        // const record = await pb.collection('users').create(data);
        // console.log(record)

        // console.log("Requesting verification")
        // const result =await pb.collection('users').requestVerification('jesus@alastria.io')
        // console.log("After requesting verification:", result)


        // We can receive QRs via the URL or scanning with the camera

        // If URL specifies a QR then
        //     check it and store in local storage
        //     clean the URL and reload the app
        // If URL is clean (initially or after reloading)
        //     retrieve the QR from local storage and display it

        // Check if we received a certificate via the URL
        // The URL should be: https://host:port/?eudcc=QRCodeInBase64Encoding
        // The QRCodeInBase64Encoding is the long string representing each QR code
        let params = new URL(document.location).searchParams
        let scope = params.get("scope")
        let command = params.get("command")
        let request_uri = params.get("request_uri")
        let credential_offer_uri = params.get("credential_offer_uri")

        console.log(document.location)

        // Check for redirect during the authentication flow
        if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
            console.log("************Redirected with state**************")
            gotoPage("LoadAndSaveQRVC", document.URL)
            return;
        }
        
        if (document.URL.includes("code=")) {
            console.log("************Redirected with code**************")
            gotoPage("LoadAndSaveQRVC", document.URL)
            return;
        }
        

        // QR code found in URL. Process and display it
        if (scope !== null) {
            gotoPage("SIOPSelectCredential", document.URL)
            return;
        }

        // Check if we are authenticating
        if (request_uri !== null) {
            // Unescape the query parameter
            request_uri = decodeURIComponent(request_uri)
            console.log(request_uri)
            gotoPage("SIOPSelectCredential", request_uri)
            return;
        }

        // Check if we are in a credential issuance scenario
        if (credential_offer_uri) {
            await gotoPage("LoadAndSaveQRVC", document.location.href)
            return;
        }

        // The URL specifies a command
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

        // Display the certificate
        const theDivs = []

        for (const vcraw of credentials) {

            if (vcraw.type !== "w3cvc") {
                console.log("skipping unknown credential type")
                continue
            }

            // We use the hash of the credential as its unique ID
            const currentId = vcraw.hash

            // Get the unencoded payload
            const vc = JSON.parse(vcraw.encoded)
            const vcs = vc.credentialSubject
            const pos = vcs.position
            var avatar = photo_man
            if (vcs.gender == "f") {
                avatar = photo_woman
            }

            const div = html`
                <ion-card>

                    <ion-card-header>
                        <ion-card-title>${vcs.name}</ion-card-title>
                        <ion-card-subtitle>Employee</ion-card-subtitle>
                    </ion-card-header>

                    <ion-card-content class="ion-padding-bottom">

                        <ion-avatar>
                            <img alt="Avatar" src=${avatar} />
                        </ion-avatar>

                        <div>
                            <p>${pos.department}</p>
                            <p>${pos.secretariat}</p>
                            <p>${pos.directorate}</p>
                            <p>${pos.subdirectorate}</p>
                            <p>${pos.service}</p>
                            <p>${pos.section}</p>
                        </div>

                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("DisplayVC", currentId)}>
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
                log.log("deleting credential", currentId)
                await storage.credentialsDelete(currentId)
                goHome()
                return
            }
        }
    }

})

async function createUser() {

    var body = {
        email: "hesus.ruiz@gmail.com",
        name: "Jesus Ruiz"
    }

    let response = await fetch("/createnaturalperson", {
        method: "POST",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        mode: "cors"
    });
    if (response.ok) {
        const jres = await response.json();
        log.log(jres)
        await window.MHR.storage.didSave(jres)
        return jres
    } else {
        throw new Error(response.statusText)
    }

}

