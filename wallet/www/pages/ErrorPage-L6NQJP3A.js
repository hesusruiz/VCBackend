// front/src/pages/ErrorPage.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
window.MHR.register("ErrorPage", class ErrorPage extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let title = T("Error");
    if (pageData && pageData.title) {
      title = T(pageData.title);
    }
    let msg = T("An error has happened.");
    if (pageData && pageData.msg) {
      msg = T(pageData.msg);
    }
    let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>${title}</ion-card-title>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">
                <div class="text-larger">${msg}</div>
                <div>${T("Please click Accept to refresh the page.")}</div>
            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button color="danger" @click=${() => window.MHR.cleanReload()}>
                    ${T("Accept")}
                </ion-button>

            </div>
        </ion-card>
        `;
    this.render(theHtml);
  }
});
