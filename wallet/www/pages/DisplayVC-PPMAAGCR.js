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
    if (!vcraw || !vcraw.encoded) {
      log.error("credential not found in storage");
      gotoPage("ErrorPage", { "title": "Credential not found", "msg": "The credential was not found in storage" });
      return;
    }
    var theData = vcraw.encoded;
    theData = JSON.parse(theData);
    theData = JSON.stringify(theData, null, "  ");
    const theHtml = html`
        <div id="theVC">
        <p>You have this Verifiable Credential: </p>
        
<pre ><code class="language-json">
${theData}
</code></pre>
        
        </div>

        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => goHome()}>
                <ion-icon slot="start" name="home"></ion-icon>
                ${T("Home")}
            </ion-button>
        </div>
        `;
    this.render(theHtml, true);
    Prism.highlightAll();
  }
});
