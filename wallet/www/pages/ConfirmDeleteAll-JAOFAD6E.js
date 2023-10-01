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
