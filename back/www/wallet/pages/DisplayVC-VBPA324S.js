// front/src/pages/DisplayVC.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var log = window.MHR.log;
window.MHR.register("DisplayVC", class DisplayVC extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter(credentialID) {
    let html = this.html;
    log.log("get " + credentialID);
    const vcraw = await storage.credentialsGet(credentialID);
    var theData = vcraw.encoded;
    console.log("The data " + JSON.stringify(theData));
    if (theData == null) {
      log.error("The scanned QR does not contain a valid URL");
      gotoPage("ErrorPage", { "title": "No data received", "msg": "The scanned QR does not contain a valid URL" });
      return;
    }
    theData = JSON.parse(theData);
    theData = JSON.stringify(theData, null, "  ");
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
        `;
    this.render(theHtml);
    Prism.highlightAll();
  }
});
