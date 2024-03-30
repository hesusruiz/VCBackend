// front/src/pages/DisplayVC.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
window.MHR.register("DisplayVC", class DisplayVC extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter(vcraw) {
    let html = this.html;
    console.log(vcraw);
    var theData = JSON.stringify(vcraw.decoded, null, "  ");
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
