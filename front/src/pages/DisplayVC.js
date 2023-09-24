let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let log = window.MHR.log

window.MHR.register("DisplayVC", class DisplayVC extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(credentialID) {
        let html = this.html
        log.log("get " + credentialID)

        const vcraw = await storage.credentialsGet(credentialID)
        var theData = vcraw.encoded

        console.log("The data " + JSON.stringify(theData))    
        // We should have received a URL that was scanned as a QR code.
        // Perform some sanity checks on the parameter
        if (theData == null) {
            log.error("The scanned QR does not contain a valid URL")
            gotoPage("ErrorPage", {"title": "No data received", "msg": "The scanned QR does not contain a valid URL"})
            return
        }

        theData = JSON.parse(theData)
        theData = JSON.stringify(theData, null ,"  ")
        const theHtml = html`
        <div id="theVC" class="w3-container">
        <p>You have this Verifiable Credential: </p>
        
<pre ><code class="language-json">
${theData}
</code></pre>
        
        </div>
        
        <div class="w3-container w3-padding-16">       
          <btn-primary @click=${() => goHome()}>${T("Home")}</btn-primary>
        </div>
        `
        
        this.render(theHtml)
            
        // Re-run the highlighter for the VC display
        Prism.highlightAll()
    }

})

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
    } catch  (error2) {
        log.error(error2);
        alert(error2);
        return null;
        }
    console.log(credentialBody);
    // Store it in local storage
    log.log("Store " + credentialBody)
    let total = 0;
    if(!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
      total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"))
      log.log("Total " + total)
    }
    const id = "W3C_VC_LD_"+total
    window.localStorage.setItem(id, credentialBody)
    total = total + 1;
    log.log(total + " credentials in storage.")
    window.localStorage.setItem("W3C_VC_LD_TOTAL", total)
    // Reload the application with a clean URL
    gotoPage("DisplayVC", id)
    return
}
