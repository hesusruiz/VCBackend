// front/src/pages/ConfirmDeleteCred.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
window.MHR.register("ConfirmDeleteCred", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let title = T("Confirm Delete");
    let msg = "Are you sure you want to delete this credential?";
    let currentId = pageData;
    let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>${title}</ion-card-title>
            </ion-card-header>


            <ion-card-content class="ion-padding-bottom">

                <p>${msg}</p>

            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button @click=${() => history.back()}>
                    <ion-icon slot="start" name="chevron-back"></ion-icon>
                    ${T("Cancel")}
                </ion-button>

                <ion-button color="danger" @click=${() => this.deleteVC(currentId)}>
                    <ion-icon slot="start" name="trash"></ion-icon>
                    ${T("Confirm delete")}
                </ion-button>

            </div>
        </ion-card>
        `;
    this.render(theHtml);
  }
  async deleteVC(currentId) {
    await storage.credentialsDelete(currentId);
    goHome();
    return;
  }
});
