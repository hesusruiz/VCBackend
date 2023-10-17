// front/src/pages/ConfirmDeleteAll.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
window.MHR.register("ConfirmDeleteAll", class ConfirmDeleteAll extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let title = T("Confirm Delete");
    let msg = "Are you sure you want to delete ALL credentials?";
    let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>${title}</ion-card-title>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">
                <div class="text-larger">${msg}</div>
            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button @click=${() => history.back()}>
                    <ion-icon slot="start" name="chevron-back"></ion-icon>
                    ${T("Cancel")}
                </ion-button>

                <ion-button color="danger" @click=${() => this.deleteALLVCs()}>
                    <ion-icon slot="start" name="trash"></ion-icon>
                    ${T("Delete all credentials")}
                </ion-button>

            </div>
        </ion-card>
        `;
    this.render(theHtml);
  }
  enterOld(pageData) {
    let html = this.html;
    let title = T("Confirm Delete");
    let msg = "Are you sure you want to delete ALL credentials?";
    let theHtml = html`
        <div class="w3-container w3-padding-64">
            <div class="w3-card-4 w3-center">
        
                <header class="w3-container w3-center color-error">
                    <h3>${title}</h3>
                </header>
        
                <div class="w3-container">
                    <p>${msg}</p>
                </div>
                
                <div class="w3-container w3-center w3-padding">
                    <btn-danger @click=${() => this.deleteALLVCs()}>${T("Delete")}</btn-danger>
                </div>

            </div>
        </div>
        `;
    this.render(theHtml);
  }
  async deleteALLVCs() {
    await window.MHR.storage.credentialsDeleteAll();
    goHome();
    return;
  }
});
