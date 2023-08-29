import { log } from '../log'

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome

window.MHR.register("MicroWallet", class MicroWallet extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {
        let html = this.html

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
        let eudcc = params.get("eudcc");
        let scope = params.get("scope")
        let command = params.get("command")

        // QR code found in URL. Process and display it
        if (eudcc !== null) {
            // Decode from Base64url
            eudcc = atob(eudcc)
            console.log("EUDCC received:", eudcc)

            // Ask the user to accept the certificate
            await window.MHR.gotoPage("AskUserToStoreQR", eudcc)
            return;

        }

        if (scope !== null) {
            // Get all parameters
            var response_type = params.get("response_type")
            var response_mode = params.get("response_mode")
            var client_id = params.get("client_id")
            var redirect_uri = params.get("redirect_uri")
            var state = params.get("state")
            var nonce = params.get("nonce")

            let theHtml = html`
            <div class="w3-container">
                <p>Welcome to the application</p>
                <p>location: ${window.location.origin}</p>

                <p>scope: ${scope}</p>
                <p>response_type: ${response_type}</p>
                <p>response_mode: ${response_mode}</p>
                <p>client_id: ${client_id}</p>
                <p>redirect_uri: ${redirect_uri}</p>
                <p>state: ${state}</p>
                <p>nonce: ${nonce}</p>
            </div>
            `
            this.render(theHtml)
            return

        }

        if (command !== null) {
            switch (command) {
                case "getvc":
                    var vc_id = params.get("vcid")

                    // get the base path of the application in runtime
                    var vc_path = window.location.origin + "/issuer/api/v1/credential/" + vc_id
                    await window.MHR.gotoPage("LoadAndSaveQRVC", vc_path)
                    return;
            
                default:
                    break;
            }
        }

        let total = 0
        if(!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
          total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"))
        }
        
        if (total > 0) {
            // Display the certificate
            console.log("Certificates found in storage")
            const theDivs = []

            for (let i = 0; i < total; i++) { 
                const currentId = "W3C_VC_LD_"+i
                // it might already have been deleted
                if(!!window.localStorage.getItem(currentId)) { 
                    const vc =  window.localStorage.getItem(currentId)
                    const div = html`<div class="w3-half w3-container w3-margin-bottom">
                            <div class="w3-card-4">
                                <div class=" w3-container w3-margin-bottom color-primary">
                                    <h4>${JSON.parse(vc)["id"]}</h4>
                                </div>

                                <div class=" w3-container">
                                <p>
                                    You have a Verifiable Credential.
                                    To display it, click on the "Details" button.
                                    To delete it, click on the "Delete" button.
                                </p>
                                </div>
                    
                                <div class="w3-container w3-padding-16">
                                    <btn-primary @click=${()=> gotoPage("DisplayVC",currentId)}>${T("Details")}</btn-primary>
                                    <btn-danger @click=${()=> this.deleteVC(currentId)}>${T("Delete")}</btn-danger>
                                </div>
                    
                            </div>
                        </div>`
                    theDivs.push(div)
                }
            }

            this.render(html`
                <p></p>
                <div class="w3-row">
                    ${theDivs}
                    
                    <div class="w3-half w3-container w3-margin-bottom">
                        <div class="w3-card-4">
                            <div class=" w3-container w3-margin-bottom color-primary">
                                <h4>Authentication</h4>
                            </div>

                            <div class=" w3-container">
                            <p>
                                To authenticate, when instructed to scan a QR by the verifier,
                                click the "Scan QR" below.
                            </p>
                            </div>
                
                            <div class="w3-container w3-padding-16">
                                <btn-primary @click=${()=> gotoPage("ScanQrPage")}>${T("Scan QR")}</btn-primary>
                            </div>
                
                        </div>
                    </div>
                
                </div>
            `)
            return

        }

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

    async deleteVC(currentId) {
        // Remove the credential from local storage
        window.localStorage.removeItem(currentId)

        // let total = 0;
        // if(!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
        //   total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"))
        //   log.log("Total " + total)
        // }
        // if (total >0) {
        //     total = total - 1;            
        // }
        // log.log(total + " credentials in storage.")
        // window.localStorage.setItem("W3C_VC_LD_TOTAL", total)

        // Reload the application
        await goHome()
        return
    }

})
