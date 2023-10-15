let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let log = window.MHR.log

window.MHR.register("DisplayVC", class DisplayVC extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(credentialID) {
        // We receive the hash of the credential as its unique ID

        let html = this.html
        log.log("get " + credentialID)

        // Retrieve the credential from storage
        // The _credential object has the following structure:
        //    _credential = {
        //        type: the type of credential: "w3cvc", "eHealth", etc
        //        encoded: the credential encoded in JWT, COSE or any other suitable format
        //        decoded: the credential in plain format as a Javascript object
        //    }

        const vcraw = await storage.credentialsGet(credentialID)
        if (!vcraw || !vcraw.encoded) {
            log.error("credential not found in storage")
            gotoPage("ErrorPage", { "title": "Credential not found", "msg": "The credential was not found in storage" })
            return
        }

        var theData = vcraw.encoded
        theData = JSON.parse(theData)
        theData = JSON.stringify(theData, null, "  ")

        const theHtml = html`
        <div id="theVC">
        <p>You have this Verifiable Credential: </p>
        
<pre ><code class="language-json">
${theData}
</code></pre>
        
        </div>

        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${()=> goHome()}>
                <ion-icon slot="start" name="home"></ion-icon>
                ${T("Home")}
            </ion-button>
        </div>
        `

        this.render(theHtml, true)

        // Re-run the highlighter for the VC display
        Prism.highlightAll()
    }

})

// TODO: modify storage mechanism
async function getCompliancyCredential(theCredential, serviceAddress) {
    try {
        console.log(theCredential)
        var credentialReq = {
            '@context': "https://www.w3.org/2018/credentials/v1",
            type: "VerifiablePresentation",
            verifiableCredential: [
                JSON.parse(theCredential)
            ]
        }
        console.log("Body " + JSON.stringify(credentialReq))
        let response = await fetch(serviceAddress, {
            method: "POST",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentialReq),
            mode: "cors"
        });
        if (response.ok) {
            var credentialBody = await response.text();
        } else {
            if (response.status == 403) {
                alert.apply("error 403");
                goHome();
                return "Error 403";
            }
            var error = await response.text();
            log.error(error);
            goHome();
            alert(error);
            return null;
        }
    } catch (error2) {
        log.error(error2);
        alert(error2);
        return null;
    }
    console.log(credentialBody);
    // Store it in local storage
    log.log("Store " + credentialBody)
    let total = 0;
    if (!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
        total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"))
        log.log("Total " + total)
    }
    const id = "W3C_VC_LD_" + total
    window.localStorage.setItem(id, credentialBody)
    total = total + 1;
    log.log(total + " credentials in storage.")
    window.localStorage.setItem("W3C_VC_LD_TOTAL", total)
    // Reload the application with a clean URL
    gotoPage("DisplayVC", id)
    return
}
