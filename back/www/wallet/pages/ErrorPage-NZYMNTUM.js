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
        <div class="w3-container w3-padding-64">
            <div class="w3-card-4 w3-center">
        
                <header class="w3-container w3-center color-error">
                    <h3>${title}</h3>
                </header>
        
                <div class="w3-container">
                    <p>${msg}</p>
                    <p>${T("Please click Accept to refresh the page.")}</p>
                </div>
                
                <div class="w3-container w3-center w3-padding">
                    <btn-primary onclick=${() => window.location.reload()}>${T("Accept")}</btn-primary>        
                </div>

            </div>
        </div>
        `;
    this.render(theHtml);
  }
});
