import PocketBase from '../components/pocketbase.es.mjs'

console.log("connec to:", window.location.origin)
const pb = new PocketBase(window.location.origin)

// The logo in the header
import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage

window.MHR.register("MicroWallet", class MicroWallet extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {
        let html = this.html

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

        // QR code found in URL. Process and display it
        if (scope !== null) {
            gotoPage("SIOPSelectCredential", document.URL)
            return;
        }

        if (request_uri !== null) {
            // Unescape the query parameter
            request_uri = decodeURIComponent(request_uri)
            console.log(request_uri)
            gotoPage("SIOPSelectCredential", request_uri)
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
            gotoPage("ErrorPage", {"title": "Error", "msg": "Error getting recent credentials"})
            return
        }

        // Display the certificate
        const theDivs = []
        
        for (const vcraw of credentials) {

            const currentId = vcraw.hash
            const vc = JSON.parse(vcraw.encoded)
            const vcs = vc.credentialSubject
            const pos = vcs.position
            var avatar = photo_man
            if (vcs.gender == "f") {
                avatar = photo_woman
            }

            const div = html`<div class="w3-half w3-container w3-margin-bottom">
                <div class="w3-card-4">
                    <div class="w3-padding-left w3-margin-bottom color-primary">
                        <h4>Employee</h4>
                    </div>

                    <div class="w3-container">
                        <img src=${avatar} alt="Avatar" class="w3-left w3-circle w3-margin-right" style="width:60px">
                        <p class="w3-large">${vcs.name}</p>
                        <hr>
                    <div class="w3-row-padding">

                    <div class=" w3-container">
                        <p class="w3-margin-bottom5">${pos.department}</p>
                        <p class="w3-margin-bottom5">${pos.secretariat}</p>
                        <p class="w3-margin-bottom5">${pos.directorate}</p>
                        <p class="w3-margin-bottom5">${pos.subdirectorate}</p>
                        <p class="w3-margin-bottom5">${pos.service}</p>
                        <p class="w3-margin-bottom5">${pos.section}</p>
                    </div>
        
                    <div class="w3-padding-16">
                        <btn-primary @click=${()=> gotoPage("DisplayVC",currentId)}>${T("Details")}</btn-primary>
                        <btn-danger @click=${()=> gotoPage("ConfirmDelete", currentId)}>${T("Delete")}</btn-danger>
                    </div>
        
                </div>
            </div>`
    
            theDivs.push(div)

        }

        if (theDivs.length > 0) {

            this.render(html`
                <p></p>
                <div class="w3-row">
                    
                    <div class="w3-container w3-margin-bottom">
                        <div class="w3-card-4">
                            <div class=" w3-center w3-margin-bottom color-primary">
                                <h4>Authentication</h4>
                            </div>

                            <div class="w3-container w3-padding-16 w3-center">
                                <btn-primary @click=${()=> gotoPage("ScanQrPage")}>${T("Scan QR")}</btn-primary>
                            </div>
                
                        </div>
                    </div>

                    ${theDivs}

                </div>

            `)
            return

        } else {

            // We do not have a QR in the local storage
            this.render(html`
                <div class="w3-container">
                    <h2>${T("There is no certificate.")}</h2>
                    <p>You need to obtain one from an Issuer, by scanning the QR in the screen of the Issuer page</p>
                    <btn-primary @click=${()=> gotoPage("ScanQrPage")}>${T("Scan a QR")}</btn-primary>
                </div>
            `)
            return

        }

    }

})
